import { prisma } from "@/lib/prisma";
import { callDraftTool, CLAIMS_DISCIPLINE } from "@/lib/drafting";
import { getSettings } from "@/lib/settings";

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

  // Reuses whichever variant was assigned at first-touch time, so a
  // contact's whole sequence stays consistent — no re-randomizing here.
  const settings = await getSettings();
  const variant = settings.abTestingEnabled ? email.contact.variant : null;
  const variantHint =
    variant === "A" ? settings.abVariantAHint : variant === "B" ? settings.abVariantBHint : null;

  const isFinalTouch = email.sequenceStep >= settings.sequenceLength - 1;

  // Each touch has a distinct, mostly-fixed shape rather than one generic
  // "escalate a bit more" instruction — locked in from line-by-line review.
  const stepStructure =
    email.sequenceStep === 1
      ? `This is follow-up 1. Shape: open with a brief warm re-open ("I hope you're doing well!" or similar, one line). Then re-introduce context in one clause: "we work on behalf of TikTok to help identify and scale brands with strong potential to perform well on TikTok Shop" (paraphrase naturally). Then the GMV/track-record line: "for the right brands, we've seen it become a meaningful six and seven figure monthly revenue channel in a matter of months" (paraphrase naturally). Then offer to discuss the scaling strategy on a call (never lay the strategy out in the email itself, only offer to share it live) naming the company. Close with a concrete meeting ask naming two specific afternoon options (e.g. "this Wednesday or Thursday afternoon"). Roughly 70-90 words — this is the longest touch in the sequence since it re-establishes context.`
      : isFinalTouch
        ? `This is the LAST touch in the sequence. Shape: "Last note from me on this." followed by one question asking if there's someone else on the team better suited to talk to — a redirect ask, not a re-pitch. Do not re-ask about TikTok Shop status or repeat the pitch. Roughly 20-25 words, the shortest touch in the sequence. No apology, no escape-hatch phrase.`
        : `This is follow-up 2 (not the last touch, and follow-up 1 already covered the context/strategy-share/meeting-ask — do NOT repeat that ground). Shape: a short scarcity beat about the agency finalizing which brands it's bringing on before focusing fully on Q4 (paraphrase naturally, don't copy verbatim), then reference the still-open meeting ask from follow-up 1 without re-explaining who you are or re-offering to share the strategy — just confirm the door's still open and nudge for a time. Roughly 25-35 words, noticeably shorter than follow-up 1.`;

  const followUpStructure = `Follow-up general rules: assume no response has come in yet. Ground everything in something specific to THIS company from the record (hero SKU, category detail, TikTok Shop status) — not a generic nudge that could apply to any brand. Never "just checking in," never re-explain the original pitch verbatim, no mechanical transitions like "since I reached out last week" or "following up on my last note." At most one question mark in the entire body.

${stepStructure}`;

  const systemPrompt = `You are drafting a follow-up outreach email for Dallas Global Agency's TikTok Shop brand-prospecting program.\n\n${CLAIMS_DISCIPLINE}\n\n${followUpStructure}\n\nStanding style feedback from the admin:\n${
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
${variantHint ? `\nStanding personalization approach for this contact (variant ${variant}): ${variantHint}` : ""}

Draft this follow-up. End with the closing "Best," — do not sign with a name or company, a signature block is appended automatically after your draft. Never sign off using the recipient's own name.`;

  const draft = await callDraftTool(systemPrompt, userPrompt);

  return prisma.email.update({
    where: { id: emailId },
    data: {
      subject: draft.subject,
      body: draft.body,
      claimsNotToMake: draft.claimsNotToMake,
      variant,
    },
    include: { contact: { include: { company: true } } },
  });
}
