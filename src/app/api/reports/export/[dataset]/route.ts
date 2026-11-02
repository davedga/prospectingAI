import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { toCsv, isValidShareToken, getEngagementRows } from "@/lib/reports";

// One-click CSV export for the report datasets. This path is allow-listed in
// src/proxy.ts (middleware doesn't gate it), so the handler does its own
// access check: a logged-in admin session OR a valid ?token= (the same share
// token the /report/<token> page uses).
export const dynamic = "force-dynamic";

type Column = { key: string; header: string };

async function buildCsv(dataset: string): Promise<{ csv: string; filename: string } | null> {
  switch (dataset) {
    case "brands": {
      const cols: Column[] = [
        { key: "name", header: "Brand" },
        { key: "domain", header: "Domain" },
        { key: "status", header: "Status" },
        { key: "archetype", header: "Archetype" },
        { key: "priority", header: "Priority" },
        { key: "estRevenue", header: "Est. revenue" },
        { key: "revenueConf", header: "Revenue confidence" },
        { key: "ttsStatus", header: "TikTok Shop status" },
        { key: "createdAt", header: "Added" },
      ];
      const rows = await prisma.company.findMany({ orderBy: { createdAt: "desc" } });
      return { csv: toCsv(cols, rows as unknown as Record<string, unknown>[]), filename: "brands" };
    }
    case "contacts": {
      const cols: Column[] = [
        { key: "name", header: "Name" },
        { key: "title", header: "Title" },
        { key: "email", header: "Email" },
        { key: "emailStatus", header: "Email status" },
        { key: "decisionRole", header: "Decision role" },
        { key: "company", header: "Company" },
        { key: "repliedAt", header: "Replied at" },
      ];
      const data = await prisma.contact.findMany({
        include: { company: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      });
      const rows = data.map((c) => ({ ...c, company: c.company.name }));
      return { csv: toCsv(cols, rows as unknown as Record<string, unknown>[]), filename: "contacts" };
    }
    case "emails": {
      const cols: Column[] = [
        { key: "company", header: "Company" },
        { key: "contact", header: "Contact" },
        { key: "sequenceStep", header: "Step" },
        { key: "status", header: "Status" },
        { key: "subject", header: "Subject" },
        { key: "variant", header: "Variant" },
        { key: "sentAt", header: "Sent at" },
        { key: "openedAt", header: "Opened at" },
        { key: "openCount", header: "Open count" },
      ];
      const data = await prisma.email.findMany({
        where: { sentAt: { not: null } },
        include: { contact: { select: { name: true, company: { select: { name: true } } } } },
        orderBy: { sentAt: "desc" },
      });
      const rows = data.map((e) => ({
        ...e,
        contact: e.contact.name,
        company: e.contact.company.name,
      }));
      return { csv: toCsv(cols, rows as unknown as Record<string, unknown>[]), filename: "emails" };
    }
    case "cmos": {
      const cols: Column[] = [
        { key: "seq", header: "#" },
        { key: "name", header: "Name" },
        { key: "status", header: "Status" },
        { key: "fit", header: "Fit" },
        { key: "consumerSignals", header: "Consumer signals" },
        { key: "email", header: "Email" },
        { key: "emailStatus", header: "Email status" },
        { key: "linkedin", header: "LinkedIn" },
        { key: "location", header: "Location" },
        { key: "apolloTitle", header: "Title" },
        { key: "firm", header: "Firm" },
        { key: "firmIndustry", header: "Firm industry" },
        { key: "currentClients", header: "Current clients" },
        { key: "clientsContacted", header: "Clients DGA contacted" },
        { key: "notes", header: "Notes" },
      ];
      const rows = await prisma.cmoLead.findMany({ orderBy: { seq: "asc" } });
      return { csv: toCsv(cols, rows as unknown as Record<string, unknown>[]), filename: "cmos" };
    }
    case "cmo-brands": {
      const cols: Column[] = [
        { key: "brand", header: "Brand" },
        { key: "website", header: "Website" },
        { key: "category", header: "Category" },
        { key: "relationship", header: "Relationship" },
        { key: "ttsStatus", header: "TikTok Shop status" },
        { key: "alreadyContacted", header: "Already contacted by DGA" },
        { key: "cmoName", header: "Fractional CMO" },
        { key: "cmoFit", header: "CMO fit" },
        { key: "cmoEmail", header: "CMO email" },
        { key: "fromList", header: "From list" },
      ];
      const rows = await prisma.cmoClientBrand.findMany({ orderBy: { brand: "asc" } });
      return { csv: toCsv(cols, rows as unknown as Record<string, unknown>[]), filename: "cmo-client-brands" };
    }
    case "ig-leads": {
      const cols: Column[] = [
        { key: "seq", header: "#" },
        { key: "batchDate", header: "Batch date" },
        { key: "brand", header: "Brand" },
        { key: "category", header: "Category" },
        { key: "website", header: "Website" },
        { key: "igHandle", header: "Instagram" },
        { key: "igUrl", header: "Instagram URL" },
        { key: "tiktokHandle", header: "TikTok" },
        { key: "ttsStatus", header: "TikTok Shop status" },
        { key: "revenueBasis", header: "7-figure basis" },
        { key: "revenueConfidence", header: "Revenue confidence" },
        { key: "usHq", header: "US HQ" },
        { key: "camDmStatus", header: "Cam DM status" },
        { key: "notes", header: "Notes" },
      ];
      const rows = await prisma.igDmLead.findMany({ orderBy: { seq: "asc" } });
      return { csv: toCsv(cols, rows as unknown as Record<string, unknown>[]), filename: "ig-dm-leads" };
    }
    case "engagement": {
      const cols: Column[] = [
        { key: "company", header: "Brand" },
        { key: "person", header: "Person" },
        { key: "title", header: "Title" },
        { key: "email", header: "Email" },
        { key: "step", header: "Step" },
        { key: "status", header: "Status" },
        { key: "sentAt", header: "Sent at" },
        { key: "openCount", header: "Opens" },
        { key: "firstOpenAt", header: "First open" },
        { key: "lastOpenAt", header: "Last open" },
        { key: "genuineOpen", header: "Genuine open" },
        { key: "clicked", header: "Clicked" },
        { key: "repliedAt", header: "Replied at" },
        { key: "gmail", header: "Gmail search" },
        { key: "openTimestamps", header: "All open times" },
      ];
      const data = await getEngagementRows();
      const rows = data.map((r) => ({
        company: r.company,
        person: r.person,
        title: r.title,
        email: r.email,
        step: r.step === 0 ? "First" : `FU ${r.step}`,
        status: r.status,
        sentAt: r.sentAt,
        openCount: r.openCount,
        firstOpenAt: r.firstOpenAt,
        lastOpenAt: r.lastOpenAt,
        genuineOpen: r.genuineOpen ? "yes" : "",
        clicked: r.clicked ? "yes" : "",
        repliedAt: r.repliedAt,
        gmail: r.email
          ? `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(`from:${r.email} OR to:${r.email}`)}`
          : "",
        openTimestamps: r.openTimestamps.map((d) => d.toISOString()).join(" | "),
      }));
      return { csv: toCsv(cols, rows as unknown as Record<string, unknown>[]), filename: "engagement" };
    }
    default:
      return null;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ dataset: string }> }
) {
  const token = new URL(request.url).searchParams.get("token");
  const isAdmin = !!(await auth());
  const authorized = isValidShareToken(token) || isAdmin;
  if (!authorized) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { dataset } = await params;
  // The engagement export includes recipient emails — admin session only,
  // never the public share token.
  if (dataset === "engagement" && !isAdmin) {
    return new Response("Forbidden", { status: 403 });
  }
  const result = await buildCsv(dataset);
  if (!result) {
    return new Response("Unknown dataset", { status: 404 });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(result.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="dga-${result.filename}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
