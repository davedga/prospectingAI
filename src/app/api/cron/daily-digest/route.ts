import { NextResponse } from "next/server";
import { sendDailyDigest } from "@/lib/daily-digest";
import { auth } from "@/auth";

export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  // Also allow a logged-in dashboard session to hit this directly (e.g. to
  // manually trigger a test digest) without needing the cron secret.
  if (!isCron) {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const result = await sendDailyDigest();
  return NextResponse.json(result);
}
