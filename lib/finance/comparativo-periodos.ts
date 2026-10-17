/**
 * lib/finance/comparativo-periodos.ts — un mes contra otro (Mi Plata › Reportes
 * comparativos).
 *
 * Por qué existe (11-10): la pantalla leía `/api/admin/dashboard?from&to`, que
 * IGNORA el rango y devuelve listas (`orders`, `sales`…), no totales. Todas las
 * cifras salían S/ 0,00 y «Pedidos» salía `NaN` (`Number(json.orders)` de un
 * arreglo de 2+ pedidos). Medido en `main`: octubre tenía 1 venta del POS y la
 * pantalla decía S/ 0,00 y «NaN%».
 *
 * Las cifras salen de la MISMA regla de ingresos que el resto de Mi Plata
 * (`ingresos-del-periodo.ts`: ventas del POS + pedidos concretados, mes de
 * calendario de Lima). Este archivo es PURO: arma el período desde los
 * agregados que trae `ComparativoPeriodosDB` y calcula la variación. Ninguna
 * cifra puede salir `NaN`: lo que no se puede calcular es `null` («—»).
 */
import { mesesHasta } from "@/lib/finance/ingresos-del-periodo";

export type Contra = "mes_pasado" | "mismo_mes_anyo";

export const CONTRAS: readonly Contra[] = ["mes_pasado", "mismo_mes_anyo"];

/** Los agregados crudos de un mes (lo que devuelve la clase DB). */
export interface AgregadosDelMes {
  ventasPos: { total: number; cuantas: number; conCosto: number; costo: number };
  pedidos: { total: number; cuantos: number; conCosto: number; costo: number };
  clientesNuevos: number;
  fiado: { total: number; cuantos: number };
}

/** Un mes listo para mostrar. `null` = no se puede calcular (se muestra «—»). */
export interface PeriodoComparativo {
  mes: string;
  /** Ventas del POS + pedidos concretados: el «ingresos» de Mi Plata. */
  ventas: number;
  /** Cuántas ventas del POS + cuántos pedidos concretados. */
  transacciones: number;
  ticketPromedio: number | null;
  /** Margen bruto en %, sólo sobre lo que tiene costo guardado. */
  margen: number | null;
  clientesNuevos: number;
  /** Fiado dado en el mes (lo que se fió, no lo que queda por cobrar hoy). */
  fiadoDado: number;
}

const fin = (v: unknown) => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};
/** A céntimos enteros: las sumas se hacen en enteros y se dividen una sola vez. */
const cts = (v: unknown) => Math.round(fin(v) * 100);

/**
 * Margen bruto en % sobre lo que guardó su costo, con un decimal. Sin ventas
 * con costo, o pasado ±999 %, no dice nada y es `null` (S/ 0,10 vendidos con
 * S/ 18,29 de costo daban «−18190 %», medido en `main` 10-2026).
 */
export function margenBruto(conCostoCts: number, costoCts: number): number | null {
  if (!(conCostoCts > 0)) return null;
  const m = Math.round(((conCostoCts - costoCts) / conCostoCts) * 1000) / 10;
  return Number.isFinite(m) && Math.abs(m) <= 999 ? m : null;
}

export function armarPeriodo(mes: string, a: AgregadosDelMes): PeriodoComparativo {
  const ventasCts = cts(a.ventasPos.total) + cts(a.pedidos.total);
  const transacciones = Math.max(0, Math.trunc(fin(a.ventasPos.cuantas) + fin(a.pedidos.cuantos)));
  return {
    mes,
    ventas: ventasCts / 100,
    transacciones,
    ticketPromedio: transacciones > 0 ? Math.round(ventasCts / transacciones) / 100 : null,
    margen: margenBruto(
      cts(a.ventasPos.conCosto) + cts(a.pedidos.conCosto),
      cts(a.ventasPos.costo) + cts(a.pedidos.costo),
    ),
    clientesNuevos: Math.max(0, Math.trunc(fin(a.clientesNuevos))),
    fiadoDado: cts(a.fiado.total) / 100,
  };
}

/**
 * Variación en % de `actual` contra `base`. `null` cuando no hay base con qué
 * comparar (base 0 o algún lado sin dato): «+100 %» desde cero mentía.
 */
export function variacion(actual: number | null, base: number | null): number | null {
  if (
    actual == null ||
    base == null ||
    !Number.isFinite(actual) ||
    !Number.isFinite(base) ||
    base === 0
  )
    return null;
  const v = ((actual - base) / Math.abs(base)) * 100;
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
}

/** El mes contra el que se compara `mes` (`YYYY-MM`). */
export function mesDeComparacion(mes: string, contra: Contra): string {
  if (contra === "mes_pasado") return mesesHasta(mes, 2)[0];
  const [y, m] = mes.split("-");
  return `${Number(y) - 1}-${m}`;
}

export function esContra(v: string | null | undefined): v is Contra {
  return (CONTRAS as readonly string[]).includes(v ?? "");
}

/* ───────────────────────── Comparar períodos ─────────────────────────
 * Mi Plata › Comparar períodos (11-10, tanda 5). Antes sumaba EN EL
 * NAVEGADOR las últimas 1 000 ventas del POS que trae `/api/admin/dashboard`,
 * con el reloj del navegador: dejaba afuera los pedidos concretados (2026 en
 * `main`: S/ 259,30 contra los S/ 397,50 de Mi Plata) y contaba la venta
 * anónima como «un cliente». Ahora el servidor arma los dos rangos de días de
 * Lima y calcula todo con la MISMA regla de ventas que Mi Plata. */

export const PERIODOS = ["semana", "mes", "trimestre", "anyo"] as const;
export type Periodo = (typeof PERIODOS)[number];
export const CONTRAS_PERIODO = ["anterior", "hace_un_anyo"] as const;
export type ContraPeriodo = (typeof CONTRAS_PERIODO)[number];

/** Días de calendario de Lima, los dos inclusive (`YYYY-MM-DD`). */
export interface RangoDias {
  desde: string;
  hasta: string;
}

/** Los agregados crudos de un rango (lo que devuelve `ComparativoPeriodosDB.delRangoCompleto`). */
export interface AgregadosDelRango extends AgregadosDelMes {
  /** Teléfonos distintos entre ventas del POS y pedidos que entran (la venta anónima no cuenta). */
  clientesUnicos: number;
  devoluciones: { total: number; cuantas: number };
}

/** Un rango listo para mostrar. `null` = no se puede calcular («—»). */
export interface PeriodoDeComparacion extends RangoDias {
  etiqueta: string;
  /** Ventas del POS + pedidos concretados: el «ingresos» de Mi Plata. */
  ventas: number;
  transacciones: number;
  ticketPromedio: number | null;
  margen: number | null;
  /** Costo guardado de lo vendido (sólo de las ventas que lo tienen). */
  costoDeVentas: number;
  clientesUnicos: number;
  clientesNuevos: number;
  fiadoDado: number;
  devoluciones: number;
}

/** Lo que responde `GET /api/finanzas/comparativo?periodo=…`. */
export interface ComparacionDePeriodos {
  periodo: Periodo;
  contra: ContraPeriodo;
  actual: PeriodoDeComparacion;
  base: PeriodoDeComparacion;
}

const DIA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const aUtc = (dia: string) => {
  const [y, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const aDia = (ms: number | Date) => new Date(ms).toISOString().slice(0, 10);
const sumarDias = (dia: string, n: number) => {
  const d = aUtc(dia);
  d.setUTCDate(d.getUTCDate() + n);
  return aDia(d);
};

/** `YYYY-MM-DD` que existe en el calendario (sin 30 de febrero) y entre 2000 y 2100, o `null`. */
export function parsearDia(s: string | null | undefined): string | null {
  const m = s ? DIA_RE.exec(s) : null;
  if (!m) return null;
  const y = Number(m[1]);
  if (y < 2000 || y > 2100) return null;
  return aDia(aUtc(s as string)) === s ? (s as string) : null;
}

/** El período de calendario que contiene `dia` (la semana va de lunes a domingo). */
export function rangoDelPeriodo(periodo: Periodo, dia: string): RangoDias {
  const d = aUtc(dia);
  const y = d.getUTCFullYear();
  const m0 = d.getUTCMonth();
  if (periodo === "semana") {
    const desde = sumarDias(dia, -((d.getUTCDay() + 6) % 7));
    return { desde, hasta: sumarDias(desde, 6) };
  }
  if (periodo === "mes")
    return { desde: aDia(Date.UTC(y, m0, 1)), hasta: aDia(Date.UTC(y, m0 + 1, 0)) };
  if (periodo === "trimestre") {
    const q0 = Math.floor(m0 / 3) * 3;
    return { desde: aDia(Date.UTC(y, q0, 1)), hasta: aDia(Date.UTC(y, q0 + 3, 0)) };
  }
  return { desde: `${y}-01-01`, hasta: `${y}-12-31` };
}

/**
 * Contra qué se compara: el período inmediatamente anterior, o el mismo de
 * hace un año (la semana, 52 semanas atrás: mismo día de la semana).
 */
export function rangoDeComparacion(
  periodo: Periodo,
  actual: RangoDias,
  contra: ContraPeriodo,
): RangoDias {
  if (contra === "anterior") return rangoDelPeriodo(periodo, sumarDias(actual.desde, -1));
  if (periodo === "semana") return rangoDelPeriodo("semana", sumarDias(actual.desde, -364));
  return rangoDelPeriodo(
    periodo,
    `${Number(actual.desde.slice(0, 4)) - 1}${actual.desde.slice(4)}`,
  );
}

/** El período siguiente (para «›»): el que contiene el día después de `hasta`. */
export function periodoSiguiente(periodo: Periodo, actual: RangoDias): RangoDias {
  return rangoDelPeriodo(periodo, sumarDias(actual.hasta, 1));
}

/** Lima es UTC−5 todo el año: el día de Lima empieza a las 05:00 UTC (igual que `rangoDelMesLima`). */
const DESFASE_LIMA_H = 5;

/** `[start, end)` en instantes UTC de un rango de días de Lima. */
export function instantesDelRango(r: RangoDias): { start: Date; end: Date } {
  const [y, m, d] = r.desde.split("-").map(Number);
  const [y2, m2, d2] = sumarDias(r.hasta, 1).split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, d, DESFASE_LIMA_H)),
    end: new Date(Date.UTC(y2, m2 - 1, d2, DESFASE_LIMA_H)),
  };
}

/* Meses escritos a mano (`Intl` cambia por versión de ICU; en Perú, «setiembre»). */
const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "setiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const corto = (m0: number) => (MESES[m0] ?? "").slice(0, 3);
const mayuscula = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

/** «6–12 oct 2026» · «Octubre 2026» · «Oct–dic 2026» · «2026». */
export function etiquetaDelRango(periodo: Periodo, r: RangoDias): string {
  const a = aUtc(r.desde);
  const b = aUtc(r.hasta);
  const y = a.getUTCFullYear();
  if (periodo === "anyo") return String(y);
  if (periodo === "mes") return `${mayuscula(MESES[a.getUTCMonth()] ?? r.desde)} ${y}`;
  if (periodo === "trimestre")
    return `${mayuscula(corto(a.getUTCMonth()))}–${corto(b.getUTCMonth())} ${y}`;
  const mismoMes = a.getUTCMonth() === b.getUTCMonth();
  const inicio = mismoMes ? String(a.getUTCDate()) : `${a.getUTCDate()} ${corto(a.getUTCMonth())}`;
  return `${inicio}–${b.getUTCDate()} ${corto(b.getUTCMonth())} ${b.getUTCFullYear()}`;
}

/** Un rango listo para mostrar, con las sumas en céntimos. Ningún `NaN`. */
export function armarPeriodoDeComparacion(
  periodo: Periodo,
  r: RangoDias,
  a: AgregadosDelRango,
): PeriodoDeComparacion {
  const base = armarPeriodo(r.desde.slice(0, 7), a);
  return {
    desde: r.desde,
    hasta: r.hasta,
    etiqueta: etiquetaDelRango(periodo, r),
    ventas: base.ventas,
    transacciones: base.transacciones,
    ticketPromedio: base.ticketPromedio,
    margen: base.margen,
    costoDeVentas: (cts(a.ventasPos.costo) + cts(a.pedidos.costo)) / 100,
    clientesUnicos: Math.max(0, Math.trunc(fin(a.clientesUnicos))),
    clientesNuevos: base.clientesNuevos,
    fiadoDado: base.fiadoDado,
    devoluciones: cts(a.devoluciones.total) / 100,
  };
}

export function esPeriodo(v: string | null | undefined): v is Periodo {
  return (PERIODOS as readonly string[]).includes(v ?? "");
}
