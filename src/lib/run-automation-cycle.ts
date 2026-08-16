import { prisma } from "@/lib/prisma";
import { generateFollowUpContent } from "@/lib/followup-content";
import { sendEmailAndAdvanceSequence } from "@/lib/send-email";
import { getSettings } from "@/lib/settings";
import { runAutomatedPipeline, type AutoPipelineSummary } from "@/lib/auto-pipeline";
import { getSentTodayCount } from "@/lib/daily-limits";
import { isWithinSendWindow } from "@/lib/send-window";

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
  const pipelineSummary = await runAutomatedPipeline().catch((error) => {
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

  const sentToday = await getSentTodayCount(settings.sendTimezone);
  let remainingSends = settings.dailyEmailLimit - sentToday;
  const withinWindow = isWithinSendWindow(settings);

  for (const pending of dueFollowUps) {
    try {
      const generated = await generateFollowUpContent(pending.id);

      if (settings.autoApproveFollowUps) {
        if (!withinWindow) {
          results.push({ emailId: pending.id, ok: true, skipped: "outside send window" });
          continue;
        }
        if (remainingSends <= 0) {
          results.push({ emailId: pending.id, ok: true, skipped: "daily email limit reached" });
          continue;
        }

        await prisma.email.update({
          where: { id: generated.id },
          data: { status: "approved", approvedAt: new Date(), approvedBy },
        });
        const sendResult = await sendEmailAndAdvanceSequence({
          ...generated,
          status: "approved",
        });
        if (sendResult.ok) remainingSends -= 1;
        results.push({
          emailId: pending.id,
          ok: sendResult.ok,
          error: sendResult.ok ? undefined : sendResult.error,
        });
      } else {
        results.push({ emailId: pending.id, ok: true });
      }
    } catch (error) {
      results.push({
        emailId: pending.id,
        ok: false,
        error: error instanceof Error ? error.message : "Follow-up generation failed.",
      });
    }
  }

  return { pipeline: pipelineSummary, processed: results.length, results };
}
