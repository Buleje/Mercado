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

export const SupplierReturnsDB = {
  async listWithItems(tenantId: string) {
    return prisma.supplierReturn.findMany({
      where: { tenantId },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
  },

  async createWithItems(tenantId: string, data: CreateData) {
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
            precioUnitario: i.precioUnitario ?? null,
          })),
        },
      },
      include: { items: true },
    });
  },
};
