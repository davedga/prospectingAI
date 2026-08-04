import { NextResponse } from "next/server";
import { prospectCompany } from "@/lib/prospecting";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const result = await prospectCompany(id);
    return NextResponse.json(result);
  } catch (error) {
    console.error(`Prospecting failed for company ${id}`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Prospecting failed." },
      { status: 502 }
    );
  }
}
