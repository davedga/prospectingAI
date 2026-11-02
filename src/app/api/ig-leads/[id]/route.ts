import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Update the Cam-DM state (and notes) on an IG-DM lead from the in-app table.
// Session-gated by the dashboard middleware.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    camDmStatus?: string;
    notes?: string;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const data: { camDmStatus?: string; notes?: string } = {};
  if (typeof body.camDmStatus === "string") data.camDmStatus = body.camDmStatus;
  if (typeof body.notes === "string") data.notes = body.notes;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  try {
    const lead = await prisma.igDmLead.update({ where: { id }, data });
    return NextResponse.json({ lead });
  } catch {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }
}
