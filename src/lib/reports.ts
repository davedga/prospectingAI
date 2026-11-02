import "server-only";
import { prisma } from "@/lib/prisma";
import {
  reprospectCompanyWhere,
  notReprospectCompanyWhere,
} from "@/lib/reprospect";

// New vs re-prospect split, reusing main's reprospect-marker model
// (DiscoveryRun prompt beginning with "[reprospect]"). See src/lib/reprospect.ts.
type Stream = "new" | "reprospect";
function companyStreamWhere(stream: Stream) {
  return stream === "reprospect"
    ? reprospectCompanyWhere
    : notReprospectCompanyWhere;
}

// ---------------------------------------------------------------------------
// Reporting aggregations for the management /reports dashboard.
//
// All email send/open/reply data comes from the live Email model. "Was this
// email actually sent?" is answered by `sentAt != null` (the most robust
// signal — status later flips to replied/bounced but sentAt stays set).
// Delivered is approximated as sent − bounced (Gmail gives us no separate
// delivery event). A GENUINE open is one fired >= 60s after send, which
// filters out mail-client prefetch/proxy opens (same rule used in the
// 2026-10-19 consolidated open-rate analysis).
// ---------------------------------------------------------------------------

export const GENUINE_OPEN_MIN_MS = 60 * 1000;

export type FunnelCounts = {
  sent: number;
  delivered: number;
  opened: number;
  genuineOpened: number;
  replied: number;
  bounced: number;
  firstTouches: number;
  followUps: number;
};

const sentWhere = { sentAt: { not: null } } as const;

// Replies are tracked on Contact.repliedAt (set when a Gmail reply is detected,
// which stops further follow-ups) — NOT on Email.status. Bounces are not
// status-tracked in this pipeline, so bounced stays 0 and delivered == sent.
async function funnelForWhere(
  emailExtra: Record<string, unknown> = {},
  contactWhere: Record<string, unknown> = {}
): Promise<FunnelCounts> {
  const base = { ...sentWhere, ...emailExtra };

  const [sent, bounced, replied, firstTouches, followUps, openedRows] =
    await Promise.all([
      prisma.email.count({ where: base }),
      prisma.email.count({ where: { ...base, status: "bounced" } }),
      prisma.contact.count({ where: { repliedAt: { not: null }, ...contactWhere } }),
      prisma.email.count({ where: { ...base, sequenceStep: 0 } }),
      prisma.email.count({ where: { ...base, sequenceStep: { gt: 0 } } }),
      // Only opened emails (small set) are pulled in full, so we can apply
      // the >=60s genuine-open rule in JS.
      prisma.email.findMany({
        where: { ...base, openedAt: { not: null } },
        select: { sentAt: true, openedAt: true },
      }),
    ]);

  const opened = openedRows.length;
  const genuineOpened = openedRows.filter(
    (e) =>
      e.sentAt != null &&
      e.openedAt != null &&
      e.openedAt.getTime() - e.sentAt.getTime() >= GENUINE_OPEN_MIN_MS
  ).length;

  return {
    sent,
    delivered: sent - bounced,
    opened,
    genuineOpened,
    replied,
    bounced,
    firstTouches,
    followUps,
  };
}

function streamEmailWhere(stream: Stream) {
  return { contact: { company: companyStreamWhere(stream) } };
}

export type StepRow = {
  step: number;
  sent: number;
  opened: number;
};

// Replies are per-contact (Contact.repliedAt), not per-step, so this table is
// sent / opened per touch; reply counts live in the funnel + "who's replying".
async function funnelByStep(): Promise<StepRow[]> {
  const [sent, opened] = await Promise.all([
    prisma.email.groupBy({
      by: ["sequenceStep"],
      where: sentWhere,
      _count: { _all: true },
    }),
    prisma.email.groupBy({
      by: ["sequenceStep"],
      where: { ...sentWhere, openedAt: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const map = new Map<number, StepRow>();
  for (const r of sent)
    map.set(r.sequenceStep, { step: r.sequenceStep, sent: r._count._all, opened: 0 });
  for (const r of opened) {
    const row = map.get(r.sequenceStep);
    if (row) row.opened = r._count._all;
  }
  return [...map.values()].sort((a, b) => a.step - b.step);
}

export type PersonActivity = {
  name: string;
  company: string;
  title: string;
  step: number;
  at: Date | null;
  // Admin-only fields — populated for the dashboard, omitted from the
  // tokenized public share view so prospect emails never leak via a share link.
  email?: string | null;
  openCount?: number;
};

async function recentOpeners(limit = 50): Promise<PersonActivity[]> {
  const rows = await prisma.email.findMany({
    where: { ...sentWhere, openedAt: { not: null } },
    orderBy: { openedAt: "desc" },
    take: limit,
    select: {
      sequenceStep: true,
      openedAt: true,
      openCount: true,
      contact: {
        select: {
          name: true,
          title: true,
          email: true,
          company: { select: { name: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    name: r.contact.name,
    company: r.contact.company.name,
    title: r.contact.title,
    step: r.sequenceStep,
    at: r.openedAt,
    email: r.contact.email,
    openCount: r.openCount,
  }));
}

async function recentRepliers(limit = 50): Promise<PersonActivity[]> {
  const rows = await prisma.contact.findMany({
    where: { repliedAt: { not: null } },
    orderBy: { repliedAt: "desc" },
    take: limit,
    select: {
      name: true,
      title: true,
      email: true,
      repliedAt: true,
      company: { select: { name: true } },
      emails: { where: { sentAt: { not: null } }, select: { sequenceStep: true } },
    },
  });
  return rows.map((r) => ({
    name: r.name,
    company: r.company.name,
    title: r.title,
    // Which touch they last received before replying.
    step: r.emails.reduce((max, e) => Math.max(max, e.sequenceStep), 0),
    at: r.repliedAt,
    email: r.email,
  }));
}

export type SegmentRow = { label: string; companies: number; replied: number };

// Group companies by a field (archetype = segment proxy, estRevenue = scale)
// and attach the number of contacts in each group that have replied, so the
// report can show which segments actually convert.
async function companySegments(
  field: "archetype" | "estRevenue"
): Promise<SegmentRow[]> {
  const groups = await prisma.company.groupBy({
    by: [field],
    _count: { _all: true },
  });

  // Replied contacts are few — fetch them with their company field and tally.
  const repliedContacts = await prisma.contact.findMany({
    where: { repliedAt: { not: null } },
    select: { company: { select: { [field]: true } } },
  });
  const repliedByLabel = new Map<string, number>();
  for (const c of repliedContacts) {
    const label = (c.company as Record<string, unknown>)[field];
    const key = (label as string) ?? "(unspecified)";
    repliedByLabel.set(key, (repliedByLabel.get(key) ?? 0) + 1);
  }

  return groups
    .map((g) => {
      const label = (g[field] as string | null) ?? "(unspecified)";
      return {
        label,
        companies: g._count._all,
        replied: repliedByLabel.get(label) ?? 0,
      };
    })
    .sort((a, b) => b.companies - a.companies);
}

export type CountRow = { label: string; count: number };

async function groupCount(
  model: "cmoLead" | "igDmLead",
  field: string
): Promise<CountRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (prisma[model] as any).groupBy({
    by: [field],
    _count: { _all: true },
  });
  return rows
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((r: any) => ({
      label: (r[field] as string | null)?.trim() || "(blank)",
      count: r._count._all,
    }))
    .sort((a: CountRow, b: CountRow) => b.count - a.count);
}

export type ReportData = {
  generatedAt: Date;
  overall: FunnelCounts;
  byStream: { new: FunnelCounts; reprospect: FunnelCounts };
  byStep: StepRow[];
  openers: PersonActivity[];
  repliers: PersonActivity[];
  bySegment: SegmentRow[];
  byScale: SegmentRow[];
  counts: {
    brands: number;
    brandsProspected: number;
    contacts: number;
    cmos: number;
    cmosWithEmail: number;
    cmosContacted: number;
    cmoBrands: number;
    igLeads: number;
    igContacted: number;
  };
  cmoByStatus: CountRow[];
  cmoByFit: CountRow[];
  igByCategory: CountRow[];
  igByTtsStatus: CountRow[];
  igByDmStatus: CountRow[];
  trend: { date: string; replyRate: number; openRate: number; sent: number }[];
};

export async function getReportData(): Promise<ReportData> {
  const [
    overall,
    streamNew,
    streamReprospect,
    byStep,
    openers,
    repliers,
    bySegment,
    byScale,
    brands,
    brandsProspected,
    contacts,
    cmos,
    cmosWithEmail,
    cmosContacted,
    cmoBrands,
    igLeads,
    igContactedZero,
    cmoByStatus,
    cmoByFitRaw,
    igByCategory,
    igByTtsStatus,
    igByDmStatus,
    snapshots,
  ] = await Promise.all([
    funnelForWhere(),
    funnelForWhere(streamEmailWhere("new"), { company: companyStreamWhere("new") }),
    funnelForWhere(streamEmailWhere("reprospect"), {
      company: companyStreamWhere("reprospect"),
    }),
    funnelByStep(),
    recentOpeners(),
    recentRepliers(),
    companySegments("archetype"),
    companySegments("estRevenue"),
    prisma.company.count(),
    prisma.company.count({
      where: { status: { in: ["prospected", "outreach_active"] } },
    }),
    prisma.contact.count(),
    prisma.cmoLead.count(),
    prisma.cmoLead.count({ where: { email: { not: null } } }),
    prisma.cmoLead.count({
      where: { clientsContacted: { not: null } },
    }),
    prisma.cmoClientBrand.count(),
    prisma.igDmLead.count(),
    prisma.igDmLead.count({
      where: { camDmStatus: null },
    }),
    groupCount("cmoLead", "status"),
    prisma.cmoLead.groupBy({ by: ["fit"], _count: { _all: true } }),
    groupCount("igDmLead", "category"),
    groupCount("igDmLead", "ttsStatus"),
    groupCount("igDmLead", "camDmStatus"),
    prisma.metricSnapshot.findMany({
      orderBy: { date: "desc" },
      take: 14,
    }),
  ]);

  const cmoByFit: CountRow[] = cmoByFitRaw
    .map((r) => ({
      label: r.fit == null ? "(unrated)" : `Fit ${r.fit}`,
      count: r._count._all,
    }))
    .sort((a, b) => b.label.localeCompare(a.label));

  const trend = snapshots
    .map((s) => {
      const p = s.payload as {
        replyRate?: number;
        openRate?: number;
        sent?: number;
      };
      return {
        date: s.date,
        replyRate: p.replyRate ?? 0,
        openRate: p.openRate ?? 0,
        sent: p.sent ?? 0,
      };
    })
    .reverse();

  return {
    generatedAt: new Date(),
    overall,
    byStream: { new: streamNew, reprospect: streamReprospect },
    byStep,
    openers,
    repliers,
    bySegment,
    byScale,
    counts: {
      brands,
      brandsProspected,
      contacts,
      cmos,
      cmosWithEmail,
      cmosContacted,
      cmoBrands,
      igLeads,
      igContacted: igLeads - igContactedZero,
    },
    cmoByStatus,
    cmoByFit,
    igByCategory,
    igByTtsStatus,
    igByDmStatus,
    trend,
  };
}

// --- helpers used by the page + snapshot script ---------------------------

export function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10; // one decimal
}

// --- share-link access -----------------------------------------------------

// The /report/[token] route is public (outside the dashboard auth group); it
// renders only when the path token equals REPORTS_SHARE_TOKEN. This is a
// capability link for internal management. Compared with ===, a constant-time
// check avoids leaking length/prefix via timing.
export function isValidShareToken(token: string | null | undefined): boolean {
  const expected = process.env.REPORTS_SHARE_TOKEN;
  if (!expected || !token) return false;
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

// --- CSV serialization ------------------------------------------------------

function csvCell(value: unknown): string {
  if (value == null) return "";
  let s: string;
  if (value instanceof Date) s = value.toISOString();
  else s = String(value);
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(
  columns: { key: string; header: string }[],
  rows: Record<string, unknown>[]
): string {
  const head = columns.map((c) => csvCell(c.header)).join(",");
  const body = rows
    .map((row) => columns.map((c) => csvCell(row[c.key])).join(","))
    .join("\n");
  return `${head}\n${body}\n`;
}
