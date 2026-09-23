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
    .map(([role, rows]) => ({ role, ...summarize(rows) }))
    .sort((a, b) => b.openRate - a.openRate);

  // --- by finer title bucket ---
  const byTitleBucket: Record<string, typeof sentEmails> = {};
  for (const e of sentEmails) {
    const key = titleBucket(e.contact.title);
    (byTitleBucket[key] ??= []).push(e);
  }
  const titleBucketStats = Object.entries(byTitleBucket)
    .map(([bucket, rows]) => ({ bucket, ...summarize(rows) }))
    .sort((a, b) => b.openRate - a.openRate);

  // --- by company priority tier ---
  const byPriority: Record<string, typeof sentEmails> = {};
  for (const e of sentEmails) {
    const key = e.contact.company.priority || "Unknown";
    (byPriority[key] ??= []).push(e);
  }
  const priorityStats = Object.entries(byPriority)
    .map(([priority, rows]) => ({ priority, ...summarize(rows) }))
    .sort((a, b) => b.openRate - a.openRate);

  // --- by company archetype ---
  const byArchetype: Record<string, typeof sentEmails> = {};
  for (const e of sentEmails) {
    const key = e.contact.company.archetype || "Unknown";
    (byArchetype[key] ??= []).push(e);
  }
  const archetypeStats = Object.entries(byArchetype)
    .map(([archetype, rows]) => ({ archetype, ...summarize(rows) }))
    .sort((a, b) => b.openRate - a.openRate);

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

  // --- recent sent samples for copy/template audit, one per step ---
  const samplesByStep: Record<number, { subject: string; body: string; sentAt: Date | null; companyName: string }[]> = {};
  for (const e of sentEmails) {
    const arr = (samplesByStep[e.sequenceStep] ??= []);
    if (arr.length < 8) {
      arr.push({ subject: e.subject, body: e.body, sentAt: e.sentAt, companyName: e.contact.company.name });
    }
  }

  return NextResponse.json({
    totals: summarize(sentEmails),
    decisionRoleStats,
    titleBucketStats,
    priorityStats,
    archetypeStats,
    companyStats,
    stepStats,
    variantStats,
    clickTracking: { totalClicks, emailsWithClicks, totalSent: sentEmails.length },
    samplesByStep,
  });
}
