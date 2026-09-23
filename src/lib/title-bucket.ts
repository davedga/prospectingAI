import "server-only";

// Shared role classification — used both for the opens/clicks stats
// breakdown (src/app/api/stats/overview) and for POC auto-selection
// (src/lib/contact-selection.ts), so the "VP performs best" reporting and
// the "prefer a VP" selection logic are always talking about the same
// buckets.
export type TitleBucket =
  | "Founder/CEO/Owner"
  | "COO"
  | "CMO"
  | "VP"
  | "Head of [dept]"
  | "Director"
  | "Manager"
  | "Other/Individual contributor";

export function titleBucket(title: string): TitleBucket {
  const t = title.toLowerCase();
  if (/\b(ceo|founder|co-founder|president|owner)\b/.test(t)) return "Founder/CEO/Owner";
  if (/\bcoo\b/.test(t)) return "COO";
  if (/\bcmo\b/.test(t)) return "CMO";
  if (/\b(vp|vice president)\b/.test(t)) return "VP";
  if (/\bhead of\b/.test(t)) return "Head of [dept]";
  if (/\bdirector\b/.test(t)) return "Director";
  if (/\bmanager\b/.test(t)) return "Manager";
  return "Other/Individual contributor";
}
