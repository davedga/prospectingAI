import { NextResponse } from "next/server";
import { autoSelectQualifyingContacts } from "@/lib/contact-selection";

// Manual bulk-prospecting (via /api/companies/bulk-prospect) creates contacts
// but doesn't select any for outreach — only the fully automated pipeline
// does that today, via the same autoSelectQualifyingContacts heuristic. This
// exposes it for the manual path.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const count = await autoSelectQualifyingContacts(id);
  return NextResponse.json({ selected: count });
}
