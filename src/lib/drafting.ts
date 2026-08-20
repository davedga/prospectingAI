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

export const CLAIMS_DISCIPLINE = `Voice: casual, conversational, informed, observational, concise. The email should feel like "I work in this space, noticed something relevant about your brand or category, and was curious whether this is on your radar" — not a cold-sales pitch. Never pushy, apologetic, overly scripted, or prescriptive.

Non-negotiable rules:
- Never fabricate a fact not present in the company/contact record: no invented GMV, margin, or COGS figures, and no "we know you need this" claims.
- Don't state a specific-sounding claim (e.g. "a handful of skincare brands have taken off on TikTok Shop") unless there's real basis for it in the record. When unsure, generalize instead ("brands in the space are exploring this") rather than invent a precise-sounding one.
- Never include specific numbers in the email body — no prices, revenue, AOV, COGS, GMV, or other figures, even real ones from the record. Use that data to shape the observation, not to write into the copy.
- Subject lines: 2-5 words, lowercase (except proper nouns), plain and specific, not a full sentence.
- One observation, stated plainly. Don't stack multiple points, don't build a case, don't explain the research or reasoning behind it in the email. Never prescribe a strategy, plan, or specific offer before discovery — the email opens a conversation, it doesn't pitch a solution.
- No unrelated analogies, stories, or "fun facts" as an opener.
- Never lecture or diagnose: no "you're missing this," "you should be doing X," or similar. We're observing something in the market, not grading their strategy.
- Never sound like an interrogation: avoid "Why aren't you doing this?" or "How is [Company] thinking about X?" — too forceful.
- Never use LinkedIn-style thought-leadership hooks: no "Unpopular opinion...", no contrarian framing, no obvious copywriting formula that reads scripted or spammy.
- Never hedge or apologize, and never hand the prospect a preemptive excuse not to answer. Banned patterns: "If it's not a priority, that's totally fine," "Just asking because...," "Not looking for anything here...," "Just flagging...," "No worries either way." Don't explain why we're asking — just ask.
- Never announce what the email isn't (e.g. "not a formal pitch, but..."). Write it so it doesn't feel like a pitch instead of saying so.
- Prefer observational phrasing — "I noticed," "I came across," "we're seeing" — over persuasive or salesy language. Avoid generic selling phrases: "happy to share what we're seeing work," "natural fit," "meaningful opportunity," "book a call."
- Question bank, when a question is used — tuned to the contact's decision role, never the blunt versions. This is the only thing seniority should change — same structure and tone either way, just this one line:
  - Economic buyer (founder/exec): "Curious if this is something you've been considering."
  - Functional owner / Operational champion / Influencer-router (more operational or junior contacts): "Curious if this has been on your radar."
  - Either role, alternate phrasing: "Is this something you've been looking at recently?"
  - Do not use: "Has [Company] looked seriously at TikTok Shop yet?" or "How is [Company] thinking about TikTok Shop?" — too direct, demands a strategic answer instead of an easy yes/no.
- Do not literally name the contact's title or decision role in the email body (never write "as the Ecommerce Manager..." or "given your role in...").
- Avoid em dashes (—). If a sentence would naturally use one, either rewrite it as two sentences or use a single hyphen (-) instead. Do not overuse hyphens as a substitute either — prefer plain sentence structure.
- Respect multi-thread sequencing: a functional owner gets the primary technical/operational pitch; a routing/champion contact gets a lighter "who owns this decision" message; the economic buyer is only approached directly when warranted (large deal, no response from others, or a small/founder-led company where the founder is the economic buyer).
- In claimsNotToMake, list anything you deliberately left vague or unclaimed due to lack of evidence.`;

// Only reference Q4/Black Friday when it's actually seasonally true, so the
// framing doesn't go stale as the calendar moves past this launch window.
function getSeasonalFramingInstruction(now = new Date()): string {
  const month = now.getMonth() + 1; // 1-12
  if (month >= 7 && month <= 9) {
    return `Mention that brands are actively getting set up on TikTok Shop ahead of Q4 and Black Friday — it's currently ${now.toLocaleString("en-US", { month: "long" })}, so this framing is timely.`;
  }
  if (month >= 10 && month <= 12) {
    return `Mention that a lot of brands are getting set up on TikTok Shop right now for Black Friday and the Q4 push — it's currently ${now.toLocaleString("en-US", { month: "long" })}, so this is happening now, not "coming up."`;
  }
  return `Skip the Q4/Black Friday framing entirely — it's currently ${now.toLocaleString("en-US", { month: "long" })}, too far past that season to reference it naturally. Use a general "brands are adopting TikTok Shop this year" framing instead if a why-now beat is needed at all.`;
}

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

  const firstTouchStructure = `First-touch structure, roughly 50-90 words total. Give brief context before the observation — this is true cold outbound, so skipping straight to "I noticed X" reads as presumptuous:
1. Who we are — briefly, we work with / research brands on TikTok Shop.
2. What we were doing — researching their category.
3. How we found them — came across their brand.
4. What we noticed — one specific thing about their CURRENT TikTok Shop situation. This must match their actual status (given below as "TikTok Shop status") — not on TikTok Shop at all, on TikTok Shop but doesn't look prioritized, on TikTok Shop but underdeveloped for their size, or another real condition. Never default to "not on TikTok Shop yet" if the record shows otherwise.
5. Why now — ${getSeasonalFramingInstruction()}
6. The ask — one soft question from the question bank in the rules above. The goal is an easy yes/no reply that opens a conversation, not a detailed strategic answer.

If the record below includes a real, specific reason this brand looks like a good fit for TikTok Shop beyond just the category (a bundle-friendly product line, a clear hero SKU, a notable listing structure, or economics that seem favorable) — surface that specific reason in step 4 instead of a generic category-level observation, without citing any numbers. If the record is thin (no strong company-specific signal beyond category and TikTok Shop status), keep the observation at the category level rather than inventing brand-specific detail.`;

  const systemPrompt = `You are drafting outreach email copy for Dallas Global Agency's TikTok Shop brand-prospecting program.\n\n${CLAIMS_DISCIPLINE}\n\n${firstTouchStructure}\n\nStanding style feedback from the admin:\n${
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
${variantHint ? `\nStanding personalization approach for this contact (variant ${variant}): ${variantHint}` : ""}

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
