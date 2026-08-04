import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateDiscoveryBatch } from "@/lib/discovery";
import { checkExclusion } from "@/lib/exclusions";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const brief = (body?.prompt as string | undefined)?.trim();

  if (!brief) {
    return NextResponse.json({ error: "prompt is required." }, { status: 400 });
  }

  const [excludedBrands, feedback] = await Promise.all([
    prisma.excludedBrand.findMany({ select: { name: true } }),
    prisma.feedback.findMany({
      where: { scope: "discovery" },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { note: true },
    }),
  ]);

  let candidates;
  try {
    candidates = await generateDiscoveryBatch({
      brief,
      excludedNames: excludedBrands.map((b) => b.name),
      feedbackNotes: feedback.map((f) => f.note),
    });
  } catch (error) {
    console.error("Discovery generation failed", error);
    return NextResponse.json(
      { error: "Claude failed to generate a discovery batch." },
      { status: 502 }
    );
  }

  const discoveryRun = await prisma.discoveryRun.create({
    data: { prompt: brief },
  });

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
        status: "proposed",
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
  }

  return NextResponse.json({ discoveryRunId: discoveryRun.id });
}
