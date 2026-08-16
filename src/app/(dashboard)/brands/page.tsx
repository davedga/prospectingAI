import { prisma } from "@/lib/prisma";
import { BrandsTable, type BrandRow } from "@/components/brands/brands-table";

async function getVariantStats() {
  const [sentA, openedA, sentB, openedB] = await Promise.all([
    prisma.email.count({ where: { status: "sent", variant: "A" } }),
    prisma.email.count({ where: { status: "sent", variant: "A", openedAt: { not: null } } }),
    prisma.email.count({ where: { status: "sent", variant: "B" } }),
    prisma.email.count({ where: { status: "sent", variant: "B", openedAt: { not: null } } }),
  ]);
  return { sentA, openedA, sentB, openedB };
}

function openRate(opened: number, sent: number) {
  return sent === 0 ? "—" : `${Math.round((opened / sent) * 100)}%`;
}

export default async function BrandsPage() {
  const [companies, variantStats] = await Promise.all([
    prisma.company.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        discoveryRun: { select: { prompt: true } },
        _count: { select: { contacts: true } },
        contacts: {
          select: {
            emails: {
              where: { status: "sent" },
              select: { openedAt: true, clickedAt: true },
            },
          },
        },
      },
    }),
    getVariantStats(),
  ]);

  const brands: BrandRow[] = companies.map((c) => {
    const sentEmails = c.contacts.flatMap((contact) => contact.emails);
    return {
      id: c.id,
      name: c.name,
      domain: c.domain,
      status: c.status,
      archetype: c.archetype,
      priority: c.priority,
      discoveryPrompt: c.discoveryRun?.prompt ?? null,
      contactCount: c._count.contacts,
      sentCount: sentEmails.length,
      openedCount: sentEmails.filter((e) => e.openedAt).length,
      clickedCount: sentEmails.filter((e) => e.clickedAt).length,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Brands</h1>
        <p className="text-sm text-neutral-500">
          Every company the bot has ever proposed or prospected, in one
          place — separate from the Exclusions do-not-contact list.
        </p>
      </div>

      {(variantStats.sentA > 0 || variantStats.sentB > 0) && (
        <div className="flex flex-wrap gap-6 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm">
          <span className="font-medium text-neutral-700">A/B open rate:</span>
          <span>
            Variant A — {variantStats.sentA} sent, {variantStats.openedA} opened (
            {openRate(variantStats.openedA, variantStats.sentA)})
          </span>
          <span>
            Variant B — {variantStats.sentB} sent, {variantStats.openedB} opened (
            {openRate(variantStats.openedB, variantStats.sentB)})
          </span>
        </div>
      )}

      {brands.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Nothing here yet — run a Discovery batch to get started.
        </p>
      ) : (
        <BrandsTable brands={brands} />
      )}
    </div>
  );
}
