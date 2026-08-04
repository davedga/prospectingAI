import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

export async function scheduleNextFollowUp(contactId: string, sentStep: number, sentAt: Date) {
  const settings = await getSettings();
  const nextStep = sentStep + 1;

  if (nextStep >= settings.sequenceLength) return null;

  const delayDays = nextStep === 1 ? settings.followUp1DelayDays : settings.followUp2DelayDays;
  const scheduledFor = new Date(sentAt.getTime() + delayDays * 24 * 60 * 60 * 1000);

  return prisma.email.create({
    data: {
      contactId,
      sequenceStep: nextStep,
      subject: "",
      body: "",
      status: "draft",
      scheduledFor,
    },
  });
}
