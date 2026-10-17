import "server-only";
import { prisma } from "@/lib/prisma";
import { ESTADOS_PEDIDO_QUE_ENTRAN } from "@/lib/finance/ingresos-del-periodo";
import { inicioDelDiaLima } from "@/lib/admin/metas-periodo";
import { diasEntreFechas, sumarDiasAFecha } from "@/lib/admin/metas-tareas";
import { horaLima, sumarTramo, type TramoVenta } from "@/lib/metas/logros-reglas";
import { limaDateKey } from "@/lib/utils";

/**
 * MetasSerieDB — lo vendido por hora y por día de Lima, y los hitos que miden
 * los logros (ADR-488). Sólo lee; `tenantId` SIEMPRE 1er parámetro.
 *
 * «Lo vendido» es la misma regla que el avance de la meta `ventas` y que Mi
 * Plata (`lib/finance/ingresos-del-periodo.ts`): toda venta del POS (`Sale`)
 * más los pedidos que entran como ingreso (`Order` sin borrar y en
 * `ESTADOS_PEDIDO_QUE_ENTRAN`), por `createdAt`. Así la barra de «Hoy», el
 * calendario y la tarjeta de la meta dicen la misma cifra.
 */

/** Más de esto no se lee de una vez (un año y un mes de días). */
export const TOPE_DIAS_SERIE = 400;

export interface ConteoConFechas {
  /** Cuántos hay en total. */
  n: number;
  /** El día de Lima en que se llegó a cada cantidad pedida (1.º, 100.º…), si ya se llegó. */
  fechas: Partial<Record<number, string>>;
}

export interface HitosDeVentas extends ConteoConFechas {
  /** La venta o pedido más grande de la historia. */
  ticketMax: number;
  /** El día de la primera venta o pedido de al menos `umbralTicket`. */
  fechaTicket: string | null;
}

export interface CierreDeCaja {
  openedAt: Date;
  closedAt: Date | null;
  closingAmount: number | null;
  expectedAmount: number | null;
  difference: number | null;
  notes: string | null;
}

const filtroPedidos = (tenantId: string) => ({
  tenantId,
  deletedAt: null,
  status: { in: [...ESTADOS_PEDIDO_QUE_ENTRAN] },
});

const tramos = (n: number): TramoVenta[] => Array.from({ length: n }, () => ({ total: 0, n: 0 }));
const aNumero = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** Del n.º-ésimo instante (ordenado) sale el día de Lima en que se llegó a n. */
function fechasDeLlegada(
  instantes: Date[],
  cantidades: readonly number[],
): Partial<Record<number, string>> {
  const fechas: Partial<Record<number, string>> = {};
  for (const c of cantidades) {
    const d = instantes[c - 1];
    if (d) fechas[c] = limaDateKey(d);
  }
  return fechas;
}

async function ventasEntre(tenantId: string, gte: Date, lt: Date) {
  const [ventas, pedidos] = await Promise.all([
    prisma.sale.findMany({
      where: { tenantId, createdAt: { gte, lt } },
      select: { createdAt: true, total: true },
    }),
    prisma.order.findMany({
      where: { ...filtroPedidos(tenantId), createdAt: { gte, lt } },
      select: { createdAt: true, total: true },
    }),
  ]);
  return [...ventas, ...pedidos];
}

export const MetasSerieDB = {
  /** Lo vendido en cada hora (0-23) del día de Lima `dia` ("YYYY-MM-DD"). */
  async porHora(tenantId: string, dia: string): Promise<TramoVenta[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await ventasEntre(
      tenantId,
      inicioDelDiaLima(dia),
      inicioDelDiaLima(sumarDiasAFecha(dia, 1)),
    );
    const horas = tramos(24);
    for (const f of filas) sumarTramo(horas[horaLima(f.createdAt)]!, Number(f.total));
    return horas;
  },

  /**
   * Lo vendido por día de Lima de `desde` a `hasta` (inclusive). Un día sin
   * ventas no viene. Más de `TOPE_DIAS_SERIE` días: se leen los últimos.
   */
  async porDia(
    tenantId: string,
    desde: string,
    hasta: string,
  ): Promise<Record<string, TramoVenta>> {
    if (!tenantId) throw new Error("tenantId is required");
    const inicio =
      diasEntreFechas(desde, hasta) >= TOPE_DIAS_SERIE
        ? sumarDiasAFecha(hasta, -(TOPE_DIAS_SERIE - 1))
        : desde;
    const filas = await ventasEntre(
      tenantId,
      inicioDelDiaLima(inicio),
      inicioDelDiaLima(sumarDiasAFecha(hasta, 1)),
    );
    const dias: Record<string, TramoVenta> = {};
    for (const f of filas) {
      const clave = limaDateKey(f.createdAt);
      sumarTramo((dias[clave] ??= { total: 0, n: 0 }), Number(f.total));
    }
    return dias;
  },

  /**
   * Ventas y pedidos de toda la historia: cuántos, el día en que se llegó a
   * cada cantidad de `cantidades`, el ticket más grande y el día del primero
   * de al menos `umbralTicket`.
   */
  async hitosDeVentas(
    tenantId: string,
    cantidades: readonly number[],
    umbralTicket: number,
  ): Promise<HitosDeVentas> {
    if (!tenantId) throw new Error("tenantId is required");
    const tope = Math.max(1, ...cantidades);
    const desdeTicket = { total: { gte: umbralTicket } };
    const [nVentas, nPedidos, primerasV, primerosP, maxV, maxP, grandeV, grandeP] =
      await Promise.all([
        prisma.sale.count({ where: { tenantId } }),
        prisma.order.count({ where: filtroPedidos(tenantId) }),
        prisma.sale.findMany({
          where: { tenantId },
          select: { createdAt: true },
          orderBy: { createdAt: "asc" },
          take: tope,
        }),
        prisma.order.findMany({
          where: filtroPedidos(tenantId),
          select: { createdAt: true },
          orderBy: { createdAt: "asc" },
          take: tope,
        }),
        prisma.sale.aggregate({ where: { tenantId }, _max: { total: true } }),
        prisma.order.aggregate({ where: filtroPedidos(tenantId), _max: { total: true } }),
        prisma.sale.findFirst({
          where: { tenantId, ...desdeTicket },
          select: { createdAt: true },
          orderBy: { createdAt: "asc" },
        }),
        prisma.order.findFirst({
          where: { ...filtroPedidos(tenantId), ...desdeTicket },
          select: { createdAt: true },
          orderBy: { createdAt: "asc" },
        }),
      ]);
    const instantes = [...primerasV, ...primerosP]
      .map((r) => r.createdAt)
      .sort((a, b) => a.getTime() - b.getTime());
    const grandes = [grandeV?.createdAt, grandeP?.createdAt]
      .filter((d): d is Date => d instanceof Date)
      .sort((a, b) => a.getTime() - b.getTime());
    return {
      n: nVentas + nPedidos,
      fechas: fechasDeLlegada(instantes, cantidades),
      ticketMax: Math.max(aNumero(maxV._max.total) ?? 0, aNumero(maxP._max.total) ?? 0),
      fechaTicket: grandes[0] ? limaDateKey(grandes[0]) : null,
    };
  },

  /** Clientes registrados y el día en que se llegó a cada cantidad. */
  async hitosDeClientes(tenantId: string, cantidades: readonly number[]): Promise<ConteoConFechas> {
    if (!tenantId) throw new Error("tenantId is required");
    const [n, ...enesimos] = await Promise.all([
      prisma.customer.count({ where: { tenantId } }),
      ...cantidades.map((c) =>
        prisma.customer.findFirst({
          where: { tenantId },
          select: { createdAt: true },
          orderBy: { createdAt: "asc" },
          skip: c - 1,
        }),
      ),
    ]);
    const fechas: Partial<Record<number, string>> = {};
    cantidades.forEach((c, i) => {
      const fila = enesimos[i];
      if (fila) fechas[c] = limaDateKey(fila.createdAt);
    });
    return { n: n as number, fechas };
  },

  /**
   * Reseñas de la tienda con al menos `estrellas` (sin borrar y aprobadas: ni
   * pendientes de moderar, ni rechazadas, ni escondidas) y el día en que se
   * llegó a `cantidad`.
   */
  async hitosDeResenas(
    tenantId: string,
    estrellas: number,
    cantidad: number,
  ): Promise<ConteoConFechas> {
    if (!tenantId) throw new Error("tenantId is required");
    const where = {
      tenantId,
      deletedAt: null,
      rating: { gte: estrellas },
      // Sólo las publicadas: una reseña `pending` todavía no pasó la moderación.
      status: "approved",
    };
    const [n, enesima] = await Promise.all([
      prisma.review.count({ where }),
      prisma.review.findFirst({
        where,
        select: { date: true },
        orderBy: { date: "asc" },
        skip: cantidad - 1,
      }),
    ]);
    return { n, fechas: enesima ? { [cantidad]: limaDateKey(enesima.date) } : {} };
  },

  /** Las últimas `tope` cajas, de la más vieja a la más nueva, con lo justo para el arqueo. */
  async cierresDeCaja(tenantId: string, tope = 400): Promise<CierreDeCaja[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await prisma.cashRegister.findMany({
      where: { tenantId },
      select: {
        openedAt: true,
        closedAt: true,
        closingAmount: true,
        expectedAmount: true,
        difference: true,
        notes: true,
      },
      orderBy: { openedAt: "desc" },
      take: tope,
    });
    return filas.reverse().map((f) => ({
      openedAt: f.openedAt,
      closedAt: f.closedAt,
      closingAmount: aNumero(f.closingAmount),
      expectedAmount: aNumero(f.expectedAmount),
      difference: aNumero(f.difference),
      notes: f.notes,
    }));
  },
};
