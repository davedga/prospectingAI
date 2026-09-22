import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBulkBrandNames } from "@/lib/exclusions";

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const raw = body?.text as string | undefined;

  if (!raw || !raw.trim()) {
    return NextResponse.json({ error: "No brand names provided." }, { status: 400 });
  }

  const names = parseBulkBrandNames(raw);

  // Prisma's interactive-transaction default timeout is 5s — plenty for a
  // handful of upserts from the manual UI, but a large CSV import (hundreds
  // to thousands of names) routinely runs past that and fails with a
  // transaction-timeout error. Raise it to match maxDuration above instead
  // of forcing large imports to be chunked client-side.
  const result = await prisma.$transaction(
    names.map((name) =>
      prisma.excludedBrand.upsert({
        where: { name },
        update: {},
        create: { name, source: "prior-prospects-import" },
      })
    ),
    { timeout: 55_000 }
  );

  return NextResponse.json({ imported: result.length });
}
