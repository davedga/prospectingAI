import { prisma } from "@/lib/prisma";
import { ReprospectPicker } from "@/components/reprospect/reprospect-picker";

// Targeted re-prospecting: browse the prior-prospect pool (brands that didn't
// respond, loaded into ExcludedBrand as category="prior-prospect") and queue
// selected brands back into automated outreach. Queueing resolves each
// brand's domain and creates a [reprospect] Company the auto-pipeline picks up.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

export default async function ReprospectPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const where = {
    category: "prior-prospect" as const,
    ...(query ? { name: { contains: query, mode: "insensitive" as const } } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.excludedBrand.count({ where: { category: "prior-prospect" } }),
    prisma.excludedBrand.findMany({
      where,
      orderBy: { name: "asc" },
      take: PAGE_SIZE,
      select: { name: true, instagramUrl: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Re-prospecting</h1>
        <p className="text-sm text-neutral-500">
          {total.toLocaleString()} prior prospects (didn&apos;t respond last time).
          Search, select, and queue brands to re-contact — the bot resolves each
          brand&apos;s site, finds contacts, and emails them under the re-prospect
          track.
        </p>
      </div>

      <ReprospectPicker
        rows={rows}
        query={query}
        total={total}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
