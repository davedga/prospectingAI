import "server-only";
import { prisma } from "@/lib/prisma";
import { sendGmailMessage } from "@/lib/gmail";

const DIGEST_RECIPIENT = "david@dallasglobal.com";
const MAX_LISTED = 50;

function formatList(entries: { contact: { name: string; company: { name: string } }; subject: string }[]) {
  if (entries.length === 0) return "(none)";
  const lines = entries
    .slice(0, MAX_LISTED)
    .map((e) => `- ${e.contact.name} (${e.contact.company.name}) — "${e.subject}"`);
  if (entries.length > MAX_LISTED) {
    lines.push(`...and ${entries.length - MAX_LISTED} more`);
  }
  return lines.join("\n");
}

// Summarizes everything that landed in "draft" status (awaiting review) in
// the last 24 hours and emails it to the admin — a daily heads-up so drafts
// don't sit unnoticed in the Review Queue.
export async function sendDailyDigest() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const drafts = await prisma.email.findMany({
    where: { status: "draft", createdAt: { gte: since } },
    include: { contact: { include: { company: true } } },
    orderBy: { createdAt: "desc" },
  });

  const firstTouches = drafts.filter((e) => e.sequenceStep === 0);
  const followUps = drafts.filter((e) => e.sequenceStep > 0);

  const text = `Drafts from the last 24 hours, sitting in the Review Queue awaiting your approval.

First touches (${firstTouches.length}):
${formatList(firstTouches)}

Follow-ups (${followUps.length}):
${formatList(followUps)}
`;

  const from = process.env.ADMIN_EMAIL;
  if (!from) {
    return { ok: false as const, error: "ADMIN_EMAIL is not set." };
  }

  const total = firstTouches.length + followUps.length;
  const result = await sendGmailMessage({
    from,
    to: DIGEST_RECIPIENT,
    subject: `DGA Prospecting — ${total} draft${total === 1 ? "" : "s"} awaiting review`,
    text,
  });

  return { ok: true as const, total, messageId: result.id };
}
