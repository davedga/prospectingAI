import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateFollowUpContent } from "@/lib/followup-content";
import { createDeadline } from "@/lib/time-budget";

// Pre-writes content for queued follow-ups WITHOUT sending anything. Moving
// generation out of the daily send-cron's 60s window lets that cron spend its
// whole budget actually sending, so it reaches its full daily cap instead of
// stalling on per-email generation. Session-gated by middleware. Sends no
// email — it only fills in draft subject/body — so it's safe to call in a
// loop. Batched + time-boxed so each call returns cleanly under maxDuration.
export const maxDuration = 60;

const CONCURRENCY = 5;
const BUDGET_MS = 45_000;

export async function POST() {
  const deadline = createDeadline(BUDGET_MS);

  const pending = await prisma.email.findMany({
    where: { status: "draft", sequenceStep: { gt: 0 }, subject: "" },
    select: { id: true },
    orderBy: { scheduledFor: "asc" },
  });

  let generated = 0;
  const errors: { id: string; error: string }[] = [];

  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    if (deadline.expired()) break;
    const chunk = pending.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async ({ id }) => {
        try {
          await generateFollowUpContent(id);
          generated += 1;
        } catch (error) {
          errors.push({
            id,
            error: error instanceof Error ? error.message : "generation failed",
          });
        }
      })
    );
  }

  return NextResponse.json({
    totalPending: pending.length,
    generated,
    remaining: Math.max(0, pending.length - generated - errors.length),
    errorCount: errors.length,
    errors: errors.slice(0, 5),
  });
}
