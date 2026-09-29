/**
 * Helpers compartidos del módulo Finanzas — single source (refactor 2026-06-15).
 * Consumidos por FinanzasModule (router + FinanzasDashboard + IntelligenceKPIStrip)
 * y por finanzas/charts.tsx. Sin JSX → módulo `.ts`.
 *
 * Brandon 2026-05-16 (audit P1 fetch dedup): cache module-level para los
 * endpoints más volumétricos del módulo. Antes 3 sub-componentes fetchéaban
 * `/api/sales?limit=5000` y `/api/expenses/summary` en paralelo al mount → 3
 * roundtrips con 15k filas. Con dedupe:
 *  - Solo 1 fetch in-flight por endpoint (resto subscribe a la misma Promise).
 *  - TTL 30s mantiene la respuesta caliente al cambiar de tab dentro de Finanzas.
 *  - invalidateFinanzasCache() expone limpieza manual ("Actualizar").
 */
import { gastoDelMes, ingresosPorMes, mesLima } from "@/lib/finance/ingresos-del-periodo";

type CacheEntry<T> = { value: T; expiresAt: number };
const finanzasCache = new Map<string, CacheEntry<unknown>>();
const finanzasInFlight = new Map<string, Promise<unknown>>();
const FINANZAS_TTL_MS = 30_000;

export async function fetchFinanzas<T>(url: string, fallback: T): Promise<T> {
  const hit = finanzasCache.get(url) as CacheEntry<T> | undefined;
  if (hit && Date.now() < hit.expiresAt) return hit.value;
  const inFlight = finanzasInFlight.get(url) as Promise<T> | undefined;
  if (inFlight) return inFlight;
  const promise = (async () => {
    try {
      const res = await fetch(url);
      const data = res.ok ? ((await res.json()) as T) : fallback;
      finanzasCache.set(url, { value: data as unknown, expiresAt: Date.now() + FINANZAS_TTL_MS });
      return data;
    } catch {
      return fallback;
    } finally {
      finanzasInFlight.delete(url);
    }
  })();
  finanzasInFlight.set(url, promise as Promise<unknown>);
  return promise;
}

export function invalidateFinanzasCache() {
  finanzasCache.clear();
  finanzasInFlight.clear();
}

// Brandon 2026-05-17 (audit tsc cleanup): helpers tipados para evitar cascada
// de errores TS18046/TS2362 al consumir Record<string, unknown> en aritmética.
// `n()` normaliza unknown → number sin excepción (NaN → 0). SaleRaw/ExpenseRaw
// son shapes mínimos que cubren todos los campos accedidos en el módulo.
export type SaleRaw = {
  createdAt?: string;
  total?: number;
  paymentMethod?: string;
  metodoPago?: string;
};
export type ExpenseRaw = {
  date?: string;
  createdAt?: string;
  amount?: number;
  category?: string;
};
export type PayableRaw = {
  amount?: number;
  total?: number;
  /** Lo ya pagado: lo que se debe es amount − paidAmount (`netoPorPagar`). */
  paidAmount?: number;
  status?: string;
  dueDate?: string;
  supplierName?: string;
  supplier?: { name?: string };
  description?: string;
};
/**
 * `total` es lo que se FIÓ; `saldo`/`balance`, lo que todavía DEBEN. Para
 * cualquier KPI de deuda va el saldo: el total incluye lo ya cobrado. El tipo
 * no declaraba los dos últimos aunque `/api/fiados` los manda desde siempre, y
 * por eso «Mi Plata» venía sumando el total.
 */
export type FiadoRaw = { total?: number; amount?: number; saldo?: number; balance?: number };
export type OrderRaw = { createdAt?: string; total?: number; status?: string };

export const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
export const n = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Ingresos de un mes (monthKey "YYYY-MM") = ventas POS (Sale) + pedidos
 * concretados (Order). Usa la MISMA definición de "venta concretada" que la
 * fuente única de KPIs (INGRESO_ORDER_STATUSES) → consistente con el resto del
 * admin. Antes Finanzas sumaba SOLO Sale (desigual con Inicio = Order+Sale).
 */
export function monthIngresos(monthKey: string, sales: SaleRaw[], orders: OrderRaw[]): number {
  // La regla vive en lib/finance/ingresos-del-periodo.ts (la misma que aplica
  // /api/finanzas/monthly-summary para Resumen y Ganancias).
  const [mes] = ingresosPorMes(
    [monthKey],
    sales.map((s) => ({ createdAt: s.createdAt ?? "", total: n(s.total) })),
    orders.map((o) => ({ createdAt: o.createdAt ?? "", total: n(o.total), status: o.status ?? "" })),
  );
  return mes?.ingresos ?? 0;
}

// ── Salud financiera (semáforo) ──────────────────────────────────────────────
export type HealthData = {
  ingresos: number;
  gastos: number;
  /**
   * El efectivo de la caja abierta, o `null` si no se sabe (no hay caja
   * abierta o espera un saldo imposible). Antes se inventaba como
   * `ingresos * 0.3` y la liquidez salía de ese invento.
   */
  efectivo: number | null;
  gastosMensuales: number;
  fiadosVencidos: number;
  payablesVencidos: number;
};

export function calcHealthScore(d: HealthData) {
  // Factor 1: Margen
  const margen = d.ingresos > 0 ? ((d.ingresos - d.gastos) / d.ingresos) * 100 : 0;
  const margenPts = margen > 25 ? 33 : margen >= 15 ? 20 : 5;
  // Factor 2: Liquidez — sólo si se sabe cuánto efectivo hay.
  const liquidezConocida = d.efectivo != null;
  const liquidez = d.efectivo == null ? null : d.gastosMensuales > 0 ? d.efectivo / d.gastosMensuales : 0;
  const liquidezPts = liquidez == null ? 0 : liquidez > 2 ? 33 : liquidez >= 1 ? 20 : 5;
  // Factor 3: Deudas
  const deudaRatio = d.ingresos > 0 ? ((d.fiadosVencidos + d.payablesVencidos) / d.ingresos) * 100 : 100;
  const deudaPts = deudaRatio < 10 ? 34 : deudaRatio <= 30 ? 20 : 5;
  // Sin liquidez el puntaje se lleva a 100 con los dos factores que sí se
  // midieron (67 puntos posibles), en vez de rellenar el hueco con un número.
  const total = liquidezConocida
    ? margenPts + liquidezPts + deudaPts
    : Math.round(((margenPts + deudaPts) / 67) * 100);
  return { total, margenPts, liquidezPts, deudaPts, margen, liquidez, liquidezConocida, deudaRatio };
}

// ── KPIs del mes: por qué existen estas dos funciones ────────────────────────
/*
 * Los dos números que mandan en Mi Plata leían campos que sus endpoints no
 * mandan, y quedaban en cero con la plata cargada (medido 2026-09-06: 15
 * ventas, 25 pedidos y 10 gastos del mes -> «Ingresos S/0», «Gastos S/0»,
 * margen 0 %). El contrato real:
 *
 *   /api/analytics/kpis-v2  -> { ingresosHoy, ticketPromedio, margenOperativo,
 *                                clientesActivos, fiadoPendiente, rotacion… }
 *                              NO trae `ventasMes` ni `salesMonth`.
 *   /api/expenses/summary   -> ARRAY [{category,total,count}] agrupado por
 *                              categoría y SIN filtro de fecha.
 *
 * Viven acá, fuera del componente, para que un test pueda fijar ese contrato:
 * el fallback tiene que seguir dando el número correcto aunque el endpoint
 * cambie de forma otra vez.
 */

/**
 * `YYYY-MM` del mes de LIMA de `fecha`, la clave que usa monthly-summary. Era
 * el mes de la hora local del navegador: fuera de Perú (o en un servidor en
 * UTC) el 30/09 a las 20:00 ya era octubre.
 */
export const claveDeMes = (fecha: Date): string => mesLima(fecha);

/**
 * Ingresos del mes en curso. Prefiere el KPI del endpoint; si no vino (hoy es
 * el caso), los toma del resumen mensual, que sí los trae agregados server-side.
 */
export function ingresosDelMes(
  kpisData: Record<string, unknown> | null | undefined,
  monthlySummary: ReadonlyArray<{ month: string; ingresos: number }>,
  ahora: Date,
): number {
  const delKpi = n(kpisData?.ventasMes ?? kpisData?.salesMonth);
  if (delKpi) return delKpi;
  const clave = claveDeMes(ahora);
  return n(monthlySummary.find((m) => m.month === clave)?.ingresos);
}

/**
 * Gastos del mes en curso. Prefiere el KPI del endpoint; si no vino, suma los
 * gastos cuya fecha cae dentro del mes — el summary por categoría NO sirve
 * para esto porque no filtra por fecha.
 */
export function gastosDelMes(
  expSummary: { totalMonth?: number; total?: number } | null | undefined,
  gastos: ReadonlyArray<ExpenseRaw>,
  ahora: Date,
): number {
  const delKpi = n(expSummary?.totalMonth ?? expSummary?.total);
  if (delKpi) return delKpi;
  // El mes de Lima, con la misma regla que las barras del gráfico (una fecha
  // sola del formulario es un día de calendario). Antes: todo lo posterior al
  // 01 en hora local, sin tope — un gasto con fecha futura se sumaba al mes.
  return gastoDelMes(claveDeMes(ahora), gastos);
}
