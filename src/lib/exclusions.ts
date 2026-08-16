import { prisma } from "@/lib/prisma";

// A random sample of already-contacted/excluded brand names, used as
// "similar profile" reference material when broadening a discovery brief —
// never as brands to propose, just as examples of the kind of brand DGA
// already works with.
export async function getExcludedBrandSample(n: number): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ name: string }[]>`
    SELECT "name" FROM "ExcludedBrand" ORDER BY RANDOM() LIMIT ${n}
  `;
  return rows.map((r) => r.name);
}

export function parseBulkBrandNames(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n,]/)
        .map((line) => line.replace(/^"|"$/g, "").trim())
        .filter(Boolean)
    )
  );
}
