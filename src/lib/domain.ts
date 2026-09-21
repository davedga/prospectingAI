// Shared normalization so domain comparisons are consistent wherever we
// dedupe companies — strips protocol, "www.", trailing slash, and case.
export function normalizeDomain(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

// Discovery sometimes writes a placeholder instead of a real domain when it
// couldn't determine one (seen in production: "n/a", "skip",
// "placeholder-invalid"). Never treat those as a shared identity — doing so
// would group unrelated companies together as if they were the same brand.
// Require at least one dot and a plausible TLD; reject known placeholders
// even if they'd otherwise pass that shape check.
const PLACEHOLDER_DOMAINS = new Set(["n/a", "na", "skip", "none", "unknown", "tbd", "-", "placeholder-invalid"]);

export function isRealDomain(domain: string): boolean {
  const normalized = normalizeDomain(domain);
  if (!normalized || PLACEHOLDER_DOMAINS.has(normalized)) return false;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(normalized);
}
