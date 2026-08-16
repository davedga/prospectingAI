import { prisma } from "@/lib/prisma";
import { generateFollowUpContent } from "@/lib/followup-content";
import { sendEmailAndAdvanceSequence } from "@/lib/send-email";
import { getSettings } from "@/lib/settings";
import { runAutomatedPipeline, type AutoPipelineSummary } from "@/lib/auto-pipeline";
import { getFollowUpsSentTodayCount } from "@/lib/daily-limits";
import { isWithinSendWindow } from "@/lib/send-window";
import { createDeadline } from "@/lib/time-budget";

const FOLLOWUP_CONCURRENCY = 5;
// Vercel Hobby's maxDuration ceiling is 60s, but the real constraint is
// whatever external scheduler is calling this endpoint — most (including
// cron-job.org's free tier) time out client-side well before 60s. Staying
// well under that so the response reliably comes back and the scheduler
// records a real success/failure instead of a client-side timeout.
const CYCLE_BUDGET_MS = 25_000;

export type FollowUpResult = {
  emailId: string;
  ok: boolean;
  error?: string;
  skipped?: string;
};

export type AutomationCycleResult = {
  pipeline: AutoPipelineSummary | null;
  processed: number;
  results: FollowUpResult[];
  skipped?: string;
};

// Shared by the daily cron and the "run now on save" trigger in Settings,
// so both do exactly the same thing: run the pipeline stages, then work
// through any follow-ups that are due.
export async function runAutomationCycle(
  approvedBy = "auto (cron)"
): Promise<AutomationCycleResult> {
  // One shared wall-clock budget across the pipeline stages AND the
  // follow-up loop below, so a slow discovery retry doesn't starve
  // everything after it — each stage bails cleanly once time is up
  // instead of risking a hard kill mid-write.
  const deadline = createDeadline(CYCLE_BUDGET_MS);

  const pipelineSummary = await runAutomatedPipeline(deadline).catch((error) => {
    console.error("Automated pipeline run failed", error);
    return null;
  });

  const settings = await getSettings();

  if (!settings.autoGenerateFollowUps) {
    return {
      pipeline: pipelineSummary,
      processed: 0,
      results: [],
      skipped: "autoGenerateFollowUps is off — follow-ups must be drafted manually.",
    };
  }

  const dueFollowUps = await prisma.email.findMany({
    where: {
      status: "draft",
      sequenceStep: { gt: 0 },
      scheduledFor: { lte: new Date() },
      subject: "",
    },
  });

  const results: FollowUpResult[] = [];

  const sentToday = await getFollowUpsSentTodayCount(settings.sendTimezone);
  let remainingSends = settings.dailyFollowUpLimit - sentToday;
  const withinWindow = isWithinSendWindow(settings);

  for (let i = 0; i < dueFollowUps.length; i += FOLLOWUP_CONCURRENCY) {
    if (deadline.expired()) break; // remaining follow-ups wait for the next run
    const chunk = dueFollowUps.slice(i, i + FOLLOWUP_CONCURRENCY);
    await Promise.all(
      chunk.map(async (pending) => {
        try {
          const generated = await generateFollowUpContent(pending.id);

          if (!settings.autoApproveFollowUps) {
            results.push({ emailId: pending.id, ok: true });
            return;
          }
          if (!withinWindow) {
            results.push({ emailId: pending.id, ok: true, skipped: "outside send window" });
            return;
          }
          if (remainingSends <= 0) {
            results.push({ emailId: pending.id, ok: true, skipped: "daily email limit reached" });
            return;
          }
          // Reserve budget synchronously (no await between check and
          // decrement) so concurrent sends in this batch can't overshoot.
          remainingSends -= 1;

          await prisma.email.update({
            where: { id: generated.id },
            data: { status: "approved", approvedAt: new Date(), approvedBy },
          });
          const sendResult = await sendEmailAndAdvanceSequence({
            ...generated,
            status: "approved",
          });
          results.push({
            emailId: pending.id,
            ok: sendResult.ok,
            error: sendResult.ok ? undefined : sendResult.error,
          });
        } catch (error) {
          results.push({
            emailId: pending.id,
            ok: false,
            error: error instanceof Error ? error.message : "Follow-up generation failed.",
          });
        }
      })
    );
  }

  return { pipeline: pipelineSummary, processed: results.length, results };
}
