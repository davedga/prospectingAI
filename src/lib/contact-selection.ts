import { prisma } from "@/lib/prisma";

// Same default heuristic as the manual contact-selection UI: has an email,
// and isn't flagged low-relevance.
export async function autoSelectQualifyingContacts(companyId: string) {
  const result = await prisma.contact.updateMany({
    where: {
      companyId,
      email: { not: null },
      decisionRole: { not: "Low relevance" },
    },
    data: { selected: true },
  });
  return result.count;
}
