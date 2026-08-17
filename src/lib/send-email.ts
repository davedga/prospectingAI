import { prisma } from "@/lib/prisma";
import { sendGmailMessage } from "@/lib/gmail";
import { scheduleNextFollowUp } from "@/lib/followups";
import { getSettings } from "@/lib/settings";
import { bodyToHtml } from "@/lib/email-html";
import type { Prisma } from "@/generated/prisma/client";

type EmailWithContact = Prisma.EmailGetPayload<{
  include: { contact: { include: { company: true } } };
}>;

export async function sendEmailAndAdvanceSequence(email: EmailWithContact) {
  if (!email.contact.email) {
    return { ok: false as const, error: "Contact has no email address." };
  }

  const settings = await getSettings();
  const text = settings.emailSignature
    ? `${email.body}\n\n${settings.emailSignature}`
    : email.body;
  const html = settings.emailSignatureHtml
    ? bodyToHtml(email.body, settings.emailSignatureHtml, email.id)
    : undefined;

  const fromAddress = process.env.ADMIN_EMAIL;
  if (!fromAddress) {
    return { ok: false as const, error: "ADMIN_EMAIL is not set." };
  }

  let gmailMessageId: string | undefined;
  let threadId: string | undefined;
  let rfcMessageId: string | undefined;
  try {
    const sendResult = await sendGmailMessage({
      from: fromAddress,
      to: email.contact.email,
      subject: email.subject,
      text,
      html,
      // Reuses the first-touch thread/Message-ID for follow-ups so the
      // whole sequence stays in one thread — undefined on the first send.
      threadId: email.contact.gmailThreadId ?? undefined,
      inReplyToMessageId: email.contact.firstMessageId ?? undefined,
    });
    gmailMessageId = sendResult.id;
    threadId = sendResult.threadId;
    rfcMessageId = sendResult.messageId;
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
      resendMessageId: gmailMessageId,
    },
  });

  // Anchor the thread on whichever send happens to be first to succeed —
  // normally the first-touch email, but this self-heals if that one
  // somehow didn't get persisted.
  if (!email.contact.gmailThreadId && threadId) {
    await prisma.contact.update({
      where: { id: email.contactId },
      data: { gmailThreadId: threadId, firstMessageId: rfcMessageId },
    });
  }

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
