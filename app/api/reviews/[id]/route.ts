import { NextRequest, NextResponse } from "next/server";
import { ReviewsDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  await ReviewsDB.delete(auth.tenantId, id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json() as { status?: string; adminReply?: string | null };

  if (body.status !== undefined) {
    if (!["pending", "approved", "rejected"].includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    await ReviewsDB.updateStatus(auth.tenantId, id, body.status as "pending" | "approved" | "rejected");
    return NextResponse.json({ ok: true });
  }

  if ("adminReply" in body) {
    await ReviewsDB.updateReply(auth.tenantId, id, body.adminReply ?? null);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
}
