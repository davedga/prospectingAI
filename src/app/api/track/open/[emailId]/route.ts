import { after } from "next/server";
import { prisma } from "@/lib/prisma";

// 1x1 transparent GIF, served unconditionally — recipients' mail clients
// load this with no session, and a broken image would look suspicious.
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7",
  "base64"
);

async function recordOpen(emailId: string) {
  await prisma.email.updateMany({
    where: { id: emailId, status: "sent", openedAt: null },
    data: { openedAt: new Date() },
  });
  await prisma.email.updateMany({
    where: { id: emailId, status: "sent" },
    data: { openCount: { increment: 1 } },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ emailId: string }> }
) {
  const { emailId } = await params;

  after(() =>
    recordOpen(emailId).catch((error) => {
      console.error("Failed to record email open", emailId, error);
    })
  );

  return new Response(new Uint8Array(PIXEL), {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
