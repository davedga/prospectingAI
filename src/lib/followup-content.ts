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
  const isEconomicBuyer = email.contact.decisionRole === "Economic buyer";

  // Each touch has a distinct, mostly-fixed shape rather than one generic
  // "escalate a bit more" instruction — locked in from line-by-line review.
  const stepStructure =
    email.sequenceStep === 1
      ? `This is follow-up 1. Shape: open with "Curious what you think:" then one sentence tying a real category-level trend (something specific to their space performing on TikTok Shop, e.g. creator demos/UGC driving discovery) directly to their specific hero SKU or product — the two clauses should connect, not sit side by side. Close with one question: "${isEconomicBuyer ? "Is this something you've been considering ahead of Q4?" : "Is this something the team's exploring ahead of Q4?"}" Roughly 35-45 words.`
      : isFinalTouch
        ? `This is the LAST touch in the sequence. Shape: "Last note from me on this." followed by one question asking if there's someone else on the team better suited to talk to — a redirect ask, not a re-pitch. Do not re-ask about TikTok Shop status or repeat the pitch. Roughly 20-25 words, the shortest touch in the sequence. No apology, no escape-hatch phrase.`
        : `This is follow-up 2 (not the last touch). Shape: open with a scarcity beat about the agency's own capacity closing out for the season ("we're finding the last few brands before we focus on Q4" — paraphrase naturally, don't copy verbatim), then one sentence naming the company and offering to share the scaling strategy on a call (never lay the strategy out in the email itself, only offer to share it live), then a concrete meeting ask for roughly 15 minutes sometime in the near future. Roughly 40-55 words.`;

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

Draft this follow-up. End with the closing "Looking forward to your response," — do not sign with a name or company, a signature block is appended automatically after your draft. Never sign off using the recipient's own name.`;

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
