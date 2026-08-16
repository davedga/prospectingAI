import { prisma } from "@/lib/prisma";
import { generateDiscoveryBatch } from "@/lib/discovery";
import { checkExclusion } from "@/lib/exclusions";

export type RunDiscoveryBatchOptions = {
  // Hard cap — never create more than this many companies this run.
  maxCompanies?: number;
  // Soft target — keep retrying (with an auto-broadened brief) until at
  // least this many non-excluded companies exist, or maxAttempts is hit.
  minCompanies?: number;
  maxAttempts?: number;
};

// On retries, don't just re-ask the identical question and hope for
// different names — broaden the brief so Claude actually has more room to
// find viable candidates. The whole point of Discovery is a steady supply
// of brands to onboard and scale on TikTok Shop, so a thin batch should
// widen the net, not just retry narrowly.
function broadenBrief(brief: string, attempt: number): string {
  if (attempt <= 1) return brief;
  return `${brief}

This is retry attempt ${attempt} for this batch — the prior attempt(s) didn't surface enough new, non-excluded candidates. Broaden the search for this batch: consider adjacent brand categories, a wider revenue range, and brands at different stages of their TikTok Shop journey (not yet on it, or on it but still underscaled) — not just brands that match the original brief narrowly. The goal is a steady supply of viable brands for Dallas Global Agency to onboard and scale on TikTok Shop, so prioritize volume of qualified candidates this round over narrow precision.`;
}

export async function runDiscoveryBatch(
  brief: string,
  autoSelect: boolean,
  options?: RunDiscoveryBatchOptions
) {
  const maxCompanies = options?.maxCompanies;
  const minCompanies = options?.minCompanies ?? 0;
  const maxAttempts = Math.max(1, options?.maxAttempts ?? (minCompanies > 0 ? 5 : 1));

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

  const discoveryRun = await prisma.discoveryRun.create({
    data: { prompt: brief },
  });

  const companyIds: string[] = [];
  let usableCount = 0;
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts += 1;

    const remainingBudget =
      typeof maxCompanies === "number" ? maxCompanies - companyIds.length : undefined;
    if (remainingBudget !== undefined && remainingBudget <= 0) break;

    const generated = await generateDiscoveryBatch({
      brief: broadenBrief(brief, attempts),
      excludedNames: Array.from(seenNames),
      feedbackNotes,
    });

    const fresh = generated.filter((c) => !seenNames.has(c.name.toLowerCase()));
    if (fresh.length === 0) break; // Claude has nothing new to offer — stop early

    const batch = remainingBudget !== undefined ? fresh.slice(0, remainingBudget) : fresh;

    for (const candidate of batch) {
      seenNames.add(candidate.name.toLowerCase());
      const exclusion = await checkExclusion(candidate.name);

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
