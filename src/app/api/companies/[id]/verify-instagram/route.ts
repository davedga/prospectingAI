import { NextResponse } from "next/server";
import { verifyInstagramForCompany } from "@/lib/verify-instagram";

// Verify (and correct, if needed) one company's Instagram link via a live
// web search. Session-gated by the dashboard middleware.
export const maxDuration = 60;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const result = await verifyInstagramForCompany(id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Instagram verification failed", id, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Verification failed." },
      { status: 502 }
    );
  }
}
