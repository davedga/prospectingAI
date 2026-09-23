import { prisma } from "@/lib/prisma";
import { titleBucket } from "@/lib/title-bucket";
import { isLargeCompany } from "@/lib/company-size";

// Role-preference order for picking POCs automatically. Backed by the
// opens/clicks analysis in src/app/api/stats/overview: once bot-inflated
// opens are filtered out, VP has the best genuine open rate and
// Founder/CEO/Owner the best genuine repeat-open count, while Director
// and Manager trail badly. At a larger, more structured company the
// founder is usually insulated from cold outreach and a VP is the more
// reachable real decision-maker; at a smaller company the founder is
// often still reading their own inbox, so keep them first there.
const ROLE_ORDER_LARGE_COMPANY = ["VP", "Founder/CEO/Owner", "COO", "Director", "Manager"];
const ROLE_ORDER_DEFAULT = ["Founder/CEO/Owner", "VP", "COO", "Director", "Manager"];

const MAX_AUTO_SELECTED_POCS = 2;

// Same base qualification as before (has an email, isn't flagged
// low-relevance), but now ranks by role and only auto-selects the top 2 —
// previously this selected every qualifying contact regardless of role,
// which is how a single company ended up with 8+ contacts sent to.
export async function autoSelectQualifyingContacts(companyId: string) {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { archetype: true, estRevenue: true },
  });

  const contacts = await prisma.contact.findMany({
    where: {
      companyId,
      email: { not: null },
      decisionRole: { not: "Low relevance" },
    },
    select: { id: true, title: true },
  });

  if (contacts.length === 0) return 0;

  const order = isLargeCompany(company) ? ROLE_ORDER_LARGE_COMPANY : ROLE_ORDER_DEFAULT;
  const rank = (title: string) => {
    const i = order.indexOf(titleBucket(title));
    return i === -1 ? order.length : i;
  };

  const chosen = [...contacts]
    .sort((a, b) => rank(a.title) - rank(b.title))
    .slice(0, MAX_AUTO_SELECTED_POCS);

  const result = await prisma.contact.updateMany({
    where: { id: { in: chosen.map((c) => c.id) } },
    data: { selected: true },
  });
  return result.count;
}
