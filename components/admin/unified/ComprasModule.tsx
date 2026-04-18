"use client";
import { CardTitle } from "@buleje/design-system";
import { useState, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  Lightbulb, ClipboardList, Users, PackageCheck,
  Truck, BarChart3, PackagePlus,
  ShoppingCart, ShoppingBasket, Clock, DollarSign, Building2, AlertTriangle, CreditCard,
  CheckCircle2, Maximize2, X as XIcon, RotateCcw,
} from "@buleje/design-system/icons";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import type { AdminTab } from "@/components/admin/shared/AdminTabBar";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import FavStar from "@/components/admin/shared/FavStar";
import EmptyState from "@/components/admin/shared/EmptyState";
import ChartExpandModal from "@/components/admin/shared/ChartExpandModal";
import DashboardSkeleton from "@/components/admin/shared/DashboardSkeleton";
import KpiCard from "@/components/admin/shared/KPICard";
import AutoRefreshControl from "@/components/admin/shared/AutoRefreshControl";
import ExportButton from "@/components/admin/shared/ExportButton";
import PeriodSelector from "@/components/admin/shared/PeriodSelector";
import { useFavoriteCharts } from "@/hooks/use-favorite-charts";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { cn } from "@/lib/utils";
import { ChartTooltip } from "@/lib/chart-tooltip";
import {
  PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area,
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

// ── Tipos de datos de API ───────────────────────────────────────────────────
interface PurchaseRecord {
  id?: string | number;
  status?: string;
  total?: number;
  grandTotal?: number;
  createdAt?: string;
  date?: string;
  orderDate?: string;
  supplierName?: string;
  supplier?: string | { name?: string };
}

interface SupplierRecord {
  id?: string | number;
  name?: string;
}

interface PayableRecord {
  id?: string | number;
  status?: string;
  amount?: number;
  balance?: number;
  dueDate?: string;
  supplierName?: string;
  supplier?: string | { name?: string };
}

interface ComprasData {
  purchases: PurchaseRecord[];
  suppliers: SupplierRecord[];
  payables: PayableRecord[];
}


import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

export const TabError = () => (
  <div className="text-center py-12">
    <p className="text-sm text-[var(--data-error)]">Error al cargar el módulo</p>
    <button onClick={() => window.location.reload()} className="mt-2 text-xs text-primary hover:underline">Recargar página</button>
  </div>
);

const SugerenciasCompraTab = dynamic(() => import("@/components/admin/compras/SugerenciasCompraTab"), { loading: S });
const PurchaseOrdersTab = dynamic(() => import("@/components/admin/PurchaseOrdersTab"), { loading: S });
const SuppliersTab = dynamic(() => import("@/components/admin/SuppliersTab"), { loading: S });
const ReceivingTab = dynamic(() => import("@/components/admin/ReceivingTab"), { loading: S });
const PuntoCompraView = dynamic(() => import("@/components/admin/pos/PuntoCompraView"), { loading: S });
const SupplierComparator = dynamic(() => import("@/components/admin/SupplierComparator"), { ssr: false, loading: S });
const DevolucionesProveedorModule = dynamic(() => import("@/components/admin/DevolucionesProveedorModule"), { loading: S });

const MODULE_ID = "compras";

const CHART_COLORS = ['var(--color-primary)', '#f97316', '#457b9d', '#e63946', '#9b5de5', '#2dd4bf', '#264653', '#6b705c'];

const TABS: AdminTab[] = [
  { id: "punto-compra", label: "Punto de Compra", icon: ShoppingBasket },
  { id: "sugerencias", label: "Sugerencias", icon: Lightbulb },
  { id: "ordenes-compra", label: "Ordenes", icon: ClipboardList },
  { id: "proveedores", label: "Proveedores", icon: Users },
  { id: "recepcion", label: "Recepcion", icon: PackageCheck },
  { id: "comparador", label: "Comparador", icon: BarChart3 },
  { id: "devoluciones", label: "Devoluciones", icon: RotateCcw },
];

function normalizeComprasTab(savedTab: string | null): string {
  if (savedTab === "dashboard") return TABS[0].id;
  return TABS.some((tab) => tab.id === savedTab) ? savedTab as string : TABS[0].id;
}

// ── Dashboard de Compras ────────────────────────────────────────────────────

function ComprasDashboard() {
  const [data, setData] = useState<ComprasData>({ purchases: [], suppliers: [], payables: [] });
  const [loading, setLoading] = useState(true);
  // Mejora 12: Click-to-filter PieChart proveedores
  const [pieFilter, setPieFilter] = useState<string | null>(null);
  // Mejora 13: Expand chart
  const [expandedChart, setExpandedChart] = useState<string | null>(null);
  // Mejora 1: Period selector
  const [period, setPeriod] = useState<"today" | "7d" | "30d" | "month">("30d");
  // Mejora 3: Auto-refresh
  // Snapshot "now" once per mount — React Compiler rejects Date.now() during render/useMemo
  const [nowTs] = useState(() => Date.now());
  // Mejora 5: Favoritos
  const compFavs = useFavoriteCharts("compras");

  const fetchData = useCallback(() => {
    Promise.allSettled([
      fetch('/api/purchases').then(r => r.ok ? r.json() : []),
      fetch('/api/suppliers').then(r => r.ok ? r.json() : []),
      fetch('/api/payables').then(r => r.ok ? r.json() : []),
    ]).then(([pRes, sRes, paRes]) => {
      setData({
        purchases: pRes.status === 'fulfilled' ? (Array.isArray(pRes.value) ? pRes.value : pRes.value?.purchases || pRes.value?.data || []) : [],
        suppliers: sRes.status === 'fulfilled' ? (Array.isArray(sRes.value) ? sRes.value : sRes.value?.suppliers || sRes.value?.data || []) : [],
        payables: paRes.status === 'fulfilled' ? (Array.isArray(paRes.value) ? paRes.value : paRes.value?.payables || paRes.value?.data || []) : [],
      });
      setLoading(false);
    });
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const autoRefresh = useAutoRefresh({ intervalSeconds: 300, onRefresh: fetchData });

  /* ── KPIs ── */
  const kpis = useMemo(() => {
    const totalOC = data.purchases.length;
    const ocPendientes = data.purchases.filter((p) => p.status !== 'completed' && p.status !== 'recibido' && p.status !== 'cancelado').length;
    const totalGastado = data.purchases.reduce((s, p) => s + (p.total || p.grandTotal || 0), 0);
    const totalProveedores = data.suppliers.length;
    const deudaTotal = data.payables.reduce((s, p) => s + (p.amount || p.balance || 0), 0);
    const now = new Date();
    const deudaVencida = data.payables
      .filter((p) => p.status !== 'pagado' && p.status !== 'paid' && p.dueDate && new Date(p.dueDate) < now)
      .reduce((s, p) => s + (p.amount || p.balance || 0), 0);
    return { totalOC, ocPendientes, totalGastado, totalProveedores, deudaTotal, deudaVencida };
  }, [data]);

  /* ── Compras por mes ── */
  const purchasesByMonth = useMemo(() => {
    const months: Record<string, { total: number; count: number }> = {};
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    // Initialize last 6 months
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months[key] = { total: 0, count: 0 };
    }
    data.purchases.forEach((p) => {
      const d = new Date(p.createdAt || p.date || p.orderDate || nowTs);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (months[key]) {
        months[key].total += (p.total || p.grandTotal || 0);
        months[key].count += 1;
      }
    });
    return Object.entries(months).map(([key, val]) => {
      const [, m] = key.split('-');
      return { mes: monthNames[parseInt(m) - 1], total: Math.round(val.total), count: val.count };
    });
  }, [data.purchases, nowTs]);

  /* ── Gasto por proveedor ── */
  const supplierSpend = useMemo(() => {
    const g: Record<string, { name: string; total: number; count: number }> = {};
    data.purchases.forEach((p) => {
      const supplierField = p.supplier;
      const name = p.supplierName
        || (typeof supplierField === "object" && supplierField !== null ? supplierField.name : undefined)
        || (typeof supplierField === "string" ? supplierField : undefined)
        || 'Sin proveedor';
      const id = name;
      if (!g[id]) g[id] = { name, total: 0, count: 0 };
      g[id].total += (p.total || p.grandTotal || 0);
      g[id].count += 1;
    });
    return Object.values(g).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [data.purchases]);

  const totalSpend = useMemo(() => supplierSpend.reduce((s, v) => s + v.total, 0), [supplierSpend]);

  /* ── Estado de OC por mes (stacked) ── */
  const statusByMonth = useMemo(() => {
    const months: Record<string, Record<string, number>> = {};
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${monthNames[d.getMonth()]}`;
      months[key] = { Pendiente: 0, 'En proceso': 0, Recibido: 0, Cancelado: 0 };
    }
    data.purchases.forEach((p) => {
      const d = new Date(p.createdAt || p.date || p.orderDate || nowTs);
      const key = monthNames[d.getMonth()];
      if (!months[key]) return;
      const st = p.status || 'pendiente';
      if (st === 'pendiente' || st === 'pending' || st === 'draft') months[key].Pendiente += 1;
      else if (st === 'en_proceso' || st === 'processing' || st === 'ordered' || st === 'enviado') months[key]['En proceso'] += 1;
      else if (st === 'completed' || st === 'recibido' || st === 'received') months[key].Recibido += 1;
      else if (st === 'cancelado' || st === 'cancelled' || st === 'canceled') months[key].Cancelado += 1;
      else months[key].Pendiente += 1;
    });
    return Object.entries(months).map(([mes, vals]) => ({ mes, ...vals }));
  }, [data.purchases, nowTs]);

  /* ── Deuda por proveedor ── */
  const debtBySupplier = useMemo(() => {
    const g: Record<string, { name: string; total: number; vencida: number; dueDate: string }> = {};
    const now = new Date();
    data.payables.forEach((p) => {
      const supplierField = p.supplier;
      const name = p.supplierName
        || (typeof supplierField === "object" && supplierField !== null ? supplierField.name : undefined)
        || (typeof supplierField === "string" ? supplierField : undefined)
        || 'Sin nombre';
      if (!g[name]) g[name] = { name, total: 0, vencida: 0, dueDate: '' };
      const amt = p.amount || p.balance || 0;
      g[name].total += amt;
      if (p.dueDate && new Date(p.dueDate) < now && p.status !== 'pagado' && p.status !== 'paid') {
        g[name].vencida += amt;
      }
      if (!g[name].dueDate || (p.dueDate && p.dueDate > g[name].dueDate)) {
        g[name].dueDate = p.dueDate || '';
      }
    });
    return Object.values(g).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [data.payables]);

  /* ── Proximos pagos ── */
  const nextPayments = useMemo(() => {
    const now = new Date();
    return [...data.payables]
      .filter((p) => p.status !== 'pagado' && p.status !== 'paid')
      .sort((a, b) => new Date(a.dueDate || 0).getTime() - new Date(b.dueDate || 0).getTime())
      .slice(0, 5)
      .map((p) => {
        const due = new Date(p.dueDate || nowTs);
        const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const supplierField = p.supplier;
        return {
          name: p.supplierName
            || (typeof supplierField === "object" && supplierField !== null ? supplierField.name : undefined)
            || (typeof supplierField === "string" ? supplierField : undefined)
            || 'Proveedor',
          amount: p.amount || p.balance || 0,
          dueDate: p.dueDate,
          days: diffDays,
          id: p.id,
        };
      });
  }, [data.payables, nowTs]);

  /* ── Tendencia con promedio movil ── */
  const trendData = useMemo(() => {
    return purchasesByMonth.map((m, i, arr) => {
      const windowSize = Math.min(3, i + 1);
      const avg = arr.slice(Math.max(0, i - windowSize + 1), i + 1).reduce((s, v) => s + v.total, 0) / windowSize;
      return { ...m, promedio: Math.round(avg) };
    });
  }, [purchasesByMonth]);

  /* ── Cambio real mes anterior vs mes actual ── */
  const kpiChanges = useMemo(() => {
    if (purchasesByMonth.length < 2) return { gastado: undefined, oc: undefined };
    const current = purchasesByMonth[purchasesByMonth.length - 1];
    const previous = purchasesByMonth[purchasesByMonth.length - 2];
    return {
      gastado: previous.total > 0 ? ((current.total - previous.total) / previous.total) * 100 : undefined,
      oc: previous.count > 0 ? ((current.count - previous.count) / previous.count) * 100 : undefined,
    };
  }, [purchasesByMonth]);

  /* ── Skeleton loading ── */
  if (loading) return <DashboardSkeleton />;

  const kpiCards = [
    { label: "OC totales", value: kpis.totalOC, icon: ShoppingCart, color: "#457b9d", change: kpiChanges.oc != null ? Math.round(kpiChanges.oc * 10) / 10 : undefined },
    { label: "OC pendientes", value: kpis.ocPendientes, icon: Clock, color: "#f97316" },
    { label: "Total gastado", value: `S/ ${kpis.totalGastado.toLocaleString()}`, icon: DollarSign, color: "var(--color-primary)", change: kpiChanges.gastado != null ? Math.round(kpiChanges.gastado * 10) / 10 : undefined },
    { label: "Proveedores", value: kpis.totalProveedores, icon: Building2, color: "#9b5de5" },
    { label: "Deuda total", value: `S/ ${kpis.deudaTotal.toLocaleString()}`, icon: CreditCard, color: "#f97316" },
    { label: "Deuda vencida", value: `S/ ${kpis.deudaVencida.toLocaleString()}`, icon: AlertTriangle, color: "#e63946", alert: kpis.deudaVencida > 0 },
  ];

  return (
    <div className="space-y-6">

      {/* === Controls: Period + Refresh + Export === */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodSelector value={period} onChange={setPeriod} />
        <div className="flex items-center gap-2">
          <AutoRefreshControl secondsLeft={autoRefresh.secondsLeft} paused={autoRefresh.paused} isActive={autoRefresh.isActive} onTogglePause={autoRefresh.togglePause} onRefreshNow={autoRefresh.refreshNow} />
          <ExportButton />
        </div>
      </div>

      {/* === Alertas Compras === */}
      {(kpis.ocPendientes > 0 || kpis.deudaVencida > 0) && (
        <div className="flex flex-wrap gap-2">
          {kpis.ocPendientes > 0 && <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-[var(--data-warning-100)] text-[var(--data-warning)]"><AlertTriangle className="h-3 w-3" /> {kpis.ocPendientes} ordenes pendientes</span>}
          {kpis.deudaVencida > 0 && <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-[var(--data-error-100)] text-[var(--data-error)]"><AlertTriangle className="h-3 w-3" /> S/ {kpis.deudaVencida.toLocaleString()} deuda vencida</span>}
        </div>
      )}

      {/* === KPIs (6 cards) === */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiCards.map((k, i) => (
          <KpiCard key={i} label={k.label} value={k.value} icon={k.icon} color={k.color} change={k.change} alert={k.alert} />
        ))}
      </div>

      {/* === Compras por Mes (AreaChart) === */}
      <div className="bg-white rounded-xl border border-[var(--rule-soft)] p-6 ">
        <div className="flex items-center gap-2 mb-4"><FavStar id="compras-mes" favs={compFavs} /><CardTitle className="text-sm font-bold text-[var(--text-primary)]">Compras por mes (ultimos 6 meses)</CardTitle></div>
        <ResponsiveContainer minWidth={0} width="100%" height={280}>
          <AreaChart data={purchasesByMonth}>
            <defs>
              <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} className="fill-gray-500" />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `S/${v.toLocaleString()}`} className="fill-gray-500" />
            <Tooltip content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const rawVal = payload[0]?.value;
              const val = typeof rawVal === "number" ? rawVal : 0;
              const count = (payload[0]?.payload as { count?: number } | undefined)?.count || 0;
              return (
                <div className="bg-white rounded-xl border border-[var(--rule-soft)] px-4 py-3">
                  <p className="text-xs font-semibold text-[var(--text-primary)]">{String(label ?? "")}</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    S/ {val.toLocaleString()} ({count} OCs)
                  </p>
                </div>
              );
            }} />
            <Area type="monotone" dataKey="total" stroke="var(--color-primary)" strokeWidth={2.5} fill="url(#areaGradient)" name="Total compras" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* === Distribucion por Proveedor (PieChart + tabla) === */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-[var(--rule-soft)] p-6 ">
          <div className="flex items-center justify-between mb-4">
            <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Gasto por proveedor</CardTitle>
            <div className="flex items-center gap-2">
              {pieFilter && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
                  {pieFilter}
                  <button onClick={() => setPieFilter(null)} className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"><XIcon className="h-3 w-3" /></button>
                </span>
              )}
              <button onClick={() => setExpandedChart("proveedor")} className="p-1 hover:bg-gray-100 rounded transition-colors" title="Expandir"><Maximize2 className="h-3.5 w-3.5 text-[var(--text-tertiary)]" /></button>
            </div>
          </div>
          <ResponsiveContainer minWidth={0} width="100%" height={280}>
            <PieChart>
              <Pie data={supplierSpend} innerRadius={55} outerRadius={90} dataKey="total" paddingAngle={2} className="cursor-pointer"
                label={({ name, percent }: { name?: string; percent?: number }) => `${(name || "").substring(0, 10)} ${((percent ?? 0) * 100).toFixed(0)}%`}
                onClick={(_: unknown, idx: number) => setPieFilter(prev => prev === supplierSpend[idx]?.name ? null : supplierSpend[idx]?.name ?? null)}
              >
                {supplierSpend.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-[var(--rule-soft)] p-6 ">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-4">Ranking de proveedores</CardTitle>
          <div className="max-h-70 space-y-3 overflow-y-auto">
            {supplierSpend.length === 0 ? (
              <EmptyState title="Sin datos de proveedores" className="py-8" />
            ) : (
              supplierSpend.map((s, i) => {
                const pct = totalSpend > 0 ? (s.total / totalSpend) * 100 : 0;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs font-mono font-bold w-5 text-[var(--text-tertiary)] shrink-0">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-[var(--text-primary)] truncate">{s.name}</span>
                        <span className="text-xs font-mono font-bold text-[var(--text-primary)] shrink-0 ml-2">S/ {s.total.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        </div>
                        <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] shrink-0 w-10 text-right">{pct.toFixed(0)}%</span>
                        <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] shrink-0">{s.count} OCs</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* === Estado de OC (BarChart stacked) === */}
      <div className="bg-white rounded-xl border border-[var(--rule-soft)] p-6 ">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-4">Estado de ordenes por mes</CardTitle>
        <ResponsiveContainer minWidth={0} width="100%" height={250}>
          <BarChart data={statusByMonth}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} className="fill-gray-500" />
            <YAxis tick={{ fontSize: 11 }} className="fill-gray-500" />
            <Tooltip content={<ChartTooltip />} />
            <Legend iconType="circle" formatter={(value) => <span className="text-xs text-[var(--text-secondary)]">{value}</span>} />
            <Bar dataKey="Pendiente" stackId="a" fill="#f97316" radius={[0, 0, 0, 0]} />
            <Bar dataKey="En proceso" stackId="a" fill="#457b9d" />
            <Bar dataKey="Recibido" stackId="a" fill="var(--color-primary)" />
            <Bar dataKey="Cancelado" stackId="a" fill="#e63946" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* === Deuda por Proveedor (horizontal) + Proximos Pagos === */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-[var(--rule-soft)] p-6 ">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-4">Deuda por proveedor</CardTitle>
          {debtBySupplier.length === 0 ? (
            <EmptyState title="Sin deudas registradas" description="No hay deudas pendientes con proveedores" />
          ) : (
            <ResponsiveContainer minWidth={0} width="100%" height={260}>
              <BarChart data={debtBySupplier} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(0,0,0,0.06)" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `S/${v.toLocaleString()}`} className="fill-gray-500" />
                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} className="fill-gray-600" />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="total" name="Deuda total" radius={[0, 6, 6, 0]} barSize={14}>
                  {debtBySupplier.map((d, i) => (
                    <Cell key={i} fill={d.vencida > 0 ? "#e63946" : d.total > 500 ? "#f97316" : "var(--color-primary)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl border border-[var(--rule-soft)] p-6 ">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-4">Proximos pagos</CardTitle>
          {nextPayments.length === 0 ? (
            <EmptyState title="Sin pagos pendientes" description="No hay pagos próximos registrados" />
          ) : (
            <div className="space-y-3">
              {nextPayments.map((p, i) => {
                const isOverdue = p.days < 0;
                const isUrgent = p.days >= 0 && p.days <= 7;
                const badgeColor = isOverdue
                  ? "bg-[var(--data-error-100)] text-[var(--data-error)]"
                  : isUrgent
                    ? "bg-[var(--data-warning-100)] text-[var(--data-warning)]"
                    : "bg-[var(--accent-soft)] text-[var(--data-success)]";
                const dotColor = isOverdue ? "bg-[var(--data-error)]" : isUrgent ? "bg-[var(--data-warning)]" : "bg-[var(--accent-soft)]";

                return (
                  <div key={p.id || i} className="flex items-center gap-3 p-3 rounded-xl border border-[var(--rule-soft)] bg-gray-50/50">
                    <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", dotColor)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[var(--text-primary)] truncate">{p.name}</p>
                      <p className="text-lg font-mono font-bold text-[var(--text-primary)]">S/ {p.amount.toLocaleString()}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={cn("text-[length:var(--ts-2xs)] font-medium px-2 py-0.5 rounded-full", badgeColor)}>
                        {isOverdue ? `Vencido ${Math.abs(p.days)}d` : p.days === 0 ? "Hoy" : `En ${p.days}d`}
                      </span>
                      <button className="text-[length:var(--ts-2xs)] font-semibold text-primary hover:underline flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Pagado
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* === Tendencia de Gastos vs Promedio Movil (ComposedChart) === */}
      <div className="bg-white rounded-xl border border-[var(--rule-soft)] p-6 ">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-1">Tendencia de gastos</CardTitle>
        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mb-4">Gasto real vs promedio movil 3 meses</p>
        <ResponsiveContainer minWidth={0} width="100%" height={260}>
          <ComposedChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} className="fill-gray-500" />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `S/${v.toLocaleString()}`} className="fill-gray-500" />
            <Tooltip content={<ChartTooltip />} />
            <Legend iconType="circle" formatter={(value) => <span className="text-xs text-[var(--text-secondary)]">{value}</span>} />
            <Bar dataKey="total" fill="var(--color-primary)" radius={[6, 6, 0, 0]} name="Gasto real" barSize={28} fillOpacity={0.85} />
            <Line type="monotone" dataKey="promedio" stroke="#f97316" strokeWidth={2.5} dot={{ r: 4, fill: "#f97316", strokeWidth: 0 }} name="Prom. movil 3m" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Mejora 13: Expand chart modal */}
      {expandedChart && (
        <ChartExpandModal title="Gasto por proveedor" onClose={() => setExpandedChart(null)}>
            <ResponsiveContainer minWidth={0} width="100%" height={500}>
              <PieChart>
                <Pie data={supplierSpend} innerRadius={100} outerRadius={200} dataKey="total" paddingAngle={2} label>
                  {supplierSpend.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
        </ChartExpandModal>
      )}
    </div>
  );
}

void ComprasDashboard;

// ── Componente principal ────────────────────────────────────────────────────

export default function ComprasModule() {
  const [sub, setSub] = useState(() => {
    if (typeof window === "undefined") return TABS[0].id;
    return normalizeComprasTab(localStorage.getItem(`admin-last-tab-${MODULE_ID}`));
  });
  useEffect(() => { localStorage.setItem(`admin-last-tab-${MODULE_ID}`, sub); }, [sub]);

  // Escuchar evento de navegación desde PuntoCompraView (botón "Ver en Órdenes")
  useEffect(() => {
    const handler = (e: Event) => {
      const tabId = (e as CustomEvent).detail;
      if (tabId && TABS.some(t => t.id === tabId)) setSub(tabId);
    };
    window.addEventListener("compras-navigate-tab", handler);
    return () => window.removeEventListener("compras-navigate-tab", handler);
  }, []);



  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Compras"
        description="Pedidos a proveedores, recepción y cuentas por pagar"
        icon={PackagePlus}
        bgTint="bg-amber-50"
        iconColorClass="text-amber-600"
      />



      <AdminTabBar
        tabs={TABS}
        activeTab={sub}
        onTabChange={setSub}
        moduleId="compras"
      >
        {sub === "punto-compra" && <PuntoCompraView />}
        {sub === "sugerencias" && <SugerenciasCompraTab />}
        {sub === "ordenes-compra" && <PurchaseOrdersTab />}
        {sub === "proveedores" && <SuppliersTab />}
        {sub === "recepcion" && <ReceivingTab />}
        {sub === "comparador" && <SupplierComparator />}
        {sub === "devoluciones" && <DevolucionesProveedorModule />}
      </AdminTabBar>
    </div>
  );
}
