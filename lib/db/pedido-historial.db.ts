import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * PedidoHistorialDB — qué le pasó a cada pedido, quién y cuándo, para el panel.
 *
 * Junta dos fuentes que ya existían y nadie mostraba:
 *  - `OrderStatusHistory`: cada cambio de estado (de → a, quién, nota: el
 *    motivo de la cancelación o de la entrega sin reparto).
 *  - `ActivityLog` con `entity="pedido"` y `action=ACCION_NOTA_PEDIDO`: las
 *    notas internas del equipo. Antes el panel mandaba `adminNotes`, que no es
 *    columna ni campo del PATCH: ninguna nota se guardó nunca (17-10).
 *
 * Sólo para el panel (requireAdmin): `changedBy` y las notas son internos. El
 * seguimiento público (`order-tracking.db.ts`) no pasa por acá.
 */

/** La acción con que se guarda una nota interna del pedido en `ActivityLog`. */
export const ACCION_NOTA_PEDIDO = "Nota interna";

/** Tope de pedidos por consulta: lo que trae el panel en una página. */
export const MAX_PEDIDOS_HISTORIAL = 200;

export type EventoPedido =
  | {
      tipo: "estado";
      de: string | null;
      a: string;
      quien: string | null;
      nota: string | null;
      cuando: string;
    }
  | { tipo: "nota"; quien: string; texto: string; cuando: string };

export const PedidoHistorialDB = {
  /** Los eventos de cada pedido, del más viejo al más nuevo. Pedidos de otro negocio no aparecen. */
  async deVarios(tenantId: string, ids: readonly string[]): Promise<Record<string, EventoPedido[]>> {
    const unicos = [...new Set(ids)].slice(0, MAX_PEDIDOS_HISTORIAL);
    if (unicos.length === 0) return {};
    const [estados, notas] = await Promise.all([
      prisma.orderStatusHistory.findMany({
        where: { tenantId, orderId: { in: unicos } },
        orderBy: { createdAt: "asc" },
        select: { orderId: true, fromStatus: true, toStatus: true, changedBy: true, note: true, createdAt: true },
      }),
      prisma.activityLog.findMany({
        where: { tenantId, entity: "pedido", action: ACCION_NOTA_PEDIDO, entityId: { in: unicos } },
        orderBy: { createdAt: "asc" },
        select: { entityId: true, user: true, detail: true, createdAt: true },
        take: 2000,
      }),
    ]);

    const porPedido: Record<string, EventoPedido[]> = {};
    const agregar = (id: string, e: EventoPedido) => {
      (porPedido[id] ??= []).push(e);
    };
    for (const h of estados) {
      agregar(h.orderId, {
        tipo: "estado",
        de: h.fromStatus ?? null,
        a: h.toStatus,
        quien: h.changedBy ?? null,
        nota: h.note ?? null,
        cuando: h.createdAt.toISOString(),
      });
    }
    for (const n of notas) {
      if (!n.entityId) continue;
      agregar(n.entityId, { tipo: "nota", quien: n.user, texto: n.detail, cuando: n.createdAt.toISOString() });
    }
    for (const lista of Object.values(porPedido)) lista.sort((x, y) => x.cuando.localeCompare(y.cuando));
    return porPedido;
  },

  /** Guarda una nota interna del pedido con quién la escribió. El pedido debe ser del negocio. */
  async anotar(tenantId: string, orderId: string, quien: string, texto: string): Promise<boolean> {
    const existe = await prisma.order.findFirst({ where: { id: orderId, tenantId }, select: { id: true } });
    if (!existe) return false;
    await prisma.activityLog.create({
      data: { tenantId, action: ACCION_NOTA_PEDIDO, entity: "pedido", entityId: orderId, detail: texto, user: quien },
    });
    return true;
  },
};
