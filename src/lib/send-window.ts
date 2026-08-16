type WindowSettings = {
  sendWindowStartHour: number;
  sendWindowEndHour: number;
  sendTimezone: string;
};

// Hobby-tier Vercel Cron only fires once a day, so this mostly gates that
// single run — if it lands outside the window, automated sends wait for
// the next run rather than firing at 3am in the recipient's business hours.
export function isWithinSendWindow(settings: WindowSettings, now = new Date()): boolean {
  const hourString = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: settings.sendTimezone,
  }).format(now);
  const hour = Number(hourString) % 24;

  return hour >= settings.sendWindowStartHour && hour < settings.sendWindowEndHour;
}
