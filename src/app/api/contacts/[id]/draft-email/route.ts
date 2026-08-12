import { NextResponse } from "next/server";
import { draftFirstEmail } from "@/lib/drafting";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const feedbackNote = body?.feedbackNote as string | undefined;
  const auto = Boolean(body?.auto);

  try {
    const email = await draftFirstEmail(id, feedbackNote, auto);
    return NextResponse.json(email);
  } catch (error) {
    console.error(`Drafting failed for contact ${id}`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Drafting failed." },
      { status: 502 }
    );
  }
}
