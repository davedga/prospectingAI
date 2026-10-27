import { notFound } from "next/navigation";
import { getReportData, isValidShareToken } from "@/lib/reports";
import { ReportView } from "@/components/reports/report-view";

// Public, read-only management report. This route is OUTSIDE the (dashboard)
// auth group and is allow-listed in src/proxy.ts, so it renders without a
// login — the path token is the gate. A wrong/absent token 404s. Share the
// URL /report/<REPORTS_SHARE_TOKEN> with management. Export links carry the
// same token so the CSV buttons work from the shared view too.
export const dynamic = "force-dynamic";

export default async function SharedReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!isValidShareToken(token)) notFound();

  const data = await getReportData();
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
        <ReportView
          data={data}
          readOnly
          exportHref={(d) =>
            `/api/reports/export/${d}?token=${encodeURIComponent(token)}`
          }
        />
      </div>
    </div>
  );
}
