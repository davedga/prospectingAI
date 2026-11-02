// Import the master brand list (prior prospects + exclusions) into the
// ExcludedBrand table.
//
//   npm run import-prospects                 # DRY RUN — parse + report only, no DB writes
//   npm run import-prospects -- <path.xlsx>  # dry run against an explicit workbook
//   npm run import-prospects -- --replace    # DESTRUCTIVE: wipe ExcludedBrand and reload
//   npm run import-prospects -- --merge      # upsert rows without wiping first
//
// Source: the "FINAL CLAUDE" master sheet, exported from Google Sheets to
// .xlsx in ~/Downloads. Tabs are matched by name keyword (not position), and
// the dry run prints exactly what it matched so you can eyeball it before the
// destructive --replace. Each brand becomes one ExcludedBrand row tagged with:
//   category = "prior-prospect"  -> non-responders, eligible for re-outreach
//   category = "do-not-contact"  -> hard exclude (510 / Bella / additional)
// Both categories are screened OUT of NEW discovery; only prior-prospect rows
// are eligible for targeted re-prospecting. A brand appearing in both a
// prior-prospect tab and an exclude tab is forced to do-not-contact.
import "dotenv/config";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import * as XLSX from "xlsx";
import { prisma } from "../src/lib/prisma";

type Category = "prior-prospect" | "do-not-contact";
type Entry = { name: string; instagramUrl: string | null; category: Category; source: string };

function latestWorkbook(): string {
  const dir = join(homedir(), "Downloads");
  const matches = readdirSync(dir)
    .filter((f) => /\.xlsx$/i.test(f) && /final.*claude|claude.*final|brand.*master|prospect/i.test(f))
    .sort();
  if (matches.length === 0) {
    throw new Error(
      `No matching workbook in ${dir}. Export the master sheet to .xlsx there, or pass an explicit path.`
    );
  }
  return join(dir, matches[matches.length - 1]);
}

function clean(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function normalizeIg(v: unknown): string | null {
  const s = clean(v);
  if (!s) return null;
  if (!/instagram\.com/i.test(s)) return null;
  return s.replace(/\s+/g, "");
}

// Map a sheet name to how its rows should be categorised. Returns null for
// sheets we deliberately skip (e.g. a 4th "not needed" tab).
function classifySheet(sheetName: string): { category: Category; source: string } | null {
  const n = sheetName.toLowerCase();
  if (n.includes("bella")) return { category: "do-not-contact", source: "bella" };
  if (n.includes("exclud") || n.includes("do not") || n.includes("dnm") || n.includes("dont message"))
    return { category: "do-not-contact", source: `exclude:${sheetName}` };
  // The big "Final ####" prior-prospect pool (non-responders).
  if (n.includes("final") || n.includes("prior") || n.includes("prospect"))
    return { category: "prior-prospect", source: `prior:${sheetName}` };
  return null; // unrecognised tab — skip, report it
}

function rows(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: false });
}

function isHeader(cellA: string | null): boolean {
  return !!cellA && /^brand/i.test(cellA);
}

function parseWorkbook(path: string): { entries: Entry[]; skipped: string[]; perSheet: Record<string, number> } {
  const wb = XLSX.readFile(path);
  const entries: Entry[] = [];
  const skipped: string[] = [];
  const perSheet: Record<string, number> = {};

  for (const sheetName of wb.SheetNames) {
    const cls = classifySheet(sheetName);
    if (!cls) {
      skipped.push(sheetName);
      continue;
    }
    const data = rows(wb.Sheets[sheetName]);
    let count = 0;
    for (const r of data) {
      const name = clean(r[0]);
      if (!name || isHeader(name)) continue;
      entries.push({
        name,
        instagramUrl: normalizeIg(r[1]),
        category: cls.category,
        source: cls.source,
      });
      count += 1;
    }
    perSheet[sheetName] = count;
  }
  return { entries, skipped, perSheet };
}

// Collapse duplicate brand names (case-insensitive). do-not-contact beats
// prior-prospect; otherwise keep the first and fill in a missing IG link.
function dedupe(entries: Entry[]): Entry[] {
  const byKey = new Map<string, Entry>();
  for (const e of entries) {
    const key = e.name.toLowerCase();
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...e });
      continue;
    }
    if (existing.category === "prior-prospect" && e.category === "do-not-contact") {
      byKey.set(key, { ...e, instagramUrl: e.instagramUrl ?? existing.instagramUrl });
    } else if (!existing.instagramUrl && e.instagramUrl) {
      existing.instagramUrl = e.instagramUrl;
    }
  }
  return Array.from(byKey.values());
}

async function main() {
  const args = process.argv.slice(2);
  const replace = args.includes("--replace");
  const merge = args.includes("--merge");
  const explicitPath = args.find((a) => !a.startsWith("--"));
  const path = explicitPath ?? latestWorkbook();

  console.log(`Workbook: ${path}`);
  const { entries, skipped, perSheet } = parseWorkbook(path);
  const deduped = dedupe(entries);

  const prior = deduped.filter((e) => e.category === "prior-prospect");
  const exclude = deduped.filter((e) => e.category === "do-not-contact");
  const priorWithIg = prior.filter((e) => e.instagramUrl).length;

  console.log("\nParsed per sheet:");
  for (const [s, c] of Object.entries(perSheet)) console.log(`  ${s}: ${c}`);
  if (skipped.length) console.log(`Skipped (unrecognised) sheets: ${skipped.join(", ")}`);
  console.log(
    `\nTotals: ${deduped.length} unique brands (${entries.length} raw)\n  prior-prospect (re-outreach eligible): ${prior.length} (${priorWithIg} with IG)\n  do-not-contact (hard exclude): ${exclude.length}`
  );

  if (!replace && !merge) {
    console.log("\nDRY RUN — no database changes. Re-run with --replace (wipe + reload) or --merge (upsert) to write.");
    return;
  }

  if (replace) {
    const before = await prisma.excludedBrand.count();
    console.log(`\n--replace: deleting ${before} existing ExcludedBrand rows, then inserting ${deduped.length}…`);
    await prisma.$transaction([
      prisma.excludedBrand.deleteMany({}),
      prisma.excludedBrand.createMany({
        data: deduped.map((e) => ({
          name: e.name,
          instagramUrl: e.instagramUrl,
          category: e.category,
          source: e.source,
        })),
        skipDuplicates: true,
      }),
    ]);
    const after = await prisma.excludedBrand.count();
    console.log(`Done. ExcludedBrand now has ${after} rows.`);
  } else {
    console.log(`\n--merge: upserting ${deduped.length} rows…`);
    let n = 0;
    for (const e of deduped) {
      await prisma.excludedBrand.upsert({
        where: { name: e.name },
        create: { name: e.name, instagramUrl: e.instagramUrl, category: e.category, source: e.source },
        update: { instagramUrl: e.instagramUrl, category: e.category, source: e.source },
      });
      n += 1;
    }
    console.log(`Done. Upserted ${n} rows.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
