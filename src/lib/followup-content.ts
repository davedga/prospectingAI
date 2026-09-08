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
      ? `This is follow-up 1, the longest touch in the sequence (roughly 100-130 words). Shape, in this order:
1. Transition line: "A little more context on why I reached out:"
2. ONE short sentence with a real, sourced stat or insight about the category or a comparable brand's TikTok Shop performance — whatever's genuinely researched for this company, but only one sentence, one data point, don't stack multiple facts or name multiple brands. Write it in active voice. Reference the current period as "this year," not "heading into [year]" if that year is already substantially underway — check the actual current date rather than assuming.
3. The GMV/track-record line: "for the right brands, we've seen TikTok Shop become a meaningful six and seven-figure monthly revenue channel within a matter of months" (paraphrase naturally, no hyphen after "six").
4. A specific thesis tied to their actual TikTok Shop status: if not on TikTok Shop, something like "I think [Company] has a real opportunity to establish itself in a category that's growing fast"; if already on TikTok Shop, something like "I think [Company] has a real opportunity to scale its existing TikTok Shop presence further" — pick whichever matches their actual status, never invent one.
5. Offer to walk them through the approach: "I'd love the opportunity to walk you through how we envision scaling [Company] on TikTok Shop" (never lay the actual strategy out in the email itself).
6. A concrete meeting ask naming two specific upcoming weekdays and roughly 15 minutes.`
      : isFinalTouch
        ? `This is the LAST touch in the sequence, the shortest (roughly 55-70 words). Shape: "Last note from me on this." Then restate the thesis briefly and the offer to connect: "I think [Company] has a meaningful opportunity to scale on TikTok Shop going into the holiday season, and I'd love to connect with the team to discuss how we'd approach it." (say "going into the holiday season," not "ahead of Q4" here — the actual buildout may not literally finish before Q4, the real urgency is getting them signed soon). Then a redirect ask: "If this doesn't sit with you, is there someone else on the team who would be better to speak with regarding this opportunity?" No apology, no escape-hatch phrase.`
        : `This is follow-up 2 (roughly 40-55 words, not the last touch, and follow-up 1 already covered the context/stat/strategy-share/meeting-ask — do NOT repeat that ground). Shape:
1. A scarcity beat with a concrete timeframe about the agency onboarding its last few clients ahead of Q4 (paraphrase naturally, don't copy verbatim, e.g. "we're hunkering down over the next six weeks to onboard our last few clients ahead of Q4" — say "clients," not "brands," and don't add a separate "and start focusing on growth" clause, "ahead of Q4" already covers it).
2. One confidence-statement sentence, matched to their actual TikTok Shop status, avoiding "lay the foundation" and avoiding reusing "momentum" (already used elsewhere in the sequence) — if not on TikTok Shop, something like "we feel confident we can help get [Company] live and positioned on TikTok Shop ahead of the holiday season"; if already on TikTok Shop, something like "we feel confident we can help scale [Company]'s presence on TikTok Shop further heading into the holiday season."
3. One question from the question bank above, matched to their TikTok Shop status (not on TTS: the "going into the holiday season" variant; already on TTS: the "scaling further... been considering" variant) — never the generic "is TikTok Shop a priority" question for a brand that's already live there.`;

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
