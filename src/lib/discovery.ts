import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";

export type CandidateCompany = {
  name: string;
  domain: string;
  websiteUrl: string;
  instagramUrl?: string;
  tiktokUrl?: string;
  amazonUrl?: string;
  facebookUrl?: string;
  heroSku?: string;
  skuPrice?: string;
  archetype?: string;
  priority?: string;
  estRevenue?: string;
  revenueConf?: string;
  ttsStatus?: string;
  accountThesis?: string;
  cogsNotes?: string;
  parentCompany?: string;
  parentRole?: string;
  siblingBrands?: string[];
};

const PROPOSE_COMPANIES_TOOL = {
  name: "propose_companies",
  description:
    "Propose a batch of candidate companies for TikTok Shop brand prospecting, screened against the exclusion list and prior standing feedback.",
  input_schema: {
    type: "object" as const,
    properties: {
      companies: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            domain: { type: "string" },
            websiteUrl: { type: "string" },
            instagramUrl: { type: "string" },
            tiktokUrl: { type: "string" },
            amazonUrl: { type: "string" },
            facebookUrl: { type: "string" },
            heroSku: { type: "string" },
            skuPrice: { type: "string" },
            archetype: {
              type: "string",
              enum: [
                "Established DTC",
                "Nodpod-style emerging",
                "Strategic scale",
                "Fragile",
              ],
            },
            priority: {
              type: "string",
              enum: ["High", "Medium-High", "Medium", "Low-Medium", "Low"],
            },
            estRevenue: { type: "string" },
            revenueConf: { type: "string", enum: ["High", "Medium", "Low"] },
            ttsStatus: { type: "string" },
            accountThesis: {
              type: "string",
              description: "One-line thesis on why this account is worth prospecting.",
            },
            cogsNotes: { type: "string" },
            parentCompany: {
              type: "string",
              description: "Set only if this brand is owned by, owns, or shares marketing budget with another company.",
            },
            parentRole: {
              type: "string",
              enum: [
                "owns this brand",
                "manages marketing budget",
                "sibling brand",
              ],
            },
            siblingBrands: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: [
            "name",
            "domain",
            "websiteUrl",
            "heroSku",
            "skuPrice",
            "archetype",
            "priority",
            "estRevenue",
            "revenueConf",
            "ttsStatus",
            "accountThesis",
          ],
        },
      },
    },
    required: ["companies"],
  },
};

export async function generateDiscoveryBatch({
  brief,
  excludedNames,
  feedbackNotes,
}: {
  brief: string;
  excludedNames: string[];
  feedbackNotes: string[];
}): Promise<CandidateCompany[]> {
  const systemPrompt = `You are a B2B prospecting analyst for Dallas Global Agency, sourcing TikTok Shop brand-prospecting candidates.

For every candidate company you propose, include real, verifiable, specific detail — hero SKU and price, archetype, priority, estimated revenue with a confidence level, TikTok Shop status, and a one-line account thesis. Flag if the brand is owned by, owns, or shares marketing budget with another company (parent-company check), and list sibling brands worth prospecting too if relevant.

Never propose a brand whose name matches (even loosely) one of these already-contacted/excluded brands:
${excludedNames.length > 0 ? excludedNames.join(", ") : "(none yet)"}

Standing feedback from the admin that must shape every batch you generate:
${feedbackNotes.length > 0 ? feedbackNotes.map((n) => `- ${n}`).join("\n") : "(none yet)"}

Call the propose_companies tool with your results. Do not fabricate data — if you are not confident about a fact, reflect that in the confidence field or omit it rather than inventing specifics.`;

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    system: systemPrompt,
    tools: [PROPOSE_COMPANIES_TOOL],
    tool_choice: { type: "tool", name: "propose_companies" },
    messages: [
      {
        role: "user",
        content: `Brief: ${brief}\n\nPropose a batch of 8-12 candidate companies matching this brief.`,
      },
    ],
  });

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );

  if (!toolUse) {
    throw new Error("Claude did not return a propose_companies tool call.");
  }

  const input = toolUse.input as { companies: CandidateCompany[] };
  return input.companies;
}
