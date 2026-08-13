import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";

async function recordClick(emailId: string) {
  await prisma.email.updateMany({
    where: { id: emailId, status: "sent", clickedAt: null },
    data: { clickedAt: new Date() },
  });
  await prisma.email.updateMany({
    where: { id: emailId, status: "sent" },
    data: { clickCount: { increment: 1 } },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ emailId: string }> }
) {
  const { emailId } = await params;
  const target = new URL(request.url).searchParams.get("u");

  if (!target || !/^https?:\/\//i.test(target)) {
    return NextResponse.json({ error: "Missing or invalid target URL." }, { status: 400 });
  }

  after(() =>
    recordClick(emailId).catch((error) => {
      console.error("Failed to record email click", emailId, error);
    })
  );

  return NextResponse.redirect(target, { status: 302 });
}
