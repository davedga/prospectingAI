"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function finalizeDiscoverySelection(
  runId: string,
  selectedCompanyIds: string[],
  feedbackNote: string
) {
  const companies = await prisma.company.findMany({
    where: { discoveryRunId: runId },
    select: { id: true },
  });

  const selectedSet = new Set(selectedCompanyIds);

  await prisma.$transaction([
    prisma.company.updateMany({
      where: { id: { in: companies.filter((c) => selectedSet.has(c.id)).map((c) => c.id) } },
      data: { status: "selected" },
    }),
    prisma.company.updateMany({
      where: { id: { in: companies.filter((c) => !selectedSet.has(c.id)).map((c) => c.id) } },
      data: { status: "rejected" },
    }),
    ...(feedbackNote.trim()
      ? [
          prisma.feedback.create({
            data: {
              scope: "discovery" as const,
              discoveryRunId: runId,
              note: feedbackNote.trim(),
            },
          }),
        ]
      : []),
  ]);

  revalidatePath("/discovery");
  revalidatePath(`/discovery/${runId}`);
  revalidatePath("/prospecting");
}
