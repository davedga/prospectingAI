import { prisma } from "@/lib/prisma";
import { searchOrganization, searchPeople, enrichPerson } from "@/lib/apollo";

function classifyDecisionRole(title: string): string {
  const t = title.toLowerCase();
  if (/\b(ceo|founder|president|owner)\b/.test(t)) return "Economic buyer";
  if (/\b(vp|head of|director|chief)\b/.test(t)) return "Functional owner";
  if (/\bmanager\b/.test(t)) return "Operational champion";
  return "Influencer/router";
}

// Company.domain has no DB-level uniqueness constraint, and Discovery has
// historically created multiple rows for the same real brand (e.g. 14
// separate "Tushy" rows, all hellotushy.com). Prospecting a duplicate
// re-fetches the same real people from Apollo and re-emails them. Check
// for a sibling row on the same domain that already has a sent email
// before doing any Apollo work.
async function findContactedDuplicate(domain: string, excludeCompanyId: string) {
  const siblings = await prisma.company.findMany({
    where: { id: { not: excludeCompanyId }, domain: { equals: domain, mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      contacts: { select: { emails: { where: { status: "sent" }, select: { id: true }, take: 1 } } },
    },
  });
  return siblings.find((c) => c.contacts.some((contact) => contact.emails.length > 0));
}

export async function prospectCompany(companyId: string) {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
  });

  const duplicate = await findContactedDuplicate(company.domain, companyId);
  if (duplicate) {
    await prisma.company.update({
      where: { id: companyId },
      data: { status: "rejected" },
    });
    await prisma.feedback.create({
      data: {
        scope: "prospecting",
        companyId,
        note: `Skipped — ${company.domain} already contacted under company "${duplicate.name}" (id ${duplicate.id}). Prospecting this duplicate would re-email the same real people.`,
      },
    });
    return {
      companyId,
      contactsCreated: 0,
      error: `Skipped — ${company.domain} already has outreach sent under another company record ("${duplicate.name}"). Marked rejected to avoid re-contacting the same people.`,
    };
  }

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
