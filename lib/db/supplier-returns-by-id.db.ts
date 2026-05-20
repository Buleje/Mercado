import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * SupplierReturnsByIdDB
 *
 * Audit project-wide 2026-05-19 — métodos para /api/supplier-returns/[id]/route.ts.
 *
 * Maneja PATCH (cambio de estado) y DELETE de una devolución específica,
 * con aislamiento multi-tenant obligatorio (tenantId 1er argumento).
 *
 * NO modifica lib/db/supplier-returns.db.ts (archivo compartido protegido).
 */

const ESTADOS = ["PENDIENTE", "ENVIADA", "RESUELTA"] as const;
type Estado = (typeof ESTADOS)[number];

export { ESTADOS };

/**
 * Busca una devolución por id con sus items, asegurando tenantId.
 */
export async function getSupplierReturnById(tenantId: string, id: string) {
  return prisma.supplierReturn.findFirst({
    where: { id, tenantId },
    include: { items: true },
  });
}

/**
 * Actualiza el estado de una devolución.
 * Devuelve el registro actualizado, o null si no existe / no pertenece al tenant.
 */
export async function updateSupplierReturnEstado(
  tenantId: string,
  id: string,
  estado: Estado,
) {
  const result = await prisma.supplierReturn.updateMany({
    where: { id, tenantId },
    data: { estado },
  });
  if (result.count === 0) return null;
  return prisma.supplierReturn.findFirst({
    where: { id, tenantId },
    include: { items: true },
  });
}

/**
 * Elimina una devolución por id. Devuelve true si se eliminó, false si no existía.
 */
export async function deleteSupplierReturn(tenantId: string, id: string): Promise<boolean> {
  const result = await prisma.supplierReturn.deleteMany({
    where: { id, tenantId },
  });
  return result.count > 0;
}

/**
 * Obtiene el teléfono de un proveedor para notificaciones WhatsApp (fire-and-forget).
 * Devuelve null si no tiene teléfono o no existe.
 */
export async function getSupplierPhone(proveedorId: string): Promise<string | null> {
  const supplier = await prisma.supplier
    .findUnique({ where: { id: proveedorId }, select: { phone: true } })
    .catch((err: unknown) => {
      logger.warn("[supplier-returns-by-id] supplier lookup failed", {
        proveedorId,
        error: String(err),
      });
      return null;
    });
  return supplier?.phone ?? null;
}
