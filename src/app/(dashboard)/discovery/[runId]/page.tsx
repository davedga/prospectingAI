import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ResultsTable } from "@/components/discovery/results-table";

export default async function DiscoveryRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;

  const run = await prisma.discoveryRun.findUnique({
    where: { id: runId },
    include: {
      companies: {
        include: { exclusionCheck: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!run) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/discovery"
        className="text-sm text-neutral-500 underline underline-offset-2"
      >
        ← Back to discovery
      </Link>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Discovery results
        </h1>
        <p className="text-sm text-neutral-500">{run.prompt}</p>
      </div>

      <ResultsTable runId={run.id} companies={run.companies} />
    </div>
  );
}
