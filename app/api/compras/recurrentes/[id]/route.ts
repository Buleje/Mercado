import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { RecurringPurchasesDB } from "@/lib/db/recurring-purchases.db";
import { PurchasesDB, SuppliersDB } from "@/lib/jsondb";

/** Editar, desactivar, borrar o disparar un pedido recurrente (ADR-377). */

const PatchSchema = z.object({
  intervalDays: z.number().int().min(1).max(365).optional(),
  nextDate: z.string().optional(),
  notifyDaysBefore: z.number().int().min(0).max(30).optional(),
  paymentMethod: z.string().max(40).optional(),
  active: z.boolean().optional(),
  notes: z.string().max(500).optional(),
  /** `generar: true` crea la orden de compra ahora y corre la fecha. */
  generar: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const _rl = await applyRateLimit(req, "MODERATE", "compras-recurrentes-X"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const parsed = PatchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { generar, ...patch } = parsed.data;

    const recurrente = await RecurringPurchasesDB.getById(auth.tenantId, id);
    if (!recurrente) return NextResponse.json({ error: "Pedido recurrente no encontrado" }, { status: 404 });

    if (generar) {
      if (recurrente.items.length === 0) {
        return NextResponse.json({ error: "El pedido recurrente no tiene productos" }, { status: 422 });
      }
      const ahora = new Date();
      const subtotal = recurrente.items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
      const ocId = `po-${ahora.getTime()}-${Math.random().toString(36).slice(2, 6)}`;

      // Sin forma de pago propia, la orden nace con la condición pactada en la
      // ficha del proveedor. Que la deuda dependa de un default silencioso es
      // justamente lo que llenaba las cuentas por pagar de plata que nadie debía.
      const proveedor = await SuppliersDB.getById(auth.tenantId, recurrente.supplierId);
      const formaDePago = recurrente.paymentMethod || proveedor?.condicionPago || "contado";

      const oc = await PurchasesDB.add({
        id: ocId,
        supplierId: recurrente.supplierId,
        supplierName: recurrente.supplierName,
        items: recurrente.items,
        total: subtotal,
        status: "pendiente",
        notes: `Pedido recurrente cada ${recurrente.intervalDays} días`,
        paymentMethod: formaDePago,
        createdBy: auth.username,
        createdAt: ahora.toISOString(),
        updatedAt: ahora.toISOString(),
      }, auth.tenantId);

      const actualizado = await RecurringPurchasesDB.marcarGenerada(auth.tenantId, id, ocId, ahora);
      return NextResponse.json({ orden: oc, recurrente: actualizado }, { status: 201 });
    }

    const actualizado = await RecurringPurchasesDB.update(auth.tenantId, id, patch);
    if (!actualizado) return NextResponse.json({ error: "Pedido recurrente no encontrado" }, { status: 404 });
    return NextResponse.json(actualizado);
  } catch (e) {
    logger.error("[compras/recurrentes/id] PATCH error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const _rl = await applyRateLimit(req, "MODERATE", "compras-recurrentes-X"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    await RecurringPurchasesDB.delete(auth.tenantId, id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    logger.error("[compras/recurrentes/id] DELETE error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
