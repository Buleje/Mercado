import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SalesDB, InventoryMovementsDB, CashRegistersDB, LoyaltyDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { withDbRetry } from "@/lib/db-retry";

const SaleItemSchema = z.object({
  productId: z.number().int().positive(),
  price: z.number().nonnegative(),
  quantity: z.number().positive(),
  name: z.string().max(200),
  unit: z.string().max(50).default(""),
});

const SaleSchema = z.object({
  items: z.array(SaleItemSchema).min(1, "at least one item required"),
  payment: z.enum(["efectivo", "yape", "plin", "tarjeta"]).optional().default("efectivo"),
  amountPaid: z.number().nonnegative().optional(),
  customerPhone: z.string().max(20).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const data = await withDbRetry(() => SalesDB.getAll(auth.tenantId));
    return NextResponse.json(data);
  } catch (e) {
    console.error("[sales] GET error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const raw = await req.json();
  const parsed = SaleSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  const data = parsed.data;
  const total = data.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const id = `sale-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const sale = await SalesDB.add(auth.tenantId, {
    id,
    items: data.items,
    total,
    payment: data.payment ?? "efectivo",
    amountPaid: data.amountPaid ?? total,
    change: (data.amountPaid ?? total) - total,
    customerPhone: data.customerPhone || undefined,
    createdAt: new Date().toISOString(),
  });

  // Decrement stock for each item sold (fire-and-forget)
  for (const item of data.items) {
    InventoryMovementsDB.record({
      productId: item.productId,
      type: "venta",
      quantity: item.quantity,
      reference: sale.id,
      notes: `Venta POS: ${item.name}`,
    }).catch(() => {});
  }

  // Register cash movement if a register is open (fire-and-forget)
  CashRegistersDB.getOpen().then(async (reg) => {
    if (reg) {
      await CashRegistersDB.addMovement(reg.id, {
        type: "venta",
        amount: total,
        method: data.payment ?? "efectivo",
        description: `Venta ${sale.id}`,
        saleId: sale.id,
      });
    }
  }).catch(() => {});

  // Accrue loyalty points for POS sale (fire-and-forget)
  if (data.customerPhone) {
    LoyaltyDB.accruePoints(data.customerPhone, total).catch(() => {});
  }

  return NextResponse.json(sale, { status: 201 });
}
