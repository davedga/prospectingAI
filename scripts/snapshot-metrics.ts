// Write one row/day of the headline reporting numbers into MetricSnapshot so
// the /reports page can show day-over-day deltas and a short trend. Idempotent:
// upserts on the America/New_York date, so running it twice in a day just
// refreshes today's row.
//
//   npm run snapshot-metrics
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const GENUINE_OPEN_MIN_MS = 60 * 1000;

function nyDate(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(new Date());
}

async function main() {
  const [sent, bounced, replied, openedRows, cmos, igLeads] = await Promise.all([
    prisma.email.count({ where: { sentAt: { not: null } } }),
    prisma.email.count({ where: { sentAt: { not: null }, status: "bounced" } }),
    // Replies live on Contact.repliedAt, not Email.status.
    prisma.contact.count({ where: { repliedAt: { not: null } } }),
    prisma.email.findMany({
      where: { sentAt: { not: null }, openedAt: { not: null } },
      select: { sentAt: true, openedAt: true },
    }),
    prisma.cmoLead.count(),
    prisma.igDmLead.count(),
  ]);

  const opened = openedRows.length;
  const genuineOpened = openedRows.filter(
    (e) =>
      e.sentAt != null &&
      e.openedAt != null &&
      e.openedAt.getTime() - e.sentAt.getTime() >= GENUINE_OPEN_MIN_MS
  ).length;

  const round = (num: number, den: number) =>
    den ? Math.round((num / den) * 1000) / 10 : 0;

  const payload = {
    sent,
    delivered: sent - bounced,
    opened,
    genuineOpened,
    replied,
    bounced,
    openRate: round(genuineOpened, sent),
    replyRate: round(replied, sent),
    cmos,
    igLeads,
  };

  const date = nyDate();
  await prisma.metricSnapshot.upsert({
    where: { date },
    update: { payload },
    create: { date, payload },
  });

  console.log(`Snapshot ${date}:`, JSON.stringify(payload));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
