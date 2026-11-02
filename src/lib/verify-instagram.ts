import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";

// Discovery proposes Instagram handles straight from the model's training
// memory (generateDiscoveryBatch has no web_search), which regularly yields
// a wrong or non-existent profile — the exact "incorrect profile match"
// problem raised for the IG DM track. This verifier grounds the handle in a
// live web search and either confirms it, corrects it, or flags it as
// unconfirmed, so Cameron isn't handed a guessed handle.

const WEB_SEARCH_TOOL = {
  type: "web_search_20250305" as const,
  name: "web_search" as const,
  max_uses: 3,
};

const REPORT_TOOL = {
  name: "report_instagram",
  description:
    "Report the official Instagram profile for the brand after verifying it with web search.",
  input_schema: {
    type: "object" as const,
    properties: {
      instagramUrl: {
        type: "string",
        description:
          "The confirmed official Instagram profile URL (https://www.instagram.com/<handle>/). Empty string if no official profile could be confirmed.",
      },
      status: {
        type: "string",
        enum: ["confirmed", "corrected", "not_found"],
        description:
          "confirmed = the proposed URL is the real official profile; corrected = a different real profile was found; not_found = no official profile could be confirmed.",
      },
      note: {
        type: "string",
        description:
          "Short reason, e.g. 'linked from brand's own site', 'corrected from @wrong_handle', or 'no official account found'.",
      },
    },
    required: ["instagramUrl", "status", "note"],
  },
};

export type InstagramVerification = {
  instagramUrl: string;
  status: "confirmed" | "corrected" | "not_found";
  note: string;
};

function findReportToolUse(content: Anthropic.ContentBlock[]) {
  return content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === "tool_use" && b.name === "report_instagram"
  );
}

export async function runInstagramVerification(brand: {
  name: string;
  domain?: string | null;
  websiteUrl?: string | null;
  proposedInstagramUrl?: string | null;
}): Promise<InstagramVerification> {
  const system = `You verify the official Instagram profile for a consumer brand.

Use the web_search tool (up to 3 searches) to find the brand's REAL, official Instagram account. Strategy:
- Prefer the Instagram link published on the brand's own website (the strongest signal).
- Cross-check the handle's bio/name against the brand and its domain — a same-name account for a different company, a fan/parody/reseller account, or a regional/sub-brand account is NOT a match.
- A proposed URL is given below; confirm it ONLY if it is genuinely the brand's official account. If it's wrong, find the correct one. If no official account can be confirmed, say so rather than guessing.

Then call report_instagram with your finding. Normalize the URL to https://www.instagram.com/<handle>/ form. Do not fabricate a handle to have one — an unconfirmed guess is worse than none here.`;

  const userPrompt = `Brand: ${brand.name}
Website: ${brand.websiteUrl ?? brand.domain ?? "unknown"}
Proposed Instagram URL (may be wrong): ${brand.proposedInstagramUrl || "(none)"}

Verify the official Instagram profile and call report_instagram.`;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];

  const first = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1500,
    system,
    tools: [WEB_SEARCH_TOOL, REPORT_TOOL],
    tool_choice: { type: "auto" },
    messages,
  });

  let toolUse = findReportToolUse(first.content);

  // "auto" may let it stop after searching without reporting — force a
  // second turn pinned to the report tool, using whatever it already found.
  if (!toolUse) {
    messages.push({ role: "assistant", content: first.content });
    messages.push({
      role: "user",
      content: "Call report_instagram now with your finding, based on the research above.",
    });
    const second = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1000,
      system,
      tools: [REPORT_TOOL],
      tool_choice: { type: "tool", name: "report_instagram" },
      messages,
    });
    toolUse = findReportToolUse(second.content);
  }

  if (!toolUse) throw new Error("Instagram verification did not return a result.");

  const input = toolUse.input as InstagramVerification;
  return {
    instagramUrl: (input.instagramUrl ?? "").trim(),
    status: input.status,
    note: (input.note ?? "").trim(),
  };
}

// Verify one company's Instagram link and persist the outcome. A confirmed
// or corrected handle leaves instagramVerified = true (with the URL updated
// if it changed); an unconfirmable one is flagged false so it's visible in
// the UI / export rather than silently handed off as correct.
export async function verifyInstagramForCompany(companyId: string) {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { id: true, name: true, domain: true, websiteUrl: true, instagramUrl: true },
  });

  const result = await runInstagramVerification({
    name: company.name,
    domain: company.domain,
    websiteUrl: company.websiteUrl,
    proposedInstagramUrl: company.instagramUrl,
  });

  const verified = result.status !== "not_found";
  const nextUrl =
    result.status === "corrected" && result.instagramUrl
      ? result.instagramUrl
      : result.status === "confirmed"
        ? result.instagramUrl || company.instagramUrl
        : company.instagramUrl; // not_found: keep what we had, but flag it

  await prisma.company.update({
    where: { id: company.id },
    data: {
      instagramUrl: nextUrl,
      instagramVerified: verified,
      instagramCheckedAt: new Date(),
      instagramCheckNote: result.note || result.status,
    },
  });

  return { companyId: company.id, verified, status: result.status, instagramUrl: nextUrl, note: result.note };
}
