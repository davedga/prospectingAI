import "server-only";

// "Larger company" heuristic for POC targeting — a VP is a more realistic,
// reachable decision-maker at a bigger, more structured company (the
// founder is insulated/delegates), while at a smaller company the
// founder/CEO is often still the one actually reading their own inbox.
// estRevenue is a free-text range like "$5M-$10M" — take the highest
// number found in it, in millions.
const LARGE_REVENUE_THRESHOLD_MILLIONS = 10;

function parseMaxRevenueMillions(estRevenue: string | null | undefined): number | null {
  if (!estRevenue) return null;
  const matches = [...estRevenue.matchAll(/([\d.]+)\s*([mb])/gi)];
  if (matches.length === 0) return null;
  let max = 0;
  for (const m of matches) {
    const value = parseFloat(m[1]);
    if (Number.isNaN(value)) continue;
    const millions = m[2].toLowerCase() === "b" ? value * 1000 : value;
    if (millions > max) max = millions;
  }
  return max > 0 ? max : null;
}

export function isLargeCompany(company: {
  archetype: string | null;
  estRevenue: string | null;
}): boolean {
  if (company.archetype === "Strategic scale") return true;
  const maxRevenue = parseMaxRevenueMillions(company.estRevenue);
  return maxRevenue !== null && maxRevenue >= LARGE_REVENUE_THRESHOLD_MILLIONS;
}
