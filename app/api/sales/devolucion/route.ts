import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { toNumOrZero } from "@/lib/decimal-utils";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

const ReturnItemSchema = z.object({
  productId: z.number().int().positive(),
  qty: z.number().int().positive(),
  motivo: z.string().max(200).optional(),
});

const DevolucionSchema = z.object({
  saleId: z.string().min(1),
  items: z.array(ReturnItemSchema).min(1).max(50),
  refundType: z.enum(["efectivo", "credito"]),
});

/**
 * POST /api/sales/devolucion
 * Process a product return from an existing sale.
 * Restores stock, creates InventoryMovement records, and optionally
 * applies credit to the customer's account.
 */
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "sales-devolucion"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const tenantId = auth.tenantId ?? "main";

  try {
    const raw = await req.json();
    const parsed = DevolucionSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", issues: parsed.error.issues.map(i => i.message) },
        { status: 400 },
      );
    }

    const { saleId, items, refundType } = parsed.data;

    // SECURITY 2026-05-05 (audit POS #4): refund efectivo requiere admin.
    // Antes cajero solo podía hacer refund efectivo sin aprobación —
    // vector de fraude (vender a familiar, devolver cash, queda con dinero).
    // Ahora cajero solo puede hacer refund "crédito"; admin puede ambos.
    if (refundType === "efectivo" && auth.role !== "admin" && auth.role !== "owner") {
      return NextResponse.json(
        { error: "Refund en efectivo requiere autorización del admin" },
        { status: 403 },
      );
    }

    // Verify sale exists
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, tenantId },
      include: { items: true },
    });

    if (!sale) {
      return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });
    }

    let totalRefund = 0;
    const returnItems: { productId: number; name: string; quantity: number; price: number }[] = [];

    // SECURITY 2026-05-06 (pentest H4): tope acumulado de qty devuelta por
    // saleItem. Antes una devolución de 50 unidades sobre venta de 1 daba
    // refund infinito (creditBalance × 50) + stock inflado al producto.
    // Buscar devoluciones previas de esta misma venta (Return scoped por tenant).
    const previousReturns = await prisma.return.findMany({
      where: { saleId, tenantId },
      select: { items: { select: { productId: true, quantity: true } } },
    });
    const previousReturnsFlat = previousReturns.flatMap((r) => r.items);
    const returnedSoFar = new Map<number, number>();
    for (const r of previousReturnsFlat) {
      if (r.productId == null) continue;
      returnedSoFar.set(r.productId, (returnedSoFar.get(r.productId) ?? 0) + r.quantity);
    }

    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        // Find original sale item to get price
        const saleItem = sale.items.find(si => si.productId === item.productId);
        if (!saleItem) continue;

        // SECURITY (pentest H4): qty devuelta no puede exceder qty vendida menos lo ya devuelto.
        const alreadyReturned = returnedSoFar.get(item.productId) ?? 0;
        const remaining = saleItem.quantity - alreadyReturned;
        if (item.qty > remaining) {
          throw new Error(
            `Qty solicitada (${item.qty}) excede disponible (${remaining}) para producto ${saleItem.name}`,
          );
        }

        // TD-018: saleItem.price es Decimal
        const saleItemPriceNum = toNumOrZero(saleItem.price);
        const itemTotal = saleItemPriceNum * item.qty;
        totalRefund += itemTotal;

        // SECURITY (pentest H3): findFirst con tenantId. Antes findUnique
        // sin scope permitía restaurar stock al producto del tenant víctima.
        const product = await tx.product.findFirst({
          where: { id: item.productId, tenantId },
        });
        if (product && product.stock != null) {
          const previousStock = product.stock;
          const newStock = previousStock + item.qty;

          await tx.product.updateMany({
            where: { id: item.productId, tenantId },
            data: { stock: newStock },
          });

          // Create InventoryMovement
          await tx.inventoryMovement.create({
            data: {
              productId: item.productId,
              type: "devolucion",
              quantity: item.qty,
              previousStock,
              newStock,
              reference: saleId,
              notes: item.motivo || "Devolucion desde POS",
              createdBy: auth.username,
              tenantId,
            },
          });
        }

        returnItems.push({
          productId: item.productId,
          name: saleItem.name,
          quantity: item.qty,
          price: saleItemPriceNum,
        });
      }

      // Create Return record
      await tx.return.create({
        data: {
          saleId,
          reason: items[0]?.motivo || "Devolucion POS",
          total: totalRefund,
          customerPhone: sale.customerPhone,
          creditApplied: refundType === "credito",
          tenantId,
          items: {
            create: returnItems.map(ri => ({
              productId: ri.productId,
              name: ri.name,
              quantity: ri.quantity,
              price: ri.price,
              unit: "unidad",
            })),
          },
        },
      });

      // If credit type, add to customer's credit balance
      if (refundType === "credito" && sale.customerPhone) {
        await tx.customer.update({
          where: { phone: sale.customerPhone },
          data: { creditBalance: { increment: totalRefund } },
        });
      }
    });

    logActivity(
      "Devolucion", "venta",
      `Devolucion de S/${totalRefund.toFixed(2)} para venta ${saleId.slice(0, 8)} (${refundType})`,
      saleId, auth.username,
    ).catch((err) => logger.warn("[sales/devolucion] activity log failed", { err: String(err) }));

    return NextResponse.json({
      success: true,
      totalRefund,
      refundType,
      items: returnItems,
    });
  } catch (e) {
    logger.error("[sales/devolucion] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al procesar la devolucion" },
      { status: 500 },
    );
  }
}
