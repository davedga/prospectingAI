import { NextResponse } from "next/server";
import { planCompanyDedup, runCompanyDedup } from "@/lib/dedupe-companies";

export const maxDuration = 60;

// GET returns the merge plan without changing anything. POST executes it.
export async function GET() {
  const plan = await planCompanyDedup();
  return NextResponse.json(plan);
}

export async function POST() {
  const result = await runCompanyDedup();
  return NextResponse.json(result);
}
