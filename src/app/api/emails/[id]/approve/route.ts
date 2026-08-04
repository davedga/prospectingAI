import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const body = await request.json().catch(() => ({}));
  const subject = body?.subject as string | undefined;
  const emailBody = body?.body as string | undefined;

  const email = await prisma.email.update({
    where: { id },
    data: {
      ...(subject ? { subject } : {}),
      ...(emailBody ? { body: emailBody } : {}),
      status: "approved",
      approvedAt: new Date(),
      approvedBy: session?.user?.email ?? "unknown",
    },
  });

  return NextResponse.json(email);
}
