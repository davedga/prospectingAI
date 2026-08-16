"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { runAutomationCycle } from "@/lib/run-automation-cycle";

// Any of these being on means there's something for the automation cycle
// to actually do right now, instead of waiting for the next daily cron.
const RUN_NOW_KEYS = [
  "autoRunDiscovery",
  "autoSelectDiscovered",
  "autoProspectSelected",
  "autoDraftFirstEmails",
  "autoGenerateFollowUps",
] as const;

function triggerRunNow(settings: Record<string, unknown>, approvedBy: string) {
  const shouldRun = RUN_NOW_KEYS.some((key) => settings[key] === true);
  if (shouldRun) {
    after(() => {
      runAutomationCycle(approvedBy).catch((error) => {
        console.error("Immediate automation run failed", error);
      });
    });
  }
  return shouldRun;
}

export type SettingsSaveState = {
  status: "idle" | "success" | "error";
  message?: string;
  ranAutomationNow?: boolean;
  savedAt?: number;
};

export async function updateSettings(
  _prevState: SettingsSaveState,
  formData: FormData
): Promise<SettingsSaveState> {
  try {
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
    const minDiscoveryPerRun = Number(formData.get("minDiscoveryPerRun"));
    const abTestingEnabled = formData.get("abTestingEnabled") === "on";
    const abVariantAHint = (formData.get("abVariantAHint") as string) || null;
    const abVariantBHint = (formData.get("abVariantBHint") as string) || null;

    const updated = await prisma.settings.update({
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
        minDiscoveryPerRun,
        abTestingEnabled,
        abVariantAHint,
        abVariantBHint,
      },
    });

    revalidatePath("/settings");
    revalidatePath("/review");
    revalidatePath("/drafting");

    const ranAutomationNow = triggerRunNow(updated, "auto (settings save)");

    return { status: "success", ranAutomationNow, savedAt: Date.now() };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Failed to save settings.",
    };
  }
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
  const updated = await prisma.settings.update({
    where: { id: settings.id },
    data: { [key]: value },
  });
  revalidatePath("/review");
  revalidatePath("/settings");
  revalidatePath("/drafting");

  triggerRunNow(updated, "auto (toggle)");
}
