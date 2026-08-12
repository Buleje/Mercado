import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PurchasesDB, type DbPurchaseOrder } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { toNumOrZero } from "@/lib/decimal-utils";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";
import { applyRateLimit } from "@/lib/rate-limit";
import { getRecibidoAcumulado, saldoPendiente } from "@/lib/compras/recibido-acumulado";
import { costoUnitarioReal } from "@/lib/compras/totales-oc";
import { TRANSICIONES_OC, transicionValida, type EstadoOC } from "@/lib/compras/estados-oc";

const DiferenciaSchema = z.object({
  productoId: z.number().int().positive(),
  cantidadEsperada: z.number().min(0),
  cantidadRecibida: z.number().min(0),
  motivo: z.string().max(500).optional(),
});

// Las transiciones viven en lib/compras/estados-oc.ts — la misma tabla que
// alimenta el <select> de la pantalla. 2026-08-11: la copia que había acá
// enrutaba `pendiente` hacia "emitida" y `recibido` hacia "pagada", dos
// estados que no existen en el enum PurchaseStatus ni los aceptaba el Zod de
// abajo; medido, todo cambio de estado desde `pendiente` devolvía 422 salvo
// cancelar.

const PatchSchema = z.object({
  // Alineado con el enum PurchaseStatus de Prisma (lib/db/misc.db.ts).
  // `auto_generated` es estado de origen, no destino: el admin la aprueba
  // pasándola a pendiente, no vuelve a marcarla como auto-generada.
  status: z.enum(["pendiente", "parcial", "recibido", "cancelado"]).optional(),
  notes: z.string().max(1000).optional(),
  diferencias: z.array(DiferenciaSchema).optional(),
  // ADR-377 — datos que se completan después de emitir: la factura llega con
  // la mercadería, el flete se sabe cuando el mototaxi cobra.
  invoiceNumber: z.string().max(60).optional(),
  invoiceType: z.enum(["factura", "boleta", "guia", "ninguno"]).optional(),
  igvIncluded: z.boolean().optional(),
  flete: z.number().min(0).optional(),
  otrosCostos: z.number().min(0).optional(),
  cancelReason: z.string().max(300).optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const po = await withDbRetry(() => PurchasesDB.getById(auth.tenantId, id));
    if (!po) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    return NextResponse.json(po);
  } catch (e) {
    logger.error("[purchases/id] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const _rl = await applyRateLimit(req, "MODERATE", "purchases-X"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const raw = await req.json();
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  try {
    const existing = await PurchasesDB.getById(auth.tenantId, id);
    if (!existing) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });

    // F5: Validar transición de estado
    const statusChanged = parsed.data.status && parsed.data.status !== existing.status;
    if (statusChanged && parsed.data.status) {
      if (!transicionValida(existing.status, parsed.data.status)) {
        const allowed = TRANSICIONES_OC[existing.status as EstadoOC] ?? [];
        return NextResponse.json(
          { error: `Transición inválida: ${existing.status} → ${parsed.data.status}. Permitidas: [${allowed.join(", ")}]` },
          { status: 422 }
        );
      }
    }

    // diferencias no es campo de DbPurchaseOrder — se procesa más abajo.
    const { diferencias: _diferencias, ...campos } = parsed.data;

    // ADR-377: quién y cuándo. `deliveryDate` es lo que el proveedor prometió;
    // esto es lo que pasó de verdad, y la diferencia entre ambas es la que
    // mide si el proveedor cumple.
    const patch: Partial<DbPurchaseOrder> = {
      ...campos,
      ...(statusChanged && parsed.data.status === "recibido"
        ? { receivedDate: new Date().toISOString(), receivedBy: auth.username }
        : {}),
    };

    const updated = await PurchasesDB.update(auth.tenantId, id, patch);

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

        await prisma.$transaction(async (tx) => {
          // 2026-08-11: descontar lo que las recepciones ya metieron al stock.
          // Sin esto, cerrar por el <select> una OC con recepción parcial
          // sumaba la cantidad ENTERA otra vez (medido: OC de 10 con 4
          // recibidos terminaba en stock 14).
          const yaRecibido = await getRecibidoAcumulado(tx, auth.tenantId, updated.id, updated.items);
          // ADR-377: flete + otros costos se reparten por valor entre los items.
          const subtotalOrden = updated.items.reduce((s, i) => s + i.quantity * toNumOrZero(i.unitCost), 0);
          const sobrecostos = (updated.flete ?? 0) + (updated.otrosCostos ?? 0);

          for (const item of updated.items) {
            const product = await tx.product.findUnique({ where: { id: item.productId } });
            if (!product) continue;

            // Con diferencias declaradas manda lo declarado; si no, lo que
            // falte por recibir según las recepciones ya registradas.
            const dif = difMap.get(item.productId);
            const quantityReceived = dif
              ? dif.cantidadRecibida
              : saldoPendiente(item.quantity, yaRecibido.get(item.productId) ?? 0);

            if (quantityReceived <= 0) continue; // Nothing received for this item

            const prevStock = product.stock ?? 0;
            const newStock = prevStock + quantityReceived;

            // TD-018: item.unitCost y product.costPrice son Decimal.
            // ADR-377: el costo lleva la parte de flete que le toca — si no,
            // el margen que muestra el sistema es optimista por unidad.
            const unitCostNum = costoUnitarioReal(item, subtotalOrden, sobrecostos);
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
          await PurchasesDB.update(auth.tenantId, id, { notes: newNotes } as Record<string, unknown>);
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
  const _rl = await applyRateLimit(req, "MODERATE", "purchases-X"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    await PurchasesDB.delete(auth.tenantId, id);
    logActivity("Eliminar", "compra", `Orden de compra ${id.slice(-6)} eliminada`, id, auth.username).catch((err) => logger.warn("[purchases/id] activity log failed", { err: String(err) }));
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    logger.error("[purchases/id] DELETE error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
