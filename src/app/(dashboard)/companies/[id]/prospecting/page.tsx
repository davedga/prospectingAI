import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ContactSelectionTable } from "@/components/prospecting/contact-selection-table";

export default async function CompanyProspectingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const company = await prisma.company.findUnique({
    where: { id },
    include: { contacts: { orderBy: { createdAt: "asc" } } },
  });

  if (!company) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/prospecting"
        className="text-sm text-neutral-500 underline underline-offset-2"
      >
        ← Back to prospecting queue
      </Link>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg font-semibold">
              {company.name}
            </CardTitle>
            {company.priority && <Badge variant="outline">{company.priority}</Badge>}
            {company.archetype && <Badge variant="secondary">{company.archetype}</Badge>}
          </div>
          <p className="text-sm text-neutral-500">{company.domain}</p>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {company.accountThesis && <p>{company.accountThesis}</p>}
          <div className="flex flex-wrap gap-4 text-neutral-600">
            {company.heroSku && (
              <span>
                <span className="text-neutral-400">Hero SKU:</span> {company.heroSku}{" "}
                {company.skuPrice}
              </span>
            )}
            {company.parentCompany && (
              <span>
                <span className="text-neutral-400">Parent co.:</span>{" "}
                {company.parentCompany} ({company.parentRole})
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {company.contacts.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No contacts found yet. Run prospecting from the queue first.
        </p>
      ) : (
        <ContactSelectionTable companyId={company.id} contacts={company.contacts} />
      )}
    </div>
  );
}
