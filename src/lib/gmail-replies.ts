import "server-only";
import { getGmailClient } from "@/lib/gmail";

// Requires the gmail.metadata (or broader) OAuth scope on top of the
// gmail.send scope used for sending — see README for the re-auth steps.
export async function checkThreadForReply(threadId: string): Promise<boolean> {
  const gmail = getGmailClient();
  const adminEmail = (process.env.ADMIN_EMAIL ?? "").toLowerCase();

  const res = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "metadata",
    metadataHeaders: ["From"],
  });

  const messages = res.data.messages ?? [];
  return messages.some((message) => {
    const fromHeader = message.payload?.headers?.find((h) => h.name === "From")?.value ?? "";
    return !fromHeader.toLowerCase().includes(adminEmail);
  });
}

// Backfills a contact's gmailThreadId for emails sent before thread
// tracking existed, using the Gmail message ID already stored on their
// sent Email row.
export async function resolveThreadIdFromMessageId(
  gmailMessageId: string
): Promise<string | undefined> {
  const gmail = getGmailClient();
  const res = await gmail.users.messages.get({
    userId: "me",
    id: gmailMessageId,
    format: "metadata",
    metadataHeaders: [],
  });
  return res.data.threadId ?? undefined;
}
