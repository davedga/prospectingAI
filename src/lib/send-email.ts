import { prisma } from "@/lib/prisma";
import { sendGmailMessage } from "@/lib/gmail";
import { resolveThreadIdFromMessageId } from "@/lib/gmail-replies";
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

  // Follow-ups for contacts sent before thread tracking existed won't have
  // a gmailThreadId yet — try to resolve one now from their sent first
  // touch's Gmail message ID before falling back to starting a fresh
  // thread. Requires the gmail.metadata scope; fails silently (and
  // harmlessly) if that isn't granted yet.
  let knownThreadId = email.contact.gmailThreadId ?? undefined;
  const knownFirstMessageId = email.contact.firstMessageId ?? undefined;
  if (email.sequenceStep > 0 && !knownThreadId) {
    const firstTouch = await prisma.email.findFirst({
      where: { contactId: email.contactId, sequenceStep: 0, status: "sent" },
      select: { resendMessageId: true },
    });
    if (firstTouch?.resendMessageId) {
      try {
        const resolved = await resolveThreadIdFromMessageId(firstTouch.resendMessageId);
        if (resolved) {
          knownThreadId = resolved;
          await prisma.contact.update({
            where: { id: email.contactId },
            data: { gmailThreadId: resolved },
          });
        }
      } catch (error) {
        console.error(`Could not resolve thread for contact ${email.contactId}`, error);
      }
    }
  }

  let gmailMessageId: string | undefined;
  let sentThreadId: string | undefined;
  let rfcMessageId: string | undefined;
  try {
    const sendResult = await sendGmailMessage({
      from: fromAddress,
      to: email.contact.email,
      subject: email.subject,
      text,
      html,
      threadId: knownThreadId,
      inReplyToMessageId: knownFirstMessageId,
    });
    gmailMessageId = sendResult.id;
    sentThreadId = sendResult.threadId;
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

  // Only anchor the thread from a send's own result when it's genuinely
  // the first touch — a follow-up that couldn't resolve the real thread
  // above gets its own fresh Gmail thread for delivery purposes, but that
  // must never be persisted as if it were canonical, or a later, correct
  // backfill attempt would be permanently blocked by the wrong value.
  if (email.sequenceStep === 0 && !knownThreadId && sentThreadId) {
    await prisma.contact.update({
      where: { id: email.contactId },
      data: { gmailThreadId: sentThreadId, firstMessageId: rfcMessageId },
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
