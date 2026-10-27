import { getReportData } from "@/lib/reports";
import { ReportView } from "@/components/reports/report-view";

// Admin-facing report. Lives inside the authed (dashboard) group, so the
// sidebar + sign-out shell wrap it. Management uses the public share link
// (/report/<token>) instead — same data, no login. See src/lib/reports.ts
// isValidShareToken and src/app/report/[token]/page.tsx.
export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const data = await getReportData();
  return (
    <ReportView data={data} exportHref={(d) => `/api/reports/export/${d}`} />
  );
}
