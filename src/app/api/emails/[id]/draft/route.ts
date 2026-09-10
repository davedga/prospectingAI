import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { draftFirstEmail } from "@/lib/drafting";
import { generateFollowUpContent } from "@/lib/followup-content";

// Drafting now does up to 3 web_search round-trips before the model
// returns a draft, which can comfortably exceed Vercel's default
// serverless timeout — without this, calls fail with a client-side
// "Failed to fetch" once the function gets killed mid-request.
export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const feedbackNote = body?.feedbackNote as string | undefined;

  const existing = await prisma.email.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Email not found." }, { status: 404 });
  }

  try {
    const email =
      existing.sequenceStep === 0
        ? await draftFirstEmail(existing.contactId, feedbackNote)
        : await generateFollowUpContent(id, feedbackNote);

    return NextResponse.json(email);
  } catch (error) {
    console.error(`Drafting failed for email ${id}`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Drafting failed." },
      { status: 502 }
    );
  }
}
