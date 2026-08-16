import { prisma } from "@/lib/prisma";
import { generateDiscoveryBatch } from "@/lib/discovery";
import { checkExclusion } from "@/lib/exclusions";

export async function runDiscoveryBatch(
  brief: string,
  autoSelect: boolean,
  maxCompanies?: number
) {
  const [excludedBrands, feedback] = await Promise.all([
    prisma.excludedBrand.findMany({ select: { name: true } }),
    prisma.feedback.findMany({
      where: { scope: "discovery" },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { note: true },
    }),
  ]);

  const generated = await generateDiscoveryBatch({
    brief,
    excludedNames: excludedBrands.map((b) => b.name),
    feedbackNotes: feedback.map((f) => f.note),
  });

  const candidates =
    typeof maxCompanies === "number" ? generated.slice(0, Math.max(0, maxCompanies)) : generated;

  const discoveryRun = await prisma.discoveryRun.create({
    data: { prompt: brief },
  });

  const companyIds: string[] = [];

  for (const candidate of candidates) {
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
  }

  return { discoveryRunId: discoveryRun.id, companyIds };
}
