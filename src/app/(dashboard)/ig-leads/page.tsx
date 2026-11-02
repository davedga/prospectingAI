import { prisma } from "@/lib/prisma";
import { IgLeadsClient } from "@/components/ig-leads/ig-leads-client";

// In-app IG-DM lead generator for Cam. Generates TikTok-Shop-fit brands with
// web-verified Instagram handles, deduped against the DB, and lets Cam work
// them (mark DM status) + export the familiar xlsx. See src/lib/ig-lead-gen.ts.
export const dynamic = "force-dynamic";

export default async function IgLeadsPage() {
  const leads = await prisma.igDmLead.findMany({
    where: { source: "in-app-gen" },
    orderBy: { importedAt: "desc" },
    take: 500,
  });
  const totalImported = await prisma.igDmLead.count({
    where: { source: { not: "in-app-gen" } },
  });

  return <IgLeadsClient initialLeads={leads} importedCount={totalImported} />;
}
