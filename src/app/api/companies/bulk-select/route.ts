import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// "Send existing prospects to outreach" — mark selected companies as
// "selected" so the auto-pipeline prospects + drafts + emails them. Only
// moves brands that aren't already in outreach (proposed / rejected /
// dormant); anything already prospecting/prospected/active is left alone so
// we don't re-prospect contacts that already exist. Session-gated by
// middleware.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { ids?: string[] } | null;
  const ids = (body?.ids ?? []).filter(Boolean);
  if (ids.length === 0) {
    return NextResponse.json({ error: "No companies given." }, { status: 400 });
  }

  const eligible = await prisma.company.findMany({
    where: { id: { in: ids }, status: { in: ["proposed", "rejected", "dormant"] } },
    select: { id: true },
  });
  const eligibleIds = eligible.map((c) => c.id);

  if (eligibleIds.length > 0) {
    await prisma.company.updateMany({
      where: { id: { in: eligibleIds } },
      data: { status: "selected" },
    });
  }

  revalidatePath("/brands");
  revalidatePath("/prospecting");

  return NextResponse.json({
    requested: ids.length,
    queued: eligibleIds.length,
    skipped: ids.length - eligibleIds.length,
  });
}
