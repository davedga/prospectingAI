import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DraftingBoard } from "@/components/drafting/drafting-board";
import { GeneralFeedbackBox } from "@/components/drafting/general-feedback-box";
import { SettingToggle } from "@/components/review/auto-approve-toggle";

export default async function DraftingPage() {
  const [contacts, settings] = await Promise.all([
    prisma.contact.findMany({
      where: { selected: true },
      orderBy: { createdAt: "asc" },
      include: {
        company: { select: { name: true } },
        emails: {
          where: { sequenceStep: 0 },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    }),
    getSettings(),
  ]);

  const boardContacts = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    title: c.title,
    companyName: c.company.name,
    email: c.emails[0]
      ? {
          id: c.emails[0].id,
          contactId: c.emails[0].contactId,
          subject: c.emails[0].subject,
          body: c.emails[0].body,
          claimsNotToMake: c.emails[0].claimsNotToMake,
          status: c.emails[0].status,
          sequenceStep: c.emails[0].sequenceStep,
        }
      : null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Drafting</h1>
          <p className="text-sm text-neutral-500">
            Every selected contact across every company, in one place —
            draft, edit, approve, or reject without hopping between
            companies.
          </p>
        </div>
        <SettingToggle
          id="drafting-auto-draft"
          settingKey="autoDraftFirstEmails"
          initialValue={settings.autoDraftFirstEmails}
          label="Auto-draft"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            General feedback for drafting
          </CardTitle>
          <p className="text-xs text-neutral-500">
            Not tied to one contact or company — saved as standing style
            feedback fed into every future draft, first-touch and
            follow-up alike.
          </p>
        </CardHeader>
        <CardContent>
          <GeneralFeedbackBox />
        </CardContent>
      </Card>

      <DraftingBoard
        contacts={boardContacts}
        autoDraft={settings.autoDraftFirstEmails}
      />
    </div>
  );
}
