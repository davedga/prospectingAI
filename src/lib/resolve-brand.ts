import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";

// The prior-prospect pool stores only a brand name (+ sometimes an Instagram
// link), but the prospecting pipeline needs a real website domain to look the
// company up in Apollo. This resolves the official domain via a live web
// search — same grounding approach as the IG verifier — so re-prospecting a
// pool brand doesn't depend on a human pasting a URL.

const WEB_SEARCH_TOOL = {
  type: "web_search_20250305" as const,
  name: "web_search" as const,
  max_uses: 3,
};

const REPORT_TOOL = {
  name: "report_domain",
  description: "Report the official website domain for the brand after verifying it with web search.",
  input_schema: {
    type: "object" as const,
    properties: {
      domain: {
        type: "string",
        description:
          "The brand's official website domain, bare (e.g. 'nodpod.com'), no scheme or path. Empty string if no confident match.",
      },
      confident: {
        type: "boolean",
        description: "True only if this is clearly the brand's own official site (not a retailer, marketplace, or same-name unrelated company).",
      },
    },
    required: ["domain", "confident"],
  },
};

function findReport(content: Anthropic.ContentBlock[]) {
  return content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "report_domain"
  );
}

function cleanDomain(raw: string): string | null {
  const d = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim();
  // Must look like a real domain (something.tld).
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : null;
}

export async function resolveBrandDomain(brand: {
  name: string;
  instagramUrl?: string | null;
}): Promise<{ domain: string; websiteUrl: string } | null> {
  const system = `You find the official website domain for a consumer brand.

Use web_search (up to 3 searches) to find the brand's OWN official site — not a retailer, Amazon, a marketplace, or a same-name unrelated company. Prefer the site linked from the brand's official Instagram if given. Then call report_domain with the bare domain and whether you're confident. If you cannot confidently identify the brand's own site, report an empty domain with confident=false rather than guessing.`;

  const userPrompt = `Brand: ${brand.name}
Instagram: ${brand.instagramUrl || "(none)"}

Find the official website domain and call report_domain.`;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];

  const first = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 800,
    system,
    tools: [WEB_SEARCH_TOOL, REPORT_TOOL],
    tool_choice: { type: "auto" },
    messages,
  });

  let toolUse = findReport(first.content);
  if (!toolUse) {
    messages.push({ role: "assistant", content: first.content });
    messages.push({ role: "user", content: "Call report_domain now with your finding." });
    const second = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 500,
      system,
      tools: [REPORT_TOOL],
      tool_choice: { type: "tool", name: "report_domain" },
      messages,
    });
    toolUse = findReport(second.content);
  }

  if (!toolUse) return null;
  const input = toolUse.input as { domain: string; confident: boolean };
  if (!input.confident) return null;
  const domain = cleanDomain(input.domain ?? "");
  if (!domain) return null;
  return { domain, websiteUrl: `https://${domain}` };
}
