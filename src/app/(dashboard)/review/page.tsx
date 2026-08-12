import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SendApprovedButton } from "@/components/review/send-approved-button";
import { UpcomingFollowUps } from "@/components/review/upcoming-followups";
import { AutoApproveToggle } from "@/components/review/auto-approve-toggle";
import { ReviewSection } from "@/components/review/review-section";
import type { DraftTableEmail } from "@/components/drafting/draft-table";

export default async function ReviewPage() {
  const [firstEmails, followUpEmails, approvedEmails, upcomingFollowUps, settings] =
    await Promise.all([
      prisma.email.findMany({
        where: { status: "draft", sequenceStep: 0, subject: { not: "" } },
        include: { contact: { include: { company: true, emails: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.email.findMany({
        where: { status: "draft", sequenceStep: { gt: 0 }, subject: { not: "" } },
        include: { contact: { include: { company: true, emails: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.email.findMany({
        where: { status: "approved" },
        include: { contact: { include: { company: true } } },
        orderBy: { approvedAt: "asc" },
      }),
      prisma.email.findMany({
        where: { status: "draft", sequenceStep: { gt: 0 }, subject: "" },
        include: { contact: { include: { company: true } } },
        orderBy: { scheduledFor: "asc" },
      }),
      getSettings(),
    ]);

  const toTableEmail = (
    e: (typeof firstEmails)[number]
  ): DraftTableEmail => ({
    id: e.id,
    contactId: e.contactId,
    subject: e.subject,
    body: e.body,
    claimsNotToMake: e.claimsNotToMake,
    status: e.status,
    sequenceStep: e.sequenceStep,
    contactName: e.contact.name,
    contactTitle: e.contact.title,
    companyName: e.contact.company.name,
    sequenceLength: settings.sequenceLength,
    sequenceChain: e.contact.emails
      .filter((sib) => sib.subject !== "")
      .map((sib) => ({
        sequenceStep: sib.sequenceStep,
        status: sib.status,
        scheduledFor: sib.scheduledFor?.toISOString() ?? null,
        sentAt: sib.sentAt?.toISOString() ?? null,
      })),
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Review Queue</h1>
        <p className="text-sm text-neutral-500">
          Nothing sends until you approve it here.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              First emails awaiting review ({firstEmails.length})
            </CardTitle>
            <AutoApproveToggle
              id="auto-approve-first"
              settingKey="autoApproveFirstEmails"
              initialValue={settings.autoApproveFirstEmails}
            />
          </div>
        </CardHeader>
        <CardContent>
          <ReviewSection initialEmails={firstEmails.map(toTableEmail)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              Follow-ups awaiting review ({followUpEmails.length})
            </CardTitle>
            <AutoApproveToggle
              id="auto-approve-followups"
              settingKey="autoApproveFollowUps"
              initialValue={settings.autoApproveFollowUps}
            />
          </div>
        </CardHeader>
        <CardContent>
          <ReviewSection initialEmails={followUpEmails.map(toTableEmail)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            Upcoming follow-ups ({upcomingFollowUps.length})
          </CardTitle>
          <p className="text-xs text-neutral-500">
            Not drafted yet — either scheduled for later, or waiting on the
            daily cron. Draft one early if you don&apos;t want to wait.
          </p>
        </CardHeader>
        <CardContent>
          {upcomingFollowUps.length === 0 ? (
            <p className="text-sm text-neutral-500">No follow-ups pending.</p>
          ) : (
            <UpcomingFollowUps
              items={upcomingFollowUps.map((e) => ({
                id: e.id,
                sequenceStep: e.sequenceStep,
                scheduledFor: e.scheduledFor?.toISOString() ?? null,
                contact: {
                  name: e.contact.name,
                  company: { name: e.contact.company.name },
                },
              }))}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              Approved, ready to send ({approvedEmails.length})
            </CardTitle>
            <SendApprovedButton count={approvedEmails.length} />
          </div>
        </CardHeader>
        <CardContent>
          {approvedEmails.length === 0 ? (
            <p className="text-sm text-neutral-500">Nothing approved yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {approvedEmails.map((email) => (
                <li key={email.id} className="py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{email.contact.name}</span>
                    <span className="text-neutral-500">
                      {email.contact.company.name}
                    </span>
                  </div>
                  <p className="truncate text-neutral-500">{email.subject}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
