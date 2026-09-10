import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmailAndAdvanceSequence } from "@/lib/send-email";

// Sends exactly one approved email, unlike /api/emails/send-approved which
// sweeps every "approved" row at once — needed when only a specific subset
// of an otherwise-larger approved backlog should actually go out.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const email = await prisma.email.findUnique({
    where: { id },
    include: { contact: { include: { company: true } } },
  });

  if (!email) {
    return NextResponse.json({ error: "Email not found." }, { status: 404 });
  }
  if (email.status !== "approved") {
    return NextResponse.json(
      { error: `Email is "${email.status}", not "approved" — approve it first.` },
      { status: 409 }
    );
  }

  const result = await sendEmailAndAdvanceSequence(email);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true, emailId: id });
}
