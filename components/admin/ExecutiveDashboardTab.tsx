"use client";

import { CardTitle, SectionTitle } from "@buleje/design-system";
import { AdminTooltip } from "@/components/admin/shared/AdminTooltip";
import { useState, useMemo, useEffect, startTransition } from "react";
import { Gauge, TrendingUp, TrendingDown, DollarSign, Users, ShoppingCart, AlertTriangle, CheckCircle, ArrowUp, ArrowDown, BarChart3, Eye, Download, Star, RefreshCw } from "@buleje/design-system/icons";
import { cn, exportToCSV, safeNumber } from "@/lib/utils";
import type { Product, Sale, Customer } from "@/types/erp";

type Period = "hoy" | "semana" | "mes" | "trimestre";

// ── API data types ─────────────────────────────────────────────────────────────
type OrderItem  = { id: string; name: string; quantity: number; price: number };
type Order      = { id: string; customer?: { phone?: string }; items: OrderItem[]; total: number; status: string; createdAt: string };
type Payable    = { id: string; amount: number; paidAmount: number; status: string; dueDate: string };
type Review     = { id: string; rating: number; createdAt: string };
type DashData   = {
  products: Product[]; orders: Order[]; sales: Sale[]; customers: Customer[];
  payables: Payable[]; reviews: Review[];
  alerts: { lowStock: number; pendingOrders: number; overduePayables: number };
};

type ModuleHealth = {
  module: string; status: "ok" | "warning" | "critical";
  metric: string; value: number; target: number; trend: number;
  detail?: string; isCurrency?: boolean; isDecimal?: boolean;
};

const PERIOD_LABELS: Record<Period, string> = { hoy: "Hoy", semana: "Esta semana", mes: "Este mes", trimestre: "Este trimestre" };
const PERIOD_DAYS:   Record<Period, number> = { hoy: 1,    semana: 7,              mes: 30,          trimestre: 90 };

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtShort(n: number) {
  if (n >= 1_000_000) return `S/${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `S/${(n / 1_000).toFixed(1)}k`;
  return fmt(n);
}
function inPeriod(dateStr: string, period: Period): boolean {
  const date = new Date(dateStr);
  const now  = new Date();
  if (period === "hoy")      return date.toDateString() === now.toDateString();
  const diffDays = (now.getTime() - date.getTime()) / 86_400_000;
  if (period === "semana")   return diffDays < 7;
  if (period === "mes")      return diffDays < 30;
  return diffDays < 90;
}
function prevPeriod(dateStr: string, period: Period): boolean {
  const date = new Date(dateStr);
  const now  = new Date();
  const diffDays = (now.getTime() - date.getTime()) / 86_400_000;
  if (period === "hoy")      { const y = new Date(now); y.setDate(y.getDate() - 1); return date.toDateString() === y.toDateString(); }
  if (period === "semana")   return diffDays >= 7  && diffDays < 14;
  if (period === "mes")      return diffDays >= 30 && diffDays < 60;
  return diffDays >= 90 && diffDays < 180;
}

export default function ExecutiveDashboardTab() {
  const [period, setPeriod]               = useState<Period>("semana");
  const [data, setData]                   = useState<DashData | null>(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(false);
  const [expandedModule, setExpanded]     = useState<string | null>(null);
  const [lastUpdated, setLastUpdated]     = useState<Date | null>(null);

  const load = () => {
    startTransition(() => { setLoading(true); setError(false); });
    fetch("/api/admin/dashboard")
      .then(r => { if (!r.ok) throw new Error(); return r.json() as Promise<DashData>; })
      .then(d => startTransition(() => { setData(d); setLastUpdated(new Date()); }))
      .catch(() => startTransition(() => setError(true)))
      .finally(() => startTransition(() => setLoading(false)));
  };

  useEffect(() => { load(); }, []); // initial data load

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    if (!data) return null;
    const orders     = data.orders.filter(o => o.status !== "cancelado" && inPeriod(o.createdAt, period));
    const prevOrders = data.orders.filter(o => o.status !== "cancelado" && prevPeriod(o.createdAt, period));
    const sales      = data.sales.filter(s => inPeriod(s.createdAt, period));
    const prevSales  = data.sales.filter(s => prevPeriod(s.createdAt, period));

    // BUG-FIX (audit 2026-05-05): wrap todos los reduces y deltas con safeNumber
    // para evitar NaN propagation cuando el dataset tiene valores corruptos
    // (orders sin total, products sin costPrice, etc).
    const revenue     = safeNumber(orders.reduce((s, o) => s + safeNumber(o.total), 0) + sales.reduce((s, sl) => s + safeNumber(sl.total), 0));
    const prevRevenue = safeNumber(prevOrders.reduce((s, o) => s + safeNumber(o.total), 0) + prevSales.reduce((s, sl) => s + safeNumber(sl.total), 0));
    const revDelta    = prevRevenue > 0 ? safeNumber(((revenue - prevRevenue) / prevRevenue) * 100) : 0;

    const tickets      = orders.length + sales.length;
    const prevTickets  = prevOrders.length + prevSales.length;
    const tickDelta    = prevTickets > 0 ? safeNumber(((tickets - prevTickets) / prevTickets) * 100) : 0;

    const phones      = new Set([...orders.map(o => o.customer?.phone).filter(Boolean), ...sales.map(s => s.customerPhone).filter(Boolean)]);
    const prevPhones  = new Set([...prevOrders.map(o => o.customer?.phone).filter(Boolean), ...prevSales.map(s => s.customerPhone).filter(Boolean)]);
    const cliDelta    = prevPhones.size > 0 ? safeNumber(((phones.size - prevPhones.size) / prevPhones.size) * 100) : 0;

    const costMap: Record<string, number> = {};
    data.products.forEach(p => { if (p.costPrice) costMap[p.id] = p.costPrice; });
    const totalCost   = safeNumber([...orders.flatMap(o => o.items), ...sales.flatMap(s => s.items ?? [])].reduce((s, i) => s + safeNumber(costMap[i.id as string]) * safeNumber(i.quantity), 0));
    const utilidad    = revenue - totalCost;
    const margen      = revenue > 0 ? safeNumber((utilidad / revenue) * 100) : 0;
    const prevCost    = safeNumber([...prevOrders.flatMap(o => o.items), ...prevSales.flatMap(s => s.items ?? [])].reduce((s, i) => s + safeNumber(costMap[i.id as string]) * safeNumber(i.quantity), 0));
    const prevUtil    = prevRevenue - prevCost;
    const utilDelta   = prevUtil !== 0 ? safeNumber(((utilidad - prevUtil) / Math.abs(prevUtil)) * 100) : 0;

    // 7-day sparklines (last 7 calendar days)
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      return d.toISOString().slice(0, 10);
    });
    const revSpark = last7.map(k =>
      data.orders.filter(o => o.status !== "cancelado" && o.createdAt.slice(0, 10) === k).reduce((s, o) => s + o.total, 0) +
      data.sales.filter(s => s.createdAt.slice(0, 10) === k).reduce((s, sl) => s + sl.total, 0)
    );
    const tickSpark = last7.map(k =>
      data.orders.filter(o => o.createdAt.slice(0, 10) === k).length +
      data.sales.filter(s => s.createdAt.slice(0, 10) === k).length
    );
    const clientSpark = last7.map(k => new Set([
      ...data.orders.filter(o => o.createdAt.slice(0, 10) === k).map(o => o.customer?.phone).filter(Boolean),
      ...data.sales.filter(s => s.createdAt.slice(0, 10) === k).map(s => s.customerPhone).filter(Boolean),
    ]).size);
    const utilSpark = last7.map(k => {
      const dayOrders = data.orders.filter(o => o.status !== "cancelado" && o.createdAt.slice(0, 10) === k);
      const daySales  = data.sales.filter(s => s.createdAt.slice(0, 10) === k);
      const dayRev    = dayOrders.reduce((s, o) => s + o.total, 0) + daySales.reduce((s, sl) => s + sl.total, 0);
      const dayCost   = [...dayOrders.flatMap(o => o.items), ...daySales.flatMap(s => s.items ?? [])].reduce((s, it) => s + (costMap[it.id as string] ?? 0) * it.quantity, 0);
      return dayRev - dayCost;
    });

    return { revenue, revDelta, tickets, tickDelta, clients: phones.size, cliDelta, utilidad, margen, utilDelta, revSpark, tickSpark, clientSpark, utilSpark };
  }, [data, period]);

  // ── Revenue bar chart ─────────────────────────────────────────────────────
  const revenueChart = useMemo(() => {
    if (!data) return [];
    const days = Math.min(PERIOD_DAYS[period], 30);
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (days - 1 - i));
      const key   = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
      const val   = data.orders.filter(o => o.status !== "cancelado" && o.createdAt.slice(0, 10) === key).reduce((s, o) => s + o.total, 0)
                  + data.sales.filter(s  => s.createdAt.slice(0, 10) === key).reduce((s, sl) => s + sl.total, 0);
      return { label, value: val };
    });
  }, [data, period]);

  // ── Module health ─────────────────────────────────────────────────────────
  const moduleHealth: ModuleHealth[] = useMemo(() => {
    if (!data) return [];
    const { products, orders, sales, customers, payables, reviews } = data;

    const stockCrit    = products.filter(p => p.stock !== undefined && p.stockMin !== undefined && p.stock <= p.stockMin);
    const agotados     = products.filter(p => p.stock === 0);
    const pending      = orders.filter(o => o.status === "pendiente");
    const delivered    = orders.filter(o => o.status === "entregado");
    const delivRate    = orders.length > 0 ? (delivered.length / orders.length) * 100 : 100;
    const overduePay   = payables.filter(p => p.status !== "pagado" && new Date(p.dueDate) < new Date());
    const totalDebt    = payables.filter(p => p.status !== "pagado").reduce((s, p) => s + (p.amount - p.paidAmount), 0);
    const avgRating    = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
    const newCustomers = customers.filter(c => inPeriod(c.createdAt ?? "", period)).length;
    const perOrders    = orders.filter(o => o.status !== "cancelado" && inPeriod(o.createdAt, period));
    const perSales     = sales.filter(s => inPeriod(s.createdAt, period));
    const perRevenue   = perOrders.reduce((s, o) => s + o.total, 0) + perSales.reduce((s, sl) => s + sl.total, 0);
    const itemsSold    = [...perOrders.flatMap(o => o.items), ...perSales.flatMap(s => s.items ?? [])].reduce((s, i) => s + i.quantity, 0);

    return [
      { module: "Inventario", status: stockCrit.length > 5 ? "critical" : stockCrit.length > 0 ? "warning" : "ok", metric: "Stock crítico", value: stockCrit.length, target: 0, detail: `${agotados.length} agotados / ${products.length} total`, trend: -stockCrit.length },
      { module: "Pedidos",    status: pending.length > 10 ? "critical" : pending.length > 3 ? "warning" : "ok",     metric: "Pendientes",     value: pending.length,    target: 0, detail: `Tasa entrega: ${delivRate.toFixed(0)}%`, trend: delivRate - 90 },
      { module: "Caja",       status: perRevenue === 0 ? "warning" : "ok",   metric: "Ingresos período", value: perRevenue, target: 1000, detail: `${perOrders.length + perSales.length} transacciones`, trend: 0, isCurrency: true },
      { module: "Clientes",   status: newCustomers === 0 ? "warning" : "ok", metric: "Nuevos clientes",  value: newCustomers, target: 5, detail: `Total registrados: ${customers.length}`, trend: newCustomers > 0 ? 5 : 0 },
      { module: "Cuentas",    status: overduePay.length > 2 ? "critical" : overduePay.length > 0 ? "warning" : "ok", metric: "Facturas vencidas", value: overduePay.length, target: 0, detail: `Deuda total: S/${totalDebt.toFixed(0)}`, trend: -overduePay.length },
      { module: "Calidad",    status: reviews.length === 0 ? "warning" : avgRating < 3 ? "critical" : avgRating < 4 ? "warning" : "ok", metric: "Rating promedio", value: avgRating, target: 4.5, detail: `${reviews.length} reseñas`, trend: +(avgRating - 4).toFixed(1), isDecimal: true },
      { module: "Ventas",     status: itemsSold === 0 ? "warning" : "ok", metric: "Ítems vendidos",  value: itemsSold, target: 50, detail: `Ingresos: S/${perRevenue.toFixed(0)}`, trend: itemsSold > 0 ? 5 : -5 },
    ];
  }, [data, period]);

  // ── Recommendations ───────────────────────────────────────────────────────
  const recommendations = useMemo(() => {
    if (!data) return [];
    const list: { text: string; severity: "high" | "medium" | "low" }[] = [];
    const { alerts } = data;
    if (alerts.overduePayables > 0) list.push({ text: `Revisar ${alerts.overduePayables} factura${alerts.overduePayables > 1 ? "s" : ""} vencida${alerts.overduePayables > 1 ? "s" : ""} de proveedores`, severity: "high" });
    if (alerts.lowStock       > 0) list.push({ text: `Reabastecer ${alerts.lowStock} producto${alerts.lowStock > 1 ? "s" : ""} con stock crítico`, severity: "medium" });
    if (alerts.pendingOrders  > 5) list.push({ text: `Procesar ${alerts.pendingOrders} pedidos pendientes acumulados`, severity: "medium" });
    if (list.length === 0)         list.push({ text: "Todo al día — sin alertas activas en este momento", severity: "low" });
    return list;
  }, [data]);

  const criticalCount = moduleHealth.filter(h => h.status === "critical").length;
  const warningCount  = moduleHealth.filter(h => h.status === "warning").length;
  const maxChart = Math.max(...revenueChart.map(r => r.value), 1);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-2 sm:gap-4">
      <RefreshCw className="h-8 w-8 text-primary animate-spin" />
      <p className="text-sm text-muted font-medium">Cargando datos ejecutivos...</p>
    </div>
  );
  if (error) return (
    <div className="flex flex-col items-center justify-center py-24 gap-2 sm:gap-4">
      <AlertTriangle className="h-8 w-8 text-[var(--data-error-500)]" />
      <p className="text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)] font-medium">Error cargando datos</p>
      <button onClick={load} className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors">
        Reintentar
      </button>
    </div>
  );

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
            <Gauge className="h-6 w-6 text-primary" /> Dashboard Ejecutivo
          </SectionTitle>
          <p className="text-xs text-[var(--text-secondary)] dark:text-muted mt-0.5">
            Visión integral · {lastUpdated ? `Actualizado ${lastUpdated.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <AdminTooltip content="Recargar todos los KPIs del dashboard">
            <button onClick={load} aria-label="Actualizar datos" className="p-2 rounded-lg bg-[var(--surface-sunken)] dark:bg-surface hover:bg-[var(--rule-soft)] dark:hover:bg-accent transition-colors">
              <RefreshCw className="h-4 w-4 text-[var(--text-secondary)]" />
            </button>
          </AdminTooltip>
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", period === p ? "bg-primary text-white" : "bg-[var(--surface-sunken)] dark:bg-surface text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--rule-soft)] dark:hover:bg-accent")}>
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* ── System health banner ── */}
      {(criticalCount > 0 || warningCount > 0) && (
        <div className={cn("rounded-xl p-3 flex items-center gap-3 text-sm font-semibold border", criticalCount > 0 ? "bg-[var(--data-error-50)] dark:bg-red-950/20 text-[var(--data-error-500)] dark:text-[var(--data-error-500)] border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/30" : "bg-[var(--data-warning-50)] dark:bg-amber-950/20 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/30")}>
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>
            {criticalCount > 0 && `${criticalCount} módulo${criticalCount > 1 ? "s" : ""} crítico${criticalCount > 1 ? "s" : ""}`}
            {criticalCount > 0 && warningCount > 0 && " · "}
            {warningCount  > 0 && `${warningCount} advertencia${warningCount > 1 ? "s" : ""}`}
          </span>
        </div>
      )}
      {criticalCount === 0 && warningCount === 0 && (
        <div className="rounded-xl p-3 flex flex-wrap items-center gap-3 text-sm font-semibold bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30">
          <CheckCircle className="h-5 w-5 shrink-0" />
          Sistema operando normalmente — todos los módulos en verde
        </div>
      )}

      {/* ── KPI cards ── */}
      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Ingresos",      value: fmtShort(kpis.revenue),  delta: kpis.revDelta,  icon: DollarSign,  color: "text-[var(--data-success-500)]", bgColor: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",  spark: kpis.revSpark,    sparkColor: "var(--accent)" },
            { label: "Transacciones", value: String(kpis.tickets),    delta: kpis.tickDelta, icon: ShoppingCart,color: "text-[var(--data-success-500)]",    bgColor: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",        spark: kpis.tickSpark,   sparkColor: "#3b82f6" },
            { label: "Clientes",      value: String(kpis.clients),    delta: kpis.cliDelta,  icon: Users,       color: "text-[var(--text-secondary)]", bgColor: "bg-[var(--surface-sunken)]",    spark: kpis.clientSpark, sparkColor: "#8b5cf6" },
            { label: "Utilidad",      value: fmtShort(kpis.utilidad), delta: kpis.utilDelta, icon: TrendingUp,  color: "text-[var(--data-warning-500)]",  bgColor: "bg-amber-50 dark:bg-amber-900/20",      spark: kpis.utilSpark,   sparkColor: "#f59e0b" },
          ].map(kpi => (
            <div key={kpi.label} className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-4">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0", kpi.bgColor)}>
                  <kpi.icon className={cn("h-4.5 w-4.5", kpi.color)} />
                </div>
                <span className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted leading-tight">{kpi.label}</span>
              </div>
              <p className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-foreground leading-none">{kpi.value}</p>
              <div className="flex items-center justify-between mt-2">
                <div className={cn("flex items-center gap-1 text-xs font-bold", kpi.delta >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>
                  {kpi.delta >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                  {Math.abs(kpi.delta).toFixed(1)}%
                </div>
                <MiniSparkline data={kpi.spark} color={kpi.sparkColor} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Revenue bar chart ── */}
      <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-3 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <CardTitle className="font-bold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" /> Ingresos — {PERIOD_LABELS[period]}
          </CardTitle>
          <button
            onClick={() => exportToCSV(revenueChart.map(r => ({ fecha: r.label, ingreso: r.value })), `ingresos-${period}`)}
            className="text-xs text-primary font-semibold flex items-center gap-1 hover:underline"
          >
            <Download className="h-3 w-3" /> CSV
          </button>
        </div>
        {revenueChart.every(r => r.value === 0) ? (
          <p className="text-center text-sm text-[var(--text-tertiary)] dark:text-muted py-8">Sin datos de ingresos para este período</p>
        ) : (
          <div className="flex flex-wrap items-end gap-0.5 h-28 overflow-hidden">
            {revenueChart.map((r, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group min-w-0" title={`${r.label}: ${fmt(r.value)}`}>
                <div className="w-full flex flex-col justify-end rounded-t overflow-hidden" style={{ height: 96 }}>
                  <div
                    className={cn("w-full rounded-t transition-all duration-[var(--dur-base)] group-hover:opacity-80", r.value > 0 ? "bg-primary" : "bg-[var(--surface-sunken)] dark:bg-surface")}
                    style={{ height: `${(r.value / maxChart) * 96}px`, minHeight: 2 }}
                  />
                </div>
                {revenueChart.length <= 14 && (
                  <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted truncate w-full text-center">
                    {r.label.split(" ")[0]}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Module health grid ── */}
      <div>
        <CardTitle className="font-bold text-[var(--text-primary)] dark:text-foreground mb-3 flex flex-wrap items-center gap-2">
          <Eye className="h-4 w-4 text-primary" /> Salud por módulo
        </CardTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 items-start">
          {moduleHealth.map(h => {
            const pct = h.target > 0 ? Math.min((h.value / h.target) * 100, 100) : (h.value === 0 ? 100 : 0);
            return (
              <button
                key={h.module}
                onClick={() => setExpanded(expandedModule === h.module ? null : h.module)}
                className={cn(
                  "bg-white dark:bg-card rounded-xl border p-4 text-left transition-all duration-[var(--dur-base)] hover:shadow-[var(--shadow-sm)]",
                  h.status === "critical" ? "border-[var(--data-error-500)] dark:border-[var(--data-error-500)]" : h.status === "warning" ? "border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]" : "border-[var(--rule-base)] dark:border-card-border",
                  expandedModule === h.module && "sm:col-span-2 ring-1 ring-primary/20"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm text-[var(--text-primary)] dark:text-foreground">{h.module}</span>
                  <span className={cn("text-[length:var(--ts-2xs)] font-bold uppercase px-2 py-0.5 rounded-full", h.status === "ok" ? "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]" : h.status === "warning" ? "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/30 dark:text-[var(--data-warning-500)]" : "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/30 dark:text-[var(--data-error-500)]")}>
                    {h.status === "ok" ? "OK" : h.status === "warning" ? "Alerta" : "Crítico"}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] dark:text-muted mb-1.5">{h.metric}</p>
                <div className="flex items-end justify-between">
                  <span className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground leading-none">
                    {h.isCurrency ? fmtShort(h.value) : h.isDecimal ? Number(h.value).toFixed(1) : h.value}
                    {h.isDecimal && <Star className="h-3 w-3 text-[var(--data-warning-500)] fill-[var(--data-warning-500)] inline ml-1 mb-1" />}
                  </span>
                  <span className={cn("text-xs font-bold flex items-center gap-0.5", h.trend >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>
                    {h.trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {h.trend > 0 ? "+" : ""}{Number(h.trend).toFixed(1)}
                  </span>
                </div>
                {expandedModule === h.module && (
                  <div className="mt-3 pt-3 border-t border-[var(--rule-soft)] dark:border-card-border space-y-2">
                    {h.detail && <p className="text-xs text-[var(--text-secondary)] dark:text-muted">{h.detail}</p>}
                    {h.target > 0 && (
                      <>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-[var(--text-tertiary)] dark:text-muted">Meta: {h.target}</span>
                          <span className="font-bold text-[var(--text-secondary)] dark:text-foreground">{pct.toFixed(0)}%</span>
                        </div>
                        <div className="w-full h-2 bg-[var(--surface-sunken)] dark:bg-surface rounded-full overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all", h.status === "ok" ? "bg-[var(--accent-soft)]" : h.status === "warning" ? "bg-[var(--data-warning-500)]" : "bg-[var(--data-error-500)]")} style={{ width: `${pct}%` }} />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Recommendations ── */}
      <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-3 sm:p-5">
        <CardTitle className="font-bold text-[var(--text-primary)] dark:text-foreground mb-3 flex flex-wrap items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[var(--data-warning-500)]" /> Acciones recomendadas
        </CardTitle>
        <div className="space-y-2">
          {recommendations.map((action, i) => (
            <div key={i} className={cn("flex items-center gap-3 px-2 sm:px-4 py-2 sm:py-3 rounded-xl text-sm", action.severity === "high" ? "bg-[var(--data-error-50)] dark:bg-red-950/10 text-[var(--data-error-500)] dark:text-[var(--data-error-500)]" : action.severity === "medium" ? "bg-[var(--data-warning-50)] dark:bg-amber-950/10 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]" : "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)]")}>
              {action.severity === "high" ? <AlertTriangle className="h-4 w-4 shrink-0" /> : action.severity === "medium" ? <AlertTriangle className="h-4 w-4 shrink-0 opacity-70" /> : <CheckCircle className="h-4 w-4 shrink-0" />}
              <span className="font-semibold">{action.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 44; const h = 16;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - 2 - ((v - min) / range) * (h - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const lastVal = data[data.length - 1];
  const prevVal = data[data.length - 2];
  const trend = lastVal >= prevVal ? "↑" : "↓";
  return (
    <div className="group relative">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible opacity-70 group-hover:opacity-100 transition-opacity">
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="absolute bottom-full right-0 mb-1 hidden group-hover:block bg-gray-900 text-white text-[length:var(--ts-2xs)] font-semibold px-2 py-1 rounded-md whitespace-nowrap z-20">
        7 días {trend} hoy: {typeof lastVal === 'number' && lastVal >= 1000 ? `${(lastVal/1000).toFixed(1)}k` : lastVal}
      </div>
    </div>
  );
}
