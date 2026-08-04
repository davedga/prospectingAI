import { NextResponse } from "next/server";
import { prospectCompany } from "@/lib/prospecting";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const companyIds = body?.companyIds as string[] | undefined;

  if (!companyIds || companyIds.length === 0) {
    return NextResponse.json({ error: "companyIds is required." }, { status: 400 });
  }

  const results = [];
  for (const companyId of companyIds) {
    try {
      results.push(await prospectCompany(companyId));
    } catch (error) {
      results.push({
        companyId,
        contactsCreated: 0,
        error: error instanceof Error ? error.message : "Prospecting failed.",
      });
    }
  }

  return NextResponse.json({ results });
}
