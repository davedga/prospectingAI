import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { DraftingBoard } from "@/components/drafting/drafting-board";

export default async function CompanyDraftingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const settings = await getSettings();

  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      contacts: {
        where: { selected: true },
        orderBy: { createdAt: "asc" },
        include: {
          emails: {
            where: { sequenceStep: 0 },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  if (!company) notFound();

  const contacts = company.contacts.map((c) => ({
    id: c.id,
    name: c.name,
    title: c.title,
    companyName: company.name,
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
      <Link
        href={`/companies/${company.id}/prospecting`}
        className="text-sm text-neutral-500 underline underline-offset-2"
      >
        ← Back to {company.name}
      </Link>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Draft emails — {company.name}
        </h1>
        <p className="text-sm text-neutral-500">
          Nothing sends until you approve each email.
        </p>
      </div>

      {contacts.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No selected contacts for this company yet.
        </p>
      ) : (
        <DraftingBoard
          contacts={contacts}
          autoDraft={settings.autoDraftFirstEmails}
        />
      )}
    </div>
  );
}
