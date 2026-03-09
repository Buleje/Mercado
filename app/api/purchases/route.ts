export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PurchasesDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";

const PurchaseItemSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative(),
  unit: z.string().max(50).default(""),
  name: z.string().max(200).default(""),
});

const PurchaseSchema = z.object({
  supplierId: z.string().min(1),
  supplierName: z.string().max(200).optional(),
  items: z.array(PurchaseItemSchema).min(1, "at least one item required"),
  notes: z.string().max(1000).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json(await PurchasesDB.getAll());
  } catch (e) {
    console.error("[purchases] GET error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const raw = await req.json();
  const parsed = PurchaseSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  const data = parsed.data;
  const now = new Date().toISOString();
  const id = `po-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const total = data.items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
  const po = await PurchasesDB.add({
    id,
    supplierId: data.supplierId,
    supplierName: data.supplierName || "",
    items: data.items,
    total,
    status: "pendiente",
    notes: data.notes || undefined,
    createdAt: now,
    updatedAt: now,
  });
  return NextResponse.json(po, { status: 201 });
}
