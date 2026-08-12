import { prisma } from "@/lib/prisma";
import { callDraftTool, CLAIMS_DISCIPLINE } from "@/lib/drafting";

export async function generateFollowUpContent(emailId: string, feedbackNote?: string) {
  const email = await prisma.email.findUniqueOrThrow({
    where: { id: emailId },
    include: {
      contact: {
        include: {
          company: true,
          emails: { orderBy: { sequenceStep: "asc" } },
        },
      },
    },
  });

  const draftingFeedback = await prisma.feedback.findMany({
    where: { scope: "drafting" },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: { note: true },
  });

  const priorTouches = email.contact.emails.filter(
    (e) => e.sequenceStep < email.sequenceStep && e.status === "sent"
  );
  const lastTouch = priorTouches[priorTouches.length - 1];
  const daysSinceLastTouch = lastTouch?.sentAt
    ? Math.round((Date.now() - lastTouch.sentAt.getTime()) / (24 * 60 * 60 * 1000))
    : null;

  const systemPrompt = `You are drafting a follow-up outreach email for Dallas Global Agency's TikTok Shop brand-prospecting program.\n\n${CLAIMS_DISCIPLINE}\n\nStanding style feedback from the admin:\n${
    draftingFeedback.length > 0
      ? draftingFeedback.map((f) => `- ${f.note}`).join("\n")
      : "(none yet)"
  }`;

  const userPrompt = `Company: ${email.contact.company.name} (${email.contact.company.domain})
Hero SKU: ${email.contact.company.heroSku ?? "unknown"} ${email.contact.company.skuPrice ?? ""}
Archetype: ${email.contact.company.archetype ?? "unknown"}
Account thesis: ${email.contact.company.accountThesis ?? "none on file"}
TikTok Shop status: ${email.contact.company.ttsStatus ?? "unknown"}

Contact: ${email.contact.name}, ${email.contact.title}
Decision role: ${email.contact.decisionRole}

This is follow-up touch #${email.sequenceStep} in the sequence.
${
  priorTouches.length > 0
    ? `Prior touches sent:\n${priorTouches
        .map((t) => `- [step ${t.sequenceStep}] Subject: ${t.subject}\n  Body: ${t.body}`)
        .join("\n")}`
    : "No prior touches on file."
}
${daysSinceLastTouch !== null ? `It has been ${daysSinceLastTouch} day(s) since the last touch.` : ""}
${feedbackNote ? `\nQuick note for this regeneration: ${feedbackNote}` : ""}

No reply yet. Draft a follow-up that adds a new angle or new information versus the previous touch(es) — never "just checking in."`;

  const draft = await callDraftTool(systemPrompt, userPrompt);

  return prisma.email.update({
    where: { id: emailId },
    data: {
      subject: draft.subject,
      body: draft.body,
      claimsNotToMake: draft.claimsNotToMake,
    },
    include: { contact: { include: { company: true } } },
  });
}
