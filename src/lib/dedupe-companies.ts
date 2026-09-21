import "server-only";
import { prisma } from "@/lib/prisma";
import { normalizeDomain } from "@/lib/domain";

type CompanyForDedup = {
  id: string;
  name: string;
  domain: string;
  status: string;
  createdAt: Date;
  contactCount: number;
  sentCount: number;
};

// Picks which company in a duplicate-domain group survives the merge:
// most real outreach history wins, then contact count, then the oldest
// record (most likely to have been reviewed/cleaned up by hand already).
function pickPrimary(group: CompanyForDedup[]): CompanyForDedup {
  return [...group].sort((a, b) => {
    if (b.sentCount !== a.sentCount) return b.sentCount - a.sentCount;
    if (b.contactCount !== a.contactCount) return b.contactCount - a.contactCount;
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0];
}

async function loadGroups() {
  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      domain: true,
      status: true,
      createdAt: true,
      _count: { select: { contacts: true } },
      contacts: { select: { emails: { where: { status: "sent" }, select: { id: true } } } },
    },
  });

  const byDomain = new Map<string, CompanyForDedup[]>();
  for (const c of companies) {
    const key = normalizeDomain(c.domain);
    if (!key) continue;
    const entry: CompanyForDedup = {
      id: c.id,
      name: c.name,
      domain: c.domain,
      status: c.status,
      createdAt: c.createdAt,
      contactCount: c._count.contacts,
      sentCount: c.contacts.reduce((sum, contact) => sum + contact.emails.length, 0),
    };
    const list = byDomain.get(key);
    if (list) list.push(entry);
    else byDomain.set(key, [entry]);
  }

  return Array.from(byDomain.entries())
    .filter(([, group]) => group.length > 1)
    .map(([domain, group]) => ({ domain, group, primary: pickPrimary(group) }));
}

export async function planCompanyDedup() {
  const groups = await loadGroups();
  return {
    duplicateGroups: groups.length,
    companiesToRemove: groups.reduce((sum, g) => sum + g.group.length - 1, 0),
    contactsToReassign: groups.reduce(
      (sum, g) => sum + g.group.filter((c) => c.id !== g.primary.id).reduce((s, c) => s + c.contactCount, 0),
      0
    ),
    groups: groups.map((g) => ({
      domain: g.domain,
      keep: { id: g.primary.id, name: g.primary.name, sentCount: g.primary.sentCount, contactCount: g.primary.contactCount },
      remove: g.group
        .filter((c) => c.id !== g.primary.id)
        .map((c) => ({ id: c.id, name: c.name, sentCount: c.sentCount, contactCount: c.contactCount })),
    })),
  };
}

// Moves every contact from each duplicate onto the survivor, then deletes
// the now-empty duplicate rows (and their Feedback/ExclusionCheck rows,
// which would otherwise block the delete on the FK). No Contact or Email
// row is ever deleted — only Company rows that have nothing left on them.
export async function runCompanyDedup() {
  const groups = await loadGroups();
  let companiesRemoved = 0;
  let contactsReassigned = 0;

  for (const { group, primary } of groups) {
    const duplicateIds = group.filter((c) => c.id !== primary.id).map((c) => c.id);
    if (duplicateIds.length === 0) continue;

    const moved = await prisma.contact.updateMany({
      where: { companyId: { in: duplicateIds } },
      data: { companyId: primary.id },
    });
    contactsReassigned += moved.count;

    await prisma.feedback.deleteMany({ where: { companyId: { in: duplicateIds } } });
    await prisma.exclusionCheck.deleteMany({ where: { companyId: { in: duplicateIds } } });
    const deleted = await prisma.company.deleteMany({ where: { id: { in: duplicateIds } } });
    companiesRemoved += deleted.count;
  }

  return { duplicateGroups: groups.length, companiesRemoved, contactsReassigned };
}
