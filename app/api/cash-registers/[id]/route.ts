import { NextRequest, NextResponse } from "next/server";
import { CashRegistersDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const reg = await CashRegistersDB.getById(id);
  if (!reg) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(reg);
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const body = await req.json();

  if (body.action === "close") {
    const closingAmount = Number(body.closingAmount) || 0;
    const reg = await CashRegistersDB.close(id, closingAmount, body.notes);
    if (!reg) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(reg);
  }

  if (body.action === "movement") {
    const { type, amount, method, description, saleId } = body;
    if (!type || amount == null || !method) {
      return NextResponse.json({ error: "type, amount, method required" }, { status: 400 });
    }
    const movement = await CashRegistersDB.addMovement(id, {
      type, amount: Number(amount), method, description: description || "", saleId,
    });
    return NextResponse.json(movement, { status: 201 });
  }

  return NextResponse.json({ error: "action required (close|movement)" }, { status: 400 });
}
