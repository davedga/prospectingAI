import { NextResponse } from "next/server";
import { planContactDedup, runContactDedup } from "@/lib/dedupe-contacts";

export const maxDuration = 60;

export async function GET() {
  const plan = await planContactDedup();
  return NextResponse.json(plan);
}

export async function POST() {
  const result = await runContactDedup();
  return NextResponse.json(result);
}
