export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { InventoryMovementsDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";

const AdjustSchema = z.object({
  action: z.literal("adjust"),
  productId: z.number().positive(),
  newStock: z.number().min(0),
  notes: z.string().max(300).optional(),
});

const MovementSchema = z.object({
  productId: z.number().positive(),
  type: z.string().min(1).max(50),
  quantity: z.number().positive(),
  reference: z.string().max(100).optional(),
  notes: z.string().max(300).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("productId");

  if (productId) {
    const movements = await InventoryMovementsDB.getByProduct(Number(productId));
    return NextResponse.json(movements);
  }

  return NextResponse.json(await InventoryMovementsDB.getAll());
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const raw = await req.json();

  if (raw.action === "adjust") {
    const parsed = AdjustSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invÃ¡lidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }
    const { productId, newStock, notes } = parsed.data;
    const movement = await InventoryMovementsDB.adjust(productId, newStock, notes);
    return NextResponse.json(movement, { status: 201 });
  }

  // Default: record a movement
  const parsed = MovementSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos invÃ¡lidos", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }
  const { productId, type, quantity, reference, notes } = parsed.data;
  const movement = await InventoryMovementsDB.record({
    productId,
    type,
    quantity,
    reference,
    notes,
  });
  return NextResponse.json(movement, { status: 201 });
}
