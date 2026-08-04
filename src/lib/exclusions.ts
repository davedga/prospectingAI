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
