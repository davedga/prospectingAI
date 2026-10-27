// Import Cam's Instagram-DM leads from the master spreadsheet into Postgres.
//
//   npm run import-ig            # auto-finds IG_DM_Leads_MASTER.xlsx under ~/Downloads/IG_DM_Leads_Cam
//   npm run import-ig -- <path>  # explicit workbook path
//
// Upserts on IgDmLead.dedupeKey (igUrl, else normalized brand) so re-running
// the daily sync never duplicates. Reads the "Master" sheet.
import "dotenv/config";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import * as XLSX from "xlsx";
import { prisma } from "../src/lib/prisma";

function defaultWorkbook(): string {
  const p = join(homedir(), "Downloads", "IG_DM_Leads_Cam", "IG_DM_Leads_MASTER.xlsx");
  if (!existsSync(p)) throw new Error(`Not found: ${p}`);
  return p;
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

async function main() {
  const path = process.argv[2] && !process.argv[2].startsWith("--")
    ? process.argv[2]
    : defaultWorkbook();
  console.log(`Reading ${path}`);
  const wb = XLSX.readFile(path);
  const ws = wb.Sheets["Master"];
  if (!ws) throw new Error('Sheet "Master" not found');

  const data = (
    XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: false }) as unknown[][]
  ).slice(1);

  let n = 0;
  for (const r of data) {
    const brand = clean(r[2]);
    if (!brand) continue;
    const igUrl = clean(r[6]);
    const dedupeKey = (igUrl?.toLowerCase() || `brand:${brand.toLowerCase()}`).slice(0, 500);

    const fields = {
      seq: toInt(r[0]),
      batchDate: clean(r[1]),
      brand,
      category: clean(r[3]),
      website: clean(r[4]),
      igHandle: clean(r[5]),
      igUrl,
      tiktokHandle: clean(r[7]),
      ttsStatus: clean(r[8]),
      ttsEvidence: clean(r[9]),
      revenueBasis: clean(r[10]),
      revenueConfidence: clean(r[11]),
      usHq: clean(r[12]),
      camDmStatus: clean(r[13]),
      notes: clean(r[14]),
    };

    await prisma.igDmLead.upsert({
      where: { dedupeKey },
      update: fields,
      create: { dedupeKey, ...fields },
    });
    n++;
  }

  console.log(`Upserted ${n} IG DM leads.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
