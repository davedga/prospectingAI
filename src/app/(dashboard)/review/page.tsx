import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmailReviewCard } from "@/components/drafting/email-review-card";
import { SendApprovedButton } from "@/components/review/send-approved-button";

export default async function ReviewPage() {
  const [draftEmails, approvedEmails] = await Promise.all([
    prisma.email.findMany({
      where: { status: "draft", subject: { not: "" } },
      include: { contact: { include: { company: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.email.findMany({
      where: { status: "approved" },
      include: { contact: { include: { company: true } } },
      orderBy: { approvedAt: "asc" },
    }),
  ]);

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
              Awaiting your review ({draftEmails.length})
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {draftEmails.length === 0 ? (
            <p className="text-sm text-neutral-500">Nothing waiting on you.</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {draftEmails.map((email) => (
                <EmailReviewCard
                  key={email.id}
                  email={email}
                  contactName={email.contact.name}
                  contactTitle={email.contact.title}
                  companyName={email.contact.company.name}
                  allowRegenerate={email.sequenceStep === 0}
                />
              ))}
            </div>
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
