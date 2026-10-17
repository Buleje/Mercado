import "server-only";

/**
 * Lecturas de la operación de pedidos (17-10): lo que hay que preparar (N02),
 * la agenda de entregas (N01) y la base del análisis operativo (N06).
 *
 * Sólo LEE pedidos: el estado se cambia por `PATCH /api/orders/[id]` (la
 * máquina de estados de `OrdersDB`, intacta). Lo único que escribe es el
 * avance de la preparación, en el KV por negocio
 * `interno:pedidos-preparacion:<tenantId>` y bajo el candado de
 * `PlatformSettingsDB.actualizar` (dos celulares del almacén no se pisan).
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { PlatformSettingsDB } from "./platform-settings.db";
import {
  aplicarCambio,
  podarAvances,
  type AvancePrep,
  type CambioPrep,
  type EstadoPedidoPrep,
  type PedidoPrep,
} from "@/lib/pedidos/preparacion";
import type { PedidoActivo, PedidoAnalisis, ZonaConfigurada } from "@/lib/pedidos/analisis-operativo";
import type { EntregaAgendada } from "@/lib/pedidos/franja-entrega";

const CLAVE_AVANCE = (tenantId: string) => `interno:pedidos-preparacion:${tenantId}`;
const TX = { maxWait: 10_000, timeout: 10_000 } as const;
/** Pedidos por preparar que se traen (los más viejos primero: esperan más). */
export const MAX_POR_PREPARAR = 200;
/** Tope del análisis: más que esto se avisa en pantalla («los 5.000 más nuevos»). */
export const MAX_ANALISIS = 5000;
const EN_PREPARACION: EstadoPedidoPrep[] = ["confirmado", "preparando"];
const EN_MARCHA = ["pendiente", "confirmado", "preparando", "en_camino"] as const;

const AvanceSchema = z.object({
  lineas: z.record(z.string(), z.object({ preparada: z.number().min(0) })),
  por: z.string(),
  at: z.string(),
  listo: z
    .object({
      at: z.string(),
      por: z.string(),
      bultos: z.number().int().nullable(),
      faltantes: z.array(z.object({ itemId: z.number(), nombre: z.string(), falta: z.number(), unidad: z.string() })),
    })
    .nullable(),
});

function exigirTenant(tenantId: string): void {
  if (!tenantId) throw new Error("tenantId is required");
}

/** Los avances válidos; uno roto se salta (y se avisa) sin tirar el resto. */
function avancesDe(valor: unknown, tenantId: string): Record<string, AvancePrep> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return {};
  const out: Record<string, AvancePrep> = {};
  for (const [id, v] of Object.entries(valor as Record<string, unknown>)) {
    const r = AvanceSchema.safeParse(v);
    if (r.success) out[id] = r.data;
    else logger.warn("[pedidos-operacion] avance inválido en el KV, se salta", { tenantId });
  }
  return out;
}

/** «Grande, sin azúcar»: las opciones elegidas del ítem (snapshot del pedido). */
export function detalleDeOpciones(modifiersJson: unknown): string | null {
  if (!Array.isArray(modifiersJson)) return null;
  const nombres = modifiersJson.flatMap((m) =>
    m && typeof m === "object" && typeof (m as { optionName?: unknown }).optionName === "string"
      ? [String((m as { optionName: string }).optionName).trim()]
      : [],
  );
  const limpios = nombres.filter(Boolean);
  return limpios.length ? limpios.join(", ") : null;
}

/** Desde cuándo está en su estado: el último cambio anotado; si no hay, la creación (pendiente) o la última edición. */
function enEstadoDesde(o: { status: string; createdAt: Date; updatedAt: Date; statusHistory: { createdAt: Date }[] }): string {
  const ultimo = o.statusHistory[0]?.createdAt;
  return (ultimo ?? (o.status === "pendiente" ? o.createdAt : o.updatedAt)).toISOString();
}

/** Las zonas GUARDADAS en Ajustes › Delivery. Las de muestra (sin guardar) no cuentan: serían inventadas. */
async function zonasGuardadas(tenantId: string): Promise<ZonaConfigurada[]> {
  const fila = await prisma.settings.findFirst({ where: { tenantId }, select: { deliveryZone: true } });
  if (!fila?.deliveryZone) return [];
  try {
    const crudo: unknown = JSON.parse(fila.deliveryZone);
    if (!Array.isArray(crudo)) return [];
    return crudo.flatMap((z) => {
      if (!z || typeof z !== "object") return [];
      const { name, neighborhoods } = z as { name?: unknown; neighborhoods?: unknown };
      if (typeof name !== "string" || !name.trim()) return [];
      const barrios = Array.isArray(neighborhoods) ? neighborhoods.filter((b): b is string => typeof b === "string") : [];
      return [{ nombre: name.trim(), barrios }];
    });
  } catch (err) {
    logger.warn("[pedidos-operacion] zonas de delivery ilegibles", { tenantId, error: String(err) });
    return [];
  }
}

export type ResultadoCambioPrep =
  | { ok: true; avance: AvancePrep | null }
  | { ok: false; error: string; status: 404 | 409 | 422 };

export const PedidosOperacionDB = {
  /** Los pedidos confirmados o en preparación, con sus líneas, su entrega pedida y lo ya juntado. */
  async porPreparar(tenantId: string): Promise<{ pedidos: PedidoPrep[]; truncado: boolean }> {
    exigirTenant(tenantId);
    const filas = await prisma.order.findMany({
      where: { tenantId, deletedAt: null, status: { in: EN_PREPARACION } },
      orderBy: { createdAt: "asc" },
      take: MAX_POR_PREPARAR + 1,
      select: {
        id: true,
        customerName: true,
        customerPhone: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        total: true,
        riderName: true,
        notes: true,
        deliveryAssignment: { select: { partner: { select: { name: true } } } },
        statusHistory: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
        items: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            productId: true,
            name: true,
            quantity: true,
            unit: true,
            modifiersJson: true,
            product: { select: { category: true, stock: true } },
          },
        },
      },
    });
    const truncado = filas.length > MAX_POR_PREPARAR;
    const lista = filas.slice(0, MAX_POR_PREPARAR);
    const ids = lista.map((o) => o.id);
    const [slots, kv] = await Promise.all([
      ids.length ? prisma.deliverySlot.findMany({ where: { tenantId, orderId: { in: ids } } }) : Promise.resolve([]),
      PlatformSettingsDB.getFresco<unknown>(CLAVE_AVANCE(tenantId)),
    ]);
    const slotDe = new Map(slots.map((s) => [s.orderId, s]));
    const avances = avancesDe(kv, tenantId);
    const pedidos: PedidoPrep[] = lista.map((o) => {
      const slot = slotDe.get(o.id);
      return {
        id: o.id,
        cliente: o.customerName,
        telefono: o.customerPhone,
        estado: o.status as EstadoPedidoPrep,
        creado: o.createdAt.toISOString(),
        enEstadoDesde: enEstadoDesde(o),
        total: Number(o.total),
        repartidor: o.deliveryAssignment?.partner.name ?? o.riderName ?? null,
        notas: o.notes,
        entrega: slot ? { fecha: slot.date, franja: slot.slot, nota: slot.notes } : null,
        lineas: o.items.map((i) => ({
          itemId: i.id,
          productoId: i.productId,
          nombre: i.name,
          unidad: i.unit,
          cantidad: i.quantity,
          categoria: i.product?.category?.trim() || null,
          stock: i.product?.stock ?? null,
          detalle: detalleDeOpciones(i.modifiersJson),
        })),
        avance: avances[o.id] ?? null,
      };
    });
    return { pedidos, truncado };
  },

  /**
   * Los pedidos en marcha con día de entrega pedido, de ayer en adelante (lo
   * de ayer sin entregar es lo atrasado), por día y franja.
   */
  async agenda(tenantId: string, desdeClave: string): Promise<EntregaAgendada[]> {
    exigirTenant(tenantId);
    const slots = await prisma.deliverySlot.findMany({
      where: { tenantId, date: { gte: desdeClave } },
      orderBy: [{ date: "asc" }, { slot: "asc" }],
      take: 500,
    });
    if (slots.length === 0) return [];
    const pedidos = await prisma.order.findMany({
      where: { tenantId, deletedAt: null, id: { in: slots.map((s) => s.orderId) }, status: { in: [...EN_MARCHA] } },
      select: { id: true, customerName: true, status: true, total: true },
    });
    const porId = new Map(pedidos.map((o) => [o.id, o]));
    return slots.flatMap((s) => {
      const o = porId.get(s.orderId);
      return o
        ? [{ id: o.id, cliente: o.customerName, estado: o.status, total: Number(o.total), fecha: s.date, franja: s.slot, nota: s.notes }]
        : [];
    });
  },

  /**
   * Anota lo juntado de UN pedido. El pedido tiene que ser del negocio y estar
   * confirmado o en preparación; las líneas se validan contra las de la base.
   */
  async cambiarAvance(
    tenantId: string,
    pedidoId: string,
    cambio: CambioPrep,
    quien: string,
    ahora: Date = new Date(),
  ): Promise<ResultadoCambioPrep> {
    exigirTenant(tenantId);
    const pedido = await prisma.order.findFirst({
      where: { tenantId, id: pedidoId, deletedAt: null },
      select: { status: true, items: { select: { id: true, quantity: true, name: true, unit: true } } },
    });
    if (!pedido) return { ok: false, error: "No encontramos ese pedido.", status: 404 };
    if (!EN_PREPARACION.includes(pedido.status as EstadoPedidoPrep)) {
      return { ok: false, error: "Ese pedido ya no está por preparar: recarga la lista.", status: 409 };
    }
    const lineas = pedido.items.map((i) => ({ itemId: i.id, cantidad: i.quantity, nombre: i.name, unidad: i.unit }));
    return PlatformSettingsDB.actualizar<unknown, ResultadoCambioPrep>(
      CLAVE_AVANCE(tenantId),
      (actual) => {
        const mapa = avancesDe(actual, tenantId);
        const r = aplicarCambio(mapa[pedidoId] ?? null, lineas, cambio, quien, ahora);
        if (!r.ok) return { resultado: { ok: false, error: r.error, status: 422 } };
        if (r.avance) mapa[pedidoId] = r.avance;
        else delete mapa[pedidoId];
        return { valor: podarAvances(mapa, ahora), resultado: { ok: true, avance: r.avance } };
      },
      quien,
      TX,
    );
  },

  /** Los pedidos del período con su historial y su reparto, los activos de hoy y las zonas guardadas. */
  async paraAnalisis(
    tenantId: string,
    desde: Date | null,
  ): Promise<{ pedidos: PedidoAnalisis[]; activos: PedidoActivo[]; zonas: ZonaConfigurada[]; truncado: boolean }> {
    exigirTenant(tenantId);
    const [filas, abiertos, zonas] = await Promise.all([
      prisma.order.findMany({
        where: { tenantId, deletedAt: null, ...(desde && { createdAt: { gte: desde } }) },
        orderBy: { createdAt: "desc" },
        take: MAX_ANALISIS + 1,
        select: {
          id: true,
          customerName: true,
          status: true,
          source: true,
          total: true,
          createdAt: true,
          cancelReason: true,
          riderName: true,
          customerLocation: true,
          customerReference: true,
          deliveryAssignment: { select: { fee: true, partner: { select: { name: true } } } },
          statusHistory: {
            orderBy: { createdAt: "asc" },
            select: { fromStatus: true, toStatus: true, createdAt: true, note: true },
          },
        },
      }),
      prisma.order.findMany({
        where: { tenantId, deletedAt: null, status: { in: [...EN_MARCHA] } },
        orderBy: { updatedAt: "asc" },
        take: 500,
        select: {
          id: true,
          customerName: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          statusHistory: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
        },
      }),
      zonasGuardadas(tenantId),
    ]);
    const truncado = filas.length > MAX_ANALISIS;
    const pedidos: PedidoAnalisis[] = filas.slice(0, MAX_ANALISIS).map((o) => ({
      id: o.id,
      cliente: o.customerName,
      estado: o.status,
      origen: o.source,
      total: Number(o.total),
      creado: o.createdAt.toISOString(),
      motivo: o.cancelReason,
      repartidor: o.deliveryAssignment?.partner.name ?? o.riderName ?? null,
      costoReparto: o.deliveryAssignment ? Number(o.deliveryAssignment.fee) : null,
      direccion: [o.customerLocation, o.customerReference].filter(Boolean).join(" · "),
      historial: o.statusHistory.map((h) => ({
        de: h.fromStatus,
        a: h.toStatus,
        cuando: h.createdAt.toISOString(),
        nota: h.note,
      })),
    }));
    const activos: PedidoActivo[] = abiertos.map((o) => ({
      id: o.id,
      cliente: o.customerName,
      estado: o.status,
      enEstadoDesde: enEstadoDesde(o),
    }));
    return { pedidos, activos, zonas, truncado };
  },
};
