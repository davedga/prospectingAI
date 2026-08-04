import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const scope = body?.scope as string | undefined;
  const note = (body?.note as string | undefined)?.trim();
  const companyId = body?.companyId as string | undefined;
  const discoveryRunId = body?.discoveryRunId as string | undefined;

  if (!scope || !note) {
    return NextResponse.json(
      { error: "scope and note are required." },
      { status: 400 }
    );
  }

  const feedback = await prisma.feedback.create({
    data: { scope, note, companyId, discoveryRunId },
  });

  return NextResponse.json(feedback);
}
