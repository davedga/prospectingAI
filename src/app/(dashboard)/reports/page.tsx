import { getReportData, getEngagementRows, type DateRange } from "@/lib/reports";
import { ReportView } from "@/components/reports/report-view";

// Admin-facing report. Lives inside the authed (dashboard) group, so the
// sidebar + sign-out shell wrap it. Management uses the public share link
// (/report/<token>) instead — same data, no login. See src/lib/reports.ts
// isValidShareToken and src/app/report/[token]/page.tsx.
export const dynamic = "force-dynamic";

function parseDays(raw: string | undefined): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function rangeFromDays(days: number | null): DateRange | undefined {
  return days ? { from: new Date(Date.now() - days * 86_400_000) } : undefined;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days } = await searchParams;
  const activeRangeDays = parseDays(days);
  const range = rangeFromDays(activeRangeDays);

  // getEngagementRows reads EmailOpenEvent; if the deploy lands before that
  // migration is applied, degrade to hiding the engagement tab rather than
  // 500-ing the whole report.
  const [data, engagement] = await Promise.all([
    getReportData(range),
    getEngagementRows(range).catch((err) => {
      console.error("Engagement rows unavailable (migration pending?)", err);
      return undefined;
    }),
  ]);

  return (
    <ReportView
      data={data}
      engagement={engagement}
      exportHref={(d) => `/api/reports/export/${d}`}
      rangePresetHref={(dd) => (dd ? `/reports?days=${dd}` : `/reports`)}
      activeRangeDays={activeRangeDays}
    />
  );
}
