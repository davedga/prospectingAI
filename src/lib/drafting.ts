import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

const DRAFT_EMAIL_TOOL = {
  name: "draft_email",
  description: "Draft a single outreach email to one contact.",
  input_schema: {
    type: "object" as const,
    properties: {
      subject: { type: "string" },
      body: { type: "string" },
      claimsNotToMake: {
        type: "string",
        description:
          "What was deliberately left vague or unclaimed due to lack of evidence in the company/contact record.",
      },
    },
    required: ["subject", "body", "claimsNotToMake"],
  },
};

export const CLAIMS_DISCIPLINE = `Non-negotiable rules for every email you draft:
- Never fabricate a fact not present in the company/contact record: no invented GMV, margin, or COGS figures, and no "we know you need this" claims.
- Never include specific numbers in the email body — no prices, revenue, AOV, COGS, GMV, or other figures, even real ones from the record. Use that data to pick the angle, not to write into the copy.
- Keep first-touch emails to 30-60 words; follow-ups to 40-70 words. Subject lines should be 2-5 words — plain and specific, not clever, not a full sentence.
- Pick ONE observation and lead with it. At most one short sentence explaining why it stood out. Then one low-friction question. That's the whole email — don't stack multiple points or build a case.
- Your job is not to prove how much research you did. Use the research to find the single observation most likely to earn a reply, then leave the rest out. Never explain the research or reasoning behind the observation in the email itself, and never prescribe a strategy, plan, or specific offer before discovery — the email should open a conversation, not pitch a solution.
- Prefer an observational, curious tone over a persuasive one. Ask, don't sell. Avoid generic selling language: "happy to share what we're seeing work," "natural fit," "meaningful opportunity," "book a call," and similar phrases.
- Reference at least one concrete, specific detail about the company (SKU name, a real TTS-status fact, a competitor's presence) — never a generic template that could apply to any brand — but state it plainly in one sentence, not as a case being built.
- The contact's decision role and title are a GUIDE for which question to ask — do not literally name their title or role in the email body (never write "as the Ecommerce Manager..." or "given your role in..."). Use the role to pick the angle:
  - Economic buyer (exec/founder): ask if the channel is strategically on their radar.
  - Functional owner (ecommerce/marketing lead): ask if they've evaluated it as a revenue channel.
  - Influencer/router (affiliate/creator/partnerships): ask if they're involved in creator or TikTok Shop expansion.
  - Operational champion (associate/manager): ask if this is something they own, or someone else does.
- Avoid em dashes (—). If a sentence would naturally use one, either rewrite it as two sentences or use a single hyphen (-) instead. Do not overuse hyphens as a substitute either — prefer plain sentence structure.
- Follow-ups must add a new observation or angle versus the previous touch — never "just checking in" — and follow every rule above.
- Respect multi-thread sequencing: a functional owner gets the primary technical/operational pitch; a routing/champion contact gets a lighter "who owns this decision" message; the economic buyer is only approached directly when warranted (large deal, no response from others, or a small/founder-led company where the founder is the economic buyer).
- In claimsNotToMake, list anything you deliberately left vague or unclaimed due to lack of evidence.`;

export async function callDraftTool(systemPrompt: string, userPrompt: string) {
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2000,
    system: systemPrompt,
    tools: [DRAFT_EMAIL_TOOL],
    tool_choice: { type: "tool", name: "draft_email" },
    messages: [{ role: "user", content: userPrompt }],
  });

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  if (!toolUse) throw new Error("Claude did not return a draft_email tool call.");

  return toolUse.input as { subject: string; body: string; claimsNotToMake: string };
}

export async function draftFirstEmail(
  contactId: string,
  feedbackNote?: string,
  autoTrigger = false
) {
  const contact = await prisma.contact.findUniqueOrThrow({
    where: { id: contactId },
    include: {
      company: true,
      emails: { orderBy: { createdAt: "desc" } },
    },
  });

  const settings = await getSettings();

  const draftingFeedback = await prisma.feedback.findMany({
    where: { scope: "drafting" },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: { note: true },
  });

  const priorEmails = contact.emails;

  // Assigned once per contact and reused for the whole sequence, so
  // follow-ups stay consistent with whichever variant the first touch used.
  let variant: string | null = null;
  if (settings.abTestingEnabled) {
    variant = contact.variant;
    if (!variant) {
      variant = Math.random() < 0.5 ? "A" : "B";
      await prisma.contact.update({ where: { id: contactId }, data: { variant } });
    }
  }
  const variantHint =
    variant === "A" ? settings.abVariantAHint : variant === "B" ? settings.abVariantBHint : null;

  const systemPrompt = `You are drafting outreach email copy for Dallas Global Agency's TikTok Shop brand-prospecting program.\n\n${CLAIMS_DISCIPLINE}\n\nStanding style feedback from the admin:\n${
    draftingFeedback.length > 0
      ? draftingFeedback.map((f) => `- ${f.note}`).join("\n")
      : "(none yet)"
  }`;

  const userPrompt = `Company: ${contact.company.name} (${contact.company.domain})
Hero SKU: ${contact.company.heroSku ?? "unknown"} ${contact.company.skuPrice ?? ""}
Archetype: ${contact.company.archetype ?? "unknown"}
Account thesis: ${contact.company.accountThesis ?? "none on file"}
COGS notes: ${contact.company.cogsNotes ?? "none on file"}
TikTok Shop status: ${contact.company.ttsStatus ?? "unknown"}

Contact: ${contact.name}, ${contact.title}
Decision role: ${contact.decisionRole}

${
  priorEmails.length > 0
    ? `Prior outreach history with this company:\n${priorEmails
        .map((e) => `- [step ${e.sequenceStep}, ${e.status}] Subject: ${e.subject}`)
        .join("\n")}`
    : "No prior outreach history with this company."
}

${feedbackNote ? `Quick note for this regeneration: ${feedbackNote}` : ""}
${variantHint ? `\nA/B test angle for this email (variant ${variant}): ${variantHint}` : ""}

Draft the first outreach email (sequence step 0) to this contact. End with a brief closing only (e.g. "Best," or "Thanks,") — do not sign with a name or company, a signature block is appended automatically after your draft. Never sign off using the recipient's own name.`;

  const draft = await callDraftTool(systemPrompt, userPrompt);

  const shouldAutoApprove = autoTrigger && settings.autoApproveFirstEmails;
  const statusFields = shouldAutoApprove
    ? { status: "approved", approvedAt: new Date(), approvedBy: "auto" }
    : { status: "draft" };

  const existing = await prisma.email.findFirst({
    where: { contactId, sequenceStep: 0 },
  });

  if (existing) {
    return prisma.email.update({
      where: { id: existing.id },
      data: {
        subject: draft.subject,
        body: draft.body,
        claimsNotToMake: draft.claimsNotToMake,
        variant,
        ...statusFields,
      },
    });
  }

  return prisma.email.create({
    data: {
      contactId,
      sequenceStep: 0,
      subject: draft.subject,
      body: draft.body,
      claimsNotToMake: draft.claimsNotToMake,
      variant,
      ...statusFields,
    },
  });
}
