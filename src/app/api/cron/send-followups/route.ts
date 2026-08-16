import { NextResponse } from "next/server";
import { runAutomationCycle } from "@/lib/run-automation-cycle";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await runAutomationCycle("auto (cron)");
  return NextResponse.json(result);
}
