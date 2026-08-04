import { prisma } from "@/lib/prisma";
import { ProspectingQueue } from "@/components/prospecting/prospecting-queue";

export default async function ProspectingPage() {
  const companies = await prisma.company.findMany({
    where: { status: { in: ["selected", "prospecting", "prospected"] } },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { contacts: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Prospecting</h1>
        <p className="text-sm text-neutral-500">
          Companies selected out of Discovery, queued for buying-committee
          research via Apollo.
        </p>
      </div>

      {companies.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Nothing queued. Select companies from a Discovery run first.
        </p>
      ) : (
        <ProspectingQueue companies={companies} />
      )}
    </div>
  );
}
