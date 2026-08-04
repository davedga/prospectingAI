import { prisma } from "@/lib/prisma";
import { resend, OUTREACH_FROM_ADDRESS } from "@/lib/resend";
import { scheduleNextFollowUp } from "@/lib/followups";
import type { Prisma } from "@/generated/prisma/client";

type EmailWithContact = Prisma.EmailGetPayload<{
  include: { contact: { include: { company: true } } };
}>;

export async function sendEmailAndAdvanceSequence(email: EmailWithContact) {
  if (!email.contact.email) {
    return { ok: false as const, error: "Contact has no email address." };
  }

  const sendResult = await resend.emails.send({
    from: OUTREACH_FROM_ADDRESS,
    to: email.contact.email,
    subject: email.subject,
    text: email.body,
  });

  if (sendResult.error) {
    return { ok: false as const, error: sendResult.error.message };
  }

  const sentAt = new Date();
  await prisma.email.update({
    where: { id: email.id },
    data: {
      status: "sent",
      sentAt,
      resendMessageId: sendResult.data?.id,
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
