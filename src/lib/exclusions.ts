import { prisma } from "@/lib/prisma";

function normalize(name: string) {
  return name.trim().toLowerCase();
}

export async function checkExclusion(
  name: string
): Promise<{ isExcluded: boolean; matchedName?: string }> {
  const brands = await prisma.excludedBrand.findMany();
  const normalized = normalize(name);
  if (!normalized) return { isExcluded: false };

  for (const brand of brands) {
    const brandNormalized = normalize(brand.name);
    if (
      normalized.includes(brandNormalized) ||
      brandNormalized.includes(normalized)
    ) {
      return { isExcluded: true, matchedName: brand.name };
    }
  }
  return { isExcluded: false };
}

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
