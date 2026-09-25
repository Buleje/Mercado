import "server-only";

/**
 * lib/db/por-cobrar.db.ts
 *
 * Tablero consolidado de cuentas por cobrar (auditoría 2026-06): el concepto
 * "plata que me deben" estaba repartido en Fiados, Préstamos y Adelantos sin
 * una vista única. Esta clase NO fusiona los módulos (cada uno conserva su
 * semántica y su pantalla) — solo agrega los saldos pendientes.
 *
 * Fuentes de saldo:
 *  - Fiados:    Fiado.saldo            (status ACTIVO | VENCIDO)
 *  - Préstamos: cuotas impagas         (PrestamoCuota.monto where pagadoEn=null,
 *                                       préstamo ACTIVO | VENCIDO y DADO)
 *  - Adelantos: Adelanto.saldoPendiente (status ABIERTO — EXCEDIDO es deuda del
 *                                        negocio, NO por cobrar)
 *  - Madera:    saldo de la cuenta corriente forestal (ADR-322), sumando sólo
 *               las partes con saldo A FAVOR del CTP.
 *
 * Por qué la madera entra acá (2026-09-11): la guía de salida ahora anota la
 * venta en la cuenta del cliente, y sin este bucket «Todo lo que me deben»
 * mentía por omisión — el aserradero despachaba S/ 5.000 a cuenta y el tablero
 * decía cero. Es la misma plata que el resto: alguien la tiene que pagar.
 *
 * El saldo NO está guardado: se deriva sumando cargos menos abonos por parte
 * (`cuenta-corriente.ts`), porque un saldo almacenado se desincroniza con la
 * primera corrección. Acá se hace la misma cuenta y se cuentan sólo las partes
 * que quedan debiendo: una parte con saldo a favor SUYO es deuda del negocio,
 * no algo por cobrar — el mismo criterio que ya aplica a los adelantos.
 *
 * ── Resumen y detalle, un solo criterio (2026-09-21) ────────────────────────
 * La pantalla dejó de ser cuatro tarjetas que enlazan a cuatro módulos y pasó a
 * ser UNA lista con la deuda adentro. Eso abre el riesgo de que la lista y el
 * total se contradigan, así que los `where` viven UNA sola vez
 * (`WHERE_*` acá abajo) y los usan tanto `getSummary` (agregados, barato — lo
 * llama el cron diario por cada tenant) como `getDetalle` (las filas). Si
 * alguien cambia un criterio, cambia en los dos caminos a la vez.
 */

import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import { limaDateKey } from "@/lib/utils";

export interface PorCobrarBucket {
  total: number;
  count: number;
}

export interface PorCobrarSummary {
  fiados: PorCobrarBucket;
  prestamos: PorCobrarBucket;
  adelantos: PorCobrarBucket;
  /** Cuenta corriente forestal: madera despachada que todavía no se cobró. */
  madera: PorCobrarBucket;
  totalGeneral: number;
}

export type PorCobrarTipo = "fiado" | "prestamo" | "adelanto" | "madera";

/** Una deuda concreta: quién, cuánto, desde cuándo y dónde se cobra. */
export interface PorCobrarFila {
  /** Id del registro en SU módulo (fiado, préstamo, adelanto) o de la parte forestal. */
  id: string;
  tipo: PorCobrarTipo;
  /** Quién debe, con el nombre con el que se lo llama en el mostrador. */
  quien: string;
  monto: number;
  /** `YYYY-MM-DD` — desde cuándo debe. */
  desde: string | null;
  /** `YYYY-MM-DD` — cuándo se acordó que paga. `null` = sin plazo pactado. */
  vence: string | null;
  /** Texto corto que ubica la deuda: código de operación, N° de cuotas, detalle. */
  nota: string | null;
}

export interface PorCobrarDetalle extends PorCobrarSummary {
  items: PorCobrarFila[];
}

// ── Criterios (única fuente: los comparten resumen y detalle) ────────────────

const FIADO_VIVO = ["ACTIVO", "VENCIDO"] as const;
const PRESTAMO_VIVO = ["ACTIVO", "VENCIDO"] as const;

const WHERE_FIADO = (tenantId: string) => ({
  tenantId,
  status: { in: [...FIADO_VIVO] },
  saldo: { gt: 0 },
});

/**
 * Sólo los préstamos DADOS: un préstamo RECIBIDO son cuotas que pagamos
 * nosotros. Sumarlo acá convertía plata que debemos en plata que nos deben.
 * `DADO` es el default del schema, así que lo ya cargado no se mueve.
 * Y sólo los que tienen alguna cuota impaga: un préstamo activo con todo
 * pagado no es una cuenta por cobrar, aunque el módulo lo siga listando.
 */
const WHERE_PRESTAMO = (tenantId: string) => ({
  tenantId,
  status: { in: [...PRESTAMO_VIVO] },
  direccion: "DADO" as const,
  cuotas: { some: { pagadoEn: null } },
});

const WHERE_ADELANTO = (tenantId: string) => ({
  tenantId,
  status: "ABIERTO" as const,
  saldoPendiente: { gt: 0 },
});

// ── Helpers puros (testeables sin base) ──────────────────────────────────────

/** Redondeo a céntimos: la unidad del negocio, no el épsilon del float. */
function aSoles(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * `YYYY-MM-DD` de una fecha guardada.
 *
 * Los campos que vienen de un calendario (`fechaVence`, `fechaVencimiento`) se
 * guardan a medianoche UTC: leerlos en hora de Lima los corre un día para
 * atrás. Por eso el corte es en UTC, igual que en el resto del libro.
 */
export function diaUtc(fecha: Date | string | null | undefined): string | null {
  if (!fecha) return null;
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Lo que devuelve Prisma en una columna `Decimal` (o un número plano en tests). */
type MontoLike =
  | { toNumber: () => number; toFixed: (decimals?: number) => string; toString: () => string }
  | number
  | string
  | null
  | undefined;

/** Saldo por parte de la cuenta corriente forestal: cargos − abonos. */
export function saldosPorParte(
  movs: { parteId: string; parteNombre: string; tipo: string; monto: MontoLike; fecha: Date }[],
): { parteId: string; nombre: string; saldo: number; desde: string | null }[] {
  const acc = new Map<string, { nombre: string; saldo: number; desde: Date }>();
  for (const m of movs) {
    const monto = toNumOrZero(m.monto);
    const prev = acc.get(m.parteId);
    const delta = m.tipo === "cargo" ? monto : -monto;
    if (!prev) {
      acc.set(m.parteId, { nombre: m.parteNombre, saldo: delta, desde: m.fecha });
    } else {
      prev.saldo += delta;
      if (m.fecha < prev.desde) prev.desde = m.fecha;
    }
  }
  return [...acc.entries()].map(([parteId, v]) => ({
    parteId,
    nombre: v.nombre,
    saldo: aSoles(v.saldo),
    desde: diaUtc(v.desde),
  }));
}

/**
 * Orden de cobranza: primero lo vencido (lo más viejo arriba), después lo que
 * vence pronto, y al final lo que no tiene plazo pactado, de mayor a menor.
 * Sin esto la lista salía en el orden en que la trajo la base, que no es el
 * orden en que se cobra.
 */
export function ordenarPorCobrar(filas: PorCobrarFila[], hoy: string): PorCobrarFila[] {
  const grupo = (f: PorCobrarFila) => (!f.vence ? 2 : f.vence < hoy ? 0 : 1);
  return [...filas].sort((a, b) => {
    const ga = grupo(a);
    const gb = grupo(b);
    if (ga !== gb) return ga - gb;
    if (ga !== 2 && a.vence !== b.vence) return (a.vence ?? "").localeCompare(b.vence ?? "");
    if (a.monto !== b.monto) return b.monto - a.monto;
    return a.id.localeCompare(b.id);
  });
}

/**
 * El resumen que muestra la pantalla sale de las MISMAS filas que lista: si la
 * tabla y el total salieran de dos consultas distintas, la vista podría
 * contradecirse sola.
 */
export function resumirPorCobrar(filas: PorCobrarFila[]): PorCobrarSummary {
  const vacio = (): PorCobrarBucket => ({ total: 0, count: 0 });
  const buckets: Record<PorCobrarTipo, PorCobrarBucket> = {
    fiado: vacio(),
    prestamo: vacio(),
    adelanto: vacio(),
    madera: vacio(),
  };
  for (const f of filas) {
    buckets[f.tipo].total += f.monto;
    buckets[f.tipo].count += 1;
  }
  const fiados = { total: aSoles(buckets.fiado.total), count: buckets.fiado.count };
  const prestamos = { total: aSoles(buckets.prestamo.total), count: buckets.prestamo.count };
  const adelantos = { total: aSoles(buckets.adelanto.total), count: buckets.adelanto.count };
  const madera = { total: aSoles(buckets.madera.total), count: buckets.madera.count };
  return {
    fiados,
    prestamos,
    adelantos,
    madera,
    totalGeneral: aSoles(fiados.total + prestamos.total + adelantos.total + madera.total),
  };
}

export const PorCobrarDB = {
  /** Agrega los saldos pendientes por cobrar del tenant (tenant-scoped). */
  async getSummary(tenantId: string): Promise<PorCobrarSummary> {
    const [fiadoAgg, adelantoAgg, cuotaAgg, prestamosCount, movsForestales] = await Promise.all([
      prisma.fiado.aggregate({
        where: WHERE_FIADO(tenantId),
        _sum: { saldo: true },
        _count: true,
      }),
      prisma.adelanto.aggregate({
        where: WHERE_ADELANTO(tenantId),
        _sum: { saldoPendiente: true },
        _count: true,
      }),
      // Saldo de préstamos = cuotas aún no pagadas de préstamos vivos.
      prisma.prestamoCuota.aggregate({
        where: { pagadoEn: null, prestamo: WHERE_PRESTAMO(tenantId) },
        _sum: { monto: true },
      }),
      prisma.prestamo.count({ where: WHERE_PRESTAMO(tenantId) }),
      /* Cuenta corriente forestal: se traen los movimientos y se suman por
         parte, porque el saldo es un derivado (cargos − abonos) y no una
         columna. Son decenas por tenant, no miles. */
      prisma.forestCuentaMov.findMany({
        where: { tenantId, deletedAt: null },
        select: { parteId: true, parteNombre: true, tipo: true, monto: true, fecha: true },
      }),
    ]);

    const fiados: PorCobrarBucket = { total: toNumOrZero(fiadoAgg._sum.saldo), count: fiadoAgg._count };
    const adelantos: PorCobrarBucket = { total: toNumOrZero(adelantoAgg._sum.saldoPendiente), count: adelantoAgg._count };
    const prestamos: PorCobrarBucket = { total: toNumOrZero(cuotaAgg._sum.monto), count: prestamosCount };

    /* Sólo las partes que QUEDAN DEBIENDO: el saldo negativo de una parte es
       plata que le debemos nosotros, y sumarla acá restaría de lo que nos
       deben —dos deudas de signo contrario no se compensan en un tablero de
       cobranza—. */
    const deudores = saldosPorParte(movsForestales).filter((p) => p.saldo > 0.005);
    const madera: PorCobrarBucket = {
      total: aSoles(deudores.reduce((a, p) => a + p.saldo, 0)),
      count: deudores.length,
    };

    const totalGeneral = aSoles(fiados.total + prestamos.total + adelantos.total + madera.total);

    return { fiados, prestamos, adelantos, madera, totalGeneral };
  },

  /**
   * La misma plata, pero fila por fila: quién debe, cuánto, desde cuándo y con
   * qué id se abre su detalle en el módulo que le corresponde.
   *
   * Devuelve además el resumen DERIVADO de esas filas (`resumirPorCobrar`), no
   * una segunda consulta: es lo que evita que la cabecera diga un número y la
   * tabla sume otro.
   */
  async getDetalle(tenantId: string): Promise<PorCobrarDetalle> {
    const [fiados, prestamos, adelantos, movsForestales] = await Promise.all([
      prisma.fiado.findMany({
        where: WHERE_FIADO(tenantId),
        select: {
          id: true,
          saldo: true,
          descripcion: true,
          status: true,
          fechaVence: true,
          createdAt: true,
          customer: { select: { name: true, phone: true } },
        },
      }),
      prisma.prestamo.findMany({
        where: WHERE_PRESTAMO(tenantId),
        select: {
          id: true,
          entidadNombre: true,
          fechaDesembolso: true,
          createdAt: true,
          customer: { select: { name: true } },
          cuotas: {
            where: { pagadoEn: null },
            select: { monto: true, fechaVence: true },
          },
        },
      }),
      prisma.adelanto.findMany({
        where: WHERE_ADELANTO(tenantId),
        select: {
          id: true,
          codigoOperacion: true,
          reciboManual: true,
          saldoPendiente: true,
          fechaAdelanto: true,
          fechaVencimiento: true,
          beneficiario: { select: { nombre: true } },
        },
      }),
      prisma.forestCuentaMov.findMany({
        where: { tenantId, deletedAt: null },
        select: { parteId: true, parteNombre: true, tipo: true, monto: true, fecha: true },
      }),
    ]);

    const filas: PorCobrarFila[] = [];

    for (const f of fiados) {
      filas.push({
        id: f.id,
        tipo: "fiado",
        quien: f.customer?.name?.trim() || "Cliente sin nombre",
        monto: toNumOrZero(f.saldo),
        /* `createdAt` es un instante real (no un calendario): el día del
           negocio es el de Lima, si no una venta de las 20:00 se lee «mañana». */
        desde: limaDateKey(f.createdAt) || null,
        vence: diaUtc(f.fechaVence),
        nota: f.descripcion?.trim() || null,
      });
    }

    for (const p of prestamos) {
      const impagas = p.cuotas.length;
      const proxima = p.cuotas
        .map((c) => c.fechaVence)
        .sort((a, b) => a.getTime() - b.getTime())[0];
      filas.push({
        id: p.id,
        tipo: "prestamo",
        quien: p.customer?.name?.trim() || p.entidadNombre?.trim() || "Sin nombre",
        monto: aSoles(p.cuotas.reduce((s, c) => s + toNumOrZero(c.monto), 0)),
        desde: diaUtc(p.fechaDesembolso) ?? (limaDateKey(p.createdAt) || null),
        vence: diaUtc(proxima),
        nota: `${impagas} cuota${impagas === 1 ? "" : "s"} sin pagar`,
      });
    }

    for (const a of adelantos) {
      filas.push({
        id: a.id,
        tipo: "adelanto",
        quien: a.beneficiario?.nombre?.trim() || "Sin nombre",
        monto: toNumOrZero(a.saldoPendiente),
        desde: diaUtc(a.fechaAdelanto),
        vence: diaUtc(a.fechaVencimiento),
        nota: a.codigoOperacion?.trim() || (a.reciboManual ? `Recibo ${a.reciboManual}` : null),
      });
    }

    for (const parte of saldosPorParte(movsForestales)) {
      if (parte.saldo <= 0.005) continue;
      filas.push({
        id: parte.parteId,
        tipo: "madera",
        quien: parte.nombre?.trim() || "Parte sin nombre",
        monto: parte.saldo,
        desde: parte.desde,
        vence: null,
        nota: "Cuenta corriente del Libro CTP",
      });
    }

    const items = ordenarPorCobrar(filas, limaDateKey());
    return { ...resumirPorCobrar(items), items };
  },
};
