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
- Keep first-touch emails to 80-120 words; follow-ups to 40-70 words.
- Reference at least one concrete, specific detail about the company (SKU name, a real economics or TTS-status fact, the recipient's actual role) — never a generic template that could apply to any brand.
- Follow-ups must add new information or a new angle versus the previous touch — never "just checking in."
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

  const draftingFeedback = await prisma.feedback.findMany({
    where: { scope: "drafting" },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: { note: true },
  });

  const priorEmails = contact.emails;

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

Draft the first outreach email (sequence step 0) to this contact.`;

  const draft = await callDraftTool(systemPrompt, userPrompt);

  const settings = autoTrigger ? await getSettings() : null;
  const shouldAutoApprove = Boolean(settings?.autoApproveFirstEmails);
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
      ...statusFields,
    },
  });
}
