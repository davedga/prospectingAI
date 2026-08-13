import { NextResponse } from "next/server";
import { runDiscoveryBatch } from "@/lib/run-discovery";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const brief = (body?.prompt as string | undefined)?.trim();

  if (!brief) {
    return NextResponse.json({ error: "prompt is required." }, { status: 400 });
  }

  try {
    const { discoveryRunId } = await runDiscoveryBatch(brief, false);
    return NextResponse.json({ discoveryRunId });
  } catch (error) {
    console.error("Discovery generation failed", error);
    return NextResponse.json(
      { error: "Claude failed to generate a discovery batch." },
      { status: 502 }
    );
  }
}
