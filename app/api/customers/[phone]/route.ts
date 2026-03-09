import { NextResponse } from "next/server";
import { CustomersDB, normalizePhone } from "@/lib/jsondb";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ phone: string }> }
) {
  const { phone } = await ctx.params;
  const record = await CustomersDB.getByPhone(normalizePhone(phone));
  if (!record) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(record);
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ phone: string }> }
) {
  const { phone } = await ctx.params;
  const body = await req.json();
  if (typeof body.aiNotes !== "string") {
    return NextResponse.json({ error: "aiNotes required" }, { status: 400 });
  }
  await CustomersDB.updateAiNotes(normalizePhone(phone), body.aiNotes);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ phone: string }> }
) {
  const { phone } = await ctx.params;
  await CustomersDB.delete(normalizePhone(phone));
  return NextResponse.json({ ok: true });
}
