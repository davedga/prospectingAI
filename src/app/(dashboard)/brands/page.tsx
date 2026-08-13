import { prisma } from "@/lib/prisma";
import { BrandsTable, type BrandRow } from "@/components/brands/brands-table";

export default async function BrandsPage() {
  const companies = await prisma.company.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      discoveryRun: { select: { prompt: true } },
      _count: { select: { contacts: true } },
    },
  });

  const brands: BrandRow[] = companies.map((c) => ({
    id: c.id,
    name: c.name,
    domain: c.domain,
    status: c.status,
    archetype: c.archetype,
    priority: c.priority,
    discoveryPrompt: c.discoveryRun?.prompt ?? null,
    contactCount: c._count.contacts,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Brands</h1>
        <p className="text-sm text-neutral-500">
          Every company the bot has ever proposed or prospected, in one
          place — separate from the Exclusions do-not-contact list.
        </p>
      </div>

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
