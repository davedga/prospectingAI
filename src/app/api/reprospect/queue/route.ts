import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeDomain, isRealDomain } from "@/lib/domain";
import { resolveBrandDomain } from "@/lib/resolve-brand";
import { REPROSPECT_MARKER } from "@/lib/reprospect";

// Queue prior-prospect pool brands for re-outreach. Given brand names (from
// the ExcludedBrand prior-prospect pool), resolves each brand's website
// domain via web search, skips anything already in the app, and creates a
// [reprospect] DiscoveryRun + Company rows (status "selected"). The existing
// auto-pipeline then prospects (Apollo), drafts, and sends them under the
// re-prospect stream + its own daily limit. Session-gated by middleware.
//
// Domain resolution is a live web search, so a request is capped; the UI
// calls again to continue a larger selection.
export const maxDuration = 300;

const BATCH_CAP = 8;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    names?: string[];
    label?: string;
  } | null;

  const names = (body?.names ?? []).map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) {
    return NextResponse.json({ error: "Provide brand names to queue." }, { status: 400 });
  }

  const batch = names.slice(0, BATCH_CAP);
  const results: { name: string; status: "queued" | "skipped"; reason?: string; domain?: string }[] = [];

  // Pull the pool rows (for IG links) and ensure they're prior-prospects.
  const pool = await prisma.excludedBrand.findMany({
    where: { name: { in: batch } },
    select: { name: true, instagramUrl: true, category: true },
  });
  const poolByName = new Map(pool.map((p) => [p.name.toLowerCase(), p]));

  const toCreate: { name: string; domain: string; websiteUrl: string; instagramUrl: string | null }[] = [];
  for (const name of batch) {
    const row = poolByName.get(name.toLowerCase());
    if (!row) {
      results.push({ name, status: "skipped", reason: "not in the prior-prospect pool" });
      continue;
    }
    const resolved = await resolveBrandDomain({ name, instagramUrl: row.instagramUrl });
    if (!resolved || !isRealDomain(resolved.domain)) {
      results.push({ name, status: "skipped", reason: "couldn't resolve a website domain" });
      continue;
    }
    const domain = normalizeDomain(resolved.domain);
    const existing = await prisma.company.findFirst({
      where: { domain: { equals: domain, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) {
      results.push({ name, status: "skipped", reason: "already in the app", domain });
      continue;
    }
    toCreate.push({ name, domain, websiteUrl: resolved.websiteUrl, instagramUrl: row.instagramUrl });
  }

  if (toCreate.length > 0) {
    const label = body?.label?.trim() || `pool ${new Date().toISOString().slice(0, 10)}`;
    const run = await prisma.discoveryRun.create({
      data: { prompt: `${REPROSPECT_MARKER} ${label}` },
    });
    for (const b of toCreate) {
      await prisma.company.create({
        data: {
          name: b.name,
          domain: b.domain,
          websiteUrl: b.websiteUrl,
          instagramUrl: b.instagramUrl,
          accountThesis: "Re-prospect from the prior-prospects pool (did not respond previously).",
          status: "selected",
          discoveryRunId: run.id,
        },
      });
      results.push({ name: b.name, status: "queued", domain: b.domain });
    }
  }

  return NextResponse.json({
    processed: batch.length,
    queued: results.filter((r) => r.status === "queued").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    remaining: Math.max(0, names.length - batch.length),
    results,
  });
}
