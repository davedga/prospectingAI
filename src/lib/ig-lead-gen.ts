import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import { createDeadline } from "@/lib/time-budget";
import { buildDedupeIndex, normalizeBrand } from "@/lib/ig-lead-dedupe";
import { runInstagramVerification } from "@/lib/verify-instagram";
import { resolveBrandDomain } from "@/lib/resolve-brand";
import { checkTikTokShopStatus } from "@/lib/tiktok-shop-status";
import type { IgDmLead } from "@/generated/prisma/client";

// In-app version of the daily IG-DM lead task: brainstorm TikTok-Shop-fit
// brands, dedupe against the DB, then ground each one (domain + verified
// Instagram handle + live TikTok-Shop status) before storing it for Cam. The
// IG handle is confirmed via web search and dropped if unconfirmed, so Cam is
// never handed a guessed/wrong profile.

const PROPOSE_TOOL = {
  name: "propose_ig_leads",
  description:
    "Propose candidate consumer brands for TikTok-Shop IG-DM outreach, screened against the excluded list.",
  input_schema: {
    type: "object" as const,
    properties: {
      brands: {
        type: "array",
        items: {
          type: "object",
          properties: {
            brand: { type: "string" },
            category: { type: "string", description: "e.g. Swimwear, Beauty, Pet, Snacks" },
            website: { type: "string", description: "Official site URL if known, else empty." },
            instagramUrl: {
              type: "string",
              description:
                "Your best guess at the brand's official Instagram URL (https://www.instagram.com/<handle>/) if you know it — it will be confirmed by web search, so a good guess speeds this up. Empty if unsure.",
            },
            revenueBasis: {
              type: "string",
              description:
                "Observable facts suggesting 7-figure+ revenue (named retailers, store counts, funding, follower counts). NEVER an invented dollar figure.",
            },
            revenueConfidence: { type: "string", enum: ["High", "Medium", "Low"] },
            usHq: { type: "string", description: "US city/state of HQ if known." },
          },
          required: ["brand", "category", "revenueBasis", "revenueConfidence"],
        },
      },
    },
    required: ["brands"],
  },
};

type Candidate = {
  brand: string;
  category?: string;
  website?: string;
  instagramUrl?: string;
  revenueBasis?: string;
  revenueConfidence?: string;
  usHq?: string;
};

function nyDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

function findPropose(content: Anthropic.ContentBlock[]) {
  return content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "propose_ig_leads"
  );
}

async function brainstorm(opts: {
  count: number;
  category?: string;
  seedBrands?: string[];
  excludedSample: string[];
}): Promise<Candidate[]> {
  const want = Math.min(opts.count * 4 + 8, 48);
  const system = `You source TikTok-Shop IG-DM leads for Dallas Global Agency. DGA runs TikTok Shop for brands, so targets are brands that would BENEFIT from a TikTok Shop and don't run one at scale yet.

Criteria (loose — these are DM leads, not the strict email ICP):
- Consumer product brand. Shelf-stable food/beverage OK; NO frozen/refrigerated goods; NO CBD/cannabinoids.
- Likely 7-figure+ revenue (infer from national retail presence, store count, funding, social following — never invent a sales number).
- US-based entity/HQ. Exclude brands owned by large corporations (L'Oréal, Henkel, Mondelez, SC Johnson, etc.), and brands that shut down or just launched.
- Should have an Instagram presence (it will be verified later).
- Favor less-obvious mid-size US brands across categories (apparel, swim, footwear, golf, accessories, jewelry, beauty, hair, grooming, supplements, pet, baby/kids, home/kitchen, drinkware, outdoor, fitness, shelf-stable snacks/bev, fragrance/candles, stationery/gifts).

Never propose a brand matching (even loosely) one of these already-covered brands:
${opts.excludedSample.length ? opts.excludedSample.slice(0, 400).join(", ") : "(none)"}
${opts.category ? `\nFocus this batch on the category: ${opts.category}.` : ""}
${opts.seedBrands?.length ? `\nStart from / build around these brands the user named: ${opts.seedBrands.join(", ")}.` : ""}

Call propose_ig_leads with ~${want} candidates. Don't fabricate facts; keep revenueConfidence honest (Medium or lower when the basis is thin).`;

  const msg = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    system,
    tools: [PROPOSE_TOOL],
    tool_choice: { type: "tool", name: "propose_ig_leads" },
    messages: [{ role: "user", content: `Propose ~${want} candidate brands.` }],
  });
  const tu = findPropose(msg.content);
  if (!tu) return [];
  const input = tu.input as { brands: Candidate[] };
  return (input.brands ?? []).filter((b) => b && b.brand);
}

export type IgGenResult = {
  generated: IgDmLead[];
  checked: number;
  skippedDuplicate: number;
  skippedUnverified: number;
};

// Process candidates with a small concurrency cap until we hit `count`
// verified leads or run out of time budget.
export async function generateIgLeadBatch(opts: {
  count: number;
  category?: string;
  seedBrands?: string[];
  timeBudgetMs?: number;
}): Promise<IgGenResult> {
  const count = Math.max(1, Math.min(Math.floor(opts.count || 10), 15));
  const deadline = createDeadline(opts.timeBudgetMs ?? 55_000);

  const dedupe = await buildDedupeIndex();
  const excludedSample = [...dedupe.keys].slice(0, 400);

  const candidates = (await brainstorm({
    count,
    category: opts.category,
    seedBrands: opts.seedBrands,
    excludedSample,
  })).filter((c) => !dedupe.has(c.brand));

  const generated: IgDmLead[] = [];
  let checked = 0;
  let skippedUnverified = 0;
  const skippedDuplicate = 0; // dedupe already applied pre-flight
  const seenThisRun = new Set<string>();

  // Qualify one candidate end-to-end; returns a lead or null.
  async function qualify(c: Candidate): Promise<IgDmLead | null> {
    checked++;
    let website = c.website?.trim() || null;
    if (!website) {
      const resolved = await resolveBrandDomain({ name: c.brand }).catch(() => null);
      website = resolved?.websiteUrl ?? null;
    }

    const ig = await runInstagramVerification({
      name: c.brand,
      websiteUrl: website,
      // A proposed handle turns the verification into a fast confirm (instead
      // of discovering from scratch), raising throughput and the hit rate.
      proposedInstagramUrl: c.instagramUrl?.trim() || null,
    }).catch(() => null);

    if (!ig || ig.status === "not_found" || !ig.instagramUrl) {
      skippedUnverified++;
      return null;
    }

    const tts = await checkTikTokShopStatus({ name: c.brand, websiteUrl: website }).catch(() => ({
      status: "Unverified" as const,
      evidence: "",
      tiktokHandle: "",
    }));
    if (tts.status === "Scaled TikTok Shop") {
      // Already scaled on TikTok Shop — not a good IG-DM target.
      return null;
    }

    const handle = (() => {
      const m = ig.instagramUrl.match(/instagram\.com\/([^/?]+)/i);
      return m ? `@${m[1]}` : null;
    })();
    const dedupeKey = ig.instagramUrl.toLowerCase().slice(0, 500);
    if (seenThisRun.has(dedupeKey)) return null;
    seenThisRun.add(dedupeKey);

    const data = {
      brand: c.brand,
      category: c.category ?? null,
      website,
      igHandle: handle,
      igUrl: ig.instagramUrl,
      tiktokHandle: tts.tiktokHandle || null,
      ttsStatus: tts.status,
      ttsEvidence: tts.evidence || null,
      revenueBasis: c.revenueBasis ?? null,
      revenueConfidence: c.revenueConfidence ?? null,
      usHq: c.usHq ?? null,
      camDmStatus: "",
      igVerified: true,
      igVerifyNote: ig.note || null,
      batchDate: nyDate(),
      source: "in-app-gen",
    };

    // Upsert on the verified IG URL so a re-run can't create a duplicate row.
    return prisma.igDmLead.upsert({
      where: { dedupeKey },
      update: data,
      create: { dedupeKey, ...data },
    });
  }

  // Concurrency-capped worker loop. Each candidate is a few web searches, so
  // the limit is wall-clock, not CPU — run a wide pool to fit more in the
  // ~55s budget.
  const CONCURRENCY = 8;
  let idx = 0;
  async function worker() {
    while (idx < candidates.length && generated.length < count && !deadline.expired()) {
      const c = candidates[idx++];
      const lead = await qualify(c);
      if (lead && generated.length < count) generated.push(lead);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  return { generated, checked, skippedDuplicate, skippedUnverified };
}
