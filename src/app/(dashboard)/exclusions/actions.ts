"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function addExcludedBrand(formData: FormData) {
  const name = (formData.get("name") as string)?.trim();
  if (!name) return;

  await prisma.excludedBrand.upsert({
    where: { name },
    update: {},
    create: { name, source: "manual" },
  });

  revalidatePath("/exclusions");
}

export async function removeExcludedBrand(id: string) {
  await prisma.excludedBrand.delete({ where: { id } });
  revalidatePath("/exclusions");
}
