import "server-only";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import { limaDateKey } from "@/lib/utils";
import { compararPrecios, type FilaComparable, type LineaDeCompra } from "@/lib/compras/precio-comparable";

/**
 * Audit project-wide 2026-05-19 — DB class para comparación de precios por proveedor.
 * Encapsula la query de historial de compras de un producto agrupado por proveedor y unidad.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** Una fila por proveedor y unidad (C37): ver `lib/compras/precio-comparable.ts`. */
export type DbPrecioComparativoRow = FilaComparable;

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Cuánto cuesta un producto con cada proveedor, puesto en tu tienda y en la
 * misma unidad (C37, 17-10). Antes: el `unitCost` crudo de la última orden de
 * cada proveedor, con anuladas, unidades mezcladas y sin descuento ni flete.
 */
export async function getComparativoPrecios(
  tenantId: string,
  productId: number,
): Promise<DbPrecioComparativoRow[]> {
  const items = await prisma.purchaseItem.findMany({
    where: {
      productId,
      purchaseOrder: { tenantId, status: { notIn: ["cancelado", "auto_generated"] } },
    },
    select: {
      quantity: true,
      unitCost: true,
      unit: true,
      purchaseOrder: {
        select: {
          id: true,
          supplierId: true,
          supplierName: true,
          status: true,
          createdAt: true,
          receivedDate: true,
          discount: true,
          igvIncluded: true,
          flete: true,
          otrosCostos: true,
          supplier: { select: { name: true } },
          // El subtotal de la orden entera: el flete se reparte por valor (ADR-377).
          items: { select: { quantity: true, unitCost: true } },
        },
      },
    },
    orderBy: { purchaseOrder: { createdAt: "desc" } },
    take: 500,
  });

  const lineas: LineaDeCompra[] = items.map((it) => {
    const o = it.purchaseOrder;
    return {
      supplierId: o.supplierId,
      // El nombre de hoy del proveedor; el de la orden si ya no está en el padrón.
      supplierName: o.supplier?.name ?? o.supplierName,
      ordenId: o.id,
      estado: o.status,
      creada: o.createdAt.toISOString(),
      recibida: o.receivedDate ? o.receivedDate.toISOString() : null,
      unidad: it.unit,
      cantidad: it.quantity,
      // TD-018: unitCost es Decimal
      costoUnitario: toNumOrZero(it.unitCost),
      orden: {
        subtotal: o.items.reduce((s, x) => s + x.quantity * toNumOrZero(x.unitCost), 0),
        descuentoPct: toNumOrZero(o.discount),
        igvIncluido: o.igvIncluded !== false,
        flete: toNumOrZero(o.flete),
        otros: toNumOrZero(o.otrosCostos),
      },
    };
  });

  return compararPrecios(lineas, limaDateKey());
}
