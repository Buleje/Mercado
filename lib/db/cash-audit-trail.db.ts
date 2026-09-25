import { prisma } from "@/lib/prisma";

/**
 * cash-audit-trail — quién tocó la caja.
 *
 * El módulo controlaba el dinero pero no las manos: `CashMovement` no guarda
 * usuario (sólo una descripción libre), así que la única traza real vive en
 * `ActivityLog`. Hasta ahora sólo se escribían ahí los ingresos y egresos
 * manuales; la **apertura** y el **cierre** —los dos momentos en que el monto se
 * fija— no dejaban rastro. Ya se escriben, y esto es lo que los lee.
 *
 * Sólo lectura y siempre con `tenantId`: es un registro de auditoría, no se
 * edita ni se borra desde la aplicación.
 */

export type CashTrailAction = "Abrir" | "Cerrar" | "Crear";

export interface CashTrailEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  detail: string;
  user: string;
  createdAt: string;
}

/** Entidades que cuentan como «tocar la caja». */
const ENTIDADES_CAJA = ["caja", "movimiento_caja"];

export class CashAuditTrailDB {
  /**
   * Últimos movimientos de auditoría de la caja del tenant.
   *
   * @param limit tope de filas (se acota a 200: es un panel, no un export).
   * @param registerId si viene, sólo lo de esa caja — pero se incluyen igual los
   *   movimientos manuales, cuyo `entityId` es el del movimiento y no el de la caja.
   */
  static async list(
    tenantId: string,
    opts: { limit?: number; registerId?: string } = {},
  ): Promise<CashTrailEntry[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const take = Math.min(Math.max(opts.limit ?? 50, 1), 200);

    const rows = await prisma.activityLog.findMany({
      where: {
        tenantId,
        entity: { in: ENTIDADES_CAJA },
        ...(opts.registerId ? { entityId: opts.registerId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
      select: { id: true, action: true, entity: true, entityId: true, detail: true, user: true, createdAt: true },
    });

    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      detail: r.detail,
      user: r.user,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
