import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmailAndAdvanceSequence } from "@/lib/send-email";

export async function POST() {
  const approved = await prisma.email.findMany({
    where: { status: "approved" },
    include: { contact: { include: { company: true } } },
  });

  const results: { emailId: string; ok: boolean; error?: string }[] = [];

  for (const email of approved) {
    const result = await sendEmailAndAdvanceSequence(email);
    results.push({ emailId: email.id, ok: result.ok, error: result.ok ? undefined : result.error });
  }

  return NextResponse.json({ results });
}
