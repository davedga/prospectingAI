import { notFound } from "next/navigation";
import { getReportData, isValidShareToken, type DateRange } from "@/lib/reports";
import { ReportView } from "@/components/reports/report-view";

// Public, read-only management report. This route is OUTSIDE the (dashboard)
// auth group and is allow-listed in src/proxy.ts, so it renders without a
// login — the path token is the gate. A wrong/absent token 404s. Share the
// URL /report/<REPORTS_SHARE_TOKEN> with management. Export links carry the
// same token so the CSV buttons work from the shared view too.
export const dynamic = "force-dynamic";

function parseDays(raw: string | undefined): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function rangeFromDays(days: number | null): DateRange | undefined {
  return days ? { from: new Date(Date.now() - days * 86_400_000) } : undefined;
}

export default async function SharedReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { token } = await params;
  if (!isValidShareToken(token)) notFound();

  const { days } = await searchParams;
  const activeRangeDays = parseDays(days);
  const range = rangeFromDays(activeRangeDays);

  const full = await getReportData(range);
  // Strip admin-only recipient emails before they reach the public share
  // payload — the share view never renders them, but they'd otherwise ship
  // in the serialized props. openCount stays (it's non-identifying).
  const stripEmail = (p: (typeof full.openers)[number]) => ({ ...p, email: null });
  const data = {
    ...full,
    openers: full.openers.map(stripEmail),
    repliers: full.repliers.map(stripEmail),
  };
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
        <ReportView
          data={data}
          readOnly
          exportHref={(d) =>
            `/api/reports/export/${d}?token=${encodeURIComponent(token)}`
          }
          activeRangeDays={activeRangeDays}
          rangePresetHref={(dd) =>
            dd
              ? `/report/${encodeURIComponent(token)}?days=${dd}`
              : `/report/${encodeURIComponent(token)}`
          }
        />
      </div>
    </div>
  );
}
