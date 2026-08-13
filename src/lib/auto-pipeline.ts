import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { runDiscoveryBatch } from "@/lib/run-discovery";
import { prospectCompany } from "@/lib/prospecting";
import { autoSelectQualifyingContacts } from "@/lib/contact-selection";
import { draftFirstEmail } from "@/lib/drafting";
import { sendEmailAndAdvanceSequence } from "@/lib/send-email";

export type AutoPipelineSummary = {
  discoveryRunId: string | null;
  discoveredCompanies: number;
  prospectedCompanies: number;
  prospectingErrors: number;
  draftedFirstEmails: number;
  draftingErrors: number;
  sentFromAutoApproval: number;
  sendErrors: number;
};

export async function runAutomatedPipeline(): Promise<AutoPipelineSummary> {
  const settings = await getSettings();

  const summary: AutoPipelineSummary = {
    discoveryRunId: null,
    discoveredCompanies: 0,
    prospectedCompanies: 0,
    prospectingErrors: 0,
    draftedFirstEmails: 0,
    draftingErrors: 0,
    sentFromAutoApproval: 0,
    sendErrors: 0,
  };

  // 1. Self-directed discovery, using the standing brief instead of an
  // admin-typed prompt.
  if (settings.autoRunDiscovery && settings.standingDiscoveryBrief?.trim()) {
    try {
      const { discoveryRunId, companyIds } = await runDiscoveryBatch(
        settings.standingDiscoveryBrief.trim(),
        settings.autoSelectDiscovered
      );
      summary.discoveryRunId = discoveryRunId;
      summary.discoveredCompanies = companyIds.length;
    } catch (error) {
      console.error("Automated discovery failed", error);
    }
  }

  // 2. Auto-prospect every company sitting in "selected" with no contacts
  // yet, then auto-select the qualifying contacts Apollo found.
  if (settings.autoProspectSelected) {
    const toProspect = await prisma.company.findMany({
      where: { status: "selected" },
      select: { id: true },
    });

    for (const company of toProspect) {
      try {
        await prospectCompany(company.id);
        await autoSelectQualifyingContacts(company.id);
        summary.prospectedCompanies += 1;
      } catch (error) {
        console.error(`Automated prospecting failed for company ${company.id}`, error);
        summary.prospectingErrors += 1;
      }
    }
  }

  // 3. Auto-draft first emails for selected contacts that don't have one
  // yet, and auto-send immediately if auto-approve resulted in "approved".
  if (settings.autoDraftFirstEmails) {
    const needsDraft = await prisma.contact.findMany({
      where: { selected: true, emails: { none: { sequenceStep: 0 } } },
      include: { company: true },
    });

    for (const contact of needsDraft) {
      try {
        const email = await draftFirstEmail(contact.id, undefined, true);
        summary.draftedFirstEmails += 1;

        if (email.status === "approved") {
          const result = await sendEmailAndAdvanceSequence({ ...email, contact });
          if (result.ok) summary.sentFromAutoApproval += 1;
          else summary.sendErrors += 1;
        }
      } catch (error) {
        console.error(`Automated drafting failed for contact ${contact.id}`, error);
        summary.draftingErrors += 1;
      }
    }
  }

  return summary;
}
