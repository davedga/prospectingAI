import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

// Re-prospecting: brands from the prior-prospects list (the same ~8.35k names
// loaded into ExcludedBrand) that we deliberately reach out to again. They
// arrive pre-scored and pre-contacted via /api/cron/reprospect-import, each
// import batch recorded as a DiscoveryRun whose prompt starts with this
// marker — that's how the rest of the app tells a re-prospect apart from a
// net-new discovery without a schema change.
export const REPROSPECT_MARKER = "[reprospect]";

// Separate from dailyFirstEmailLimit so re-prospects never eat into the
// net-new first-touch budget (and vice versa).
export function getDailyReprospectLimit(): number {
  const n = Number(process.env.REPROSPECT_DAILY_LIMIT);
  return Number.isFinite(n) && n >= 0 && process.env.REPROSPECT_DAILY_LIMIT ? n : 30;
}

export const reprospectCompanyWhere: Prisma.CompanyWhereInput = {
  discoveryRun: { is: { prompt: { startsWith: REPROSPECT_MARKER } } },
};

export const notReprospectCompanyWhere: Prisma.CompanyWhereInput = {
  NOT: reprospectCompanyWhere,
};

export async function isReprospectCompany(company: { discoveryRunId: string | null }): Promise<boolean> {
  if (!company.discoveryRunId) return false;
  const run = await prisma.discoveryRun.findUnique({
    where: { id: company.discoveryRunId },
    select: { prompt: true },
  });
  return !!run?.prompt.startsWith(REPROSPECT_MARKER);
}

// The import stores the brand's "why now" signal as the first line of
// accountThesis ("Signal: ..."), phrased for the selected contact.
export function parseSignal(accountThesis: string | null | undefined): string | null {
  const m = accountThesis?.match(/^Signal: (.+)$/m);
  return m ? m[1].trim() : null;
}

// ---------------------------------------------------------------------------
// Angles — small, deliberate deviations from the standard first touch, so we
// can see what works on brands that have (probably) heard from us before.
// Stored on Contact.variant / Email.variant as "R-<angle>" so opens/replies
// can be broken down by angle the same way A/B variants are.

export type ReprospectAngle = "control" | "trigger" | "reconnect";

export const REPROSPECT_ANGLES: ReprospectAngle[] = ["control", "trigger", "reconnect"];

export function angleVariant(angle: ReprospectAngle): string {
  return `R-${angle}`;
}

export function parseAngle(variant: string | null | undefined): ReprospectAngle | null {
  const a = variant?.startsWith("R-") ? variant.slice(2) : null;
  return a && (REPROSPECT_ANGLES as string[]).includes(a) ? (a as ReprospectAngle) : null;
}

// Extra instruction appended to the normal first-touch prompt. Everything
// else (structure, claims discipline, subject format) stays identical — the
// point is to change exactly one thing per angle.
export function reprospectAngleInstruction(angle: ReprospectAngle, triggerNote: string | null): string {
  if (angle === "trigger" && triggerNote) {
    return `Re-prospect angle "trigger" — ONE change from the standard template: replace only the opening clause of paragraph 2 ("Ahead of Q4, I've been looking closely at the [category] category") with a short, natural reference to this real, current signal: ${triggerNote}. Keep it to a few words (e.g. "Congrats on the new role -" or "Saw the team is hiring for [role] -"), then continue paragraph 2 with the same "noticed [Company] [status]" sentence. Everything else exactly as the standard template.`;
  }
  if (angle === "reconnect") {
    return `Re-prospect angle "reconnect" — ONE change from the standard template: our team may have reached out to this brand some time ago, so start paragraph 1 with a brief, plain acknowledgement before the intro (e.g. "Reaching back out -" or "It's been a while since we last connected -"). Never claim a specific prior conversation, date, or that they replied. Everything else exactly as the standard template.`;
  }
  return `Re-prospect angle "control" — use the standard template exactly, no changes.`;
}
