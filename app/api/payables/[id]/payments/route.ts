import { NextResponse } from "next/server";
import { PayablesDB } from "@/lib/jsondb";
import type { DbPayment } from "@/lib/jsondb";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  if (!body.amount || body.amount <= 0) {
    return NextResponse.json({ error: "amount required and must be > 0" }, { status: 400 });
  }
  const payment: DbPayment = {
    id: `pmt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    amount: Number(body.amount),
    method: body.method || "efectivo",
    date: body.date || new Date().toISOString(),
    reference: body.reference || undefined,
  };
  const updated = await PayablesDB.addPayment(id, payment);
  if (!updated) return NextResponse.json({ error: "payable not found" }, { status: 404 });
  return NextResponse.json(updated);
}
