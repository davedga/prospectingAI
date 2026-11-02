import { NextResponse } from "next/server";
import { runDiscoveryBatch } from "@/lib/run-discovery";

// Manual / research-first discovery entry point. Powers the Discovery UI.
//
// Two modes:
//  - "discover": find NEW brands matching a free-text brief (category,
//    revenue band, TTS status, etc.).
//  - "brands": profile a SPECIFIC list of brand names or websites the user
//    pasted in — don't substitute lookalikes, just research the ones named.
//
// Two downstream workflows, chosen with `autoContact`:
//  - false (default): research only. Companies land as "proposed" and are
//    never auto-contacted — the user exports them (brands / IG links) or
//    reviews them before anything goes out.
//  - true: automated outreach. Companies land as "selected", which the
//    auto-pipeline cron then prospects (Apollo contacts) and emails.
//
// This path is session-gated by the dashboard middleware.

// Keep the synchronous UI request inside the discovery wall-clock budget —
// very large counts should go through the automated pipeline over time, not
// one blocking request.
const MAX_MANUAL_COUNT = 20;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    prompt?: string;
    mode?: "discover" | "brands";
    seedBrands?: string[];
    count?: number;
    autoContact?: boolean;
  } | null;

  const mode = body?.mode === "brands" ? "brands" : "discover";
  const autoContact = body?.autoContact === true;

  const rawCount = Number(body?.count);
  const count =
    Number.isFinite(rawCount) && rawCount > 0
      ? Math.min(Math.floor(rawCount), MAX_MANUAL_COUNT)
      : undefined;

  // Build the brief Claude actually sees.
  let brief: string;
  if (mode === "brands") {
    const seeds = (body?.seedBrands ?? [])
      .map((s) => s.trim())
      .filter(Boolean);
    if (seeds.length === 0) {
      return NextResponse.json(
        { error: "List at least one brand name or website." },
        { status: 400 }
      );
    }
    brief = `Profile these SPECIFIC brands for TikTok Shop prospecting — research and return a record for each one named below, and do NOT substitute other/lookalike brands or invent additional ones. If a named brand is a poor fit or disqualified, still return it with that reflected in its thesis/priority rather than dropping it silently.\n\nBrands / sites:\n${seeds
      .map((s) => `- ${s}`)
      .join("\n")}`;
  } else {
    brief = (body?.prompt ?? "").trim();
    if (!brief) {
      return NextResponse.json({ error: "prompt is required." }, { status: 400 });
    }
  }

  // For the "brands" mode the count is the number of seeds; for "discover"
  // the user's requested lead count becomes both the floor (retry until we
  // reach it) and the ceiling (don't overshoot) for this run.
  const options =
    count !== undefined
      ? { minCompanies: count, maxCompanies: count }
      : undefined;

  try {
    const result = await runDiscoveryBatch(brief, autoContact, options);
    return NextResponse.json({
      discoveryRunId: result.discoveryRunId,
      usableCount: result.usableCount,
      shortfall: result.shortfall,
      autoContact,
    });
  } catch (error) {
    console.error("Discovery generation failed", error);
    return NextResponse.json(
      { error: "Claude failed to generate a discovery batch." },
      { status: 502 }
    );
  }
}
