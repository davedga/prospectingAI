import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewRunForm } from "@/components/discovery/new-run-form";

export default async function DiscoveryPage() {
  const runs = await prisma.discoveryRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { _count: { select: { companies: true } } },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Discovery</h1>
        <p className="text-sm text-neutral-500">
          Describe the kind of brand you want Claude to source, screened
          against your exclusion list and standing feedback.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            New discovery run
          </CardTitle>
        </CardHeader>
        <CardContent>
          <NewRunForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            Past runs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-neutral-500">No discovery runs yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {runs.map((run) => (
                <li key={run.id} className="py-2.5">
                  <Link
                    href={`/discovery/${run.id}`}
                    className="flex items-center justify-between gap-4 text-sm"
                  >
                    <span className="truncate text-neutral-800">
                      {run.prompt}
                    </span>
                    <span className="shrink-0 text-neutral-500">
                      {run._count.companies} companies ·{" "}
                      {run.createdAt.toLocaleDateString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
