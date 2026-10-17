import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * SupplierReturnsDB
 *
 * Audit project-wide 2026-05-19 — migracion de /api/supplier-returns.
 * Devoluciones a proveedores con items + tenantId obligatorio.
 */

interface CreateData {
  proveedorId?: string;
  proveedorNombre: string;
  motivo: string;
  notas?: string;
  items: Array<{
    nombre: string;
    cantidad: number;
    unidad: string;
    // ADR-379. `productId` ausente = ítem escrito a mano: no mueve stock.
    productId?: number;
    precioUnitario?: number;
  }>;
}

/** Un ítem trae un `productId` de otro negocio (o inexistente). */
export class ProductoAjenoError extends Error {
  constructor(public readonly productId: number) {
    super(`El producto ${productId} no es de este negocio`);
    this.name = "ProductoAjenoError";
  }
}

export const SupplierReturnsDB = {
  async listWithItems(tenantId: string) {
    return prisma.supplierReturn.findMany({
      where: { tenantId },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * El costo de cada ítem con `productId` lo pone el servidor (regla 6: totales en backend):
   * antes guardaba el `precioUnitario` que mandaba el navegador sin mirarlo (10-10). Un
   * `productId` que no es de este negocio se rechaza: con él la devolución movería stock ajeno.
   */
  async createWithItems(tenantId: string, data: CreateData) {
    const ids = [...new Set(data.items.map((i) => i.productId).filter((id): id is number => id != null))];
    const productos = ids.length
      ? await prisma.product.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, costPrice: true } })
      : [];
    const costo = new Map(productos.map((p) => [p.id, p.costPrice == null ? null : Number(p.costPrice)]));
    const ajeno = ids.find((id) => !costo.has(id));
    if (ajeno !== undefined) throw new ProductoAjenoError(ajeno);
    return prisma.supplierReturn.create({
      data: {
        proveedorId: data.proveedorId,
        proveedorNombre: data.proveedorNombre,
        motivo: data.motivo,
        notas: data.notas,
        estado: "PENDIENTE",
        tenantId,
        items: {
          create: data.items.map((i) => ({
            nombre: i.nombre,
            cantidad: i.cantidad,
            unidad: i.unidad,
            productId: i.productId ?? null,
            precioUnitario: i.productId != null ? (costo.get(i.productId) ?? null) : (i.precioUnitario ?? null),
          })),
        },
      },
      include: { items: true },
    });
  },
};
