import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { draftFirstEmail } from "@/lib/drafting";
import { generateFollowUpContent } from "@/lib/followup-content";

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
