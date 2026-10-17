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
  /**
   * La caja a la que pertenece (M28): la misma `entityId` en abrir/cerrar; la
   * caja del movimiento en ingresos, egresos, arqueos y cambios de medio.
   * `null` si el movimiento ya no existe.
   */
  cajaId: string | null;
}

/** Entidades que cuentan como «tocar la caja». */
const ENTIDADES_CAJA = ["caja", "movimiento_caja"];
/** Filas que se reservan por caja cuando se piden cajas puntuales. */
const FILAS_POR_CAJA = 4;

export class CashAuditTrailDB {
  /**
   * Últimos movimientos de auditoría de la caja del tenant.
   *
   * @param limit tope de filas (se acota a 200: es un panel, no un export). Con
   *   `registerIds` el tope crece con las cajas pedidas (4 filas por caja: abrir,
   *   cerrar y un reintento de cada uno, hasta 800): con 200 cajas y tope 200, las
   *   más viejas se quedaban sin «quién abrió».
   * @param registerId sólo lo de esa caja (por `entityId`).
   * @param registerIds sólo lo de esas cajas: las que la pantalla ya tiene.
   *   Sin esto, «quién abrió/cerró» salía de las últimas 200 filas de TODO el
   *   rastro y los movimientos manuales empujaban fuera a las cajas viejas.
   * @param soloCaja sólo aperturas y cierres (`entity = "caja"`), sin los
   *   movimientos manuales.
   */
  static async list(
    tenantId: string,
    opts: { limit?: number; registerId?: string; registerIds?: string[]; soloCaja?: boolean } = {},
  ): Promise<CashTrailEntry[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const ids = opts.registerIds?.length ? Array.from(new Set(opts.registerIds)) : null;
    const tope = ids ? Math.min(Math.max(ids.length * FILAS_POR_CAJA, 200), 800) : 200;
    const take = Math.min(Math.max(opts.limit ?? (ids ? tope : 50), 1), tope);

    const rows = await prisma.activityLog.findMany({
      where: {
        tenantId,
        entity: opts.soloCaja ? "caja" : { in: ENTIDADES_CAJA },
        ...(ids ? { entityId: { in: ids } } : opts.registerId ? { entityId: opts.registerId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
      select: { id: true, action: true, entity: true, entityId: true, detail: true, user: true, createdAt: true },
    });

    /* «Ver caja» desde una fila de movimiento: el registro guarda el id del
       movimiento, no el de la caja. Una sola consulta, acotada al tenant. */
    const idsDeMovimiento = Array.from(
      new Set(rows.filter((r) => r.entity === "movimiento_caja" && r.entityId).map((r) => r.entityId as string)),
    );
    const cajaDelMovimiento = new Map<string, string>();
    if (idsDeMovimiento.length > 0) {
      const movs = await prisma.cashMovement.findMany({
        where: { id: { in: idsDeMovimiento }, cashRegister: { tenantId } },
        select: { id: true, cashRegisterId: true },
      });
      for (const m of movs) cajaDelMovimiento.set(m.id, m.cashRegisterId);
    }

    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      detail: r.detail,
      user: r.user,
      createdAt: r.createdAt.toISOString(),
      cajaId: r.entity === "caja" ? r.entityId : r.entityId ? (cajaDelMovimiento.get(r.entityId) ?? null) : null,
    }));
  }
}
