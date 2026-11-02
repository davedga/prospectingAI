import { prisma } from "@/lib/prisma";

// A brand must not be generated twice, nor collide with the email track or
// the do-not-contact list. The DB now holds what the old file-based dedupe
// (already_checked_brands.txt + prior-prospect CSVs) used to cover:
//   - IgDmLead.brand   — every IG-DM lead already produced/imported
//   - ExcludedBrand.name — prior prospects + do-not-contact
//   - Company.name     — the email-outreach track
// We match on a normalized key with substring checks both ways, because the
// same brand shows up as a name, a handle, or a domain across sources.

export function normalizeBrand(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

export type DedupeIndex = {
  has: (brand: string) => boolean;
  keys: Set<string>;
};

// Build one in-memory index of every taken name. Called once per generation
// batch so each candidate check is O(1)-ish rather than a DB round trip.
export async function buildDedupeIndex(): Promise<DedupeIndex> {
  const [igLeads, excluded, companies] = await Promise.all([
    prisma.igDmLead.findMany({ select: { brand: true } }),
    prisma.excludedBrand.findMany({ select: { name: true } }),
    prisma.company.findMany({ select: { name: true } }),
  ]);

  const keys = new Set<string>();
  for (const r of igLeads) keys.add(normalizeBrand(r.brand));
  for (const r of excluded) keys.add(normalizeBrand(r.name));
  for (const r of companies) keys.add(normalizeBrand(r.name));
  keys.delete("");

  // Substring match in both directions: a candidate "saie" should collide
  // with a stored "saiebeauty", and vice versa. Guard against very short
  // keys (< 4 chars) that would match almost anything.
  const long = [...keys].filter((k) => k.length >= 4);

  return {
    keys,
    has(brand: string): boolean {
      const k = normalizeBrand(brand);
      if (!k) return true; // treat an empty/garbage name as "already taken"
      if (keys.has(k)) return true;
      if (k.length < 4) return false;
      return long.some((stored) => stored.includes(k) || k.includes(stored));
    },
  };
}
