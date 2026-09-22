import "server-only";

// Shared fuzzy brand-name matching for the exclusion list (ExcludedBrand) —
// used to keep every never-contact brand out of the pipeline even when the
// company record's name/domain is a near-miss (different spacing,
// punctuation, a "Home"/"Beauty" suffix, a minor typo) rather than an exact
// string match. "Fuzzy at 75% accuracy" per the admin's explicit
// instruction: any candidate at or above a 0.75 Dice-coefficient similarity
// is treated as the same brand, on top of an exact match after stripping
// spacing/punctuation (name or domain).

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\+/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(s: string): string {
  return normalize(s).replace(/ /g, "");
}

function domainCompact(domain: string | null | undefined): string {
  if (!domain) return "";
  const stripped = domain
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .replace(/\.(com|co|io|net|org|shop|store|us|uk|life|beauty)$/, "");
  return compact(stripped);
}

function bigrams(s: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

// Dice's coefficient over character bigrams — a cheap, dependency-free
// stand-in for a full fuzzy-match ratio, robust enough for short brand-name
// strings and typo/spacing variants.
function diceCoefficient(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let intersection = 0;
  for (const bg of A) if (B.has(bg)) intersection++;
  return (2 * intersection) / (A.size + B.size);
}

const MATCH_THRESHOLD = 0.75;
const MIN_COMPACT_LENGTH = 4;

export type BrandMatch = { matched: boolean; matchedName?: string; score?: number };

export function findExcludedBrandMatch(
  name: string,
  domain: string | null | undefined,
  excludedNames: string[]
): BrandMatch {
  const nName = normalize(name);
  const cName = compact(name);
  const cDomain = domainCompact(domain);
  if (!nName) return { matched: false };

  let best: { name: string; score: number } | null = null;
  for (const ex of excludedNames) {
    const cEx = compact(ex);
    if (!cEx || cEx.length < MIN_COMPACT_LENGTH) continue;

    if (cName === cEx || (cDomain && cDomain === cEx)) {
      return { matched: true, matchedName: ex, score: 1 };
    }

    const score = diceCoefficient(nName, normalize(ex));
    if (!best || score > best.score) best = { name: ex, score };
  }

  if (best && best.score >= MATCH_THRESHOLD) {
    return { matched: true, matchedName: best.name, score: best.score };
  }
  return { matched: false };
}
