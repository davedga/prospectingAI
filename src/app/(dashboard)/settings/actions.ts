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
  const emailSignatureHtml = (formData.get("emailSignatureHtml") as string) || null;
  const standingDiscoveryBrief = (formData.get("standingDiscoveryBrief") as string) || null;
  const autoRunDiscovery = formData.get("autoRunDiscovery") === "on";
  const autoSelectDiscovered = formData.get("autoSelectDiscovered") === "on";
  const autoProspectSelected = formData.get("autoProspectSelected") === "on";
  const sendWindowStartHour = Number(formData.get("sendWindowStartHour"));
  const sendWindowEndHour = Number(formData.get("sendWindowEndHour"));
  const sendTimezone = (formData.get("sendTimezone") as string) || "America/New_York";
  const dailyDiscoveryLimit = Number(formData.get("dailyDiscoveryLimit"));
  const dailyProspectLimit = Number(formData.get("dailyProspectLimit"));
  const dailyEmailLimit = Number(formData.get("dailyEmailLimit"));
  const abTestingEnabled = formData.get("abTestingEnabled") === "on";
  const abVariantAHint = (formData.get("abVariantAHint") as string) || null;
  const abVariantBHint = (formData.get("abVariantBHint") as string) || null;

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
      emailSignatureHtml,
      standingDiscoveryBrief,
      autoRunDiscovery,
      autoSelectDiscovered,
      autoProspectSelected,
      sendWindowStartHour,
      sendWindowEndHour,
      sendTimezone,
      dailyDiscoveryLimit,
      dailyProspectLimit,
      dailyEmailLimit,
      abTestingEnabled,
      abVariantAHint,
      abVariantBHint,
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
