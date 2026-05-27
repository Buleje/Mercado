import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

const RecepcionItemSchema = z.object({
  productId: z.number().int().positive(),
  receivedQty: z.number().int().nonnegative(),
  unitPrice: z.number().nonnegative(),
});

const RecepcionSchema = z.object({
  ocId: z.string().min(1),
  items: z.array(RecepcionItemSchema).min(1),
  notas: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "compras-recepciones"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const tenantId = auth.tenantId;

  try {
    const raw = await req.json();
    const parsed = RecepcionSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    const { ocId, items, notas } = parsed.data;

    // 1. Verify OC exists and belongs to tenant
    const oc = await prisma.purchaseOrder.findFirst({
      where: { id: ocId, tenantId },
      include: { items: true },
    });

    if (!oc) {
      return NextResponse.json({ error: "Orden de compra no encontrada" }, { status: 404 });
    }

    // F3: Validar overshipping — receivedQty no puede exceder la cantidad ordenada
    for (const item of items) {
      const ocItem = oc.items.find((i) => i.productId === item.productId);
      if (ocItem && item.receivedQty > ocItem.quantity) {
        return NextResponse.json(
          { error: `Producto ${item.productId}: cantidad recibida (${item.receivedQty}) excede la ordenada (${ocItem.quantity})` },
          { status: 422 },
        );
      }
    }

    // F4: Total server-authoritative — ignorar unitPrice del cliente, usar precio de la OC original
    // El servidor recomputa el total desde los precios de la PO.
    let serverTotal = 0;
    for (const item of items) {
      if (item.receivedQty <= 0) continue;
      const ocItem = oc.items.find((i) => i.productId === item.productId);
      if (ocItem) {
        serverTotal += item.receivedQty * Number(ocItem.unitCost ?? 0);
      }
    }

    // 2. Process in transaction
    let stockUpdated = 0;
    let allComplete = true;

     
    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        if (item.receivedQty <= 0) {
          // Check if ordered item was fully received
          const ocItem = oc.items.find((i) => i.productId === item.productId);
          if (ocItem && ocItem.quantity > 0) allComplete = false;
          continue;
        }

        // a. Update product stock con weighted-avg cost (F5)
        const product = await tx.product.findFirst({
          where: { id: item.productId, tenantId },
        });

        if (!product) continue;

        const previousStock = product.stock ?? 0;
        // F4: unitCost viene de la OC original, no del cliente
        const ocItem = oc.items.find((i) => i.productId === item.productId);
        const authorizedUnitCost = Number(ocItem?.unitCost ?? 0);

        // F5: Weighted-average cost price
        const currentCost = Number(product.costPrice ?? 0);
        const totalCost = previousStock * currentCost + item.receivedQty * authorizedUnitCost;
        const totalQty = previousStock + item.receivedQty;
        const weightedAvgCost = totalQty > 0 ? totalCost / totalQty : authorizedUnitCost;

        const newStock = previousStock + item.receivedQty;

        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: newStock,
            costPrice: authorizedUnitCost > 0 ? weightedAvgCost : undefined,
          },
        });

        // b. Create inventory movement
        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            type: "compra",
            quantity: item.receivedQty,
            previousStock,
            newStock,
            reference: `OC-${ocId}`,
            notes: notas ?? null,
            tenantId,
            createdBy: auth.username,
          },
        });

        stockUpdated++;

        // c. Check if this item was fully received
        const ocItemCheck = oc.items.find((i) => i.productId === item.productId);
        if (ocItemCheck && item.receivedQty < ocItemCheck.quantity) {
          allComplete = false;
        }
      }

      // 3. Update PurchaseOrder status
      const newStatus = allComplete ? "recibido" : "parcial";
      await tx.purchaseOrder.update({
        where: { id: ocId },
        data: {
          status: newStatus as never,
          notes: notas ? `${oc.notes ? oc.notes + " | " : ""}Recepcion: ${notas}` : oc.notes,
        },
      });
    });

    const finalStatus = allComplete ? "completed" : "partial";

    return NextResponse.json({ ok: true, stockUpdated, status: finalStatus, serverTotal });
  } catch (e) {
    logger.error("[compras/recepciones] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error procesando recepcion" }, { status: 500 });
  }
}
