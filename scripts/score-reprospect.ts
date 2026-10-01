// Score enriched prior-prospect brands for the re-prospecting pilot.
//
//   npx tsx scripts/score-reprospect.ts <signals.json> [--list <prior-prospects.csv>]
//       [--order oldest-first|newest-first|unknown] [--eligible-rows N] [--out <prefix>]
//
// signals.json is an array of BrandSignals (see src/lib/reprospect-scoring.ts).
// --list fills in listIndex/listSize by matching brand names against the CSV,
// so the scorer can use list position as "how long ago we reached out".
// The list is oldest-first; --eligible-rows N holds back everything past row N
// (contacted too recently). Defaults to 5000 — Dave: "first 5-6k is good to go".
// Writes <prefix>.json (full results) and <prefix>.csv (one row per brand).

import { readFileSync, writeFileSync } from "node:fs";
import { scoreBrands, type BrandSignals, type ListOrder } from "../src/lib/reprospect-scoring";

function arg(flag: string) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const input = process.argv[2];
if (!input || input.startsWith("--")) {
  console.error("Usage: npx tsx scripts/score-reprospect.ts <signals.json> [--list csv] [--order oldest-first|newest-first|unknown] [--out prefix]");
  process.exit(1);
}
const order = (arg("--order") ?? "oldest-first") as ListOrder;
const eligibleRows = Number(arg("--eligible-rows") ?? 5000);
const out = arg("--out") ?? input.replace(/\.json$/, "") + ".scored";
const listPath = arg("--list");

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const signals: BrandSignals[] = JSON.parse(readFileSync(input, "utf8"));

if (listPath) {
  const rows = readFileSync(listPath, "utf8")
    .split(/\r?\n/)
    .slice(1) // header
    .map((l) => l.replace(/^"|"$/g, "").trim())
    .filter(Boolean);
  const index = new Map<string, number>();
  rows.forEach((name, i) => {
    const k = norm(name);
    if (!index.has(k)) index.set(k, i);
  });
  let missing = 0;
  for (const s of signals) {
    const i = index.get(norm(s.name));
    if (i == null) missing += 1;
    else {
      s.listIndex = i;
      s.listSize = rows.length;
    }
  }
  if (missing) console.warn(`${missing} brand(s) not found in ${listPath}; recency treated as unknown for them.`);
}

const results = scoreBrands(signals, { listOrder: order, eligibleRows });

writeFileSync(`${out}.json`, JSON.stringify(results, null, 2));

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const header = [
  "Tier", "Score", "Status", "Brand", "Domain", "Size", "Trigger", "Reasons",
  "Primary", "Primary title", "Primary email", "Primary framing",
  "Secondary", "Secondary title", "Secondary email", "Secondary framing",
  "New leader", "Hiring", "Growth", "TikTok Shop", "Fit", "Recency",
];
const lines = results.map((r) =>
  [
    r.tier, r.score, r.status, r.name, r.domain, r.sizeBand, r.trigger, r.reasons.join("; "),
    r.primary?.name, r.primary?.title, r.primary?.email, r.primary?.framing,
    r.secondary?.name, r.secondary?.title, r.secondary?.email, r.secondary?.framing,
    r.breakdown.newLeader.note, r.breakdown.hiring.note, r.breakdown.headcountGrowth.note,
    r.breakdown.tts.note, r.breakdown.fit.note, r.breakdown.recency.note,
  ].map(csvCell).join(",")
);
writeFileSync(`${out}.csv`, [header.join(","), ...lines].join("\n"));

const count = (t: string) => results.filter((r) => r.tier === t).length;
console.log(
  `Scored ${results.length}: A ${count("A")} · B ${count("B")} · C ${count("C")} · Hold ${count("Hold")} · ` +
    `review ${results.filter((r) => r.status === "needs_review").length} · ` +
    `disqualified ${results.filter((r) => r.status === "disqualified").length}`
);
console.log(`→ ${out}.json\n→ ${out}.csv`);
