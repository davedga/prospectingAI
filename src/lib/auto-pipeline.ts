import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { runDiscoveryBatch } from "@/lib/run-discovery";
import { proposeBroadenedBrief } from "@/lib/discovery";
import { getExcludedBrandSample } from "@/lib/exclusions";
import { prospectCompany } from "@/lib/prospecting";
import { autoSelectQualifyingContacts } from "@/lib/contact-selection";
import { draftFirstEmail } from "@/lib/drafting";
import { sendEmailAndAdvanceSequence } from "@/lib/send-email";
import {
  getDiscoveredTodayCount,
  getProspectedTodayCount,
  getFirstEmailsSentTodayCount,
} from "@/lib/daily-limits";
import { isWithinSendWindow } from "@/lib/send-window";
import { createDeadline, type Deadline } from "@/lib/time-budget";

const DRAFT_SEND_CONCURRENCY = 5;
const BRIEF_AUTO_TUNE_COOLDOWN_MS = 20 * 60 * 60 * 1000; // ~20h, roughly once/day
const DEFAULT_PIPELINE_BUDGET_MS = 25_000;

export type AutoPipelineSummary = {
  discoveryRunId: string | null;
  discoveredCompanies: number;
  discoveryUsableCompanies: number;
  discoveryAttempts: number;
  discoveryShortfall: boolean;
  discoverySkippedLimitReached: boolean;
  discoveryBriefAutoTuned: boolean;
  discoveryBriefChangeSummary: string | null;
  prospectedCompanies: number;
  prospectingErrors: number;
  prospectingSkippedLimitReached: boolean;
  draftedFirstEmails: number;
  draftingErrors: number;
  sentFromAutoApproval: number;
  sendErrors: number;
  sendSkippedOutsideWindow: number;
  sendSkippedLimitReached: number;
  timeBudgetExhausted: boolean;
};

// These three stages are the only ones that run unattended, so daily
// limits and the send window only gate them — manual actions in the UI
// are already throttled by a human clicking things. Each stage also
// checks the shared wall-clock deadline before starting new work, so a
// slow stage (e.g. Discovery retrying) leaves time for the others instead
// of consuming the whole invocation — over many frequent runs (daily
// cron, or an external scheduler hitting the endpoint every few minutes)
// the work still adds up to the daily targets.
export async function runAutomatedPipeline(
  deadline: Deadline = createDeadline(DEFAULT_PIPELINE_BUDGET_MS)
): Promise<AutoPipelineSummary> {
  const settings = await getSettings();

  const summary: AutoPipelineSummary = {
    discoveryRunId: null,
    discoveredCompanies: 0,
    discoveryUsableCompanies: 0,
    discoveryAttempts: 0,
    discoveryShortfall: false,
    discoverySkippedLimitReached: false,
    discoveryBriefAutoTuned: false,
    discoveryBriefChangeSummary: null,
    prospectedCompanies: 0,
    prospectingErrors: 0,
    prospectingSkippedLimitReached: false,
    draftedFirstEmails: 0,
    draftingErrors: 0,
    sentFromAutoApproval: 0,
    sendErrors: 0,
    sendSkippedOutsideWindow: 0,
    sendSkippedLimitReached: 0,
    timeBudgetExhausted: false,
  };

  // 1. Self-directed discovery, using the standing brief instead of an
  // admin-typed prompt. Capped at the remaining daily discovery budget.
  if (settings.autoRunDiscovery && settings.standingDiscoveryBrief?.trim()) {
    if (deadline.expired()) {
      summary.timeBudgetExhausted = true;
    } else {
      const discoveredToday = await getDiscoveredTodayCount(settings.sendTimezone);
      const remaining = settings.dailyDiscoveryLimit - discoveredToday;

      if (remaining <= 0) {
        summary.discoverySkippedLimitReached = true;
      } else {
        const standingBrief = settings.standingDiscoveryBrief.trim();
        try {
          const { discoveryRunId, companyIds, usableCount, attempts, shortfall } =
            await runDiscoveryBatch(standingBrief, settings.autoSelectDiscovered, {
              maxCompanies: remaining,
              minCompanies: settings.minDiscoveryPerRun,
              deadline,
            });
          summary.discoveryRunId = discoveryRunId;
          summary.discoveredCompanies = companyIds.length;
          summary.discoveryUsableCompanies = usableCount;
          summary.discoveryAttempts = attempts;
          summary.discoveryShortfall = shortfall;

          if (shortfall) {
            console.warn(
              `Discovery fell short of minDiscoveryPerRun (${settings.minDiscoveryPerRun}): only ${usableCount} usable candidates after ${attempts} attempt(s).`
            );

            // Persist a broadened brief so the next run doesn't hit the same
            // wall — capped to roughly once/day so it doesn't drift on every
            // single run if an external scheduler is triggering frequently.
            // Skipped if we're already out of time budget this invocation;
            // it'll get picked up on a future run instead.
            const cooledDown =
              !settings.standingBriefAutoTunedAt ||
              Date.now() - settings.standingBriefAutoTunedAt.getTime() >
                BRIEF_AUTO_TUNE_COOLDOWN_MS;

            if (cooledDown && !deadline.expired()) {
              try {
                const excludedSample = await getExcludedBrandSample(25);
                const { brief: newBrief, changeSummary } = await proposeBroadenedBrief({
                  currentBrief: standingBrief,
                  excludedSample,
                  usableCount,
                  targetCount: settings.minDiscoveryPerRun,
                });
                await prisma.settings.update({
                  where: { id: settings.id },
                  data: { standingDiscoveryBrief: newBrief, standingBriefAutoTunedAt: new Date() },
                });
                await prisma.feedback.create({
                  data: {
                    scope: "discovery",
                    note: `Auto-broadened standing brief after a shortfall (${usableCount}/${settings.minDiscoveryPerRun} usable candidates): ${changeSummary}`,
                  },
                });
                summary.discoveryBriefAutoTuned = true;
                summary.discoveryBriefChangeSummary = changeSummary;
              } catch (error) {
                console.error("Failed to auto-tune standing discovery brief", error);
              }
            }
          }
        } catch (error) {
          console.error("Automated discovery failed", error);
        }
      }
    }
  }

  // 2. Auto-prospect every company sitting in "selected" with no contacts
  // yet, then auto-select the qualifying contacts Apollo found. Capped at
  // the remaining daily POC (contact) budget — checked between companies,
  // since a single company's contact count isn't known in advance.
  if (settings.autoProspectSelected) {
    const prospectedToday = await getProspectedTodayCount(settings.sendTimezone);
    let remaining = settings.dailyProspectLimit - prospectedToday;

    if (remaining <= 0) {
      summary.prospectingSkippedLimitReached = true;
    } else {
      const toProspect = await prisma.company.findMany({
        where: { status: "selected" },
        select: { id: true },
      });

      for (const company of toProspect) {
        if (remaining <= 0) {
          summary.prospectingSkippedLimitReached = true;
          break;
        }
        if (deadline.expired()) {
          summary.timeBudgetExhausted = true;
          break;
        }
        try {
          const result = await prospectCompany(company.id);
          await autoSelectQualifyingContacts(company.id);
          summary.prospectedCompanies += 1;
          remaining -= result.contactsCreated;
        } catch (error) {
          console.error(`Automated prospecting failed for company ${company.id}`, error);
          summary.prospectingErrors += 1;
        }
      }
    }
  }

  // 3. Auto-draft first emails for selected contacts that don't have one
  // yet, and auto-send immediately if auto-approve resulted in "approved"
  // — but only within the configured send window, and capped at the
  // remaining daily first-email budget. Processed in small concurrent
  // batches (each draft+send is a couple of network round-trips) so more
  // fits inside a single serverless invocation.
  if (settings.autoDraftFirstEmails) {
    const sentToday = await getFirstEmailsSentTodayCount(settings.sendTimezone);
    let remainingSends = settings.dailyFirstEmailLimit - sentToday;
    const withinWindow = isWithinSendWindow(settings);

    const needsDraft = await prisma.contact.findMany({
      where: { selected: true, emails: { none: { sequenceStep: 0 } } },
      include: { company: true },
    });

    for (let i = 0; i < needsDraft.length; i += DRAFT_SEND_CONCURRENCY) {
      if (deadline.expired()) {
        summary.timeBudgetExhausted = true;
        break;
      }
      const chunk = needsDraft.slice(i, i + DRAFT_SEND_CONCURRENCY);
      await Promise.all(
        chunk.map(async (contact) => {
          try {
            const email = await draftFirstEmail(contact.id, undefined, true);
            summary.draftedFirstEmails += 1;

            if (email.status !== "approved") return;

            if (!withinWindow) {
              summary.sendSkippedOutsideWindow += 1;
              return;
            }
            if (remainingSends <= 0) {
              summary.sendSkippedLimitReached += 1;
              return;
            }
            // Reserve budget synchronously (no await between check and
            // decrement) so concurrent sends in this batch can't overshoot.
            remainingSends -= 1;

            const result = await sendEmailAndAdvanceSequence({ ...email, contact });
            if (result.ok) {
              summary.sentFromAutoApproval += 1;
            } else {
              summary.sendErrors += 1;
            }
          } catch (error) {
            console.error(`Automated drafting failed for contact ${contact.id}`, error);
            summary.draftingErrors += 1;
          }
        })
      );
    }
  }

  return summary;
}
