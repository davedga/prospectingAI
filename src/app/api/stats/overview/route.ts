import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const maxDuration = 30;

// Bucket a raw Apollo/Discovery title into a coarse role group for
// reporting — decisionRole already exists but only has 4 buckets and
// collapses distinctions (e.g. CEO vs. VP) the admin asked about directly.
function titleBucket(title: string): string {
  const t = title.toLowerCase();
  if (/\b(ceo|founder|co-founder|president|owner)\b/.test(t)) return "Founder/CEO/Owner";
  if (/\bcoo\b/.test(t)) return "COO";
  if (/\bcmo\b/.test(t)) return "CMO";
  if (/\b(vp|vice president)\b/.test(t)) return "VP";
  if (/\bhead of\b/.test(t)) return "Head of [dept]";
  if (/\bdirector\b/.test(t)) return "Director";
  if (/\bmanager\b/.test(t)) return "Manager";
  return "Other/Individual contributor";
}

function summarize(rows: { openCount: number }[]) {
  const sent = rows.length;
  const opened = rows.filter((r) => r.openCount > 0).length;
  const multiOpened = rows.filter((r) => r.openCount >= 2).length;
  const totalOpens = rows.reduce((s, r) => s + r.openCount, 0);
  return {
    sent,
    opened,
    openRate: sent ? Math.round((opened / sent) * 1000) / 10 : 0,
    multiOpened,
    multiOpenRate: sent ? Math.round((multiOpened / sent) * 1000) / 10 : 0,
    avgOpens: sent ? Math.round((totalOpens / sent) * 100) / 100 : 0,
  };
}

// Raw openCount is dominated by near-instant automated pixel-fetches
// (Gmail's own image proxy warms/caches every external image shortly
// after send, regardless of whether any human ever opens the message —
// confirmed here by ~87% of opens landing within 60s, uniformly across
// unrelated recipient domains). "genuineOpened" excludes anything whose
// FIRST open landed inside that 60s window as bot-likely, so this is a
// much more honest (if still conservative) read of real engagement.
function isGenuineOpen(e: { sentAt: Date | null; openedAt: Date | null }): boolean {
  if (!e.sentAt || !e.openedAt) return false;
  return e.openedAt.getTime() - e.sentAt.getTime() >= 60_000;
}

function summarizeGenuine(rows: { sentAt: Date | null; openedAt: Date | null; openCount: number }[]) {
  const sent = rows.length;
  const genuineRows = rows.filter(isGenuineOpen);
  const opened = genuineRows.length;
  // Only a proxy — we only store the FIRST open's timestamp, not each
  // individual one — but a second (or later) open on a row whose first
  // open already cleared the 60s bot-window is the closest read of real
  // repeat engagement the current data supports.
  const multiOpened = genuineRows.filter((r) => r.openCount >= 2).length;
  return {
    sent,
    genuineOpened: opened,
    genuineOpenRate: sent ? Math.round((opened / sent) * 1000) / 10 : 0,
    genuineMultiOpened: multiOpened,
    genuineMultiOpenRate: sent ? Math.round((multiOpened / sent) * 1000) / 10 : 0,
  };
}

export async function GET() {
  const sentEmails = await prisma.email.findMany({
    where: { status: "sent" },
    select: {
      id: true,
      sequenceStep: true,
      openCount: true,
      openedAt: true,
      clickCount: true,
      clickedAt: true,
      sentAt: true,
      subject: true,
      body: true,
      variant: true,
      contact: {
        select: {
          name: true,
          title: true,
          decisionRole: true,
          email: true,
          company: {
            select: { id: true, name: true, priority: true, archetype: true, ttsStatus: true },
          },
        },
      },
    },
    orderBy: { sentAt: "desc" },
  });

  // --- by decision role (existing 4-bucket classification) ---
  const byDecisionRole: Record<string, typeof sentEmails> = {};
  for (const e of sentEmails) {
    const key = e.contact.decisionRole || "Unknown";
    (byDecisionRole[key] ??= []).push(e);
  }
  const decisionRoleStats = Object.entries(byDecisionRole)
    .map(([role, rows]) => ({ role, ...summarize(rows), ...summarizeGenuine(rows) }))
    .sort((a, b) => b.genuineOpenRate - a.genuineOpenRate);

  // --- by finer title bucket ---
  const byTitleBucket: Record<string, typeof sentEmails> = {};
  for (const e of sentEmails) {
    const key = titleBucket(e.contact.title);
    (byTitleBucket[key] ??= []).push(e);
  }
  const titleBucketStats = Object.entries(byTitleBucket)
    .map(([bucket, rows]) => ({ bucket, ...summarize(rows), ...summarizeGenuine(rows) }))
    .sort((a, b) => b.genuineOpenRate - a.genuineOpenRate);

  // --- by company priority tier ---
  const byPriority: Record<string, typeof sentEmails> = {};
  for (const e of sentEmails) {
    const key = e.contact.company.priority || "Unknown";
    (byPriority[key] ??= []).push(e);
  }
  // Corrected-only — raw openRate/multiOpenRate is dominated by Gmail's
  // image-proxy pre-fetch noise (see summarizeGenuine above) and was
  // dropped here at the admin's request rather than reported alongside
  // the real number.
  const priorityStats = Object.entries(byPriority)
    .map(([priority, rows]) => ({ priority, ...summarizeGenuine(rows) }))
    .sort((a, b) => b.genuineOpenRate - a.genuineOpenRate);

  // --- by company archetype ---
  const byArchetype: Record<string, typeof sentEmails> = {};
  for (const e of sentEmails) {
    const key = e.contact.company.archetype || "Unknown";
    (byArchetype[key] ??= []).push(e);
  }
  const archetypeStats = Object.entries(byArchetype)
    .map(([archetype, rows]) => ({ archetype, ...summarize(rows), ...summarizeGenuine(rows) }))
    .sort((a, b) => b.genuineOpenRate - a.genuineOpenRate);

  // --- per company (which companies are opening, incl. multi-POC opens) ---
  const byCompany: Record<
    string,
    { companyId: string; companyName: string; priority: string | null; rows: typeof sentEmails }
  > = {};
  for (const e of sentEmails) {
    const c = e.contact.company;
    const entry = (byCompany[c.id] ??= { companyId: c.id, companyName: c.name, priority: c.priority, rows: [] });
    entry.rows.push(e);
  }
  const companyStats = Object.values(byCompany)
    .map((c) => {
      const contactsAtCompany = new Set(c.rows.map((r) => r.contact.name));
      const contactsWhoOpened = new Set(c.rows.filter((r) => r.openCount > 0).map((r) => r.contact.name));
      return {
        companyId: c.companyId,
        companyName: c.companyName,
        priority: c.priority,
        pocsContacted: contactsAtCompany.size,
        pocsWhoOpened: contactsWhoOpened.size,
        ...summarize(c.rows),
      };
    })
    .filter((c) => c.pocsWhoOpened >= 2 || c.multiOpened > 0)
    .sort((a, b) => b.pocsWhoOpened - a.pocsWhoOpened || b.opened - a.opened);

  // --- by sequence step (first touch vs follow-ups) ---
  const byStep: Record<number, typeof sentEmails> = {};
  for (const e of sentEmails) (byStep[e.sequenceStep] ??= []).push(e);
  const stepStats = Object.entries(byStep)
    .map(([step, rows]) => ({ step: Number(step), ...summarize(rows) }))
    .sort((a, b) => a.step - b.step);

  // --- by A/B variant ---
  const byVariant: Record<string, typeof sentEmails> = {};
  for (const e of sentEmails) {
    const key = e.variant || "none";
    (byVariant[key] ??= []).push(e);
  }
  const variantStats = Object.entries(byVariant)
    .map(([variant, rows]) => ({ variant, ...summarize(rows) }))
    .sort((a, b) => b.openRate - a.openRate);

  // --- click tracking presence ---
  const totalClicks = sentEmails.reduce((s, e) => s + e.clickCount, 0);
  const emailsWithClicks = sentEmails.filter((e) => e.clickCount > 0).length;

  // --- timing: how long after send did the first open/click land? ---
  // A genuine human open is scattered over minutes/hours/days. A cluster of
  // opens landing within seconds of send is the signature of an automated
  // scanner (corporate mail security pre-fetching images/links, or Apple
  // Mail Privacy Protection) rather than a person actually reading it.
  function bucketDelta(ms: number): string {
    const s = ms / 1000;
    if (s < 10) return "<10s";
    if (s < 60) return "10-60s";
    if (s < 300) return "1-5min";
    if (s < 1800) return "5-30min";
    if (s < 7200) return "30min-2hr";
    if (s < 86400) return "2-24hr";
    return ">24hr";
  }

  const openDeltaBuckets: Record<string, number> = {};
  let openDeltasConsidered = 0;
  let under60sOpens = 0;
  for (const e of sentEmails) {
    if (!e.sentAt || !e.openedAt) continue;
    const deltaMs = e.openedAt.getTime() - e.sentAt.getTime();
    if (deltaMs < 0) continue;
    openDeltasConsidered += 1;
    if (deltaMs < 60_000) under60sOpens += 1;
    const bucket = bucketDelta(deltaMs);
    openDeltaBuckets[bucket] = (openDeltaBuckets[bucket] ?? 0) + 1;
  }

  const clickDeltaBuckets: Record<string, number> = {};
  let clickDeltasConsidered = 0;
  let under60sClicks = 0;
  let clicksWithNoRecordedOpen = 0;
  for (const e of sentEmails) {
    if (!e.sentAt || !e.clickedAt) continue;
    if (!e.openedAt) clicksWithNoRecordedOpen += 1;
    const deltaMs = e.clickedAt.getTime() - e.sentAt.getTime();
    if (deltaMs < 0) continue;
    clickDeltasConsidered += 1;
    if (deltaMs < 60_000) under60sClicks += 1;
    const bucket = bucketDelta(deltaMs);
    clickDeltaBuckets[bucket] = (clickDeltaBuckets[bucket] ?? 0) + 1;
  }

  // Same signal, broken out by recipient email domain — corporate mail
  // security (Microsoft Defender Safe Links, Proofpoint, etc.) is what
  // typically drives near-instant opens/clicks, and it's domain-specific
  // (a company's own mail gateway), so a real bot-scan pattern should show
  // up concentrated in particular domains rather than spread evenly.
  const byDomainTiming: Record<string, { sent: number; opened: number; under60s: number }> = {};
  for (const e of sentEmails) {
    const domain = e.contact.email?.split("@")[1]?.toLowerCase() ?? "unknown";
    const entry = (byDomainTiming[domain] ??= { sent: 0, opened: 0, under60s: 0 });
    entry.sent += 1;
    if (e.openedAt && e.sentAt) {
      entry.opened += 1;
      if (e.openedAt.getTime() - e.sentAt.getTime() < 60_000) entry.under60s += 1;
    }
  }
  const domainTimingStats = Object.entries(byDomainTiming)
    .filter(([, v]) => v.sent >= 3)
    .map(([domain, v]) => ({
      domain,
      ...v,
      under60sRateOfOpened: v.opened ? Math.round((v.under60s / v.opened) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.under60sRateOfOpened - a.under60sRateOfOpened || b.sent - a.sent)
    .slice(0, 30);

  const timingStats = {
    opens: {
      consideredCount: openDeltasConsidered,
      under60sCount: under60sOpens,
      under60sRate: openDeltasConsidered
        ? Math.round((under60sOpens / openDeltasConsidered) * 1000) / 10
        : 0,
      byDelta: openDeltaBuckets,
    },
    clicks: {
      consideredCount: clickDeltasConsidered,
      under60sCount: under60sClicks,
      under60sRate: clickDeltasConsidered
        ? Math.round((under60sClicks / clickDeltasConsidered) * 1000) / 10
        : 0,
      clickedWithNoRecordedOpen: clicksWithNoRecordedOpen,
      byDelta: clickDeltaBuckets,
    },
    byDomain: domainTimingStats,
  };

  // --- recent sent samples for copy/template audit, one per step ---
  const samplesByStep: Record<number, { subject: string; body: string; sentAt: Date | null; companyName: string }[]> = {};
  for (const e of sentEmails) {
    const arr = (samplesByStep[e.sequenceStep] ??= []);
    if (arr.length < 8) {
      arr.push({ subject: e.subject, body: e.body, sentAt: e.sentAt, companyName: e.contact.company.name });
    }
  }

  return NextResponse.json({
    totals: summarizeGenuine(sentEmails),
    decisionRoleStats,
    titleBucketStats,
    priorityStats,
    archetypeStats,
    companyStats,
    stepStats,
    variantStats,
    clickTracking: { totalClicks, emailsWithClicks, totalSent: sentEmails.length },
    timingStats,
    samplesByStep,
  });
}
