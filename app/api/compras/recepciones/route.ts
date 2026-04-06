export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

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
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const tenantId = auth.tenantId ?? "main";

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

        // a. Update product stock
        const product = await tx.product.findFirst({
          where: { id: item.productId, tenantId },
        });

        if (!product) continue;

        const previousStock = product.stock ?? 0;
        const newStock = previousStock + item.receivedQty;

        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: newStock,
            costPrice: item.unitPrice > 0 ? item.unitPrice : undefined,
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
        const ocItem = oc.items.find((i) => i.productId === item.productId);
        if (ocItem && item.receivedQty < ocItem.quantity) {
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

    return NextResponse.json({ ok: true, stockUpdated, status: finalStatus });
  } catch (e) {
    console.error("[compras/recepciones] POST error:", e);
    return NextResponse.json({ error: "Error procesando recepcion" }, { status: 500 });
  }
}
