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
