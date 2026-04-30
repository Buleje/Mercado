import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PurchasesDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { toNumOrZero } from "@/lib/decimal-utils";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";

const DiferenciaSchema = z.object({
  productoId: z.number().int().positive(),
  cantidadEsperada: z.number().min(0),
  cantidadRecibida: z.number().min(0),
  motivo: z.string().max(500).optional(),
});

const PatchSchema = z.object({
  status: z.enum(["pendiente", "recibido", "cancelado"]).optional(),
  notes: z.string().max(1000).optional(),
  diferencias: z.array(DiferenciaSchema).optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const po = await withDbRetry(() => PurchasesDB.getById(id));
    if (!po) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    return NextResponse.json(po);
  } catch (e) {
    logger.error("[purchases/id] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const raw = await req.json();
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  try {
    const existing = await PurchasesDB.getById(id);
    if (!existing) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });

    const statusChanged = parsed.data.status && parsed.data.status !== existing.status;
    const updated = await PurchasesDB.update(id, parsed.data);

    if (!updated) return NextResponse.json({ error: "Error updating" }, { status: 500 });

    if (statusChanged && updated.status === "recibido") {
      // Build a map of diferencias by productoId for quick lookup
      const difMap = new Map<number, { cantidadRecibida: number; motivo?: string }>();
      if (parsed.data.diferencias) {
        for (const dif of parsed.data.diferencias) {
          difMap.set(dif.productoId, { cantidadRecibida: dif.cantidadRecibida, motivo: dif.motivo });
        }
      }

      try {
        // eslint-disable-next-line no-restricted-properties -- $transaction tenant-scoped via auth guard arriba.
        await prisma.$transaction(async (tx) => {
          for (const item of updated.items) {
            const product = await tx.product.findUnique({ where: { id: item.productId } });
            if (!product) continue;

            // Use cantidadRecibida from diferencias if available, otherwise use item.quantity
            const dif = difMap.get(item.productId);
            const quantityReceived = dif ? dif.cantidadRecibida : item.quantity;

            if (quantityReceived <= 0) continue; // Nothing received for this item

            const prevStock = product.stock ?? 0;
            const newStock = prevStock + quantityReceived;

            // TD-018: item.unitCost y product.costPrice son Decimal
            const unitCostNum = toNumOrZero(item.unitCost);
            let avgCost = unitCostNum;
            if (prevStock > 0) {
              const oldVal = prevStock * toNumOrZero(product.costPrice);
              const newVal = quantityReceived * unitCostNum;
              avgCost = (oldVal + newVal) / newStock;
            }

            // Update Product
            await tx.product.update({
               where: { id: product.id },
               data: { stock: newStock, costPrice: avgCost }
            });

            // Insert Movement atomically
            const diffNote = dif
              ? ` (esperado: ${item.quantity}, recibido: ${quantityReceived}${dif.motivo ? `, motivo: ${dif.motivo}` : ""})`
              : "";
            await tx.inventoryMovement.create({
              data: {
                tenantId: auth.tenantId,
                productId: product.id,
                type: "compra",
                quantity: quantityReceived,
                previousStock: prevStock,
                newStock: newStock,
                reference: updated.id,
                notes: `Recepción de OC ${updated.id}${diffNote}`,
                createdBy: auth.username,
              }
            });
          }
        });

        // Store diferencias as JSON note on the purchase
        if (parsed.data.diferencias && parsed.data.diferencias.length > 0) {
          const difNotes = parsed.data.diferencias
            .map((d) => `Producto ${d.productoId}: esperado ${d.cantidadEsperada}, recibido ${d.cantidadRecibida}${d.motivo ? ` (${d.motivo})` : ""}`)
            .join("; ");
          const currentNotes = updated.notes ?? "";
          const newNotes = currentNotes
            ? `${currentNotes}\n[DIFERENCIAS] ${difNotes}`
            : `[DIFERENCIAS] ${difNotes}`;
          await PurchasesDB.update(id, { notes: newNotes } as Record<string, unknown>);
        }
      } catch (err) {
        logger.error("[purchases/id] transaction failed", { err: err instanceof Error ? err.message : String(err) });
        return NextResponse.json({ error: "Fallo de transacción al actualizar stock" }, { status: 500 });
      }
    }

    if (statusChanged) {
       logActivity("Actualizar", "compra", `Estado de orden ${id.slice(-6)} cambiado a ${updated.status}`, id, auth.username).catch((err) => logger.warn("[purchases/id] activity log failed", { err: String(err) }));
    }

    return NextResponse.json(updated);
  } catch (e) {
    logger.error("[purchases/id] PATCH error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    await PurchasesDB.delete(id);
    logActivity("Eliminar", "compra", `Orden de compra ${id.slice(-6)} eliminada`, id, auth.username).catch((err) => logger.warn("[purchases/id] activity log failed", { err: String(err) }));
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    logger.error("[purchases/id] DELETE error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
