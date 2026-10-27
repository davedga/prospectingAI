// Import fractional-CMO prospects from the master spreadsheet into Postgres.
//
//   npm run import-cmo            # auto-finds the latest Fractional_CMO_MASTER_*.xlsx in ~/Downloads
//   npm run import-cmo -- <path>  # explicit workbook path
//
// Upserts on a natural key (CmoLead.dedupeKey / CmoClientBrand.dedupeKey) so
// re-running the daily sync never duplicates rows. Reads two sheets:
//   "All Fractional CMOs"      -> CmoLead
//   "Client Brands (vetted)"   -> CmoClientBrand
import "dotenv/config";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import * as XLSX from "xlsx";
import { prisma } from "../src/lib/prisma";

function latestWorkbook(): string {
  const dir = join(homedir(), "Downloads");
  const matches = readdirSync(dir)
    .filter((f) => /^Fractional_CMO_MASTER_.*\.xlsx$/i.test(f))
    .sort();
  if (matches.length === 0) {
    throw new Error(`No Fractional_CMO_MASTER_*.xlsx found in ${dir}`);
  }
  return join(dir, matches[matches.length - 1]);
}

function clean(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "" || s.toLowerCase() === "none") return null;
  return s;
}

function toInt(v: unknown): number | null {
  const s = clean(v);
  if (s == null) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function rows(ws: XLSX.WorkSheet): unknown[][] {
  // header:1 => array-of-arrays; we map by column index, not header text,
  // so a renamed header won't silently drop a column.
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: false });
}

async function importCmoLeads(ws: XLSX.WorkSheet): Promise<number> {
  const data = rows(ws).slice(1); // drop header row
  let n = 0;
  for (const r of data) {
    const name = clean(r[1]);
    if (!name) continue; // skip blank/spacer rows
    const email = clean(r[6]);
    const linkedin = clean(r[5]);
    const seq = toInt(r[0]);
    const dedupeKey = (
      email?.toLowerCase() ||
      linkedin?.toLowerCase() ||
      `name:${name.toLowerCase()}#${seq ?? n}`
    ).slice(0, 500);

    const fields = {
      seq,
      name,
      status: clean(r[2]),
      fit: toInt(r[3]),
      consumerSignals: clean(r[4]),
      linkedin,
      email,
      emailStatus: clean(r[7]),
      location: clean(r[8]),
      apolloTitle: clean(r[9]),
      headline: clean(r[10]),
      firm: clean(r[11]),
      firmIndustry: clean(r[12]),
      currentRoles: clean(r[13]),
      currentClients: clean(r[14]),
      clientsContacted: clean(r[15]),
      notes: clean(r[16]),
      inBroadSearch: (clean(r[17]) ?? "").toLowerCase().startsWith("yes"),
    };

    await prisma.cmoLead.upsert({
      where: { dedupeKey },
      update: fields,
      create: { dedupeKey, ...fields },
    });
    n++;
  }
  return n;
}

async function importClientBrands(ws: XLSX.WorkSheet): Promise<number> {
  const data = rows(ws).slice(1);
  let n = 0;
  for (const r of data) {
    const brand = clean(r[0]);
    if (!brand) continue;
    const website = clean(r[1]);
    const dedupeKey = `${brand.toLowerCase()}|${(website ?? "").toLowerCase()}`.slice(0, 500);

    const fields = {
      brand,
      website,
      category: clean(r[2]),
      relationship: clean(r[3]),
      ttsStatus: clean(r[4]),
      alreadyContacted: clean(r[5]),
      cmoName: clean(r[6]),
      cmoFit: toInt(r[7]),
      cmoLinkedin: clean(r[8]),
      cmoEmail: clean(r[9]),
      fromList: clean(r[10]),
    };

    await prisma.cmoClientBrand.upsert({
      where: { dedupeKey },
      update: fields,
      create: { dedupeKey, ...fields },
    });
    n++;
  }
  return n;
}

async function main() {
  const path = process.argv[2] && !process.argv[2].startsWith("--")
    ? process.argv[2]
    : latestWorkbook();
  console.log(`Reading ${path}`);
  const wb = XLSX.readFile(path);

  const cmoSheet = wb.Sheets["All Fractional CMOs"];
  const brandSheet = wb.Sheets["Client Brands (vetted)"];
  if (!cmoSheet) throw new Error('Sheet "All Fractional CMOs" not found');

  const cmos = await importCmoLeads(cmoSheet);
  const brands = brandSheet ? await importClientBrands(brandSheet) : 0;

  console.log(`Upserted ${cmos} CMO leads, ${brands} client brands.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
