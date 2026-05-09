import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidate, invalidateByPrefix } from "@/lib/cache";

// ── Cache helpers ─────────────────────────────────────────────────────────────
function listKey(tenantId: string) {
  return `locations:${tenantId}:list`;
}
function rowKey(tenantId: string, id: string) {
  return `locations:${tenantId}:${id}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface CreateLocationInput {
  code: string;
  zone: string;
  aisle?: string;
  shelf?: string;
  bin?: string;
  warehouseId: string;
  productId?: number | null;
  qty?: number;
  capacity: number;
  category?: string;
}

export interface UpdateLocationInput extends Partial<CreateLocationInput> {
  id: string;
}

// ── DB class ─────────────────────────────────────────────────────────────────
export const LocationsDB = {
  /**
   * Listar todas las ubicaciones del tenant con sus relaciones.
   */
  async list(tenantId: string) {
    return getOrSet(listKey(tenantId), 60, () =>
      prisma.location.findMany({
        where: { tenantId },
        include: { warehouse: true, product: true },
        orderBy: [{ zone: "asc" }, { code: "asc" }],
      })
    );
  },

  /**
   * Crear una ubicación. Limpia caché de lista.
   */
  async create(tenantId: string, data: Omit<CreateLocationInput, "id">) {
    const row = await prisma.location.create({
      data: {
        ...data,
        productId: data.productId ?? null,
        qty: data.qty ?? 0,
        tenantId,
      },
      include: { warehouse: true, product: true },
    });
    invalidateByPrefix(`locations:${tenantId}`);
    return row;
  },

  /**
   * Actualizar por id + tenantId (updateMany atómico).
   * Retorna null si no existía.
   */
  async update(tenantId: string, id: string, data: Omit<UpdateLocationInput, "id">) {
    const result = await prisma.location.updateMany({
      where: { id, tenantId },
      data: {
        ...data,
        ...(data.productId === undefined ? {} : { productId: data.productId ?? null }),
      },
    });
    if (result.count === 0) return null;
    invalidate(rowKey(tenantId, id));
    invalidateByPrefix(`locations:${tenantId}:list`);
    return prisma.location.findFirst({
      where: { id, tenantId },
      include: { warehouse: true, product: true },
    });
  },

  /**
   * Eliminar por id + tenantId (deleteMany atómico).
   * Retorna false si no existía.
   */
  async delete(tenantId: string, id: string): Promise<boolean> {
    const result = await prisma.location.deleteMany({
      where: { id, tenantId },
    });
    if (result.count === 0) return false;
    invalidate(rowKey(tenantId, id));
    invalidateByPrefix(`locations:${tenantId}:list`);
    return true;
  },
};
