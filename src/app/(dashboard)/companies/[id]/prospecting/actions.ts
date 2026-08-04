"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function confirmContactSelection(
  companyId: string,
  selectedContactIds: string[],
  feedbackNote: string
) {
  const contacts = await prisma.contact.findMany({
    where: { companyId },
    select: { id: true },
  });
  const selectedSet = new Set(selectedContactIds);

  await prisma.$transaction([
    prisma.contact.updateMany({
      where: { id: { in: contacts.filter((c) => selectedSet.has(c.id)).map((c) => c.id) } },
      data: { selected: true },
    }),
    prisma.contact.updateMany({
      where: { id: { in: contacts.filter((c) => !selectedSet.has(c.id)).map((c) => c.id) } },
      data: { selected: false },
    }),
    ...(feedbackNote.trim()
      ? [
          prisma.feedback.create({
            data: {
              scope: "prospecting" as const,
              companyId,
              note: feedbackNote.trim(),
            },
          }),
        ]
      : []),
  ]);

  revalidatePath(`/companies/${companyId}/prospecting`);
  redirect(`/companies/${companyId}/drafting`);
}
