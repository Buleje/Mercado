import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { toNumOrZero } from "@/lib/decimal-utils";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-logger";

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

    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        // Find original sale item to get price
        const saleItem = sale.items.find(si => si.productId === item.productId);
        if (!saleItem) continue;

        // TD-018: saleItem.price es Decimal
        const saleItemPriceNum = toNumOrZero(saleItem.price);
        const itemTotal = saleItemPriceNum * item.qty;
        totalRefund += itemTotal;

        // Restore stock
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (product && product.stock != null) {
          const previousStock = product.stock;
          const newStock = previousStock + item.qty;

          await tx.product.update({
            where: { id: item.productId },
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
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      totalRefund,
      refundType,
      items: returnItems,
    });
  } catch (e) {
    console.error("[sales/devolucion] POST error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al procesar la devolucion" },
      { status: 500 },
    );
  }
}
