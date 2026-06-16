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
import { INGRESO_ORDER_STATUSES } from "@/lib/finance/finance-kpis";

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
  supplierName?: string;
  supplier?: { name?: string };
  description?: string;
};
export type FiadoRaw = { total?: number; amount?: number };
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
  const fromSales = sales
    .filter((s) => (s.createdAt ?? "").startsWith(monthKey))
    .reduce((sum, s) => sum + n(s.total), 0);
  const fromOrders = orders
    .filter((o) => (o.createdAt ?? "").startsWith(monthKey) && (INGRESO_ORDER_STATUSES as readonly string[]).includes(o.status ?? ""))
    .reduce((sum, o) => sum + n(o.total), 0);
  return fromSales + fromOrders;
}

// ── Salud financiera (semáforo) ──────────────────────────────────────────────
export type HealthData = {
  ingresos: number;
  gastos: number;
  efectivo: number;
  gastosMensuales: number;
  fiadosVencidos: number;
  payablesVencidos: number;
};

export function calcHealthScore(d: HealthData) {
  // Factor 1: Margen
  const margen = d.ingresos > 0 ? ((d.ingresos - d.gastos) / d.ingresos) * 100 : 0;
  const margenPts = margen > 25 ? 33 : margen >= 15 ? 20 : 5;
  // Factor 2: Liquidez
  const liquidez = d.gastosMensuales > 0 ? d.efectivo / d.gastosMensuales : 0;
  const liquidezPts = liquidez > 2 ? 33 : liquidez >= 1 ? 20 : 5;
  // Factor 3: Deudas
  const deudaRatio = d.ingresos > 0 ? ((d.fiadosVencidos + d.payablesVencidos) / d.ingresos) * 100 : 100;
  const deudaPts = deudaRatio < 10 ? 34 : deudaRatio <= 30 ? 20 : 5;
  const total = margenPts + liquidezPts + deudaPts;
  return { total, margenPts, liquidezPts, deudaPts, margen, liquidez, deudaRatio };
}
