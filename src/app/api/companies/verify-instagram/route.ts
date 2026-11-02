import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyInstagramForCompany } from "@/lib/verify-instagram";

// Bulk Instagram verification. Give it either an explicit `companyIds` list
// or a `runId` (verifies that discovery run's companies that haven't been
// checked yet, and have an IG URL to check). Each verification runs a live
// web search, so a single request is capped at BATCH_CAP; the UI calls again
// to continue a larger run. Session-gated by the dashboard middleware.
export const maxDuration = 300;

const BATCH_CAP = 8;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    companyIds?: string[];
    runId?: string;
    onlyUnchecked?: boolean;
  } | null;

  let companyIds = body?.companyIds ?? [];

  if (companyIds.length === 0 && body?.runId) {
    const companies = await prisma.company.findMany({
      where: {
        discoveryRunId: body.runId,
        instagramUrl: { not: null },
        ...(body.onlyUnchecked === false ? {} : { instagramVerified: null }),
      },
      select: { id: true },
    });
    companyIds = companies.map((c) => c.id);
  }

  if (companyIds.length === 0) {
    return NextResponse.json(
      { error: "Provide companyIds, or a runId with companies left to verify." },
      { status: 400 }
    );
  }

  const batch = companyIds.slice(0, BATCH_CAP);
  const results = [];
  for (const id of batch) {
    try {
      results.push(await verifyInstagramForCompany(id));
    } catch (error) {
      results.push({
        companyId: id,
        verified: false,
        status: "error" as const,
        note: error instanceof Error ? error.message : "Verification failed.",
      });
    }
  }

  return NextResponse.json({
    results,
    processed: batch.length,
    remaining: Math.max(0, companyIds.length - batch.length),
  });
}
