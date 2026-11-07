/**
 * lib/finance/finance-kpis.ts — FUENTE ÚNICA de los KPIs financieros del admin.
 *
 * Problema que resuelve (auditoría 2026-06-15): 407/766 componentes admin
 * recalculaban los mismos KPIs con fórmulas distintas → números desiguales
 * entre tabs. Esta es la ÚNICA definición de cada KPI. Todo consumidor debe
 * pedir el agregado, no recalcular.
 *
 * Pura y testeable: recibe las filas ya traídas y devuelve los KPIs.
 */

/**
 * Estados de Order que cuentan como INGRESO (venta concretada).
 * ⚙️ Única perilla: si querés reconocer ingreso solo al entregar, dejá
 * ["entregado"]. Hoy: confirmado/en_camino/entregado = la venta ya se cerró.
 */
export const INGRESO_ORDER_STATUSES = ["confirmado", "en_camino", "entregado"] as const;

export interface FinanceKpiRows {
  orders: ReadonlyArray<{ total: number; status: string; createdAt: string }>;
  sales: ReadonlyArray<{ total: number; createdAt: string }>;
  payables: ReadonlyArray<{ amount: number; paidAmount: number; status: string }>;
  fiados: ReadonlyArray<{ saldo: number }>;
  expenses: ReadonlyArray<{ amount: number; date: string }>;
  products: ReadonlyArray<{ stock?: number | null; price: number; costPrice?: number | null; active: boolean }>;
}

export interface FinanceKpis {
  /** Order (venta concretada) + Sale (POS), DENTRO del período. */
  ingresos: number;
  /** Expenses dentro del período. */
  gastos: number;
  /** ingresos − gastos del período. */
  utilidadBruta: number;
  /** Payables pendientes (amount − paidAmount), ESTADO ACTUAL. */
  porPagar: number;
  /** Saldo de fiados, ESTADO ACTUAL. */
  deudaFiados: number;
  /** Stock activo valorizado a precio de VENTA. */
  stockValorVenta: number;
  /** Stock activo valorizado a COSTO. */
  stockValorCosto: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => Number(v) || 0;
const inRange = (iso: string, from: string, to: string) => {
  const d = (iso ?? "").slice(0, 10);
  return d >= from && d <= to;
};

/** Saldo pendiente de una cuenta por pagar (nunca negativo). */
export function netoPorPagar(p: { amount: number; paidAmount: number; status: string }): number {
  if (p.status === "pagado") return 0;
  return Math.max(0, num(p.amount) - num(p.paidAmount));
}

/**
 * Calcula TODOS los KPIs financieros canónicos. `period` (YYYY-MM-DD) aplica a
 * ingresos y gastos; los pasivos/stock son estado actual (no se filtran por fecha).
 */
export function computeFinanceKpis(rows: FinanceKpiRows, period: { from: string; to: string }): FinanceKpis {
  const ingresosOrders = rows.orders
    .filter(o => (INGRESO_ORDER_STATUSES as readonly string[]).includes(o.status) && inRange(o.createdAt, period.from, period.to))
    .reduce((s, o) => s + num(o.total), 0);

  const ingresosSales = rows.sales
    .filter(s => inRange(s.createdAt, period.from, period.to))
    .reduce((s, x) => s + num(x.total), 0);

  const gastos = rows.expenses
    .filter(e => inRange(e.date, period.from, period.to))
    .reduce((s, e) => s + num(e.amount), 0);

  const porPagar = rows.payables.reduce((s, p) => s + netoPorPagar(p), 0);
  const deudaFiados = rows.fiados.reduce((s, f) => s + num(f.saldo), 0);

  const activos = rows.products.filter(p => p.active && p.stock != null);
  const stockValorVenta = activos.reduce((s, p) => s + num(p.stock) * num(p.price), 0);
  const stockValorCosto = activos.reduce((s, p) => s + num(p.stock) * num(p.costPrice ?? p.price), 0);

  const ingresos = round2(ingresosOrders + ingresosSales);
  const gastosR = round2(gastos);

  return {
    ingresos,
    gastos: gastosR,
    utilidadBruta: round2(ingresos - gastosR),
    porPagar: round2(porPagar),
    deudaFiados: round2(deudaFiados),
    stockValorVenta: round2(stockValorVenta),
    stockValorCosto: round2(stockValorCosto),
  };
}
