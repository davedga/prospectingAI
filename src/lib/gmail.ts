import "server-only";
import { randomBytes } from "crypto";
import { google } from "googleapis";

export function getGmailClient() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN must all be set."
    );
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return google.gmail({ version: "v1", auth: oauth2Client });
}

function encodeSubject(subject: string) {
  // RFC 2047 encoded-word so non-ASCII subjects survive the raw MIME message.
  return `=?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`;
}

function base64UrlEncode(input: string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Self-generated RFC 2822 Message-ID so we can thread follow-ups via
// In-Reply-To/References without an extra API round-trip to fetch the
// Message-ID Gmail would otherwise assign.
function generateMessageId(fromAddress: string) {
  const domain = fromAddress.split("@")[1] ?? "dallasglobal.com";
  return `<${randomBytes(16).toString("hex")}@${domain}>`;
}

function buildRawMessage({
  from,
  to,
  subject,
  text,
  html,
  messageId,
  inReplyToMessageId,
}: {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  messageId: string;
  inReplyToMessageId?: string;
}) {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
  ];
  if (inReplyToMessageId) {
    headers.push(`In-Reply-To: ${inReplyToMessageId}`, `References: ${inReplyToMessageId}`);
  }

  if (!html) {
    const message = [...headers, 'Content-Type: text/plain; charset="UTF-8"', "", text].join(
      "\r\n"
    );
    return base64UrlEncode(message);
  }

  const boundary = `boundary_${Math.random().toString(36).slice(2)}`;
  const message = [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    text,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "",
    html,
    "",
    `--${boundary}--`,
  ].join("\r\n");

  return base64UrlEncode(message);
}

export async function sendGmailMessage({
  from,
  to,
  subject,
  text,
  html,
  threadId,
  inReplyToMessageId,
}: {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  // Gmail's own thread grouping — pass the first-touch send's threadId on
  // follow-ups so the whole sequence stays in one thread.
  threadId?: string;
  // RFC Message-ID of the first-touch email — sets In-Reply-To/References
  // so non-Gmail mail clients thread correctly too.
  inReplyToMessageId?: string;
}) {
  const gmail = getGmailClient();
  const messageId = generateMessageId(from);
  const raw = buildRawMessage({ from, to, subject, text, html, messageId, inReplyToMessageId });

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw, threadId },
  });

  return { id: res.data.id ?? undefined, threadId: res.data.threadId ?? undefined, messageId };
}
