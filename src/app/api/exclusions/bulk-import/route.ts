import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBulkBrandNames } from "@/lib/exclusions";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const raw = body?.text as string | undefined;

  if (!raw || !raw.trim()) {
    return NextResponse.json({ error: "No brand names provided." }, { status: 400 });
  }

  const names = parseBulkBrandNames(raw);

  const result = await prisma.$transaction(
    names.map((name) =>
      prisma.excludedBrand.upsert({
        where: { name },
        update: {},
        create: { name, source: "prior-prospects-import" },
      })
    )
  );

  return NextResponse.json({ imported: result.length });
}
