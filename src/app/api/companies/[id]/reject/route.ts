import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Manual escape hatch for a bad prospect record (e.g. a Discovery candidate
// that should have been dropped but got persisted, or one that turned out
// to have garbage Apollo data) — marks it rejected and deselects any
// contacts so it can never surface again in Drafting/auto-draft.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [company] = await prisma.$transaction([
    prisma.company.update({ where: { id }, data: { status: "rejected" } }),
    prisma.contact.updateMany({ where: { companyId: id, selected: true }, data: { selected: false } }),
  ]);

  return NextResponse.json({ companyId: company.id, status: company.status });
}
