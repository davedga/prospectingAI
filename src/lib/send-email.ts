import { prisma } from "@/lib/prisma";
import { sendGmailMessage } from "@/lib/gmail";
import { scheduleNextFollowUp } from "@/lib/followups";
import { getSettings } from "@/lib/settings";
import type { Prisma } from "@/generated/prisma/client";

type EmailWithContact = Prisma.EmailGetPayload<{
  include: { contact: { include: { company: true } } };
}>;

export async function sendEmailAndAdvanceSequence(email: EmailWithContact) {
  if (!email.contact.email) {
    return { ok: false as const, error: "Contact has no email address." };
  }

  const settings = await getSettings();
  const body = settings.emailSignature
    ? `${email.body}\n\n${settings.emailSignature}`
    : email.body;

  const fromAddress = process.env.ADMIN_EMAIL;
  if (!fromAddress) {
    return { ok: false as const, error: "ADMIN_EMAIL is not set." };
  }

  let messageId: string | undefined;
  try {
    const sendResult = await sendGmailMessage({
      from: fromAddress,
      to: email.contact.email,
      subject: email.subject,
      text: body,
    });
    messageId = sendResult.id;
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Gmail send failed.",
    };
  }

  const sentAt = new Date();
  await prisma.email.update({
    where: { id: email.id },
    data: {
      status: "sent",
      sentAt,
      resendMessageId: messageId,
    },
  });

  await prisma.company.update({
    where: { id: email.contact.companyId },
    data: { status: "outreach_active" },
  });

  const next = await scheduleNextFollowUp(email.contactId, email.sequenceStep, sentAt);

  if (!next) {
    await prisma.company.update({
      where: { id: email.contact.companyId },
      data: { status: "dormant" },
    });
  }

  return { ok: true as const };
}
