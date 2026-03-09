export const dynamic = 'force-dynamic'
import { NextResponse, type NextRequest } from "next/server";
import { ReturnsDB, InventoryMovementsDB } from "@/lib/jsondb";

export async function GET() {
  const returns = await ReturnsDB.getAll();
  return NextResponse.json(returns);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { saleId, orderId, reason, items } = body;
  if (!items?.length) return NextResponse.json({ error: "items requeridos" }, { status: 400 });

  const ret = await ReturnsDB.add({ saleId, orderId, reason: reason ?? "", items });

  // Restock items
  for (const item of items) {
    await InventoryMovementsDB.record({
      productId: item.productId,
      type: "devolucion",
      quantity: item.quantity,
      reference: ret.id,
      notes: `DevoluciÃ³n: ${reason ?? "Sin motivo"}`,
    });
  }

  return NextResponse.json(ret, { status: 201 });
}
