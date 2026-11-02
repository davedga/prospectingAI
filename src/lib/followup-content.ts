import { prisma } from "@/lib/prisma";
import { callDraftTool, CLAIMS_DISCIPLINE, currentTimeframe } from "@/lib/drafting";
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
  const isSenior = email.contact.decisionRole === "Economic buyer";
  const tf = currentTimeframe();

  // Follow-ups are kept deliberately simple and human — short nudges, not
  // research-heavy personalized pitches. The only numbers allowed are DGA's
  // own general track-record range; no prospect-specific stat-digging, no
  // hero-SKU name-drops. Timing words come from currentTimeframe() so "Q4"
  // never goes stale.
  const stepStructure =
    email.sequenceStep === 1
      ? `This is follow-up 1 (keep it short and human — roughly 70-90 words, NOT a mini-pitch). Shape, in this order:
1. Transition line: "A little more context on why I reached out:"
2. ONE plain credibility sentence using DGA's general track record only — e.g. "for the right brands, we've seen TikTok Shop become a meaningful six and seven-figure monthly revenue channel in a matter of months" (paraphrase naturally, no hyphen after "six"). Do NOT go hunting for a company-specific or competitor stat, and do NOT name other brands — this is a simple nudge, not a researched brief.
3. The thesis + walk-through offer in ONE sentence — e.g. "${tf.opener}, I think [Company] has a real opportunity to [establish itself in this category / scale on TikTok Shop, whichever matches their real status], and I'd love to walk you through how we'd approach it." Never "scale further"/"presence further" ("further" is banned). Never invent a thesis their status doesn't support.
4. A light meeting ask naming two specific upcoming weekdays (based on the actual current date) and roughly 15 minutes.`
      : isFinalTouch
        ? `This is the LAST touch in the sequence, the shortest (roughly 45-65 words). Shape: "Last note from me on this." Then restate the thesis briefly and the offer to connect: "I think [Company] has a meaningful opportunity to scale on TikTok Shop ${tf.timing}, and I'd love to connect with the team to discuss how we'd approach it." Then the redirect line, which branches by seniority:
   - Junior/operational contact: a question, this exact phrasing — "If this falls outside your scope, is there someone else on the team who would be better to speak with about this opportunity?"
   - Senior/economic buyer: a statement, not a question — "If this sits with someone else on your team, I'd love the opportunity to discuss this with them." (this means a senior contact's final touch may end with zero question marks total, which is fine.)
   This contact is ${isSenior ? "senior — use the statement form" : "junior/operational — use the question form"}. No apology, no escape-hatch phrase either way.`
        : `This is follow-up 2 (roughly 35-50 words, not the last touch; follow-up 1 already covered the context/credibility/meeting ask — do NOT repeat that ground). Keep it to a simple, light nudge. Shape:
1. A short why-now beat about the agency onboarding its last few clients ${tf.timing} (paraphrase naturally, say "clients," not "brands"; don't add an "and start focusing on growth" clause).
2. One confidence sentence starting "We're confident..." (never "We feel confident"), matched to their TikTok Shop status, avoiding "lay the foundation," "further," and "momentum":
   - Not on TikTok Shop: "we're confident TikTok Shop can become a meaningful channel for [Company] ${tf.timing}."
   - Already on TikTok Shop: "we're confident we can help turn TikTok Shop into a meaningful revenue channel for [Company] ${tf.timing}."
3. One short question matched to their status — don't ask a brand already on TikTok Shop whether they've "considered" it.`;

  const followUpStructure = `Follow-up general rules: assume no response has come in yet. Keep it SIMPLE and human — a short, natural nudge, not a personalized mini-pitch. You may ground it lightly in the brand's category or TikTok Shop status, but do NOT dig for brand-specific stats, do NOT name a hero SKU, and do NOT stack multiple specifics. Never "just checking in," never re-explain the original pitch verbatim, no mechanical transitions like "since I reached out last week" or "following up on my last note." At most one question mark in the entire body.

${stepStructure}`;

  const systemPrompt = `You are drafting a follow-up outreach email for Dallas Global Agency's TikTok Shop brand-prospecting program.\n\n${CLAIMS_DISCIPLINE}\n\n${followUpStructure}\n\nStanding style feedback from the admin:\n${
    draftingFeedback.length > 0
      ? draftingFeedback.map((f) => `- ${f.note}`).join("\n")
      : "(none yet)"
  }`;

  const userPrompt = `Company: ${email.contact.company.name} (${email.contact.company.domain})
Archetype: ${email.contact.company.archetype ?? "unknown"}
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
