import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { PurchasesDB } from "@/lib/db/purchases.db";
import { ProductsDB } from "@/lib/db/products.db";
import { logger } from "@/lib/logger";
import { z } from "zod";

const bodySchema = z.object({
  supplierId: z.string().optional(),
  supplierName: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.union([z.string(), z.number()]),
        quantity: z.number().positive(),
      }),
    )
    .min(1),
  notes: z.string().optional(),
});

/**
 * POST /api/admin/inventory/reorder
 *
 * Crea una OC borrador a partir de una lista de SKUs + cantidades sugeridas.
 * Usado por el botón "Generar OC" en la sección de stockout de Inventario.
 *
 * Body:
 *  - items: [{ productId, quantity }]
 *  - supplierId/supplierName: opcional (usa "Pendiente" si no se provee)
 *  - notes: opcional
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req, ["owner", "admin", "manager"]);
    if (admin instanceof NextResponse) return admin;

    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "invalid body" },
        { status: 400 },
      );
    }

    // BUG-FIX (audit 2026-05-05): usar tenantId del JWT validado, no del header
    // crudo con fallback "main" — el fallback rompía aislamiento multi-tenant.
    const tenantId = admin.tenantId;
    const allProducts = await ProductsDB.getAll(tenantId);
    const productMap = new Map(allProducts.map((p) => [String(p.id), p]));

    const items = parsed.data.items.map((it) => {
      const p = productMap.get(String(it.productId));
      const unitCost = p?.costPrice ?? (p ? p.price * 0.7 : 0);
      return {
        productId: String(it.productId),
        name: p?.name ?? `SKU ${it.productId}`,
        quantity: it.quantity,
        unitCost,
        unit: "u",
      };
    });

    const total = items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
    const id = `po_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const po = await PurchasesDB.add(
      {
        id,
        supplierId: parsed.data.supplierId ?? "pending",
        supplierName: parsed.data.supplierName ?? "Pendiente asignar",
        total,
        status: "pendiente" as never,
        notes: parsed.data.notes ?? "Generada desde Inventario · stockout",
        items,
        discount: 0,
        createdAt: now,
        updatedAt: now,
      } as never,
      tenantId,
    );

    logger.info("[inventory/reorder] OC creada", {
      id: po.id,
      items: items.length,
      total,
      tenantId,
    });

    return NextResponse.json({ ok: true, purchaseOrder: po });
  } catch (err) {
    logger.error("[inventory/reorder] failed", { error: String(err) });
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
