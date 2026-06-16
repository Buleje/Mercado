import "server-only";
import { OrdersDB } from "@/lib/db/orders.db";
import { SalesDB } from "@/lib/db/sales.db";
import { PayablesDB, ExpensesDB } from "@/lib/db/finance.db";
import { FiadosDB } from "@/lib/db/fiados.db";
import { ProductsDB } from "@/lib/db/products.db";
import { computeFinanceKpis, type FinanceKpis } from "@/lib/finance/finance-kpis";

/**
 * FUENTE ÚNICA de los KPIs financieros del admin (auditoría 2026-06-15).
 * Trae los datos vía las DB classes (cacheadas) y aplica las fórmulas canónicas
 * de lib/finance/finance-kpis.ts. Todo módulo financiero debe consumir esto en
 * vez de re-fetchear crudo y re-agregar.
 *
 * Nota de perf: hoy trae las filas y suma en JS (fórmula única testeable).
 * OrdersDB.getAll cap = 1000; para tenants de muy alto volumen mensual conviene
 * empujar el filtro de período a la query (mejora futura, no cambia la fórmula).
 */
export async function getFinanceAggregates(
  tenantId: string,
  period: { from: string; to: string },
): Promise<FinanceKpis> {
  const [orders, sales, payables, fiados, expenses, products] = await Promise.all([
    OrdersDB.getAll(tenantId).catch(() => []),
    SalesDB.getAll(tenantId).catch(() => []),
    PayablesDB.getAll(tenantId).catch(() => []),
    FiadosDB.list(tenantId).catch(() => []),
    ExpensesDB.getAll(tenantId).catch(() => []),
    ProductsDB.getAll(tenantId).catch(() => []),
  ]);

  return computeFinanceKpis({ orders, sales, payables, fiados, expenses, products }, period);
}
