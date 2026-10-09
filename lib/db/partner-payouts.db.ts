import "server-only";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { invalidate, invalidateByPrefix } from "@/lib/cache";
import { limaDateKey } from "@/lib/utils";
import type { Prisma } from "@/lib/generated/prisma/client";
import { claveCacheResultado } from "@/lib/finance/resultado-del-negocio";
import { invalidarVentasOverview } from "@/lib/caja/invalidar-ventas-overview";
import { etiquetaGasto, etiquetaGastoBorrado, idRetiroDeGasto } from "@/lib/caja/egreso-de-caja";
import { anotarEgresoConIdEnTx, devolverEgresoDeGastoEnTx, type DevolucionDeGasto } from "./caja-de-gasto.db";
import { invalidarIgvDelMes } from "./igv-del-mes.db";
import {
  computeAvailable,
  validatePayoutAmount,
  type PayoutRequestInput,
} from "@/lib/delivery/payout";
import {
  CATEGORIA_GASTO_RETIRO,
  ESTADOS_COMPROMETIDOS,
  ESTADOS_POR_PAGAR,
  TRANSICIONES,
  descripcionGastoRetiro,
  idGastoDeRetiro,
  veredicto,
  type AccionRetiro,
  type FiltroHistorialRetiros,
  type MetodoPagoRetiro,
} from "@/lib/delivery/payout-transiciones";

/**
 * PartnerPayoutsDB — retiros (cash-out) del repartidor a Yape.
 *
 * tenantId obligatorio como 1er argumento (CLAUDE.md regla #3).
 * Sin `"use cache"`: el saldo es dinero que el repartidor retira en vivo,
 * tiene que ser fresco (igual criterio que /api/delivery/me/earnings).
 *
 * Anti-fraude (regla #6): el saldo disponible SIEMPRE se recalcula en backend
 * y, para crear un retiro, dentro de una transacción serializable — así dos
 * POST concurrentes no pueden retirar el mismo dinero dos veces.
 */

/**
 * Estados que apartan saldo: pending, approved y paid. `approved` (el dueño lo
 * vio y lo va a pagar) TIENE que estar: si no, aprobar liberaba la plata y el
 * repartidor podía pedir el mismo dinero otra vez.
 */
const COMMITTED_STATES = ESTADOS_COMPROMETIDOS;

export interface PartnerBalance {
  /** Σ(fee + propina) de TODAS las entregas completadas. */
  lifetime: number;
  /** Σ(monto) de retiros en estado pending|approved|paid (dinero ya apartado). */
  withdrawn: number;
  /** Σ(monto) de retiros aún sin pagar (pendientes o aprobados). */
  pending: number;
  /** Saldo retirable ahora. */
  available: number;
}

export interface PartnerPayoutRow {
  id: string;
  amount: number;
  yapeNumber: string;
  status: string;
  note: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function readBalance(
  client: typeof prisma | PrismaTx,
  partnerId: string,
): Promise<PartnerBalance> {
  // IMPORTANTE — billetera GLOBAL del repartidor, scopeada SOLO por partnerId.
  // El `partnerId` es único a nivel proyecto (no por tenant), igual que
  // `listActiveForPartner(partnerId)`. Un repartidor de la red Buleje ("main")
  // entrega pedidos de OTRAS bodegas; esos DeliveryAssignment llevan el
  // `tenantId` del pedido (offer-cascade), no el del repartidor. Si filtráramos
  // por tenantId, ese dinero ganado cross-tenant quedaría invisible y NO
  // retirable. Por eso NO se filtra por tenantId aquí (sería re-introducir el
  // bug). El tenantId se sigue guardando en cada PartnerPayout solo como sello
  // del retiro. Tanto lo ganado como lo retirado se suman cross-tenant para que
  // el saldo disponible sea consistente (si solo uno fuera global, se podría
  // retirar de más).
  const [earned, committed, pendingAgg] = await Promise.all([
    client.deliveryAssignment.aggregate({
      where: { partnerId, status: "delivered" },
      _sum: { fee: true, tipAmount: true },
    }),
    client.partnerPayout.aggregate({
      where: { partnerId, status: { in: [...COMMITTED_STATES] } },
      _sum: { amount: true },
    }),
    client.partnerPayout.aggregate({
      where: { partnerId, status: { in: [...ESTADOS_POR_PAGAR] } },
      _sum: { amount: true },
    }),
  ]);

  const lifetime =
    Number(earned._sum.fee ?? 0) + Number(earned._sum.tipAmount ?? 0);
  const withdrawn = Number(committed._sum.amount ?? 0);
  const pending = Number(pendingAgg._sum.amount ?? 0);

  return {
    lifetime,
    withdrawn,
    pending,
    available: computeAvailable(lifetime, withdrawn),
  };
}

// ─── Panel del dueño: aprobar, pagar y rechazar (2026-10-09) ────────────────

/** Un retiro como lo ve el dueño: con el nombre y el celular del repartidor. */
export interface RetiroDelPanel extends PartnerPayoutRow {
  partnerId: string;
  partnerName: string;
  partnerPhone: string;
}

export interface ResumenRetiros {
  /** Retiros pendientes o aprobados: lo que el negocio le debe hoy al reparto. */
  porPagar: { cantidad: number; monto: number };
  /** Lo pagado desde el día 1 del mes (Lima). */
  pagadoEsteMes: { cantidad: number; monto: number };
}

export type ResultadoAccionRetiro =
  | {
      ok: true;
      retiro: RetiroDelPanel;
      /** `true` = ya estaba así: no se escribió nada (ni gasto ni caja). */
      yaEstaba: boolean;
      /** Sólo al pagar: el gasto que nació (o el que ya existía). */
      gastoId?: string;
      /** Sólo al pagar en efectivo desde la caja. `sinCaja` = no había caja abierta. */
      caja?: { sinCaja: boolean } | null;
      /** Sólo al deshacer: si el gasto todavía estaba (no lo habían borrado en Gastos). */
      gastoBorrado?: boolean;
      /** Sólo al deshacer: qué pasó con el efectivo que había salido del cajón. */
      devolucion?: DevolucionDeGasto | null;
    }
  | { ok: false; status: 404 | 409; error: string };

const SELECT_PANEL = {
  id: true,
  partnerId: true,
  amount: true,
  yapeNumber: true,
  status: true,
  note: true,
  createdAt: true,
  resolvedAt: true,
  partner: { select: { name: true, phone: true } },
} as const;

type FilaPanel = Prisma.PartnerPayoutGetPayload<{ select: typeof SELECT_PANEL }>;

function aPanel(f: FilaPanel): RetiroDelPanel {
  return {
    id: f.id,
    partnerId: f.partnerId,
    partnerName: f.partner?.name ?? "Repartidor",
    partnerPhone: f.partner?.phone ?? "",
    amount: Number(f.amount),
    yapeNumber: f.yapeNumber,
    status: f.status,
    note: f.note,
    createdAt: f.createdAt,
    resolvedAt: f.resolvedAt,
  };
}

/** Medianoche del día 1 del mes en Lima (UTC−5 todo el año), como instante. */
function inicioDelMesLima(ahora: Date): Date {
  const [y, m] = limaDateKey(ahora).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1, 5, 0, 0));
}

const ETIQUETA_METODO: Record<MetodoPagoRetiro, string> = {
  yape: "Yape",
  efectivo: "Efectivo",
  transferencia: "Transferencia",
};

/** Lo que queda en `note` del retiro pagado: cómo se pagó, para el historial y la app. */
export function notaDePago(metodo: MetodoPagoRetiro, deCaja: boolean, referencia?: string | null): string {
  const ref = String(referencia ?? "").replace(/\s+/g, " ").trim();
  return `${ETIQUETA_METODO[metodo]}${deCaja ? " (de la caja)" : ""}${ref ? ` · ${ref}` : ""}`.slice(0, 160);
}

/**
 * Cambia el estado SÓLO si el retiro está en un estado de origen válido: la
 * condición va en el WHERE (no un `if` después), así dos clics a la vez no
 * pagan dos veces — el segundo `updateMany` espera el lock de la fila, vuelve a
 * evaluar el WHERE y cuenta 0. El `tenantId` también va en el WHERE: un retiro
 * de otro negocio es un 404, igual que uno que no existe.
 */
async function cambiarEstadoEnTx(
  tx: PrismaTx,
  tenantId: string,
  id: string,
  accion: AccionRetiro,
  data: { note?: string | null; resolvedAt?: Date | null },
): Promise<{ cambiado: boolean; fila: FilaPanel | null }> {
  const regla = TRANSICIONES[accion];
  const { count } = await tx.partnerPayout.updateMany({
    where: { id, tenantId, status: { in: [...regla.desde] } },
    data: { status: regla.hacia, ...data },
  });
  const fila = await tx.partnerPayout.findFirst({ where: { id, tenantId }, select: SELECT_PANEL });
  return { cambiado: count === 1, fila };
}

/** Si no cambió: «ya estaba» (200 sin escribir) o el porqué del 409. */
function sinCambio(accion: AccionRetiro, fila: FilaPanel): ResultadoAccionRetiro {
  const v = veredicto(accion, fila.status);
  if (v.tipo === "no-se-puede") return { ok: false, status: 409, error: v.motivo };
  const gastoId = fila.status === "paid" && fila.resolvedAt ? idGastoDeRetiro(fila.id, fila.resolvedAt) : undefined;
  return { ok: true, retiro: aPanel(fila), yaEstaba: true, gastoId };
}

/**
 * Tiempo de la transacción: el pago hace 6-8 viajes a la base (estado, gasto,
 * auditoría, caja). Con el default de Prisma (5 s) el pooler cargado la vencía
 * a mitad (medido 2026-10-09: 9,4 s y 10,8 s) y el pago se deshacía entero.
 */
const OPCIONES_TX = { maxWait: 10_000, timeout: 20_000 } as const;

const NO_EXISTE: ResultadoAccionRetiro = { ok: false, status: 404, error: "No encontramos ese retiro en tu negocio." };

function safeRevalidate(tag: string): void {
  try {
    revalidateTag(tag, "max");
  } catch {
    /* fuera de contexto de request (test/script): no crítico */
  }
}

/** Lo mismo que invalida un gasto nuevo o borrado (`revalidarTrasEgreso` de gasto-con-caja) + el aviso de caja. */
function invalidarTrasPago(tenantId: string, tocoCaja: boolean): void {
  safeRevalidate(`tenant:${tenantId}:expenses`);
  safeRevalidate(`tenant:${tenantId}:cash-flow`);
  try {
    invalidateByPrefix(`${claveCacheResultado(tenantId)}:`);
  } catch (err) {
    logger.warn("[PartnerPayoutsDB] no se pudo invalidar el resultado del negocio", { error: String(err), tenantId });
  }
  // «IGV del mes» cuenta TODOS los gastos del mes (igv-del-mes.db): uno más o uno menos lo mueve.
  invalidarIgvDelMes(tenantId);
  invalidate(`admin:alerts-summary:${tenantId}`);
  if (tocoCaja) invalidarVentasOverview(tenantId);
}

export const PartnerPayoutsDB = {
  /**
   * Saldo GLOBAL del partner (ganancias de por vida − retiros comprometidos),
   * across todos los tenants. `tenantId` se ignora para el cálculo (la billetera
   * es por `partnerId`); se mantiene en la firma por consistencia con el resto
   * de la clase y porque el caller ya lo tiene a mano.
   */
  getBalance(_tenantId: string, partnerId: string): Promise<PartnerBalance> {
    return readBalance(prisma, partnerId);
  },

  /**
   * Historial de retiros del partner, más reciente primero. Global por
   * `partnerId` (across tenants) para que reconcilie con el `withdrawn` del
   * saldo, que también es global. `tenantId` se ignora (ver readBalance).
   */
  async listForPartner(
    _tenantId: string,
    partnerId: string,
    take = 20,
  ): Promise<PartnerPayoutRow[]> {
    const rows = await prisma.partnerPayout.findMany({
      where: { partnerId },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        amount: true,
        yapeNumber: true,
        status: true,
        note: true,
        createdAt: true,
        resolvedAt: true,
      },
    });
    return rows.map((r) => ({ ...r, amount: Number(r.amount) }));
  },

  /**
   * Solicita un retiro. Recalcula el saldo disponible DENTRO de una
   * transacción serializable y crea el retiro `pending` solo si el monto es
   * válido. Devuelve un resultado discriminado (nunca lanza por validación).
   */
  async requestPayout(
    tenantId: string,
    partnerId: string,
    input: PayoutRequestInput,
  ): Promise<
    | { ok: true; payout: PartnerPayoutRow; balance: PartnerBalance }
    | { ok: false; error: string }
  > {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const balance = await readBalance(tx, partnerId);
          const check = validatePayoutAmount(input.amount, balance.available);
          if (!check.ok) {
            return { ok: false as const, error: check.error };
          }
          const created = await tx.partnerPayout.create({
            data: {
              partnerId,
              tenantId,
              amount: check.amount,
              yapeNumber: input.yapeNumber,
              status: "pending",
            },
            select: {
              id: true,
              amount: true,
              yapeNumber: true,
              status: true,
              note: true,
              createdAt: true,
              resolvedAt: true,
            },
          });
          const payout: PartnerPayoutRow = {
            ...created,
            amount: Number(created.amount),
          };
          // Saldo proyectado tras apartar el retiro recién creado.
          const after: PartnerBalance = {
            lifetime: balance.lifetime,
            withdrawn: balance.withdrawn + payout.amount,
            pending: balance.pending + payout.amount,
            available: computeAvailable(
              balance.lifetime,
              balance.withdrawn + payout.amount,
            ),
          };
          return { ok: true as const, payout, balance: after };
        },
        { isolationLevel: "Serializable" },
      );
    } catch (err) {
      // Conflicto de serialización (dos retiros a la vez) u otro error de tx.
      logger.error("[PartnerPayoutsDB.requestPayout] tx failed", {
        error: err instanceof Error ? err.message : String(err),
        tenantId,
        partnerId,
      });
      return {
        ok: false,
        error: "No pudimos procesar el retiro. Intenta de nuevo.",
      };
    }
  },
  /**
   * Retiros del negocio para el panel: los que esperan pago (todos) y el
   * historial (los últimos `take`, del estado pedido: el filtro va en el WHERE,
   * no sobre los últimos N). El resumen sale de la base completa, no de la
   * ventana: el «por pagar» no puede depender de cuántas filas se listan.
   */
  async listForTenant(
    tenantId: string,
    opciones: { historial?: FiltroHistorialRetiros; take?: number } = {},
    ahora: Date = new Date(),
  ): Promise<{ porPagar: RetiroDelPanel[]; historial: RetiroDelPanel[]; resumen: ResumenRetiros }> {
    if (!tenantId) throw new Error("tenantId is required");
    const take = opciones.take ?? 60;
    const estadoHistorial = opciones.historial ? { equals: opciones.historial } : { notIn: [...ESTADOS_POR_PAGAR] };
    const [porPagar, historial, debe, pagado] = await Promise.all([
      prisma.partnerPayout.findMany({
        where: { tenantId, status: { in: [...ESTADOS_POR_PAGAR] } },
        orderBy: { createdAt: "asc" },
        take: 200,
        select: SELECT_PANEL,
      }),
      prisma.partnerPayout.findMany({
        where: { tenantId, status: estadoHistorial },
        orderBy: [{ resolvedAt: "desc" }, { createdAt: "desc" }],
        take,
        select: SELECT_PANEL,
      }),
      prisma.partnerPayout.aggregate({
        where: { tenantId, status: { in: [...ESTADOS_POR_PAGAR] } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.partnerPayout.aggregate({
        where: { tenantId, status: "paid", resolvedAt: { gte: inicioDelMesLima(ahora) } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);
    return {
      porPagar: porPagar.map(aPanel),
      historial: historial.map(aPanel),
      resumen: {
        porPagar: { cantidad: debe._count._all, monto: Number(debe._sum.amount ?? 0) },
        pagadoEsteMes: { cantidad: pagado._count._all, monto: Number(pagado._sum.amount ?? 0) },
      },
    };
  },

  /** «Ya lo vi, lo pago»: pending → approved. La plata sigue apartada. */
  async aprobar(tenantId: string, id: string, usuario: string): Promise<ResultadoAccionRetiro> {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.$transaction(async (tx): Promise<ResultadoAccionRetiro> => {
      const { cambiado, fila } = await cambiarEstadoEnTx(tx, tenantId, id, "aprobar", {});
      if (!fila) return NO_EXISTE;
      if (!cambiado) return sinCambio("aprobar", fila);
      await tx.activityLog.create({
        data: {
          tenantId, action: "Aprobar retiro", entity: "partner-payout", entityId: id, user: usuario || "—",
          detail: `${fila.partner?.name ?? "Repartidor"} · S/ ${Number(fila.amount).toFixed(2)} · Yape ${fila.yapeNumber}`,
        },
      });
      return { ok: true, retiro: aPanel(fila), yaEstaba: false };
    }, OPCIONES_TX);
  },

  /** Rechazar: la plata vuelve al saldo del repartidor; el motivo lo ve en su app. */
  async rechazar(tenantId: string, id: string, motivo: string, usuario: string): Promise<ResultadoAccionRetiro> {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.$transaction(async (tx): Promise<ResultadoAccionRetiro> => {
      const { cambiado, fila } = await cambiarEstadoEnTx(tx, tenantId, id, "rechazar", {
        note: motivo.replace(/\s+/g, " ").trim().slice(0, 200),
        resolvedAt: new Date(),
      });
      if (!fila) return NO_EXISTE;
      if (!cambiado) return sinCambio("rechazar", fila);
      await tx.activityLog.create({
        data: {
          tenantId, action: "Rechazar retiro", entity: "partner-payout", entityId: id, user: usuario || "—",
          detail: `${fila.partner?.name ?? "Repartidor"} · S/ ${Number(fila.amount).toFixed(2)} · Motivo: ${fila.note ?? "—"}`,
        },
      });
      return { ok: true, retiro: aPanel(fila), yaEstaba: false };
    }, OPCIONES_TX);
  },

  /**
   * Pagar: el retiro pasa a `paid` y, en la MISMA transacción, nace el gasto
   * «Pago a repartidor · <nombre>» (categoría Transporte) con un id derivado del
   * retiro y el instante del pago (`idGastoDeRetiro`: un pago = un gasto, aunque llegue dos veces).
   * En efectivo y con `salidaDeCaja`, el egreso se anota en la caja abierta con
   * el id de retiro del gasto (`idRetiroDeGasto`). Corregirlo = `deshacerPago`
   * (Gastos responde 409 a ese gasto: borrarlo allá dejaba el retiro `paid`).
   * Sin caja abierta no bloquea: el pago y el gasto quedan, y vuelve `sinCaja`.
   *
   * Orden de locks: el retiro (UPDATE) primero, la caja (FOR SHARE) al final.
   */
  async pagar(
    tenantId: string,
    id: string,
    opciones: { metodo: MetodoPagoRetiro; salidaDeCaja: boolean; referencia?: string | null; usuario: string },
    ahora: Date = new Date(),
  ): Promise<ResultadoAccionRetiro> {
    if (!tenantId) throw new Error("tenantId is required");
    const deCaja = opciones.salidaDeCaja && opciones.metodo === "efectivo";
    const res = await prisma.$transaction(async (tx): Promise<ResultadoAccionRetiro> => {
      const { cambiado, fila } = await cambiarEstadoEnTx(tx, tenantId, id, "pagar", {
        note: notaDePago(opciones.metodo, deCaja, opciones.referencia),
        resolvedAt: ahora,
      });
      if (!fila) return NO_EXISTE;
      if (!cambiado) return sinCambio("pagar", fila);

      const monto = Number(fila.amount);
      const nombre = fila.partner?.name ?? "";
      const descripcion = descripcionGastoRetiro(nombre);
      const gastoId = idGastoDeRetiro(id, ahora);
      await tx.expense.create({
        data: {
          id: gastoId,
          tenantId,
          category: CATEGORIA_GASTO_RETIRO,
          description: descripcion,
          amount: monto,
          date: ahora,
          recurring: false,
          paymentMethod: opciones.metodo,
          supplierName: nombre.trim() || null,
          notes: `Retiro del ${limaDateKey(fila.createdAt)} a Yape ${fila.yapeNumber} · ${notaDePago(opciones.metodo, deCaja, opciones.referencia)}`,
          createdBy: opciones.usuario || null,
          paidAt: ahora,
        },
        select: { id: true },
      });
      await tx.activityLog.create({
        data: {
          tenantId, action: "Pagar retiro", entity: "partner-payout", entityId: id, user: opciones.usuario || "—",
          detail: `${nombre || "Repartidor"} · S/ ${monto.toFixed(2)} · ${fila.note ?? ""} · gasto ${gastoId}`,
        },
      });
      // La caja, ÚLTIMO lock: pegada al commit, como cualquier gasto que sale del cajón.
      const caja = deCaja
        ? await anotarEgresoConIdEnTx(tx, tenantId, { id: idRetiroDeGasto(gastoId), monto, etiqueta: etiquetaGasto(descripcion) })
        : null;
      const retiro = aPanel(fila);
      if (caja?.sinCaja) {
        // No había caja abierta: la nota no puede decir «de la caja». Las dos filas ya son nuestras (lock tomado).
        const nota = notaDePago(opciones.metodo, false, opciones.referencia);
        await tx.partnerPayout.updateMany({ where: { id, tenantId }, data: { note: nota } });
        await tx.expense.updateMany({
          where: { id: gastoId, tenantId },
          data: { notes: `Retiro del ${limaDateKey(fila.createdAt)} a Yape ${fila.yapeNumber} · ${nota}` },
        });
        retiro.note = nota;
      }
      return { ok: true, retiro, yaEstaba: false, gastoId, caja };
    }, OPCIONES_TX);
    if (res.ok && !res.yaEstaba) invalidarTrasPago(tenantId, res.caja?.sinCaja === false);
    return res;
  },

  /**
   * Deshacer un pago (se pagó el que no era, o se le pagó por fuera): `paid` →
   * `approved`, se borra SU gasto y, si salió de una caja que sigue abierta, la
   * plata vuelve con «Gasto borrado · Pago a repartidor · …» (el camino de
   * borrar un gasto en Gastos). El retiro vuelve a «por pagar» con la plata
   * apartada: el saldo del repartidor no se mueve.
   *
   * El instante del pago va en el WHERE con el estado y el tenant: dos «deshacer»
   * a la vez (o uno contra un pago nuevo) no borran el gasto de otro pago. Si el
   * gasto ya no estaba (lo borraron en Gastos antes del 409), no se devuelve nada
   * otra vez: esa devolución ya la hizo Gastos.
   */
  async deshacerPago(tenantId: string, id: string, motivo: string, usuario: string): Promise<ResultadoAccionRetiro> {
    if (!tenantId) throw new Error("tenantId is required");
    const porque = motivo.replace(/\s+/g, " ").trim().slice(0, 140);
    const res = await prisma.$transaction(async (tx): Promise<ResultadoAccionRetiro> => {
      const antes = await tx.partnerPayout.findFirst({ where: { id, tenantId }, select: SELECT_PANEL });
      if (!antes) return NO_EXISTE;
      if (antes.status !== "paid") return sinCambio("deshacer", antes);
      const nota = `Pago deshecho: ${porque}`;
      const { count } = await tx.partnerPayout.updateMany({
        where: { id, tenantId, status: "paid", resolvedAt: antes.resolvedAt },
        data: { status: "approved", resolvedAt: null, note: nota },
      });
      if (count === 0) {
        const ahora = await tx.partnerPayout.findFirst({ where: { id, tenantId }, select: SELECT_PANEL });
        return ahora ? sinCambio("deshacer", ahora) : NO_EXISTE;
      }

      const nombre = antes.partner?.name ?? "";
      const gastoId = antes.resolvedAt ? idGastoDeRetiro(id, antes.resolvedAt) : null;
      const gastoBorrado = gastoId ? (await tx.expense.deleteMany({ where: { id: gastoId, tenantId } })).count === 1 : false;
      await tx.activityLog.create({
        data: {
          tenantId, action: "Deshacer pago de retiro", entity: "partner-payout", entityId: id, user: usuario || "—",
          detail: `${nombre || "Repartidor"} · S/ ${Number(antes.amount).toFixed(2)} · ${antes.note ?? ""} · Motivo: ${porque} · gasto ${gastoId ?? "—"} ${gastoBorrado ? "borrado" : "ya no estaba"}`,
        },
      });
      // La caja, ÚLTIMO lock: sólo si el gasto era nuestro (si ya no estaba, Gastos devolvió la plata).
      const devolucion = gastoBorrado && gastoId
        ? await devolverEgresoDeGastoEnTx(tx, tenantId, gastoId, etiquetaGastoBorrado(descripcionGastoRetiro(nombre)))
        : null;
      const retiro = aPanel({ ...antes, status: "approved", resolvedAt: null, note: nota });
      return { ok: true, retiro, yaEstaba: false, gastoId: gastoId ?? undefined, gastoBorrado, devolucion };
    }, OPCIONES_TX);
    if (res.ok && !res.yaEstaba) invalidarTrasPago(tenantId, res.devolucion?.estado === "devuelto");
    return res;
  },
};
