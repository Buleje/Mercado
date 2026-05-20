/**
 * lib/db/cash-registers-by-id.db.ts
 *
 * Audit project-wide 2026-05-19 — extrae la función assertRegisterOwnership
 * del route handler app/api/cash-registers/[id]/route.ts a una DB class
 * correcta, eliminando el acceso prisma.* directo en el endpoint.
 *
 * Nota: los métodos principales (getById, close, addMovement) siguen en
 * lib/db/sales.db.ts (CashRegistersDB). Esta clase encapsula SOLO la
 * verificación de ownership puntual que el route necesita antes de mutaciones.
 */
import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Verifica que una caja registradora pertenece al tenant dado.
 * Devuelve true si existe y pertenece; false en caso contrario.
 *
 * Equivale a la ex-función assertRegisterOwnership() del route handler.
 * Se usa como guard antes de addMovement / arqueo para bloquear inyección
 * cross-tenant (pentest H003, 2026-05-06).
 */
export const CashRegisterOwnershipDB = {
  async assertOwnership(registerId: string, tenantId: string): Promise<boolean> {
    const reg = await prisma.cashRegister.findFirst({
      where: { id: registerId, tenantId },
      select: { id: true },
    });
    return !!reg;
  },
};
