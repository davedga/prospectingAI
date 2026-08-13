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
  const standingDiscoveryBrief = (formData.get("standingDiscoveryBrief") as string) || null;
  const autoRunDiscovery = formData.get("autoRunDiscovery") === "on";
  const autoSelectDiscovered = formData.get("autoSelectDiscovered") === "on";
  const autoProspectSelected = formData.get("autoProspectSelected") === "on";

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
      standingDiscoveryBrief,
      autoRunDiscovery,
      autoSelectDiscovered,
      autoProspectSelected,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/review");
  revalidatePath("/drafting");
}

type BooleanSettingKey =
  | "autoApproveFirstEmails"
  | "autoApproveFollowUps"
  | "autoDraftFirstEmails"
  | "autoGenerateFollowUps"
  | "autoRunDiscovery"
  | "autoSelectDiscovered"
  | "autoProspectSelected";

export async function toggleAutoApprove(key: BooleanSettingKey, value: boolean) {
  const settings = await getSettings();
  await prisma.settings.update({
    where: { id: settings.id },
    data: { [key]: value },
  });
  revalidatePath("/review");
  revalidatePath("/settings");
  revalidatePath("/drafting");
}
