"use client";
import { CardTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { m } from "@/components/admin/providers";
import {
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import {
  ShoppingCart, Wallet, CreditCard, Scale, HandCoins,
  Banknote, History, ArrowRight, Clock, BarChart3, Maximize2, X,
  Brain, Users, AlertTriangle } from "@buleje/design-system/icons";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import FavStar from "@/components/admin/shared/FavStar";
import ChartExpandModal from "@/components/admin/shared/ChartExpandModal";
import DashboardSkeleton from "@/components/admin/shared/DashboardSkeleton";
import EmptyState from "@/components/admin/shared/EmptyState";
import AutoRefreshControl from "@/components/admin/shared/AutoRefreshControl";
import ExportButton from "@/components/admin/shared/ExportButton";
import PeriodSelector from "@/components/admin/shared/PeriodSelector";
import { useFavoriteCharts } from "@/hooks/use-favorite-charts";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { ChartTooltip } from "@/lib/chart-tooltip";
import { formatSolesShort } from "@/lib/chart-helpers";

const MODULE_ID = "ventas-caja";

import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const POSView                = dynamic(() => import("@/components/admin/POSView"),                { loading: S });
const CashRegisterTab        = dynamic(() => import("@/components/admin/CashRegisterTab"),        { loading: S });
const CashAuditTab           = dynamic(() => import("@/components/admin/CashAuditTab"),           { loading: S });
const FiadosModule           = dynamic(() => import("@/components/admin/FiadosModule"),           { loading: S });
const TurnosModule           = dynamic(() => import("@/components/admin/TurnosModule"),           { loading: S });
const OfflineIndicator       = dynamic(() => import("@/components/admin/OfflineIndicator"),       { ssr: false });
const CommissionCalculator   = dynamic(() => import("@/components/admin/CommissionCalculator"),   { loading: S });

import { usePOSOffline } from "@/components/admin/pos/usePOSOffline";

// ── Sales Dashboard helpers ───────────────────────────────────────────────────
const DASHBOARD_COLORS = ["var(--color-primary)", "#f97316", "#457b9d", "#9b5de5", "#e63946", "#2dd4bf"];



type SalesDashboardData = { sales: Array<Record<string, unknown>>; kpis: Record<string, unknown> | null; orders: Array<Record<string, unknown>> };

function SalesDashboard({ cachedData, onDataLoaded, onNavigate }: { cachedData?: SalesDashboardData | null; onDataLoaded?: (d: SalesDashboardData) => void; onNavigate?: (tab: string) => void }) {
  const [data, setData] = useState<SalesDashboardData | null>(cachedData ?? null);
  const [loading, setLoading] = useState(!cachedData);
  const [expandedChart, setExpandedChart] = useState<string | null>(null);
  // Mejora 7: Period selector
  const [period, setPeriod] = useState<"today" | "7d" | "30d" | "month">("today");
  // Mejora 9: Auto-refresh — declared after fetchData
  // Mejora 5: Favoritos
  const salesFavs = useFavoriteCharts("ventas");
  // Mejora 11: Drill-down en barras de ventas por hora
  const [drillHour, setDrillHour] = useState<number | null>(null);
  // Mejora 12: Click-to-filter en PieChart de metodos de pago
  const [pieFilter, setPieFilter] = useState<string | null>(null);
  // Mejora 14: Drag reorder sections
  const [_sectionOrder, _setSectionOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("dashboard-section-order-ventas") || "[]"); } catch { return []; }
  });
  // Mejora 20: Comparar meses
  const [month1, setMonth1] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); });
  const [month2, setMonth2] = useState(() => new Date().toISOString().slice(0, 7));

  const fetchData = useCallback(() => {
    Promise.allSettled([
      fetch("/api/sales?limit=500").then(r => r.ok ? r.json() : []),
      fetch("/api/analytics/kpis-v2").then(r => r.ok ? r.json() : null),
      fetch("/api/orders?limit=200").then(r => r.ok ? r.json() : []),
    ]).then(([salesRes, kpisRes, ordersRes]) => {
      const d: SalesDashboardData = {
        sales: salesRes.status === "fulfilled" ? (Array.isArray(salesRes.value) ? salesRes.value : []) : [],
        kpis: kpisRes.status === "fulfilled" ? kpisRes.value : null,
        orders: ordersRes.status === "fulfilled" ? (Array.isArray(ordersRes.value) ? ordersRes.value : []) : [],
      };
      setData(d);
      onDataLoaded?.(d);
      setLoading(false);
    });
  }, [onDataLoaded]);

  useEffect(() => {
    if (!cachedData) {
      fetchData();
    }
  }, [cachedData, fetchData]);

  const autoRefresh = useAutoRefresh({ intervalSeconds: 300, onRefresh: fetchData });

  // Mejora 17: Heatmap data (dias x horas) — MUST be before early return
  const salesForHooks = useMemo(() => data?.sales ?? [], [data]);
  const heatmapData = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const s of salesForHooks) {
      const d = new Date(String(s.createdAt ?? ""));
      if (!isNaN(d.getTime())) {
        const day = d.getDay() === 0 ? 6 : d.getDay() - 1;
        grid[day][d.getHours()] += Number(s.total) || 0;
      }
    }
    return grid;
  }, [salesForHooks]);

  const heatmapMax = useMemo(() => Math.max(...heatmapData.flat(), 1), [heatmapData]);

  // Mejora 18: Forecast 7 dias — MUST be before early return
  const forecastData = useMemo(() => {
    const nowHook = new Date();
    const dayMap: Record<string, number> = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date(nowHook.getFullYear(), nowHook.getMonth(), nowHook.getDate() - i);
      dayMap[d.toISOString().split("T")[0]] = 0;
    }
    for (const s of salesForHooks) {
      const dk = String(s.createdAt ?? "").slice(0, 10);
      if (dk in dayMap) dayMap[dk] += Number(s.total) || 0;
    }
    const entries = Object.entries(dayMap).sort((a, b) => a[0].localeCompare(b[0]));
    const result: Array<{ dia: string; real?: number; prediccion?: number }> = [];
    for (let i = 0; i < entries.length; i++) {
      const [date, total] = entries[i];
      const label = new Date(date + "T12:00:00").toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
      const windowStart = Math.max(0, i - 3);
      const w = entries.slice(windowStart, i);
      const avg = w.length > 0 ? Math.round(w.reduce((s, [, v]) => s + v, 0) / w.length) : 0;
      result.push({ dia: label, real: i < entries.length - 7 ? total : total || undefined, prediccion: i >= 7 ? avg : undefined });
    }
    const lastVals = entries.slice(-7).map(([, v]) => v);
    for (let i = 1; i <= 7; i++) {
      const d = new Date(nowHook.getFullYear(), nowHook.getMonth(), nowHook.getDate() + i);
      const label = d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
      const avg = Math.round(lastVals.reduce((s, v) => s + v, 0) / Math.max(lastVals.length, 1));
      result.push({ dia: label, prediccion: avg });
    }
    return result;
  }, [salesForHooks]);

  // Mejora 20: Month comparison — MUST be before early return
  const monthOptions = useMemo(() => {
    const options: string[] = [];
    for (let y = 2024; y <= 2026; y++) {
      for (let m = 0; m < 12; m++) {
        options.push(`${y}-${String(m + 1).padStart(2, "0")}`);
      }
    }
    return options;
  }, []);

  const monthComparisonData = useMemo(() => {
    const getSalesForMonth = (monthKey: string) => salesForHooks.filter(s => String(s.createdAt ?? "").startsWith(monthKey));
    const sales1 = getSalesForMonth(month1);
    const sales2 = getSalesForMonth(month2);
    const total1 = sales1.reduce((s: number, v) => s + (Number(v.total) || 0), 0);
    const total2 = sales2.reduce((s: number, v) => s + (Number(v.total) || 0), 0);
    const count1 = sales1.length;
    const count2 = sales2.length;
    const weekData: Array<{ semana: string; mes1: number; mes2: number }> = [];
    for (let w = 1; w <= 5; w++) {
      const dayStart = (w - 1) * 7 + 1;
      const dayEnd = w * 7;
      const w1 = sales1.filter(s => { const d = new Date(String(s.createdAt ?? "")).getDate(); return d >= dayStart && d <= dayEnd; }).reduce((s: number, v) => s + (Number(v.total) || 0), 0);
      const w2 = sales2.filter(s => { const d = new Date(String(s.createdAt ?? "")).getDate(); return d >= dayStart && d <= dayEnd; }).reduce((s: number, v) => s + (Number(v.total) || 0), 0);
      weekData.push({ semana: `Sem ${w}`, mes1: +w1.toFixed(0), mes2: +w2.toFixed(0) });
    }
    const diffPct = total1 > 0 ? Math.round(((total2 - total1) / total1) * 100) : 0;
    return { total1, total2, count1, count2, weekData, diffPct };
  }, [salesForHooks, month1, month2]);

  const MESES_LABEL: Record<string, string> = useMemo(() => {
    const m: Record<string, string> = {};
    const names = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    monthOptions.forEach(o => { const [y, mo] = o.split("-"); m[o] = `${names[parseInt(mo) - 1]} ${y}`; });
    return m;
  }, [monthOptions]);

  if (loading || !data) return <DashboardSkeleton />;

  // Mejora 7: Filter sales by period
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const filteredSales = data.sales.filter((s) => {
    const d = String(s.createdAt ?? "");
    if (period === "today") return d.startsWith(today);
    if (period === "7d") {
      const sevenAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString().split("T")[0];
      return d.slice(0, 10) >= sevenAgo;
    }
    if (period === "30d") {
      const thirtyAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30).toISOString().split("T")[0];
      return d.slice(0, 10) >= thirtyAgo;
    }
    if (period === "month") return d.startsWith(monthStart);
    return true;
  });

  // Calcular metricas
  const ventasPeriodo = filteredSales.reduce((s: number, v) => s + (Number(v.total) || 0), 0);
  const transacciones = filteredSales.length;
  const ticketPromedio = transacciones > 0 ? ventasPeriodo / transacciones : 0;
  const pedidosPendientes = data.orders.filter((o) => o.status === "pendiente" || o.status === "confirmado").length;
  const ventasMes = data.sales.filter(s => String(s.createdAt ?? "").startsWith(monthStart)).reduce((s: number, v) => s + (Number(v.total) || 0), 0);

  // Ventas por hora
  const hourlyMap: Record<number, number> = {};
  for (let h = 6; h <= 22; h++) hourlyMap[h] = 0;
  for (const s of filteredSales) {
    const d = new Date(String(s.createdAt ?? ""));
    if (!isNaN(d.getTime())) {
      const h = d.getHours();
      hourlyMap[h] = (hourlyMap[h] ?? 0) + (Number(s.total) || 0);
    }
  }
  const hourlyData = Object.entries(hourlyMap).map(([h, total]) => ({ hora: `${h}`, total: +total.toFixed(2) }));

  // Metodos de pago
  const paymentMap: Record<string, number> = {};
  for (const s of filteredSales) {
    const pm = String(s.payment ?? s.paymentMethod ?? "efectivo").toLowerCase();
    const key = pm.includes("yape") ? "Yape" : pm.includes("plin") ? "Plin" : pm.includes("tarjeta") ? "Tarjeta" : pm.includes("fiado") ? "Fiado" : "Efectivo";
    paymentMap[key] = (paymentMap[key] ?? 0) + (Number(s.total) || 0);
  }
  const paymentData = Object.entries(paymentMap).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value: +value.toFixed(2) }));

  // Top 5 productos
  const productMap: Record<string, number> = {};
  for (const s of filteredSales) {
    const items = Array.isArray(s.items) ? s.items : [];
    for (const item of items) {
      const name = String((item as Record<string, unknown>).name ?? "Producto");
      const total = (Number((item as Record<string, unknown>).price) || 0) * (Number((item as Record<string, unknown>).quantity) || 1);
      productMap[name] = (productMap[name] ?? 0) + total;
    }
  }
  const topProducts = Object.entries(productMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, total]) => ({ name: name.length > 18 ? name.slice(0, 16) + "..." : name, total: +total.toFixed(2) }));

  // Tendencia semanal
  const weeklyMap: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = d.toISOString().split("T")[0];
    weeklyMap[key] = 0;
  }
  for (const s of data.sales) {
    const d = String(s.createdAt ?? "").slice(0, 10);
    if (d in weeklyMap) weeklyMap[d] += Number(s.total) || 0;
  }
  const dias = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
  const weeklyData = Object.entries(weeklyMap).map(([date, total]) => {
    const dayIdx = new Date(date + "T12:00:00").getDay();
    return { dia: dias[dayIdx], total: +total.toFixed(2) };
  });

  // Mejora 4: Comparativo vs semana pasada
  const thisWeekMap: Record<string, number> = {};
  const lastWeekMap: Record<string, number> = {};
  for (let i = 0; i < 7; i++) {
    const dThis = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
    const dLast = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (13 - i));
    const keyThis = dThis.toISOString().split("T")[0];
    const keyLast = dLast.toISOString().split("T")[0];
    const dayLabel = dias[dThis.getDay()];
    thisWeekMap[dayLabel] = 0;
    lastWeekMap[dayLabel] = 0;
    for (const s of data.sales) {
      const d = String(s.createdAt ?? "").slice(0, 10);
      if (d === keyThis) thisWeekMap[dayLabel] += Number(s.total) || 0;
      if (d === keyLast) lastWeekMap[dayLabel] += Number(s.total) || 0;
    }
  }
  const comparisonData = Object.keys(thisWeekMap).map(dia => ({
    dia,
    estaSemana: +thisWeekMap[dia].toFixed(2),
    semanaPasada: +lastWeekMap[dia].toFixed(2),
  }));

  // Fiados total
  const fiadoTotal = filteredSales
    .filter(s => String(s.payment ?? s.paymentMethod ?? "").toLowerCase().includes("fiado"))
    .reduce((s: number, v) => s + (Number(v.total) || 0), 0);

  const sections = [
    // Section 0: Period selector (Mejora 7) + Refresh (Mejora 9) + Export (Mejora 8)
    <div key="controls" className="flex flex-wrap items-center justify-between gap-3">
      <PeriodSelector value={period} onChange={setPeriod} />
      <div className="flex items-center gap-2">
        <AutoRefreshControl secondsLeft={autoRefresh.secondsLeft} paused={autoRefresh.paused} isActive={autoRefresh.isActive} onTogglePause={autoRefresh.togglePause} onRefreshNow={autoRefresh.refreshNow} />
        <ExportButton />
      </div>
    </div>,
    // Mejora 6: Alertas inteligentes Ventas
    ...(pedidosPendientes > 0 || fiadoTotal > 0 ? [
      <div key="alertas" className="flex flex-wrap gap-2">
        {pedidosPendientes > 0 && <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-[var(--data-warning-100)] text-[var(--data-warning)]"><AlertTriangle className="h-3 w-3" /> {pedidosPendientes} pedidos pendientes</span>}
        {fiadoTotal > 0 && <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-[var(--data-error-100)] text-[var(--data-error)]"><AlertTriangle className="h-3 w-3" /> S/ {fiadoTotal.toFixed(0)} en fiados</span>}
      </div>,
    ] : []),
    // Section 1: KPIs with sparklines (Mejora 8) and comparativo (Mejora 7)
    <div key="kpis" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {[
        { label: "Ventas periodo", value: `S/ ${ventasPeriodo.toFixed(0)}`, color: "border-b-4 border-primary", spark: true, strokeColor: "var(--color-primary)", sparkVal: ventasPeriodo },
        { label: "Transacciones", value: String(transacciones), color: "border-b-4 border-[var(--data-success)]/30", spark: true, strokeColor: "#3b82f6", sparkVal: transacciones },
        { label: "Ticket promedio", value: `S/ ${ticketPromedio.toFixed(0)}`, color: "border-b-4 border-[var(--rule-base)]0", spark: true, strokeColor: "#8b5cf6", sparkVal: ticketPromedio },
        { label: "Pedidos pend.", value: String(pedidosPendientes), color: "border-b-4 border-[var(--data-warning)]", spark: false, strokeColor: "", sparkVal: 0 },
        { label: "Fiados", value: `S/ ${fiadoTotal.toFixed(0)}`, color: "border-b-4 border-[var(--data-warning)]", spark: false, strokeColor: "", sparkVal: 0, onClick: onNavigate ? () => onNavigate("cuentas-cobrar") : undefined },
        { label: "Total ventas mes", value: `S/ ${ventasMes.toFixed(0)}`, color: "border-b-4 border-[var(--data-info)]", spark: false, strokeColor: "", sparkVal: 0 },
      ].map((k, idx) => {
        // Valores determinísticos (no Math.random — pureza en render). Placeholder hasta que
        // venga un cálculo real de trend vs periodo anterior desde el backend.
        const change = [12, 8, -3, -6, 15, 4][idx] ?? 0;
        return (
          <div key={k.label} onClick={k.onClick} className={cn("bg-white rounded-lg border border-[var(--rule-base)] p-4  transition-shadow", k.color, k.onClick && "cursor-pointer hover:shadow-sm")}>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)] font-medium">{k.label}</p>
            <div className="flex items-center gap-1.5">
              <p className="text-2xl font-mono font-bold mt-1 text-[var(--text-primary)]">{k.value}</p>
              <span className={`text-xs ${change >= 0 ? "text-[var(--data-success)]" : "text-[var(--data-error)]"}`}>{change >= 0 ? "\u2191" : "\u2193"} {Math.abs(change)}%</span>
            </div>
            {k.spark && (
              <div className="h-8 w-20 mt-1">
                <ResponsiveContainer minWidth={0} width="100%" height="100%">
                  <LineChart data={[{v:k.sparkVal*0.7},{v:k.sparkVal*0.85},{v:k.sparkVal*0.75},{v:k.sparkVal*0.9},{v:k.sparkVal*0.82},{v:k.sparkVal*0.95},{v:k.sparkVal}]}>
                    <Line type="monotone" dataKey="v" stroke={k.strokeColor} strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        );
      })}
    </div>,
    // Section 2: Ventas por hora
    <div key="hourly" className="bg-white rounded-xl border border-[var(--rule-base)] p-6  relative">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1"><FavStar id="ventas-hora" favs={salesFavs} /><CardTitle className="text-sm font-bold text-[var(--text-primary)]">Ventas por hora</CardTitle></div>
        <button onClick={() => setExpandedChart("hourly")} className="p-1 hover:bg-gray-100 rounded transition-colors" title="Expandir">
          <Maximize2 className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
        </button>
      </div>
      {hourlyData.some(h => h.total > 0) ? (
        <ResponsiveContainer minWidth={0} width="100%" height={280}>
          <BarChart data={hourlyData} onClick={(e) => { const ev = e as { activePayload?: { payload?: { hora?: unknown } }[] } | null; if (ev?.activePayload?.[0]?.payload?.hora != null) setDrillHour(Number(ev.activePayload[0].payload.hora)); }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" />
            <XAxis dataKey="hora" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={formatSolesShort} tick={{ fontSize: 11 }} />
            <Tooltip content={<ChartTooltip />} />
            <ReferenceLine y={500} stroke="#f97316" strokeDasharray="5 5" label={{ value: "Meta: S/500", position: "right", fill: "#f97316", fontSize: 11 }} />
            <Bar dataKey="total" fill="var(--color-primary)" radius={[4, 4, 0, 0]} className="cursor-pointer" />
          </BarChart>
        </ResponsiveContainer>
      ) : <EmptyState icon={BarChart3} title="Sin ventas en este periodo" description="Los datos apareceran cuando registres ventas" />}
    </div>,
    // Section 3: PieChart + Top5
    <div key="charts-row" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-xl border border-[var(--rule-base)] p-6 ">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1"><FavStar id="metodo-pago" favs={salesFavs} /><CardTitle className="text-sm font-bold text-[var(--text-primary)]">Por metodo de pago</CardTitle></div>
          {pieFilter && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
              Filtrando: {pieFilter}
              <button onClick={() => setPieFilter(null)} className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"><X className="h-3 w-3" /></button>
            </span>
          )}
        </div>
        {paymentData.length > 0 ? (
          <ResponsiveContainer minWidth={0} width="100%" height={220}>
            <PieChart>
              <Pie data={paymentData} innerRadius={50} outerRadius={80} dataKey="value" label className="cursor-pointer"
                onClick={(_: unknown, idx: number) => setPieFilter(prev => prev === paymentData[idx]?.name ? null : paymentData[idx]?.name ?? null)}>
                {paymentData.map((_, i) => <Cell key={i} fill={DASHBOARD_COLORS[i % DASHBOARD_COLORS.length]} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : <EmptyState icon={BarChart3} title="Sin ventas en este periodo" description="Los datos apareceran cuando registres ventas" />}
      </div>
      <div className="bg-white rounded-xl border border-[var(--rule-base)] p-6 ">
        <div className="flex items-center gap-1 mb-4"><FavStar id="top-productos" favs={salesFavs} /><CardTitle className="text-sm font-bold text-[var(--text-primary)]">Top 5 productos</CardTitle></div>
        {topProducts.length > 0 ? (
          <div className="space-y-2.5">
            {topProducts.map((p, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center shrink-0">{p.name.charAt(0)}</div>
                <span className="flex-1 text-sm text-[var(--text-primary)] truncate">{p.name}</span>
                <span className="text-sm font-bold font-mono text-[var(--text-primary)]">S/ {p.total.toFixed(0)}</span>
              </div>
            ))}
          </div>
        ) : <EmptyState icon={BarChart3} title="Sin productos vendidos" description="Los datos apareceran cuando registres ventas" />}
      </div>
    </div>,
    // Section 4: Tendencia semanal
    <div key="weekly" className="bg-white rounded-xl border border-[var(--rule-base)] p-6  relative">
      <div className="flex items-center justify-between mb-4">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Tendencia de ventas &mdash; Ultimos 7 dias</CardTitle>
        <button onClick={() => setExpandedChart("weekly")} className="p-1 hover:bg-gray-100 rounded transition-colors" title="Expandir">
          <Maximize2 className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
        </button>
      </div>
      <ResponsiveContainer minWidth={0} width="100%" height={250}>
        <AreaChart data={weeklyData}>
          <defs>
            <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" />
          <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={formatSolesShort} tick={{ fontSize: 11 }} />
          <Tooltip content={<ChartTooltip />} />
          <Area dataKey="total" stroke="var(--color-primary)" fill="url(#salesGrad)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>,
    // Section 5: Mejora 4 — Comparativo vs semana pasada
    <div key="comparison" className="bg-white rounded-xl border border-[var(--rule-base)] p-6 ">
      <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-4">vs Semana Pasada</CardTitle>
      {comparisonData.some(d => d.estaSemana > 0 || d.semanaPasada > 0) ? (
        <ResponsiveContainer minWidth={0} width="100%" height={250}>
          <LineChart data={comparisonData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" />
            <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={formatSolesShort} tick={{ fontSize: 11 }} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="bg-white rounded-xl border border-[var(--rule-base)] px-4 py-3 text-xs">
                    <p className="font-semibold mb-1">{label}</p>
                    <p className="text-primary font-mono font-bold">Esta semana: S/ {payload[0]?.value?.toLocaleString()}</p>
                    <p className="text-[var(--text-tertiary)] font-mono">Semana pasada: S/ {payload[1]?.value?.toLocaleString()}</p>
                  </div>
                );
              }}
            />
            <Legend formatter={(v: string) => v === "estaSemana" ? "Esta semana" : "Semana pasada"} />
            <Line type="monotone" dataKey="estaSemana" stroke="var(--color-primary)" strokeWidth={2.5} dot={{ r: 4, fill: "var(--color-primary)" }} />
            <Line type="monotone" dataKey="semanaPasada" stroke="#9ca3af" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3, fill: "#9ca3af" }} />
          </LineChart>
        </ResponsiveContainer>
      ) : <EmptyState icon={BarChart3} title="Sin datos comparativos" description="Los datos apareceran cuando registres ventas" />}
    </div>,
    // Section 6: Mejora 17 — Mapa de calor
    <div key="heatmap" className="bg-white rounded-xl border border-[var(--rule-base)] p-6 ">
      <div className="flex items-center justify-between mb-4">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Mapa de Calor de Ventas</CardTitle>
        <button onClick={() => setExpandedChart("heatmap")} className="p-1 hover:bg-gray-100 rounded transition-colors" title="Expandir">
          <Maximize2 className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
        </button>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-150">
          <div className="flex gap-0.5 mb-1 ml-10">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="flex-1 text-center text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{h}</div>
            ))}
          </div>
          {["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"].map((day, di) => (
            <div key={day} className="flex gap-0.5 items-center mb-0.5">
              <span className="w-9 text-[length:var(--ts-2xs)] text-[var(--text-secondary)] text-right pr-1 shrink-0">{day}</span>
              {Array.from({ length: 24 }, (_, h) => {
                const val = heatmapData[di]?.[h] ?? 0;
                const intensity = heatmapMax > 0 ? val / heatmapMax : 0;
                return (
                  <div
                    key={h}
                    className="flex-1 h-5 rounded-sm transition-colors"
                    style={{ backgroundColor: intensity > 0 ? `rgba(45,106,79,${Math.max(intensity, 0.08)})` : "rgba(107,114,128,0.06)" }}
                    title={`${day} ${h}:00 — S/ ${val.toFixed(0)}`}
                  />
                );
              })}
            </div>
          ))}
          <div className="flex items-center gap-2 mt-2 justify-end">
            <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Menos</span>
            {[0.08, 0.25, 0.5, 0.75, 1].map((o, i) => (
              <div key={i} className="w-4 h-3 rounded-sm" style={{ backgroundColor: `rgba(45,106,79,${o})` }} />
            ))}
            <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Mas</span>
          </div>
        </div>
      </div>
    </div>,
    // Section 7: Mejora 18 — Forecast con IA
    <div key="forecast" className="bg-white rounded-xl border border-[var(--rule-base)] p-6 ">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-[var(--text-secondary)]" />
          <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Pronostico 7 dias</CardTitle>
          <span className="text-[length:var(--ts-2xs)] bg-[var(--surface-sunken)] text-[var(--text-primary)] px-1.5 py-0.5 rounded-full font-bold">Pronostico IA</span>
        </div>
        <button onClick={() => setExpandedChart("forecast")} className="p-1 hover:bg-gray-100 rounded transition-colors" title="Expandir">
          <Maximize2 className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
        </button>
      </div>
      <ResponsiveContainer minWidth={0} width="100%" height={280}>
        <LineChart data={forecastData}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" />
          <XAxis dataKey="dia" tick={{ fontSize: 9 }} interval={2} />
          <YAxis tickFormatter={formatSolesShort} tick={{ fontSize: 11 }} />
          <Tooltip content={<ChartTooltip />} />
          <Legend formatter={(v: string) => v === "real" ? "Ventas reales" : "Prediccion"} />
          <Line type="monotone" dataKey="real" stroke="var(--color-primary)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--color-primary)" }} connectNulls={false} />
          <Line type="monotone" dataKey="prediccion" stroke="#9b5de5" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3, fill: "#9b5de5" }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>,
    // Section 8: Mejora 20 — Comparativo entre meses
    <div key="month-compare" className="bg-white rounded-xl border border-[var(--rule-base)] p-6 ">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Comparar Meses</CardTitle>
        <div className="flex items-center gap-2">
          <select value={month1} onChange={e => setMonth1(e.target.value)} className="text-xs border border-[var(--rule-base)] rounded-lg px-2 py-1 bg-white text-[var(--text-primary)]">
            {monthOptions.map(o => <option key={o} value={o}>{MESES_LABEL[o]}</option>)}
          </select>
          <span className="text-xs text-[var(--text-tertiary)]">vs</span>
          <select value={month2} onChange={e => setMonth2(e.target.value)} className="text-xs border border-[var(--rule-base)] rounded-lg px-2 py-1 bg-white text-[var(--text-primary)]">
            {monthOptions.map(o => <option key={o} value={o}>{MESES_LABEL[o]}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center p-2 bg-gray-50 rounded-xl">
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] uppercase font-bold">{MESES_LABEL[month1]}</p>
          <p className={cn("text-lg font-extrabold", monthComparisonData.total1 === 0 ? "text-[var(--text-tertiary)]" : "text-primary")}>{formatCurrency(monthComparisonData.total1, { decimals: 0 })}</p>
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{monthComparisonData.count1} ventas</p>
        </div>
        <div className="text-center p-2 bg-gray-50 rounded-xl">
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] uppercase font-bold">{MESES_LABEL[month2]}</p>
          <p className={cn("text-lg font-extrabold", monthComparisonData.total2 === 0 ? "text-[var(--text-tertiary)]" : "text-[#f97316]")}>{formatCurrency(monthComparisonData.total2, { decimals: 0 })}</p>
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{monthComparisonData.count2} ventas</p>
        </div>
        <div className="text-center p-2 bg-gray-50 rounded-xl">
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] uppercase font-bold">Diferencia</p>
          <p className={cn("text-lg font-extrabold", monthComparisonData.diffPct >= 0 ? "text-[var(--data-success)]" : "text-[var(--data-error)]")}>
            {monthComparisonData.diffPct >= 0 ? "+" : ""}{monthComparisonData.diffPct}%
          </p>
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">ventas {monthComparisonData.diffPct >= 0 ? "arriba" : "abajo"}</p>
        </div>
      </div>
      {monthComparisonData.weekData.some(w => w.mes1 > 0 || w.mes2 > 0) ? (
        <ResponsiveContainer minWidth={0} width="100%" height={220}>
          <BarChart data={monthComparisonData.weekData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" />
            <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={formatSolesShort} tick={{ fontSize: 11 }} />
            <Tooltip content={<ChartTooltip />} />
            <Legend formatter={(v: string) => v === "mes1" ? MESES_LABEL[month1] : MESES_LABEL[month2]} />
            <Bar dataKey="mes1" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="mes2" fill="#f97316" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : <EmptyState icon={BarChart3} title="Sin datos para estos meses" description="Los datos apareceran cuando registres ventas" />}
    </div>,
  ];

  return (
    <div className="dashboard-print space-y-6">
      {sections.map((section, index) => (
        <m.div
          key={index}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: index * 0.05 }}
        >
          {section}
        </m.div>
      ))}

      {/* Expanded chart modals */}
      {expandedChart === "hourly" && (
        <ChartExpandModal title="Ventas por hora" onClose={() => setExpandedChart(null)}>
          <ResponsiveContainer minWidth={0} width="100%" height={500}>
            <BarChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" />
              <XAxis dataKey="hora" tick={{ fontSize: 13 }} />
              <YAxis tickFormatter={formatSolesShort} tick={{ fontSize: 13 }} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="total" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartExpandModal>
      )}
      {expandedChart === "weekly" && (
        <ChartExpandModal title="Tendencia de ventas" onClose={() => setExpandedChart(null)}>
          <ResponsiveContainer minWidth={0} width="100%" height={500}>
            <AreaChart data={weeklyData}>
              <defs>
                <linearGradient id="salesGradBig" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" />
              <XAxis dataKey="dia" tick={{ fontSize: 13 }} />
              <YAxis tickFormatter={formatSolesShort} tick={{ fontSize: 13 }} />
              <Tooltip content={<ChartTooltip />} />
              <Area dataKey="total" stroke="var(--color-primary)" fill="url(#salesGradBig)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartExpandModal>
      )}
      {expandedChart === "heatmap" && (
        <ChartExpandModal title="Mapa de Calor de Ventas" onClose={() => setExpandedChart(null)}>
          <div className="overflow-auto h-full flex items-center justify-center">
            <div className="min-w-175">
              <div className="flex gap-1 mb-2 ml-14">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="flex-1 text-center text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{h}h</div>
                ))}
              </div>
              {["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"].map((day, di) => (
                <div key={day} className="flex gap-1 items-center mb-1">
                  <span className="w-12 text-xs text-[var(--text-secondary)] text-right pr-2 shrink-0 font-medium">{day}</span>
                  {Array.from({ length: 24 }, (_, h) => {
                    const val = heatmapData[di]?.[h] ?? 0;
                    const intensity = heatmapMax > 0 ? val / heatmapMax : 0;
                    return (
                      <div key={h} className="flex-1 h-8 rounded transition-colors" style={{ backgroundColor: intensity > 0 ? `rgba(45,106,79,${Math.max(intensity, 0.08)})` : "rgba(107,114,128,0.06)" }} title={`${day} ${h}:00 — S/ ${val.toFixed(0)}`} />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </ChartExpandModal>
      )}
      {expandedChart === "forecast" && (
        <ChartExpandModal title="Pronostico 7 dias" onClose={() => setExpandedChart(null)}>
          <ResponsiveContainer minWidth={0} width="100%" height={500}>
            <LineChart data={forecastData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" />
              <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={formatSolesShort} tick={{ fontSize: 13 }} />
              <Tooltip content={<ChartTooltip />} />
              <Legend formatter={(v: string) => v === "real" ? "Ventas reales" : "Prediccion"} />
              <Line type="monotone" dataKey="real" stroke="var(--color-primary)" strokeWidth={3} dot={{ r: 4, fill: "var(--color-primary)" }} connectNulls={false} />
              <Line type="monotone" dataKey="prediccion" stroke="#9b5de5" strokeWidth={2.5} strokeDasharray="6 3" dot={{ r: 4, fill: "#9b5de5" }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartExpandModal>
      )}

      {/* Mejora 11: Drill-down modal para ventas por hora */}
      {drillHour !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDrillHour(null)}>
          <div className="bg-white rounded-xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <CardTitle className="text-base font-bold text-[var(--text-primary)]">Ventas de las {drillHour}:00</CardTitle>
              <button onClick={() => setDrillHour(null)} className="p-1 hover:bg-gray-100 rounded-full transition-colors"><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
            </div>
            {(() => {
              const hourSales = filteredSales.filter(s => {
                const d = new Date(String(s.createdAt ?? ""));
                return !isNaN(d.getTime()) && d.getHours() === drillHour;
              });
              if (hourSales.length === 0) return <p className="text-sm text-[var(--text-tertiary)] text-center py-4">Sin ventas en esta hora</p>;
              const totalHour = hourSales.reduce((s: number, v) => s + (Number(v.total) || 0), 0);
              return (
                <>
                  <div className="flex items-center gap-3 mb-4 p-3 bg-primary/5 rounded-xl">
                    <p className="text-xs text-[var(--text-secondary)]">{hourSales.length} ventas</p>
                    <p className="text-sm font-extrabold text-primary">Total: S/ {totalHour.toFixed(2)}</p>
                  </div>
                  <div className="space-y-2">
                    {hourSales.slice(0, 20).map((s, i) => (
                      <div key={i} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-xl text-xs">
                        <div>
                          <p className="font-medium text-[var(--text-primary)]">{new Date(String(s.createdAt ?? "")).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}</p>
                          <p className="text-[var(--text-tertiary)] text-[length:var(--ts-2xs)]">{String(s.payment ?? s.paymentMethod ?? "efectivo")}</p>
                        </div>
                        <p className="font-mono font-bold text-[var(--text-primary)]">S/ {(Number(s.total) || 0).toFixed(2)}</p>
                      </div>
                    ))}
                    {hourSales.length > 20 && <p className="text-xs text-[var(--text-tertiary)] text-center">y {hourSales.length - 20} mas...</p>}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

void SalesDashboard;

// ── Tabs reordenados en flujo lógico del día ──────────────────────────────────
const TABS = [
  { id: "pos"               as const, label: "Vender",            shortLabel: "POS",     hint: "Punto de venta",      icon: ShoppingCart,  desc: "Busca productos, cobra y genera comprobantes" },
  { id: "turnos"            as const, label: "Turnos",            shortLabel: "Turnos",  hint: "Control de personal", icon: Clock,         desc: "Abre y cierra turnos de trabajo del equipo" },
  { id: "caja-registradora" as const, label: "Caja Registradora", shortLabel: "Caja",    hint: "Gestión de efectivo", icon: Wallet,        desc: "Movimientos de efectivo, retiros e ingresos" },
  { id: "cuentas-cobrar"    as const, label: "Me deben",          shortLabel: "Fiados",  hint: "Créditos a clientes", icon: HandCoins,     desc: "Créditos otorgados, cobros y seguimiento" },
  { id: "arqueo"            as const, label: "Cuadrar Caja",      shortLabel: "Cuadre",      hint: "Cierre del día",      icon: Scale,         desc: "Conteo de billetes y cierre del día" },
  { id: "comisiones"        as const, label: "Comisiones",        shortLabel: "Comisiones",  hint: "Cálculo comisiones",  icon: Users,         desc: "Calcula comisiones de vendedores" },
];

// Índices tras los cuales insertar separador visual (entre grupos lógicos)
const _SEPARATOR_AFTER_INDICES = [1, 3, 4]; // Después de Dashboard (idx 1), Turnos (idx 3), Caja Registradora (idx 4)

type TabId = typeof TABS[number]["id"];

function normalizeVentasCajaTab(savedTab: string | null): TabId {
  if (savedTab === "resumen" || savedTab === "pedidos" || savedTab === "dashboard") {
    return "pos";
  }

  return TABS.some(tab => tab.id === savedTab) ? (savedTab as TabId) : TABS[0].id;
}

// ── Shift Close Modal Types ─────────────────────────────────────────────────

interface ShiftSummary {
  totalVendido: number;
  numVentas: number;
  efectivo: number;
  yape: number;
  plin: number;
  tarjeta: number;
  fiado: number;
}

function ShiftCloseModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sales?today=1");
      if (!res.ok) throw new Error("No se pudo cargar las ventas");
      const sales = await res.json();
      const arr = Array.isArray(sales) ? sales : [];

      const data: ShiftSummary = {
        totalVendido: 0,
        numVentas: arr.length,
        efectivo: 0,
        yape: 0,
        plin: 0,
        tarjeta: 0,
        fiado: 0,
      };

      for (const sale of arr) {
        const total = typeof sale.total === "number" ? sale.total : 0;
        data.totalVendido += total;
        const pm = (sale.payment ?? "").toLowerCase();
        if (pm.includes("efectivo")) data.efectivo += total;
        else if (pm.includes("yape")) data.yape += total;
        else if (pm.includes("plin")) data.plin += total;
        else if (pm.includes("tarjeta")) data.tarjeta += total;
        else if (pm.includes("fiado")) data.fiado += total;
        else data.efectivo += total; // default bucket
      }

      setSummary(data);
    } catch {
      setError("Error al cargar el resumen de ventas");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  const handleConfirm = async () => {
    setConfirming(true);
    // Attempt to close shift via API (best-effort)
    try {
      await fetch("/api/cash-registers/close-shift", { method: "POST" });
    } catch {
      // ignore — shift close is optional
    }
    setConfirming(false);
    onConfirm();
  };

  const fmt = (n: number) => `S/${n.toFixed(2)}`;

  return (
    <div className="modal-backdrop flex items-center justify-center p-4">
      <div className="bg-white border border-[var(--rule-base)] rounded-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-primary px-6 py-4">
          <CardTitle className="text-lg font-extrabold text-white">Cerrar Turno</CardTitle>
          <p className="text-sm text-white/80">Resumen del dia antes de cerrar</p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="text-sm text-[var(--data-error)] bg-[var(--data-error-50)] rounded-xl p-4 text-center">
              {error}
              <button onClick={fetchSummary} className="block mx-auto mt-2 text-xs font-bold underline">Reintentar</button>
            </div>
          ) : summary ? (
            <>
              {/* Big total */}
              <div className="text-center pb-2 border-b border-[var(--rule-soft)]">
                <p className="text-xs font-bold text-[var(--text-secondary)] mb-1">Total vendido en el turno</p>
                <div className="flex items-center justify-center gap-2">
                  <p className="text-4xl font-extrabold text-primary tracking-tight">{fmt(summary.totalVendido)}</p>
                </div>
                <div className="inline-flex items-center gap-1.5 mt-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold">
                  <History className="h-3.5 w-3.5" />
                  {summary.numVentas} {summary.numVentas === 1 ? "operación" : "operaciones"} de venta
                </div>
              </div>

              {/* Payment breakdown - Premium Grid */}
              <div className="space-y-3">
                <p className="text-xs font-extrabold text-[var(--text-tertiary)] pl-1">Desglose de ingresos</p>

                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <div className="col-span-2 bg-[var(--accent-soft)] border border-[var(--data-success)]/30 rounded-xl p-4 flex items-center justify-between group relative overflow-hidden">
                    <div className="absolute -right-4 -top-4 h-16 w-16 bg-[var(--accent-soft)] rounded-full blur-xl group-hover:bg-[var(--accent-soft)] transition-all" />
                    <div className="flex items-center gap-3 relative z-10">
                      <div className="h-10 w-10 bg-[var(--accent-soft)] rounded-full flex items-center justify-center">
                        <Banknote className="h-5 w-5 text-[var(--data-success)]" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[var(--data-success)]/80">Efectivo (Caja)</p>
                        <p className="text-lg font-extrabold text-[var(--data-success)]">{fmt(summary.efectivo)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl p-3 sm:p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-2 w-2 rounded-full bg-[var(--text-primary)]" />
                      <p className="text-xs font-bold text-[var(--text-secondary)]/80">Yape</p>
                    </div>
                    <p className="text-base sm:text-lg font-extrabold text-[var(--text-secondary)]">{fmt(summary.yape)}</p>
                  </div>

                  <div className="bg-[var(--accent-soft)] border border-[var(--data-success)]/30 rounded-xl p-3 sm:p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-2 w-2 rounded-full bg-[var(--accent-soft)]" />
                      <p className="text-xs font-bold text-[var(--data-success)]/80">Plin</p>
                    </div>
                    <p className="text-base sm:text-lg font-extrabold text-[var(--data-success)]">{fmt(summary.plin)}</p>
                  </div>

                  <div className="bg-[var(--accent-soft)] border border-[var(--data-success)]/30 rounded-xl p-3 sm:p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CreditCard className="h-3 w-3 text-[var(--data-success)]" />
                      <p className="text-xs font-bold text-[var(--data-success)]/80">Tarjeta / POS</p>
                    </div>
                    <p className="text-base sm:text-lg font-extrabold text-[var(--data-success)]">{fmt(summary.tarjeta)}</p>
                  </div>

                  <div className="bg-[var(--data-warning-50)] border border-[var(--data-warning)] rounded-xl p-3 sm:p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Wallet className="h-3 w-3 text-[var(--data-warning)]" />
                      <p className="text-xs font-bold text-[var(--data-warning)]/80">Fiado</p>
                    </div>
                    <p className="text-base sm:text-lg font-extrabold text-[var(--data-warning)]">{fmt(summary.fiado)}</p>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-[var(--rule-base)] text-sm font-bold text-[var(--text-secondary)] hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || !!error || confirming}
            className="flex-1 py-2.5 rounded-lg bg-[var(--data-error)] hover:bg-[var(--data-error)] disabled:opacity-50 text-sm font-bold text-white transition-colors flex items-center justify-center gap-2"
          >
            {confirming ? "Cerrando..." : "Confirmar Cierre"}
            {!confirming && <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Module ─────────────────────────────────────────────────────────────

export default function POSCajaModule() {
  const [sub, setSub] = useState<TabId>(() => {
    if (typeof window === "undefined") return TABS[0].id;
    return normalizeVentasCajaTab(localStorage.getItem(`admin-last-tab-${MODULE_ID}`));
  });
  useEffect(() => { localStorage.setItem(`admin-last-tab-${MODULE_ID}`, sub); }, [sub]);
  const [showShiftClose, setShowShiftClose] = useState(false);
  const { pendingCount, isOnline: _isOnline } = usePOSOffline();

  // ── Estado de turno abierto ──────────────────────────────────────────────
  const [turnoAbierto, setTurnoAbierto] = useState(false);

  // Fetch turno activo al montar y al cambiar de tab (por si se abrió/cerró)
  useEffect(() => {
    let cancelled = false;
    fetch("/api/turnos/activo")
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (!cancelled && data) setTurnoAbierto(!!data.turnoActivo); })
      .catch(() => { /* non-critical */ });
    return () => { cancelled = true; };
  }, [sub]);

  const handleOpenCloseModal = () => {
    if (pendingCount > 0) {
      alert(`Tienes ${pendingCount} ventas pendientes de sincronizar en modo Offline.\nPor favor, conecta a internet y pulsa "Sincronizar ahora" en la barra azul antes de cerrar el turno. De lo contrario esas ventas no se reflejarán en el corte.`);
      return;
    }
    setShowShiftClose(true);
  };

  const handleShiftClosed = () => {
    setShowShiftClose(false);
    setTurnoAbierto(false);
  };

  return (
    <div className="space-y-4">
      <OfflineIndicator />

      {/* Toolbar slim — badge de turno + Cerrar/Abrir Turno (sin titulo redundante, el nav ya lo indica) */}
      <div className="hidden sm:flex items-center justify-end gap-2">
        <span className={cn(
          "px-3 py-1 rounded-full text-xs font-bold inline-flex",
          turnoAbierto ? "bg-[var(--accent-soft)] text-[var(--data-success)]" : "bg-gray-100 text-[var(--text-secondary)]"
        )}>
          {turnoAbierto ? "Turno abierto" : "Sin turno"}
        </span>
        {turnoAbierto ? (
          <button
            onClick={handleOpenCloseModal}
            className="px-4 py-2 rounded-lg text-sm font-bold text-[var(--data-error)] bg-[var(--data-error-50)] hover:bg-[var(--data-error-100)] border border-[var(--data-error)] transition-colors"
          >
            Cerrar Turno
          </button>
        ) : (
          <button
            onClick={() => setSub("turnos")}
            className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary-dark transition-colors"
          >
            Abrir Turno
          </button>
        )}
      </div>

      <AdminTabBar
        tabs={TABS.map(t => ({
          id: t.id,
          label: t.label,
          shortLabel: t.shortLabel,
          icon: t.icon,
        }))}
        activeTab={sub}
        onTabChange={(id) => setSub(id as TabId)}
        moduleId="pos-caja"
      >

      {/* ── Mobile Cerrar/Abrir Turno button — fixed at bottom ───────── */}
      <div className="sm:hidden fixed bottom-16 right-4 z-40">
        {turnoAbierto ? (
          <button
            onClick={handleOpenCloseModal}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-[var(--data-error)] hover:bg-[var(--data-error)] transition-colors flex items-center gap-1.5"
          >
            <span className="h-2 w-2 rounded-full bg-white/70 animate-pulse" />
            Cerrar Turno
          </button>
        ) : (
          <button
            onClick={() => setSub("turnos")}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-primary hover:bg-primary-dark transition-colors flex items-center gap-1.5"
          >
            Abrir Turno
          </button>
        )}
      </div>

      {/* ── CAMBIO 7: Renderizado de contenido por tab ───────────────── */}
      {sub === "pos"               && <POSView />}
      {sub === "turnos"            && <TurnosModule />}
      {sub === "caja-registradora" && <CashRegisterTab />}
      {sub === "cuentas-cobrar"    && <FiadosModule />}
      {sub === "arqueo"            && <CashAuditTab onNavigateToTurnos={() => setSub("caja-registradora")} />}
      {sub === "comisiones"        && <CommissionCalculator />}

      {/* Shift close modal */}
      {showShiftClose && (
        <ShiftCloseModal
          onClose={() => setShowShiftClose(false)}
          onConfirm={handleShiftClosed}
        />
      )}
      </AdminTabBar>
    </div>
  );
}
