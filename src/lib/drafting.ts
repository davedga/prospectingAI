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

export const CLAIMS_DISCIPLINE = `Voice: casual, conversational, informed, observational, concise. The email should feel like "I work in this space, I noticed something relevant about your brand or category, and was curious whether this is on your radar" — not a cold-sales pitch. Never pushy, apologetic, overly scripted, or prescriptive.

Non-negotiable rules:
- Never fabricate a fact not present in the company/contact record: no invented GMV, margin, or COGS figures, and no "we know you need this" claims.
- Don't state a specific-sounding claim (e.g. "a handful of skincare brands have taken off on TikTok Shop") unless there's real basis for it in the record. When unsure, generalize instead ("brands in the space are exploring this") rather than invent a precise-sounding one.
- Never include specific numbers in the email body — no prices, revenue, AOV, COGS, GMV, or other figures, even real ones from the record. Use that data to shape the observation, not to write into the copy. One narrow, explicitly-approved exception: a general, non-prospect-specific range statement like "for the right brands, we've seen TikTok Shop become a meaningful six and seven figure monthly revenue channel in a matter of months" may be used as-is — it's a claim about DGA's track record in general, not about this specific prospect, so it doesn't need record-level evidence the way a brand-specific number would. This is optional per email, not a required line — include it when the email doesn't already have a strong brand-specific hook and could use the extra credibility, skip it when the observation already carries the email.
- Greeting: "Hey [First name]," — not "Hi."
- Subject lines: prefer the literal format "[Brand] + TikTok Shop" or "[Brand] + DGA" — short, plain, not a full sentence. Only deviate from that format if it would read awkwardly for a specific brand name.
- At most one question mark in the entire email body. One ask, asked once — never stack a second direct question (e.g. a category question plus a separate CTA question) even if both feel soft individually.
- One observation, stated plainly. Don't stack multiple points, don't build a case, don't explain the research or reasoning behind it in the email. Never prescribe a strategy, plan, or specific offer before discovery — the email opens a conversation, it doesn't pitch a solution.
- No unrelated analogies, stories, or "fun facts" as an opener.
- Never lecture or diagnose: no "you're missing this," "you should be doing X," or similar. We're observing something in the market, not grading their strategy.
- Never sound like an interrogation: avoid "Why aren't you doing this?" or "How is [Company] thinking about X?" — too forceful.
- Never use LinkedIn-style thought-leadership hooks: no "Unpopular opinion...", no contrarian framing, no obvious copywriting formula that reads scripted or spammy.
- Never hedge or apologize, and never hand the prospect a preemptive excuse not to answer. Banned patterns: "If it's not a priority, that's totally fine," "Just asking because...," "Not looking for anything here...," "Just flagging...," "No worries either way." Don't explain why we're asking — just ask.
- Never announce what the email isn't (e.g. "not a formal pitch, but..."). Write it so it doesn't feel like a pitch instead of saying so.
- Prefer observational phrasing — "I noticed," "I came across," "we're seeing" — over persuasive or salesy language. Avoid generic selling phrases: "happy to share what we're seeing work," "natural fit," "meaningful opportunity," "book a call."
- Question bank, when a question is used — the default is a direct but soft "has this been on your radar" style question, varied so it doesn't read identically every time. This is the only thing seniority should change — same structure and tone either way, just this one line:
  - Default / functional owner / operational contacts: "Has TikTok Shop been on your radar?" or "Has this been on your radar?"
  - Economic buyer (founder/exec), slightly softer: "Has this been something you've been considering?"
  - Either role, alternate phrasing: "Has this been something that's on your radar?"
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

  const firstTouchStructure = `First-touch structure, roughly 40-50 words total, hard cap 55. Every clause has to earn its place, cut ruthlessly rather than trim politely. Write it as ONE flowing set of sentences, not a checklist of disconnected beats stitched together with connector phrases — a reader should never be able to point to a sentence and say "that's the Q4 clause" or "that's the bolt-on line." Fit these beats into that budget, compressed into as few clauses as the words allow:

1. Who we are — one short clause: "I'm [name], we work on behalf of ByteDance to help brands scale on TikTok Shop." Paraphrase naturally, don't copy verbatim every time, but keep it to a single clause — no elaboration on what DGA or ByteDance does beyond this, and don't spell out "DGA" here (it's implied by the sender's email/signature).
2. Skip the optional track-record (six/seven-figure) line by default at this length — it costs 15-20 words on its own, close to half the entire budget. Only include it on an email that has nothing else going for it (thin record, generic category-level observation) where the credibility is worth the space; when the brand-specific observation is strong, always skip it.
3. The observation, then a Q4 bridge — TWO short sentences, not one fused clause. First sentence: a few words of context for how/why you came across them, then the specific observation — never drop straight into "Noticed X" with zero lead-in (also grammatically incomplete without a subject — always "I noticed," never bare "Noticed"). Pattern: "While researching [category] brands, I noticed [Company]'s [X]." or "Came across [Company] while looking into [category] — I noticed [X]." Keep the lead-in to 3-5 words, not a full sentence of throat-clearing. Second sentence: a short bridge that connects that specific thing to Q4 with a real reason, not just chronological proximity — ${getSeasonalFramingInstruction()} Pattern: "Feels like a good one to have live on TikTok Shop before Q4 hits," not "Q4's coming up, seems like good timing" (that's just two facts sitting next to each other, not a real bridge). This must match their actual TikTok Shop status (given below) — not on TikTok Shop at all, on but not prioritized, on but underdeveloped for their size, or another real condition; never default to "not on TikTok Shop yet" if the record shows otherwise. If the category or product itself has a platform-specific complication (e.g. a restricted product type that can't be listed at all) reflect that honestly rather than pitching something that can't actually happen — lean on an adjacent angle instead of promising the core product can go live. If the record has a real, specific reason this brand fits (a bundle-friendly line, a clear hero SKU, a notable listing structure) name that thing directly instead of a generic category observation, without citing numbers. If the record is thin, keep it at the category level rather than inventing brand-specific detail.
4. The ask — exactly one soft question from the question bank in the rules above, and the only question mark in the email.`;

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

Draft the first outreach email (sequence step 0) to this contact. End with the closing "Looking forward to your response," — do not sign with a name or company, a signature block is appended automatically after your draft. Never sign off using the recipient's own name.`;

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
