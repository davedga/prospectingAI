import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { runDiscoveryBatch } from "@/lib/run-discovery";
import { prospectCompany } from "@/lib/prospecting";
import { autoSelectQualifyingContacts } from "@/lib/contact-selection";
import { draftFirstEmail } from "@/lib/drafting";
import { sendEmailAndAdvanceSequence } from "@/lib/send-email";
import {
  getDiscoveredTodayCount,
  getProspectedTodayCount,
  getSentTodayCount,
} from "@/lib/daily-limits";
import { isWithinSendWindow } from "@/lib/send-window";

export type AutoPipelineSummary = {
  discoveryRunId: string | null;
  discoveredCompanies: number;
  discoverySkippedLimitReached: boolean;
  prospectedCompanies: number;
  prospectingErrors: number;
  prospectingSkippedLimitReached: boolean;
  draftedFirstEmails: number;
  draftingErrors: number;
  sentFromAutoApproval: number;
  sendErrors: number;
  sendSkippedOutsideWindow: number;
  sendSkippedLimitReached: number;
};

// These three stages are the only ones that run unattended, so daily
// limits and the send window only gate them — manual actions in the UI
// are already throttled by a human clicking things.
export async function runAutomatedPipeline(): Promise<AutoPipelineSummary> {
  const settings = await getSettings();

  const summary: AutoPipelineSummary = {
    discoveryRunId: null,
    discoveredCompanies: 0,
    discoverySkippedLimitReached: false,
    prospectedCompanies: 0,
    prospectingErrors: 0,
    prospectingSkippedLimitReached: false,
    draftedFirstEmails: 0,
    draftingErrors: 0,
    sentFromAutoApproval: 0,
    sendErrors: 0,
    sendSkippedOutsideWindow: 0,
    sendSkippedLimitReached: 0,
  };

  // 1. Self-directed discovery, using the standing brief instead of an
  // admin-typed prompt. Capped at the remaining daily discovery budget.
  if (settings.autoRunDiscovery && settings.standingDiscoveryBrief?.trim()) {
    const discoveredToday = await getDiscoveredTodayCount(settings.sendTimezone);
    const remaining = settings.dailyDiscoveryLimit - discoveredToday;

    if (remaining <= 0) {
      summary.discoverySkippedLimitReached = true;
    } else {
      try {
        const { discoveryRunId, companyIds } = await runDiscoveryBatch(
          settings.standingDiscoveryBrief.trim(),
          settings.autoSelectDiscovered,
          remaining
        );
        summary.discoveryRunId = discoveryRunId;
        summary.discoveredCompanies = companyIds.length;
      } catch (error) {
        console.error("Automated discovery failed", error);
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
  // remaining daily email budget.
  if (settings.autoDraftFirstEmails) {
    const sentToday = await getSentTodayCount(settings.sendTimezone);
    let remainingSends = settings.dailyEmailLimit - sentToday;
    const withinWindow = isWithinSendWindow(settings);

    const needsDraft = await prisma.contact.findMany({
      where: { selected: true, emails: { none: { sequenceStep: 0 } } },
      include: { company: true },
    });

    for (const contact of needsDraft) {
      try {
        const email = await draftFirstEmail(contact.id, undefined, true);
        summary.draftedFirstEmails += 1;

        if (email.status === "approved") {
          if (!withinWindow) {
            summary.sendSkippedOutsideWindow += 1;
          } else if (remainingSends <= 0) {
            summary.sendSkippedLimitReached += 1;
          } else {
            const result = await sendEmailAndAdvanceSequence({ ...email, contact });
            if (result.ok) {
              summary.sentFromAutoApproval += 1;
              remainingSends -= 1;
            } else {
              summary.sendErrors += 1;
            }
          }
        }
      } catch (error) {
        console.error(`Automated drafting failed for contact ${contact.id}`, error);
        summary.draftingErrors += 1;
      }
    }
  }

  return summary;
}
