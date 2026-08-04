import { prisma } from "@/lib/prisma";
import { searchOrganization, searchPeople, enrichPerson } from "@/lib/apollo";

function classifyDecisionRole(title: string): string {
  const t = title.toLowerCase();
  if (/\b(ceo|founder|president|owner)\b/.test(t)) return "Economic buyer";
  if (/\b(vp|head of|director|chief)\b/.test(t)) return "Functional owner";
  if (/\bmanager\b/.test(t)) return "Operational champion";
  return "Influencer/router";
}

export async function prospectCompany(companyId: string) {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
  });

  await prisma.company.update({
    where: { id: companyId },
    data: { status: "prospecting" },
  });

  try {
    const org = await searchOrganization(company.domain);
    if (!org) {
      await prisma.company.update({
        where: { id: companyId },
        data: { status: "prospected" },
      });
      return { companyId, contactsCreated: 0, error: "No matching Apollo organization found." };
    }

    if (org.parent_name && !company.parentCompany) {
      await prisma.company.update({
        where: { id: companyId },
        data: { parentCompany: org.parent_name, parentRole: "owns this brand" },
      });
    }

    const people = await searchPeople(org.id);
    const topCandidates = people.slice(0, 8);

    let contactsCreated = 0;
    for (const candidate of topCandidates) {
      const enriched = await enrichPerson({
        apolloId: candidate.id,
        organizationName: company.name,
        domain: company.domain,
      }).catch(() => null);

      const person = enriched ?? candidate;
      const name =
        person.name ?? [person.first_name, person.last_name].filter(Boolean).join(" ");
      if (!name || !person.title) continue;

      await prisma.contact.create({
        data: {
          companyId,
          name,
          title: person.title,
          email: person.email,
          emailStatus: person.email
            ? (person.email_status ?? "guessed")
            : "unavailable",
          linkedin: person.linkedin_url,
          location: [person.city, person.state, person.country]
            .filter(Boolean)
            .join(", "),
          decisionRole: classifyDecisionRole(person.title),
          apolloId: person.id,
        },
      });
      contactsCreated += 1;
    }

    await prisma.company.update({
      where: { id: companyId },
      data: { status: "prospected" },
    });

    return { companyId, contactsCreated };
  } catch (error) {
    await prisma.company.update({
      where: { id: companyId },
      data: { status: "selected" },
    });
    throw error;
  }
}
