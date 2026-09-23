import "server-only";
import { prisma } from "@/lib/prisma";

// prospectCompany() has historically created a fresh Contact row every time
// it ran against a company, with no check for whether a contact with that
// email already existed — so a company prospected more than once (a stuck
// "selected" status re-entering the automated pipeline, a manual re-run,
// etc.) ends up with dozens of duplicate rows for the exact same real
// person, each of which can independently get selected/drafted/sent to.
// Confirmed in production: Bearpaw's CEO and VP of Ecommerce each had ~18
// duplicate contact rows, 7 of which had already been sent real first-touch
// emails before this was caught. This merges every (companyId, email)
// group down to one canonical contact, reassigning all Email history onto
// it rather than deleting it, so past sends stay visible for reporting and
// so the merged contact correctly reflects "already contacted."

type ContactForDedup = {
  id: string;
  name: string;
  email: string;
  companyId: string;
  companyName: string;
  selected: boolean;
  createdAt: Date;
  sentCount: number;
  hasThread: boolean;
};

function pickPrimary(group: ContactForDedup[]): ContactForDedup {
  return [...group].sort((a, b) => {
    if (b.sentCount !== a.sentCount) return b.sentCount - a.sentCount;
    if (b.hasThread !== a.hasThread) return (b.hasThread ? 1 : 0) - (a.hasThread ? 1 : 0);
    if (b.selected !== a.selected) return (b.selected ? 1 : 0) - (a.selected ? 1 : 0);
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0];
}

async function loadGroups() {
  const contacts = await prisma.contact.findMany({
    where: { email: { not: null } },
    select: {
      id: true,
      name: true,
      email: true,
      companyId: true,
      selected: true,
      createdAt: true,
      gmailThreadId: true,
      company: { select: { name: true } },
      emails: { where: { status: "sent" }, select: { id: true } },
    },
  });

  const byKey = new Map<string, ContactForDedup[]>();
  for (const c of contacts) {
    if (!c.email) continue;
    const key = `${c.companyId}::${c.email.trim().toLowerCase()}`;
    const entry: ContactForDedup = {
      id: c.id,
      name: c.name,
      email: c.email,
      companyId: c.companyId,
      companyName: c.company.name,
      selected: c.selected,
      createdAt: c.createdAt,
      sentCount: c.emails.length,
      hasThread: Boolean(c.gmailThreadId),
    };
    const list = byKey.get(key);
    if (list) list.push(entry);
    else byKey.set(key, [entry]);
  }

  return Array.from(byKey.entries())
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({ key, group, primary: pickPrimary(group) }));
}

export async function planContactDedup() {
  const groups = await loadGroups();
  return {
    duplicateGroups: groups.length,
    contactsToRemove: groups.reduce((sum, g) => sum + g.group.length - 1, 0),
    emailsToReassign: groups.reduce(
      (sum, g) => sum + g.group.filter((c) => c.id !== g.primary.id).reduce((s, c) => s + c.sentCount, 0),
      0
    ),
    groups: groups
      .map((g) => ({
        companyName: g.primary.companyName,
        email: g.primary.email,
        keep: { id: g.primary.id, name: g.primary.name, sentCount: g.primary.sentCount },
        remove: g.group
          .filter((c) => c.id !== g.primary.id)
          .map((c) => ({ id: c.id, name: c.name, sentCount: c.sentCount })),
      }))
      .sort((a, b) => b.remove.length - a.remove.length),
  };
}

export async function runContactDedup() {
  const groups = await loadGroups();
  let contactsRemoved = 0;
  let emailsReassigned = 0;

  for (const { group, primary } of groups) {
    const duplicateIds = group.filter((c) => c.id !== primary.id).map((c) => c.id);
    if (duplicateIds.length === 0) continue;

    const moved = await prisma.email.updateMany({
      where: { contactId: { in: duplicateIds } },
      data: { contactId: primary.id },
    });
    emailsReassigned += moved.count;

    const deleted = await prisma.contact.deleteMany({ where: { id: { in: duplicateIds } } });
    contactsRemoved += deleted.count;
  }

  return { duplicateGroups: groups.length, contactsRemoved, emailsReassigned };
}
