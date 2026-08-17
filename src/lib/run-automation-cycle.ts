import { prisma } from "@/lib/prisma";
import { generateFollowUpContent } from "@/lib/followup-content";
import { sendEmailAndAdvanceSequence } from "@/lib/send-email";
import { getSettings } from "@/lib/settings";
import { runAutomatedPipeline, type AutoPipelineSummary } from "@/lib/auto-pipeline";
import { getFollowUpsSentTodayCount } from "@/lib/daily-limits";
import { isWithinSendWindow } from "@/lib/send-window";
import { createDeadline } from "@/lib/time-budget";
import { checkThreadForReply, resolveThreadIdFromMessageId } from "@/lib/gmail-replies";

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
  repliesDetected: number;
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
      repliesDetected: 0,
      skipped: "autoGenerateFollowUps is off — follow-ups must be drafted manually.",
    };
  }

  const results: FollowUpResult[] = [];
  let repliesDetected = 0;

  // Check Gmail for replies before touching any follow-up — a contact who
  // replied should never get another automated touch. Scoped to contacts
  // who'd actually be affected (have a pending, not-yet-sent follow-up)
  // to keep this bounded. Backfills gmailThreadId for contacts sent
  // before thread tracking existed, using the Gmail message ID already
  // stored on their sent first-touch email.
  const contactsToCheck = deadline.expired()
    ? []
    : await prisma.contact.findMany({
        where: {
          repliedAt: null,
          emails: { some: { sequenceStep: { gt: 0 }, status: { in: ["draft", "approved"] } } },
        },
        select: {
          id: true,
          gmailThreadId: true,
          emails: {
            where: { sequenceStep: 0, status: "sent" },
            select: { resendMessageId: true },
            take: 1,
          },
        },
      });

  for (let i = 0; i < contactsToCheck.length; i += FOLLOWUP_CONCURRENCY) {
    if (deadline.expired()) break;
    const chunk = contactsToCheck.slice(i, i + FOLLOWUP_CONCURRENCY);
    await Promise.all(
      chunk.map(async (contact) => {
        try {
          let threadId = contact.gmailThreadId ?? undefined;
          const firstSentMessageId = contact.emails[0]?.resendMessageId ?? undefined;

          if (!threadId && firstSentMessageId) {
            threadId = await resolveThreadIdFromMessageId(firstSentMessageId);
            if (threadId) {
              await prisma.contact.update({
                where: { id: contact.id },
                data: { gmailThreadId: threadId },
              });
            }
          }
          if (!threadId) return; // nothing sent yet, or unresolvable — nothing to check

          const replied = await checkThreadForReply(threadId);
          if (!replied) return;

          repliesDetected += 1;
          await prisma.$transaction([
            prisma.contact.update({
              where: { id: contact.id },
              data: { repliedAt: new Date() },
            }),
            prisma.email.updateMany({
              where: {
                contactId: contact.id,
                sequenceStep: { gt: 0 },
                status: { in: ["draft", "approved"] },
              },
              data: { status: "cancelled" },
            }),
          ]);
        } catch (error) {
          console.error(`Reply check failed for contact ${contact.id}`, error);
        }
      })
    );
  }

  const sentToday = await getFollowUpsSentTodayCount(settings.sendTimezone);
  let remainingSends = settings.dailyFollowUpLimit - sentToday;
  const withinWindow = isWithinSendWindow(settings);

  // Flush any follow-up that already has real generated content but never
  // successfully sent — either drafted-but-never-approved (window/budget
  // blocked it before approval) or approved-but-send-failed. Without this,
  // once content exists, the "due" query below (which requires subject
  // to still be empty) never sees it again — it'd be stuck forever.
  if (settings.autoApproveFollowUps && withinWindow && remainingSends > 0) {
    const pendingFollowUps = await prisma.email.findMany({
      where: {
        sequenceStep: { gt: 0 },
        status: { in: ["draft", "approved"] },
        subject: { not: "" },
      },
      include: { contact: { include: { company: true } } },
    });

    for (let i = 0; i < pendingFollowUps.length; i += FOLLOWUP_CONCURRENCY) {
      if (deadline.expired() || remainingSends <= 0) break;
      const chunk = pendingFollowUps.slice(i, i + FOLLOWUP_CONCURRENCY);
      await Promise.all(
        chunk.map(async (email) => {
          if (remainingSends <= 0) {
            results.push({ emailId: email.id, ok: true, skipped: "daily email limit reached" });
            return;
          }
          remainingSends -= 1;
          try {
            if (email.status === "draft") {
              await prisma.email.update({
                where: { id: email.id },
                data: { status: "approved", approvedAt: new Date(), approvedBy },
              });
            }
            const sendResult = await sendEmailAndAdvanceSequence({ ...email, status: "approved" });
            results.push({
              emailId: email.id,
              ok: sendResult.ok,
              error: sendResult.ok ? undefined : sendResult.error,
            });
          } catch (error) {
            results.push({
              emailId: email.id,
              ok: false,
              error: error instanceof Error ? error.message : "Failed to flush pending follow-up.",
            });
          }
        })
      );
    }
  }

  const dueFollowUps = deadline.expired()
    ? []
    : await prisma.email.findMany({
        where: {
          status: "draft",
          sequenceStep: { gt: 0 },
          scheduledFor: { lte: new Date() },
          subject: "",
        },
      });

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

  return { pipeline: pipelineSummary, processed: results.length, results, repliesDetected };
}
