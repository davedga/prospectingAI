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

Hard qualification rule: never propose frozen-food brands (frozen meals, frozen baked goods, ice cream, or any product requiring frozen shipping/fulfillment). TikTok Shop's logistics don't currently support that category, regardless of how good a fit the brand looks otherwise.

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

const PROPOSE_BROADENED_BRIEF_TOOL = {
  name: "propose_broadened_brief",
  description:
    "Rewrite a standing discovery brief to be moderately broader so future batches surface more viable candidates.",
  input_schema: {
    type: "object" as const,
    properties: {
      brief: {
        type: "string",
        description: "The full rewritten standing brief — not a diff, the complete replacement text.",
      },
      changeSummary: {
        type: "string",
        description: "One sentence summarizing what changed (e.g. \"expanded from beauty-only to beauty + food & bev, revenue floor $3M -> $5M\").",
      },
    },
    required: ["brief", "changeSummary"],
  },
};

// Called when Discovery keeps coming up short on a brief even after
// in-run retries — proposes a persisted, permanently-broadened version of
// the standing brief so future daily runs start from a wider net instead
// of hitting the same wall every time.
export async function proposeBroadenedBrief({
  currentBrief,
  excludedSample,
  usableCount,
  targetCount,
}: {
  currentBrief: string;
  excludedSample: string[];
  usableCount: number;
  targetCount: number;
}): Promise<{ brief: string; changeSummary: string }> {
  const systemPrompt = `You are tuning a standing brand-discovery brief for Dallas Global Agency's TikTok Shop prospecting pipeline. This brief is used daily to find new brands to onboard and scale on TikTok Shop.

The current brief keeps producing too few new, viable candidates (only ${usableCount} of a target ${targetCount} in the most recent run). Rewrite it to be moderately broader — shift toward adjacent categories, extend the revenue range, or relax TikTok Shop maturity requirements — similar in spirit to how "beauty" might become "beauty or food & bev", or a revenue floor of $3M might become $5M. Don't discard the original intent entirely, just widen it enough to unblock volume.

${excludedSample.length > 0 ? `For reference, here are brand profiles the agency has already worked with or excluded (do NOT reference these exact companies by name in the rewritten brief — they're just examples of the kind of brand profile that's relevant): ${excludedSample.join(", ")}.` : ""}

Hard qualification rule that the rewritten brief must never violate: frozen-food brands (frozen meals, frozen baked goods, ice cream, or anything requiring frozen shipping/fulfillment) are permanently off-limits — TikTok Shop's logistics don't support that category. Never broaden into it, even as an example of an adjacent category.

Call the propose_broadened_brief tool with the full rewritten brief text and a one-line summary of what changed.`;

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1000,
    system: systemPrompt,
    tools: [PROPOSE_BROADENED_BRIEF_TOOL],
    tool_choice: { type: "tool", name: "propose_broadened_brief" },
    messages: [{ role: "user", content: `Current brief: ${currentBrief}` }],
  });

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );

  if (!toolUse) {
    throw new Error("Claude did not return a propose_broadened_brief tool call.");
  }

  return toolUse.input as { brief: string; changeSummary: string };
}
