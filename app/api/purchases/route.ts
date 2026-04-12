import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PurchasesDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { withDbRetry } from "@/lib/db-retry";
import { PayablesDB } from "@/lib/db/finance.db";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit-logger";
import { logger } from "@/lib/logger";

const PurchaseItemSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative(),
  unit: z.string().max(50).default(""),
  name: z.string().max(200).default(""),
});

const PurchaseSchema = z.object({
  supplierId: z.string().default(""),
  supplierName: z.string().max(200).optional(),
  items: z.array(PurchaseItemSchema).min(1, "at least one item required"),
  notes: z.string().max(1000).optional(),
  paymentMethod: z.enum(["contado", "credito_7", "credito_15", "credito_30", "transferencia"]).default("contado"),
  deliveryDate: z.string().optional(),
  discount: z.number().min(0).max(100).default(0),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const data = await withDbRetry(() => PurchasesDB.getAll(auth.tenantId));
    return NextResponse.json(data);
  } catch (e) {
    console.error("[purchases] GET error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json();
    const parsed = PurchaseSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    const data = parsed.data;
    const now = new Date().toISOString();
    const id = `po-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const discountPct = data.discount ?? 0;
    const subtotal = data.items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
    const total = Math.max(0, subtotal * (1 - discountPct / 100));
    const po = await PurchasesDB.add({
      id,
      supplierId: data.supplierId,
      supplierName: data.supplierName || "",
      items: data.items,
      total,
      status: "pendiente",
      notes: data.notes || undefined,
      paymentMethod: data.paymentMethod,
      deliveryDate: data.deliveryDate,
      discount: discountPct,
      createdAt: now,
      updatedAt: now,
    }, auth.tenantId);

    // Tarea 1: Crear Payable automático si el pago es a crédito
    if (data.paymentMethod.startsWith("credito_")) {
      const days = parseInt(data.paymentMethod.split("_")[1]) || 30;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + days);
      // Verificar que no exista ya un Payable para esta OC
      const existingPayable = await prisma.payable.findFirst({ where: { purchaseOrderId: id } }).catch(() => null);
      if (existingPayable) {
        logger.warn("[purchases] Payable ya existe para OC — omitiendo duplicado", { purchaseOrderId: id });
      } else {
      PayablesDB.add(auth.tenantId, {
        id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        supplierId: data.supplierId,
        supplierName: data.supplierName || "",
        purchaseOrderId: id,
        description: `Auto-generado desde OC ${id}`,
        amount: total,
        paidAmount: 0,
        status: "pendiente",
        dueDate: dueDate.toISOString(),
        payments: [],
        createdAt: now,
      }).catch((e) => console.error("[purchases] Error creando payable:", e));
      logAudit({ req, action: "CREATE", entity: "Purchase", entityId: id, detail: `Payable auto-generado OC ${id}, S/${total.toFixed(2)}, vence en ${days} días` });
      } // end else (no duplicado)
    }

    // Tarea 2: Actualizar costPrice de cada producto (fire-and-forget)
    for (const item of data.items) {
      prisma.product.update({
        where: { id: item.productId },
        data: { costPrice: item.unitCost },
      }).catch(() => {});
    }

    return NextResponse.json(po, { status: 201 });
  } catch (e) {
    console.error("[purchases] POST error:", e);
    return NextResponse.json({ error: "Error al crear orden de compra" }, { status: 500 });
  }
}
