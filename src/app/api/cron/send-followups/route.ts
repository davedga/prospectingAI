import { NextResponse } from "next/server";
import { runAutomationCycle } from "@/lib/run-automation-cycle";

// Max allowed on Vercel's free Hobby plan — draft+send round-trips (Claude
// + Gmail API) add up fast at real volume (50+ first emails/day), so this
// squeezes in as much as possible per invocation. Still may not finish
// everything in one run; see README for the external hourly-scheduler
// recommendation to spread volume across more, shorter invocations.
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await runAutomationCycle("auto (cron)");
  return NextResponse.json(result);
}
