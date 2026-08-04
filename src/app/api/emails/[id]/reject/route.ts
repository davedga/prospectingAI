import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const email = await prisma.email.update({
    where: { id },
    data: { status: "cancelled" },
  });

  return NextResponse.json(email);
}
