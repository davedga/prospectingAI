import { prisma } from "@/lib/prisma";

function getOffsetMinutes(timezone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const offsetPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  const match = offsetPart.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

// Midnight *in the configured timezone*, expressed as a UTC Date — so
// "today" lines up with the admin's actual business day, not UTC's.
function startOfDayInTimezone(timezone: string, now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  const day = Number(parts.find((p) => p.type === "day")!.value);

  const offsetMinutes = getOffsetMinutes(timezone, now);
  const utcMidnightNaive = Date.UTC(year, month - 1, day, 0, 0, 0);
  return new Date(utcMidnightNaive - offsetMinutes * 60_000);
}

export async function getDiscoveredTodayCount(timezone: string): Promise<number> {
  return prisma.company.count({
    where: { createdAt: { gte: startOfDayInTimezone(timezone) } },
  });
}

export async function getProspectedTodayCount(timezone: string): Promise<number> {
  return prisma.contact.count({
    where: { createdAt: { gte: startOfDayInTimezone(timezone) } },
  });
}

export async function getFirstEmailsSentTodayCount(timezone: string): Promise<number> {
  return prisma.email.count({
    where: {
      status: "sent",
      sequenceStep: 0,
      sentAt: { gte: startOfDayInTimezone(timezone) },
    },
  });
}

export async function getFollowUpsSentTodayCount(timezone: string): Promise<number> {
  return prisma.email.count({
    where: {
      status: "sent",
      sequenceStep: { gt: 0 },
      sentAt: { gte: startOfDayInTimezone(timezone) },
    },
  });
}
