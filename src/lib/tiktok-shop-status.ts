import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";

// The IG-DM target list is brands that would benefit from a TikTok Shop and
// don't already run one at scale. This grounds the TikTok-Shop status in a
// live web search (training knowledge goes stale fast here) and cites the URL
// it relied on — same discipline as the daily lead task's TTS step.

const WEB_SEARCH_TOOL = {
  type: "web_search_20250305" as const,
  name: "web_search" as const,
  max_uses: 3,
};

const REPORT_TOOL = {
  name: "report_tiktok_shop",
  description:
    "Report the brand's TikTok Shop status after checking it with web search.",
  input_schema: {
    type: "object" as const,
    properties: {
      status: {
        type: "string",
        enum: ["No TikTok Shop found", "Small TikTok Shop", "Scaled TikTok Shop", "Unverified"],
        description:
          "No TikTok Shop found = no brand-owned storefront/listings. Small TikTok Shop = a handful of listings or low lifetime sold count. Scaled TikTok Shop = a clearly established shop (e.g. tens of thousands+ sold) — these are NOT good IG-DM targets. Unverified = could not confirm from a specific source.",
      },
      evidence: {
        type: "string",
        description:
          "The actual tiktok.com URL(s) relied on (store/pdp URL for a real shop, or the keyword/search URL that showed no brand storefront). If no specific URL supports the claim, say so and use status 'Unverified'.",
      },
      tiktokHandle: {
        type: "string",
        description: "The brand's TikTok @handle if found (e.g. '@brand'), else empty string.",
      },
    },
    required: ["status", "evidence"],
  },
};

export type TikTokShopStatus = {
  status: "No TikTok Shop found" | "Small TikTok Shop" | "Scaled TikTok Shop" | "Unverified";
  evidence: string;
  tiktokHandle: string;
};

function findReport(content: Anthropic.ContentBlock[]) {
  return content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === "tool_use" && b.name === "report_tiktok_shop"
  );
}

export async function checkTikTokShopStatus(brand: {
  name: string;
  websiteUrl?: string | null;
}): Promise<TikTokShopStatus> {
  const system = `You check whether a consumer brand already sells on TikTok Shop.

Use web_search (up to 3) — e.g. search "<brand> TikTok Shop". Judge from what you actually find:
- Real brand-owned presence = shop.tiktok.com/us/store/... or /shop/pdp/ (or /view/product/) listings sold by the brand itself. Use any 'items sold' count that appears.
- Noise (ignore): /shop/k/ keyword pages, aggregate /product/ pages, /discover/ pages, and resale listings from OTHER sellers.
- shop.tiktok.com pages can't be fetched directly, so rely on the search-result snippets/URLs.
Then call report_tiktok_shop. Cite the specific tiktok.com URL you relied on in 'evidence'. If you cannot point to a specific supporting URL, use status "Unverified" rather than asserting an absence you did not see. Never fabricate a sold count or URL.`;

  const userPrompt = `Brand: ${brand.name}
Website: ${brand.websiteUrl ?? "(unknown)"}

Check the brand's TikTok Shop status and call report_tiktok_shop.`;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];

  const first = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1200,
    system,
    tools: [WEB_SEARCH_TOOL, REPORT_TOOL],
    tool_choice: { type: "auto" },
    messages,
  });

  let toolUse = findReport(first.content);
  if (!toolUse) {
    messages.push({ role: "assistant", content: first.content });
    messages.push({
      role: "user",
      content: "Call report_tiktok_shop now with your finding, based on the research above.",
    });
    const second = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 800,
      system,
      tools: [REPORT_TOOL],
      tool_choice: { type: "tool", name: "report_tiktok_shop" },
      messages,
    });
    toolUse = findReport(second.content);
  }

  if (!toolUse) {
    return { status: "Unverified", evidence: "TTS check did not complete.", tiktokHandle: "" };
  }

  const input = toolUse.input as TikTokShopStatus;
  return {
    status: input.status,
    evidence: (input.evidence ?? "").trim(),
    tiktokHandle: (input.tiktokHandle ?? "").trim(),
  };
}
