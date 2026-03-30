export const dynamic = 'force-dynamic'
import { NextResponse, type NextRequest } from "next/server";
import { ReturnsDB, InventoryMovementsDB, CustomersDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const returns = await ReturnsDB.getAll(auth.tenantId);
  return NextResponse.json(returns);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();
  const { saleId, orderId, reason, items, photoUrl, customerPhone, applyCredit } = body;
  if (!items?.length) return NextResponse.json({ error: "items requeridos" }, { status: 400 });

  const total = items.reduce((s: number, i: { price: number; quantity: number }) => s + i.price * i.quantity, 0);

  // Apply credit to customer account before creating return
  let creditApplied = false;
  if (applyCredit && customerPhone && total > 0) {
    try {
      await CustomersDB.updateCreditBalance(customerPhone, total);
      creditApplied = true;
    } catch {
      // Non-fatal: continue even if credit fails
    }
  }

  const ret = await ReturnsDB.add({
    saleId, orderId,
    reason: reason ?? "",
    photoUrl: photoUrl ?? undefined,
    customerPhone: customerPhone ?? undefined,
    creditApplied,
    items,
  });

  // Restock items
  for (const item of items) {
    if (item.productId && item.quantity > 0) {
      await InventoryMovementsDB.record({
        productId: item.productId,
        type: "devolucion",
        quantity: item.quantity,
        reference: ret.id,
        notes: `Devolución: ${reason ?? "Sin motivo"}`,
      });
    }
  }

  return NextResponse.json({ ...ret, creditApplied }, { status: 201 });
}
