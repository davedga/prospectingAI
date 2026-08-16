import { prisma } from "@/lib/prisma";
import { generateDiscoveryBatch } from "@/lib/discovery";
import { getExcludedBrandSample } from "@/lib/exclusions";
import { createDeadline, type Deadline } from "@/lib/time-budget";

export type RunDiscoveryBatchOptions = {
  // Hard cap — never create more than this many companies this run.
  maxCompanies?: number;
  // Soft target — keep retrying (with an auto-broadened brief) until at
  // least this many non-excluded companies exist, or maxAttempts/deadline
  // is hit.
  minCompanies?: number;
  maxAttempts?: number;
  // Wall-clock budget for the whole call (all attempts combined). Always
  // completes attempt 1; skips further retries once expired instead of
  // risking a hard kill mid-write. Defaults to 25s for standalone callers
  // (e.g. the manual Discovery UI) — the automated pipeline passes its own
  // shared deadline so multiple stages can share one wall-clock budget.
  deadline?: Deadline;
};

// On retries, don't just re-ask the identical question and hope for
// different names — broaden the brief so Claude actually has more room to
// find viable candidates. The whole point of Discovery is a steady supply
// of brands to onboard and scale on TikTok Shop, so a thin batch should
// widen the net, not just retry narrowly. Already-contacted/excluded
// brands are a useful signal of "what a good candidate looks like" here —
// not to propose, but as profile examples to search adjacent to.
function broadenBrief(brief: string, attempt: number, excludedSample: string[]): string {
  if (attempt <= 1) return brief;
  const reference =
    excludedSample.length > 0
      ? `\n\nFor reference, here are brand profiles the agency has already worked with or excluded (do NOT propose these exact companies — find new, different brands with a similar or adjacent profile, category, or scale): ${excludedSample.join(", ")}.`
      : "";
  return `${brief}

This is retry attempt ${attempt} for this batch — the prior attempt(s) didn't surface enough new, non-excluded candidates. Broaden the search for this batch: shift toward adjacent brand categories (e.g. beauty could become food & bev, or sports & fitness), extend the revenue range (e.g. a $3M floor could become $5M), and consider brands at different stages of their TikTok Shop journey (not yet on it, or on it but still underscaled) — not just brands that match the original brief narrowly. The goal is a steady supply of viable brands for Dallas Global Agency to onboard and scale on TikTok Shop, so prioritize volume of qualified candidates this round over narrow precision.${reference}`;
}

// In-memory version of exclusions.ts's checkExclusion — avoids a fresh
// full-table query (6.5k+ rows) per candidate when we've already loaded
// the list once for this batch.
function matchExclusion(
  name: string,
  excludedBrands: { name: string }[]
): { isExcluded: boolean; matchedName?: string } {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return { isExcluded: false };
  for (const brand of excludedBrands) {
    const brandNormalized = brand.name.trim().toLowerCase();
    if (normalized.includes(brandNormalized) || brandNormalized.includes(normalized)) {
      return { isExcluded: true, matchedName: brand.name };
    }
  }
  return { isExcluded: false };
}

export async function runDiscoveryBatch(
  brief: string,
  autoSelect: boolean,
  options?: RunDiscoveryBatchOptions
) {
  const maxCompanies = options?.maxCompanies;
  const minCompanies = options?.minCompanies ?? 0;
  const maxAttempts = Math.max(1, options?.maxAttempts ?? (minCompanies > 0 ? 3 : 1));
  const deadline = options?.deadline ?? createDeadline(25_000);

  const [excludedBrands, feedback] = await Promise.all([
    prisma.excludedBrand.findMany({ select: { name: true } }),
    prisma.feedback.findMany({
      where: { scope: "discovery" },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { note: true },
    }),
  ]);

  const feedbackNotes = feedback.map((f) => f.note);
  const seenNames = new Set(excludedBrands.map((b) => b.name.toLowerCase()));
  const excludedSample = maxAttempts > 1 ? await getExcludedBrandSample(25) : [];

  const discoveryRun = await prisma.discoveryRun.create({
    data: { prompt: brief },
  });

  const companyIds: string[] = [];
  let usableCount = 0;
  let attempts = 0;
  let lastBriefUsed = brief;

  while (attempts < maxAttempts) {
    // Always run at least one attempt; skip further retries once the
    // shared wall-clock budget is gone rather than risking a hard kill.
    if (attempts > 0 && deadline.expired()) break;
    attempts += 1;
    lastBriefUsed = broadenBrief(brief, attempts, excludedSample);

    const remainingBudget =
      typeof maxCompanies === "number" ? maxCompanies - companyIds.length : undefined;
    if (remainingBudget !== undefined && remainingBudget <= 0) break;

    const generated = await generateDiscoveryBatch({
      brief: lastBriefUsed,
      excludedNames: Array.from(seenNames),
      feedbackNotes,
    });

    const fresh = generated.filter((c) => !seenNames.has(c.name.toLowerCase()));
    if (fresh.length === 0) break; // Claude has nothing new to offer — stop early

    const batch = remainingBudget !== undefined ? fresh.slice(0, remainingBudget) : fresh;

    for (const candidate of batch) {
      seenNames.add(candidate.name.toLowerCase());
      const exclusion = matchExclusion(candidate.name, excludedBrands);

      const company = await prisma.company.create({
        data: {
          name: candidate.name,
          domain: candidate.domain,
          websiteUrl: candidate.websiteUrl,
          instagramUrl: candidate.instagramUrl,
          tiktokUrl: candidate.tiktokUrl,
          amazonUrl: candidate.amazonUrl,
          facebookUrl: candidate.facebookUrl,
          heroSku: candidate.heroSku,
          skuPrice: candidate.skuPrice,
          archetype: candidate.archetype,
          priority: candidate.priority,
          estRevenue: candidate.estRevenue,
          revenueConf: candidate.revenueConf,
          ttsStatus: candidate.ttsStatus,
          accountThesis: candidate.accountThesis,
          cogsNotes: candidate.cogsNotes,
          parentCompany: candidate.parentCompany,
          parentRole: candidate.parentRole,
          siblingBrands: candidate.siblingBrands ?? [],
          status: exclusion.isExcluded ? "rejected" : autoSelect ? "selected" : "proposed",
          discoveryRunId: discoveryRun.id,
        },
      });

      await prisma.exclusionCheck.create({
        data: {
          companyId: company.id,
          isExcluded: exclusion.isExcluded,
          matchedName: exclusion.matchedName,
        },
      });

      companyIds.push(company.id);
      if (!exclusion.isExcluded) usableCount += 1;
    }

    if (usableCount >= minCompanies) break;
  }

  return {
    discoveryRunId: discoveryRun.id,
    companyIds,
    usableCount,
    attempts,
    shortfall: usableCount < minCompanies,
  };
}
