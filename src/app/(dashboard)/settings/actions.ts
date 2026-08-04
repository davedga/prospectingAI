"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

export async function updateSettings(formData: FormData) {
  const settings = await getSettings();

  const followUp1DelayDays = Number(formData.get("followUp1DelayDays"));
  const followUp2DelayDays = Number(formData.get("followUp2DelayDays"));
  const sequenceLength = Number(formData.get("sequenceLength"));
  const autoApproveFollowUps = formData.get("autoApproveFollowUps") === "on";

  await prisma.settings.update({
    where: { id: settings.id },
    data: {
      followUp1DelayDays,
      followUp2DelayDays,
      sequenceLength,
      autoApproveFollowUps,
    },
  });

  revalidatePath("/settings");
}
