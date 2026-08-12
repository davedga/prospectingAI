"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

export async function updateSettings(formData: FormData) {
  const settings = await getSettings();

  const followUp1DelayDays = Number(formData.get("followUp1DelayDays"));
  const followUp2DelayDays = Number(formData.get("followUp2DelayDays"));
  const sequenceLength = Number(formData.get("sequenceLength"));
  const autoDraftFirstEmails = formData.get("autoDraftFirstEmails") === "on";
  const autoGenerateFollowUps = formData.get("autoGenerateFollowUps") === "on";
  const autoApproveFirstEmails = formData.get("autoApproveFirstEmails") === "on";
  const autoApproveFollowUps = formData.get("autoApproveFollowUps") === "on";
  const emailSignature = (formData.get("emailSignature") as string) || null;

  await prisma.settings.update({
    where: { id: settings.id },
    data: {
      followUp1DelayDays,
      followUp2DelayDays,
      sequenceLength,
      autoDraftFirstEmails,
      autoGenerateFollowUps,
      autoApproveFirstEmails,
      autoApproveFollowUps,
      emailSignature,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/review");
}

export async function toggleAutoApprove(
  key: "autoApproveFirstEmails" | "autoApproveFollowUps",
  value: boolean
) {
  const settings = await getSettings();
  await prisma.settings.update({
    where: { id: settings.id },
    data: { [key]: value },
  });
  revalidatePath("/review");
  revalidatePath("/settings");
}
