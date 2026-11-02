import { NextResponse } from "next/server";
import { generateIgLeadBatch } from "@/lib/ig-lead-gen";

// On-demand IG-DM lead generation for Cam. Session-gated by the dashboard
// middleware. Each call produces one time-budgeted batch (~8-12 verified
// leads); the UI's "Generate more" button just calls this again.
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    count?: number;
    category?: string;
    seedBrands?: string[];
  } | null;

  try {
    const result = await generateIgLeadBatch({
      count: Number(body?.count) || 10,
      category: body?.category?.trim() || undefined,
      seedBrands: (body?.seedBrands ?? []).map((s) => s.trim()).filter(Boolean),
      // Budget leaves headroom: the generator hard-stops ~4s after this and
      // must return before Vercel's 60s function limit.
      timeBudgetMs: 48_000,
    });
    return NextResponse.json({
      generated: result.generated,
      checked: result.checked,
      skippedUnverified: result.skippedUnverified,
    });
  } catch (error) {
    console.error("IG lead generation failed", error);
    return NextResponse.json(
      { error: "Lead generation failed. Try again." },
      { status: 502 }
    );
  }
}
