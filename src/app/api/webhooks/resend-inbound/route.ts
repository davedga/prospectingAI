import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const payload = await request.text();
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;

  if (secret) {
    const svixHeaders = {
      "svix-id": request.headers.get("svix-id") ?? "",
      "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
      "svix-signature": request.headers.get("svix-signature") ?? "",
    };
    try {
      new Webhook(secret).verify(payload, svixHeaders);
    } catch {
      return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
    }
  }

  const event = JSON.parse(payload);
  const fromAddress: string | undefined =
    event?.data?.from?.email ?? event?.data?.from;

  if (!fromAddress) {
    return NextResponse.json({ error: "No sender address in payload." }, { status: 400 });
  }

  const contact = await prisma.contact.findFirst({
    where: { email: { equals: fromAddress, mode: "insensitive" } },
  });

  if (!contact) {
    return NextResponse.json({ received: true, matched: false });
  }

  const latestEmail = await prisma.email.findFirst({
    where: { contactId: contact.id, status: "sent" },
    orderBy: { sequenceStep: "desc" },
  });

  if (latestEmail) {
    await prisma.email.update({
      where: { id: latestEmail.id },
      data: { status: "replied" },
    });
  }

  await prisma.email.updateMany({
    where: {
      contactId: contact.id,
      status: { in: ["draft", "approved"] },
    },
    data: { status: "cancelled" },
  });

  return NextResponse.json({ received: true, matched: true });
}
