import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const STATUS_LABELS: Record<string, string> = {
  proposed: "Proposed",
  selected: "Selected",
  rejected: "Rejected",
  prospecting: "Prospecting",
  prospected: "Prospected",
  outreach_active: "Outreach active",
  dormant: "Dormant",
};

export default async function DashboardPage() {
  const [statusCounts, emailsAwaitingApproval, repliesNeedingResponse, recentActivity] =
    await Promise.all([
      prisma.company.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.email.findMany({
        where: { status: "draft", sequenceStep: { gte: 0 } },
        include: { contact: { include: { company: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.email.findMany({
        where: { status: "replied" },
        include: { contact: { include: { company: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
        distinct: ["contactId"],
      }),
      prisma.feedback.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { company: true, discoveryRun: true },
      }),
    ]);

  const countsByStatus = Object.fromEntries(
    statusCounts.map((s) => [s.status, s._count._all])
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-neutral-500">
          Pipeline overview across discovery, prospecting, and outreach.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        {Object.entries(STATUS_LABELS).map(([status, label]) => (
          <Card key={status}>
            <CardContent className="p-4">
              <p className="text-2xl font-semibold tabular-nums">
                {countsByStatus[status] ?? 0}
              </p>
              <p className="text-xs text-neutral-500">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              Emails awaiting approval
            </CardTitle>
          </CardHeader>
          <CardContent>
            {emailsAwaitingApproval.length === 0 ? (
              <p className="text-sm text-neutral-500">
                Nothing waiting on you right now.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {emailsAwaitingApproval.map((email) => (
                  <li key={email.id} className="py-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {email.contact.name}
                      </span>
                      <Badge variant="secondary">
                        {email.contact.company.name}
                      </Badge>
                    </div>
                    <p className="truncate text-neutral-500">
                      {email.subject}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/review"
              className="mt-3 inline-block text-sm font-medium text-neutral-900 underline underline-offset-2"
            >
              Go to review queue
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              Active replies — needs human response
            </CardTitle>
          </CardHeader>
          <CardContent>
            {repliesNeedingResponse.length === 0 ? (
              <p className="text-sm text-neutral-500">No open replies.</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {repliesNeedingResponse.map((email) => (
                  <li key={email.id} className="py-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {email.contact.name}
                      </span>
                      <Badge variant="destructive">Replied</Badge>
                    </div>
                    <p className="truncate text-neutral-500">
                      {email.contact.company.name}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            Recent feedback
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No feedback recorded yet.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {recentActivity.map((item) => (
                <li key={item.id} className="py-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{item.scope}</Badge>
                    <span className="text-neutral-500">
                      {item.company?.name ?? item.discoveryRun?.prompt}
                    </span>
                  </div>
                  <p className="mt-1 text-neutral-700">{item.note}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
