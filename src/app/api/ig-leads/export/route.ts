import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";

// Download the IG-DM leads as an .xlsx with the same columns Cam's master
// sheet uses, so the in-app list drops straight into his existing workflow.
// Session-gated by the dashboard middleware. (CSV is also available via
// /api/reports/export/ig-leads.)
export const dynamic = "force-dynamic";

const HEADERS = [
  "#", "Brand", "Category", "Website", "Instagram Handle", "Instagram URL",
  "TikTok Handle", "TikTok Shop Status", "TikTok Shop Evidence",
  "7-Figure Basis (estimate)", "Revenue Confidence", "US HQ",
  "Cam DM Status", "Notes",
];

export async function GET(request: Request) {
  const onlyGenerated =
    new URL(request.url).searchParams.get("source") === "in-app-gen";

  const rows = await prisma.igDmLead.findMany({
    where: onlyGenerated ? { source: "in-app-gen" } : undefined,
    orderBy: [{ importedAt: "desc" }],
  });

  const aoa: (string | number | null)[][] = [HEADERS];
  rows.forEach((r, i) => {
    aoa.push([
      i + 1, r.brand, r.category, r.website, r.igHandle, r.igUrl,
      r.tiktokHandle, r.ttsStatus, r.ttsEvidence, r.revenueBasis,
      r.revenueConfidence, r.usHq, r.camDmStatus, r.notes,
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "IG DM Leads");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="dga-ig-dm-leads-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
