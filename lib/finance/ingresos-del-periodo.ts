/**
 * lib/finance/ingresos-del-periodo.ts — LA regla de qué plata entró en un mes.
 *
 * Mi Plata tenía dos respuestas para la misma pregunta. El Resumen sumaba las
 * ventas del POS más los pedidos confirmados, en camino o entregados
 * (`/api/finanzas/monthly-summary`); Ganancias sumaba sólo pedidos, y sólo los
 * «confirmado» o «entregado» (`PLTab` bajaba `/api/orders` y filtraba en el
 * navegador). Medido en el tenant `main`, mayo 2026:
 *
 *   7 ventas del POS                    174,30
 *   3 pedidos confirmados                47,70
 *   1 pedido entregado                    7,20
 *   (1 pedido «preparando» de 91,50 no entra en ninguna de las dos)
 *   ─────────────────────────────────────────
 *   Resumen      174,30 + 47,70 + 7,20 = 229,20
 *   Ganancias             47,70 + 7,20 =  54,90   ← se perdía el mostrador
 *
 * El mismo mes, dos pantallas hermanas, 174,30 de diferencia. La regla vive
 * acá y la usan las dos (el endpoint la aplica; Ganancias lee el endpoint).
 *
 * EL MES ES EL CALENDARIO DE LIMA (decidido 2026-09-28). Perú es UTC−5 sin
 * horario de verano: el mes va del 01 a las 05:00 UTC al 01 del mes siguiente
 * a las 05:00 UTC. Antes se cortaba en UTC (`createdAt.slice(0, 7)`) y una
 * venta del 30/09 a las 20:00 de Pucallpa (01/10 01:00 UTC) caía en octubre,
 * en el Resumen y en Ganancias. El servidor (`rangoDelMesLima`) y el navegador
 * (`mesLima`) cortan en el mismo instante.
 *
 * PURO y client-safe.
 */

import { INGRESO_ORDER_STATUSES } from "@/lib/finance/finance-kpis";
import { limaDateKey } from "@/lib/utils";

/** Una venta del POS: toda venta registrada es plata que entró. */
export type FilaVenta = { createdAt: string; total: number };
/** Un pedido: entra sólo si ya está concretado (ver `pedidoEntraComoIngreso`). */
export type FilaPedido = { createdAt: string; total: number; status: string };

export interface IngresoDelMes {
  /** `YYYY-MM` en UTC. */
  month: string;
  /** Lo que vendió el mostrador (POS). */
  ventas: number;
  /** Lo que entró por pedidos concretados. */
  pedidos: number;
  /** ventas + pedidos: el número que muestran Resumen y Ganancias. */
  ingresos: number;
}

/** Los estados en los que un pedido ya es plata del negocio. */
export const ESTADOS_PEDIDO_QUE_ENTRAN = INGRESO_ORDER_STATUSES;

export function pedidoEntraComoIngreso(status: string | null | undefined): boolean {
  return (ESTADOS_PEDIDO_QUE_ENTRAN as readonly string[]).includes(status ?? "");
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const num = (v: unknown) => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** ventas + pedidos de un mes, redondeado al céntimo (la suma de Decimals llega con cola de float). */
export function combinarIngresos(month: string, ventas: number, pedidos: number): IngresoDelMes {
  const v = r2(num(ventas));
  const p = r2(num(pedidos));
  return { month, ventas: v, pedidos: p, ingresos: r2(v + p) };
}

const MES_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** `YYYY-MM` válido o `null`. */
export function parsearMes(s: string | null | undefined): string | null {
  return s && MES_RE.test(s) ? s : null;
}

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * El mes de Lima de un instante, como `YYYY-MM`. Un texto «YYYY-MM-DD» sin
 * hora ya es un día de calendario y se toma tal cual (no hay instante que
 * pasar a Lima). `""` si la fecha no sirve.
 */
export function mesLima(v: Date | string | number): string {
  if (typeof v === "string" && SOLO_FECHA.test(v)) return v.slice(0, 7);
  return limaDateKey(v).slice(0, 7);
}

/**
 * El mes de un GASTO. El formulario de gastos manda la fecha sola
 * («2026-09-01») y la base la guarda como 00:00:00.000 UTC: eso es un día de
 * calendario, no un instante — pasado a Lima sería el 31/08 a las 19:00 y el
 * gasto caería en el mes anterior. Esa medianoche exacta se lee como fecha;
 * cualquier otra hora (gastos fijos pagados, `paidAt`) es un instante de Lima.
 */
export function mesDeGasto(v: Date | string | number | null | undefined): string {
  if (v == null || v === "") return "";
  const d = v instanceof Date ? v : new Date(v);
  if (!Number.isFinite(d.getTime())) return "";
  const medianocheUtc = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
  return medianocheUtc ? d.toISOString().slice(0, 7) : mesLima(d);
}

/** Lima es UTC−5 todo el año: la medianoche de Lima son las 05:00 UTC. */
const DESFASE_LIMA_H = 5;

/** `[inicio, fin)` del mes de Lima `YYYY-MM`, en instantes UTC. */
export function rangoDelMesLima(mes: string): { start: Date; end: Date } {
  const [y, m] = mes.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1, DESFASE_LIMA_H)),
    end: new Date(Date.UTC(y, m, 1, DESFASE_LIMA_H)),
  };
}

/** `YYYY-MM` de un año/mes de calendario (Date.UTC normaliza meses fuera de rango). */
const claveCalendario = (y: number, m0: number) => new Date(Date.UTC(y, m0, 1)).toISOString().slice(0, 7);

/** Los `cuantos` meses que terminan en `hasta`, del más viejo al más nuevo. */
export function mesesHasta(hasta: string, cuantos: number): string[] {
  const [y, m] = hasta.split("-").map(Number);
  const out: string[] = [];
  for (let i = cuantos - 1; i >= 0; i--) out.push(claveCalendario(y, m - 1 - i));
  return out;
}

/**
 * La regla aplicada a filas sueltas (para quien ya las tiene en la mano y para
 * fijarla en un test). El endpoint hace lo mismo con agregados de la base.
 */
export function ingresosPorMes(
  meses: readonly string[],
  ventas: ReadonlyArray<FilaVenta>,
  pedidos: ReadonlyArray<FilaPedido>,
): IngresoDelMes[] {
  return meses.map((month) => {
    const v = ventas
      .filter((s) => mesLima(s.createdAt ?? "") === month)
      .reduce((acc, s) => acc + num(s.total), 0);
    const p = pedidos
      .filter((o) => mesLima(o.createdAt ?? "") === month && pedidoEntraComoIngreso(o.status))
      .reduce((acc, o) => acc + num(o.total), 0);
    return combinarIngresos(month, v, p);
  });
}

/** Un gasto: cuenta en el mes de su fecha (o de su alta, si no trae fecha). */
export type FilaGasto = { date?: string; createdAt?: string; amount?: number };

/**
 * Gastos de un mes de Lima (ver `mesDeGasto` para la fecha sola). Quien llama
 * pasa sólo gastos reales: las plantillas de gasto fijo (`recurring`, ADR-374)
 * no son plata que salió — `/api/expenses?recurring=false` ya las deja fuera,
 * igual que el rango `from/to` que usa Ganancias.
 */
export function gastoDelMes(mes: string, gastos: ReadonlyArray<FilaGasto>): number {
  return r2(
    gastos
      .filter((e) => mesDeGasto(e.date ?? e.createdAt) === mes)
      .reduce((acc, e) => acc + num(e.amount), 0),
  );
}
