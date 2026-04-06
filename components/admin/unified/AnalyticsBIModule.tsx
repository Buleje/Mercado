"use client";
import React, { useState, useEffect, useCallback, lazy, Suspense } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3, Flame, TrendingUp, RefreshCw,
  CreditCard, Users, Trophy, Package,
  LayoutDashboard, DollarSign, ShoppingBasket,
  Target, Clock, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Sale, Customer } from "@/types/erp";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";

// ── Spinner ──────────────────────────────────────────────────────────────────
const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

// ── Existing components (dynamic imports) ────────────────────────────────────
const ABCAnalysisTab = dynamic(() => import("@/components/admin/ABCAnalysisTab"), { loading: S });
const BCGMatrixTab = dynamic(() => import("@/components/admin/BCGMatrixTab"), { loading: S });
const BasketAnalysisTab = dynamic(() => import("@/components/admin/BasketAnalysisTab"), { loading: S });
const PeakHoursTab = dynamic(() => import("@/components/admin/PeakHoursTab"), { loading: S });
const PredictiveAnalyticsTab = dynamic(() => import("@/components/admin/PredictiveAnalyticsTab"), { loading: S });

// ── New Analytics PRO components (React.lazy) ────────────────────────────────
const AnalyticsKPIBarV2 = lazy(() => import("@/components/admin/analytics/AnalyticsKPIBarV2"));
const SalesTrendChart = lazy(() => import("@/components/admin/analytics/SalesTrendChart"));
const VentasHeatmap = lazy(() => import("@/components/admin/analytics/VentasHeatmap"));
const MarginWaterfallChart = lazy(() => import("@/components/admin/analytics/MarginWaterfallChart"));
const FiadoAnalyticsPanel = lazy(() => import("@/components/admin/analytics/FiadoAnalyticsPanel"));
const AIFiadoDashboard = lazy(() => import("@/components/admin/ai-center/AIFiadoDashboard"));
const AnomalyDetector = lazy(() => import("@/components/admin/analytics/AnomalyDetector"));
const RFMSegmentationPanel = lazy(() => import("@/components/admin/analytics/RFMSegmentationPanel"));

// ── Types ────────────────────────────────────────────────────────────────────
export type AnalyticsPeriod = "1d" | "7d" | "30d" | "90d" | "1y";

type SectionId = "resumen" | "ventas" | "productos" | "clientes" | "predicciones";

// ── Constants ────────────────────────────────────────────────────────────────
const PERIODS: { key: AnalyticsPeriod; label: string }[] = [
  { key: "1d",  label: "Hoy" },
  { key: "7d",  label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "90d", label: "90 dias" },
  { key: "1y",  label: "1 ano" },
];

const PERIOD_DISPLAY: Record<AnalyticsPeriod, string> = {
  "1d": "Hoy",
  "7d": "Ultimos 7 dias",
  "30d": "Ultimos 30 dias",
  "90d": "Ultimos 90 dias",
  "1y": "Ultimo ano",
};

const MODULE_ID = "analytics-bi";

const SECTIONS: { id: SectionId; label: string; icon: typeof LayoutDashboard; description: string }[] = [
  { id: "resumen",   label: "Resumen",   icon: LayoutDashboard, description: "Vista general de tu negocio" },
  { id: "ventas",    label: "Ventas",    icon: TrendingUp,      description: "Tendencias, horarios y patrones de venta" },
  { id: "productos", label: "Productos", icon: Package,         description: "Clasificacion ABC, BCG y margenes" },
  { id: "clientes",  label: "Clientes",  icon: Users,           description: "Segmentación RFM (Recencia, Frecuencia, Monetario — clasifica clientes por comportamiento de compra), ranking y fidelidad" },
  { id: "predicciones", label: "Predicciones", icon: Target,          description: "Pronosticos y alertas basados en historial" },
];

// ── AnalyticsCard — wrapper profesional para cada grafico ────────────────────
function AnalyticsCard({ title, subtitle, icon: Icon, children, className }: {
  title: string;
  subtitle?: string;
  icon?: typeof BarChart3;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(
      "bg-white rounded-2xl border border-gray-200 p-6 shadow-sm transition-shadow hover:shadow-md",
      className,
    )}>
      <div className="mb-5">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Icon className="h-4.5 w-4.5 text-primary" />
            </div>
          )}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 leading-tight">{title}</h3>
            {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>
      </div>
      <div className="w-full">{children}</div>
    </div>
  );
}

// ── SectionHeader — encabezado de cada seccion ───────────────────────────────
function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-2">
      <h2 className="text-xl font-bold text-gray-900">{title}</h2>
      <div className="w-12 h-1 bg-primary rounded-full mt-2" />
      <p className="text-sm text-gray-500 mt-2">{description}</p>
    </div>
  );
}

// ── Shared KPI cache — one fetch for all KPI strips ──────────────────────────
let _kpiCache: { data: Record<string, unknown>; ts: number } | null = null;
const KPI_CACHE_TTL = 60_000; // 1 minute

async function fetchKpisV2(): Promise<Record<string, unknown>> {
  if (_kpiCache && Date.now() - _kpiCache.ts < KPI_CACHE_TTL) return _kpiCache.data;
  try {
    const res = await fetch("/api/analytics/kpis-v2", { credentials: "include" });
    if (!res.ok) return _kpiCache?.data ?? {};
    const data = await res.json();
    _kpiCache = { data, ts: Date.now() };
    return data;
  } catch {
    return _kpiCache?.data ?? {};
  }
}

// ── InlineKPIStrip — compact KPI bar embedded in Resumen ─────────────────────
function InlineKPIStrip() {
  const [kpis, setKpis] = useState<{
    ventasHoy: number; ticketPromedio: number; margen: number; clientesHoy: number; fiadoPendiente: number; rotacion: number;
  } | null>(null);

  useEffect(() => {
    (async () => {
      const d = await fetchKpisV2();
      if (!d || Object.keys(d).length === 0) return;
      setKpis({
        ventasHoy: Number(d.ingresosHoy ?? d.ventasHoy ?? d.salesDay ?? 0) || 0,
        ticketPromedio: Number(d.ticketPromedio ?? d.avgTicket ?? 0) || 0,
        margen: Number(d.margenOperativo ?? d.marginPct ?? 0) || 0,
        clientesHoy: Number(d.clientesActivos ?? d.clientesHoy ?? d.customersToday ?? 0) || 0,
        fiadoPendiente: Number(d.fiadoPendiente ?? d.fiadoTotal ?? 0) || 0,
        rotacion: Number(d.rotacionInventario ?? d.inventoryTurnover ?? 0) || 0,
      });
    })();
  }, []);

  if (!kpis) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  const items = [
    { label: "Ventas hoy", value: `S/ ${kpis.ventasHoy.toFixed(0)}`, color: "text-emerald-600" },
    { label: "Ticket prom", value: `S/ ${kpis.ticketPromedio.toFixed(0)}`, color: "text-blue-600" },
    { label: "Margen", value: `${kpis.margen.toFixed(1)}%`, color: kpis.margen >= 20 ? "text-emerald-600" : "text-amber-600" },
    { label: "Clientes hoy", value: String(kpis.clientesHoy), color: "text-purple-600" },
    { label: "Fiado pend.", value: `S/ ${kpis.fiadoPendiente.toFixed(0)}`, color: kpis.fiadoPendiente > 0 ? "text-red-500" : "text-gray-500" },
    { label: "Rotación", value: `${kpis.rotacion.toFixed(1)}x`, color: "text-cyan-600" },
  ];

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm text-center"
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">{item.label}</p>
          <p className={cn("text-lg font-extrabold tabular-nums", item.color)} style={{ fontVariantNumeric: "tabular-nums" }}>{item.value}</p>
        </div>
      ))}
    </div>
  );
}

// ── SectionKPIStrip — KPIs contextuales por sección ──────────────────────────
function SectionKPIStrip({ section }: { section: "ventas" | "productos" | "clientes" | "finanzas" }) {
  const [items, setItems] = useState<{ label: string; value: string; color: string }[] | null>(null);

  useEffect(() => {
    (async () => {
      const d = await fetchKpisV2();
      if (!d || Object.keys(d).length === 0) return;

      if (section === "ventas") {
          setItems([
            { label: "Ventas hoy", value: `S/ ${(Number(d.ingresosHoy ?? d.ventasHoy ?? 0) || 0).toFixed(0)}`, color: "text-emerald-600" },
            { label: "Ticket prom", value: `S/ ${(Number(d.ticketPromedio ?? d.avgTicket ?? 0) || 0).toFixed(0)}`, color: "text-blue-600" },
            { label: "Operaciones", value: String(Number(d.ordersToday ?? d.totalVentas ?? 0) || 0), color: "text-purple-600" },
            { label: "Pico (hora)", value: d.peakHour ? `${d.peakHour}h` : "--", color: "text-amber-600" },
          ]);
        } else if (section === "productos") {
          setItems([
            { label: "SKUs activos", value: String(Number(d.skuCount ?? d.totalProducts ?? 0) || 0), color: "text-emerald-600" },
            { label: "Margen prom", value: `${(Number(d.margenOperativo ?? d.marginPct ?? 0) || 0).toFixed(1)}%`, color: "text-blue-600" },
            { label: "Stock bajo", value: String(Number(d.lowStockCount ?? d.stockBajo ?? 0) || 0), color: "text-red-500" },
            { label: "Rotación", value: `${(Number(d.rotacionInventario ?? d.inventoryTurnover ?? 0) || 0).toFixed(1)}x`, color: "text-cyan-600" },
          ]);
        } else if (section === "clientes") {
          setItems([
            { label: "Total clientes", value: String(Number(d.totalClientes ?? d.totalCustomers ?? 0) || 0), color: "text-emerald-600" },
            { label: "Nuevos (mes)", value: String(Number(d.newCustomersMonth ?? d.clientesNuevos ?? 0) || 0), color: "text-blue-600" },
            { label: "Fiado pend.", value: `S/ ${(Number(d.fiadoPendiente ?? d.fiadoTotal ?? 0) || 0).toFixed(0)}`, color: "text-red-500" },
            { label: "Retención", value: `${(Number(d.retentionRate ?? d.retencion ?? 0) || 0).toFixed(0)}%`, color: "text-purple-600" },
          ]);
        }
      })();
  }, [section]);

  if (!items) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">{item.label}</p>
          <p className={cn("text-base font-extrabold tabular-nums", item.color)} style={{ fontVariantNumeric: "tabular-nums" }}>{item.value}</p>
        </div>
      ))}
    </div>
  );
}

// ── TabbedCard — card con tabs internas para unificar componentes ─────────────
function TabbedCard({ title, subtitle, icon, tabs, className }: {
  title: string;
  subtitle?: string;
  icon?: typeof BarChart3;
  tabs: { id: string; label: string; content: React.ReactNode }[];
  className?: string;
}) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? "");
  return (
    <div className={cn(
      "bg-white rounded-2xl border border-gray-200 p-6 shadow-sm transition-shadow hover:shadow-md",
      className,
    )}>
      <div className="mb-4">
        <div className="flex items-center gap-2.5 mb-3">
          {icon && (
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              {React.createElement(icon, { className: "h-4.5 w-4.5 text-primary" })}
            </div>
          )}
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 leading-tight">{title}</h3>
            {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        <div className="flex gap-1 border-b border-gray-200">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                "px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors",
                activeTab === t.id
                  ? "bg-primary/10 text-primary border-b-2 border-primary"
                  : "text-gray-500 hover:bg-gray-50"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="w-full">
        {tabs.find(t => t.id === activeTab)?.content}
      </div>
    </div>
  );
}

// ── Top 10 Clientes ─────────────────────────────────────────────────────────
function Top10Clientes({ refreshKey }: { refreshKey: number }) {
  const [customers, setCustomers] = useState<Array<{
    id: string; nombre: string; gastoTotal: number; compras: number; ticketPromedio: number; tendencia: number;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/customers?sort=totalSpent&limit=10", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          const list = (Array.isArray(data) ? data : data.customers ?? data.data ?? []).slice(0, 10);
          setCustomers(list.map((c: Record<string, unknown>) => ({
            id: String(c.id ?? ""),
            nombre: String(c.name ?? c.nombre ?? c.customerName ?? "Cliente"),
            gastoTotal: Number(c.totalSpent ?? c.gastoTotal ?? c.total ?? 0),
            compras: Number(c.orderCount ?? c.compras ?? c.totalOrders ?? 0),
            ticketPromedio: Number(c.avgTicket ?? c.ticketPromedio ?? 0) || (Number(c.totalSpent ?? 0) / Math.max(1, Number(c.orderCount ?? 1))),
            tendencia: Number(c.trend ?? c.tendencia ?? 0),
          })));
        }
      } catch { /* silent */ }
      finally { setLoading(false); }
    })();
  }, [refreshKey]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  const medals = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];
  const formatCurrency = (n: number) => `S/${n.toFixed(2)}`;

  return (
    <div className="overflow-x-auto">
      {customers.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No hay datos de clientes disponibles</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="px-3 py-3 font-semibold text-gray-500 text-xs">#</th>
              <th className="px-3 py-3 font-semibold text-gray-500 text-xs">Cliente</th>
              <th className="px-3 py-3 font-semibold text-gray-500 text-xs text-right">Gasto total</th>
              <th className="px-3 py-3 font-semibold text-gray-500 text-xs text-right hidden sm:table-cell">Compras</th>
              <th className="px-3 py-3 font-semibold text-gray-500 text-xs text-right hidden md:table-cell">Ticket prom</th>
              <th className="px-3 py-3 font-semibold text-gray-500 text-xs text-center">Tendencia</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c, i) => (
              <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors">
                <td className="px-3 py-3 text-center">
                  {i < 3 ? <span className="text-lg">{medals[i]}</span> : <span className="text-xs font-bold text-gray-400">{i + 1}</span>}
                </td>
                <td className="px-3 py-3">
                  <p className="font-medium text-gray-900 truncate max-w-50">{c.nombre}</p>
                </td>
                <td className="px-3 py-3 text-right font-bold text-primary">{formatCurrency(c.gastoTotal)}</td>
                <td className="px-3 py-3 text-right text-gray-500 hidden sm:table-cell">{c.compras} compras</td>
                <td className="px-3 py-3 text-right text-gray-500 hidden md:table-cell">{formatCurrency(c.ticketPromedio)}</td>
                <td className="px-3 py-3 text-center">
                  {c.tendencia > 5 ? (
                    <span className="text-emerald-500 text-xs font-bold">&#8593; +{c.tendencia.toFixed(0)}%</span>
                  ) : c.tendencia < -5 ? (
                    <span className="text-red-500 text-xs font-bold">&#8595; {c.tendencia.toFixed(0)}%</span>
                  ) : (
                    <span className="text-gray-400 text-xs font-bold">&#8594; Estable</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Star Product of the Week ─────────────────────────────────────────────────
function StarProductCard({ refreshKey }: { refreshKey: number }) {
  const [star, setStar] = useState<{
    name: string; qty: number; revenue: number; trend: number; imageUrl?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/sales?limit=500", { credentials: "include" });
        if (!res.ok) return;
        const raw = await res.json();
        const sales = Array.isArray(raw) ? raw : raw.sales ?? [];
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
        const twoWeekAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);

        const thisWeek: Record<string, { name: string; qty: number; revenue: number; imageUrl?: string }> = {};
        const lastWeek: Record<string, { qty: number }> = {};

        for (const s of sales) {
          const d = (s.createdAt ?? "").slice(0, 10);
          const items = s.items ?? [];
          for (const i of items) {
            const pid = String(i.productId ?? i.name ?? "?");
            if (d >= weekAgo) {
              if (!thisWeek[pid]) thisWeek[pid] = { name: i.name ?? "Producto", qty: 0, revenue: 0, imageUrl: i.imageUrl };
              thisWeek[pid].qty += i.quantity ?? 1;
              thisWeek[pid].revenue += (i.price ?? 0) * (i.quantity ?? 1);
            } else if (d >= twoWeekAgo && d < weekAgo) {
              if (!lastWeek[pid]) lastWeek[pid] = { qty: 0 };
              lastWeek[pid].qty += i.quantity ?? 1;
            }
          }
        }

        const top = Object.entries(thisWeek).sort((a, b) => b[1].qty - a[1].qty)[0];
        if (top) {
          const [pid, data] = top;
          const lastQty = lastWeek[pid]?.qty ?? 0;
          const trend = lastQty > 0 ? ((data.qty - lastQty) / lastQty) * 100 : 0;
          setStar({ name: data.name, qty: data.qty, revenue: data.revenue, trend, imageUrl: data.imageUrl });
        }
      } catch { /* silent */ }
      finally { setLoading(false); }
    })();
  }, [refreshKey]);

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-5 w-40 bg-gray-200 rounded mb-4" />
        <div className="h-8 w-56 bg-gray-200 rounded" />
      </div>
    );
  }

  if (!star) {
    return (
      <div>
        <p className="text-sm font-semibold text-gray-500 flex items-center gap-2">
          <Flame className="h-4 w-4 text-secondary" /> Producto Estrella
        </p>
        <p className="text-xs text-gray-400 mt-2">Aun no hay ventas esta semana</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-linear-to-br from-secondary/5 to-secondary/10 p-4 border border-secondary/20">
      <div className="flex items-start gap-3">
        {star.imageUrl && (
          <div className="w-16 h-16 rounded-xl overflow-hidden bg-white shrink-0 border border-gray-200">
            <img src={star.imageUrl} alt={star.name} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-secondary bg-secondary/15 px-2.5 py-0.5 rounded-full">
              Mas vendido
            </span>
          </div>
          <p className="text-lg font-extrabold text-gray-900 truncate">{star.name}</p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-sm text-gray-500">{star.qty} unidades esta semana</span>
            <span className="text-sm font-bold text-primary">S/{star.revenue.toFixed(0)}</span>
            {star.trend !== 0 && (
              <span className={`text-xs font-bold ${star.trend > 0 ? "text-emerald-600" : "text-red-500"}`}>
                {star.trend > 0 ? "\u2191" : "\u2193"} {star.trend > 0 ? "+" : ""}{star.trend.toFixed(0)}% vs sem. pasada
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AnomalyDetectorWrapper — fetches data for AnomalyDetector ────────────────
function AnomalyDetectorWrapper({ refreshKey }: { refreshKey: number }) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [orders, setOrders] = useState<Array<{ id: string; status: string; total: number; createdAt: string; items?: Array<{ productId?: string | number; name?: string; quantity: number; price: number }> }>>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [salesRaw, ordersRaw] = await Promise.all([
        fetch("/api/sales?limit=500", { credentials: "include" }).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch("/api/orders?limit=500", { credentials: "include" }).then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      setSales(Array.isArray(salesRaw) ? salesRaw : salesRaw.sales ?? []);
      setOrders(Array.isArray(ordersRaw) ? ordersRaw : ordersRaw.orders ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

  if (loading) return <S />;

  if (sales.length === 0 && orders.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
          <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-sm text-gray-500">Sin anomalias — Todo marcha bien</p>
      </div>
    );
  }

  return (
    <Suspense fallback={<S />}>
      <AnomalyDetector sales={sales} orders={orders} />
    </Suspense>
  );
}

// ── RFMWrapper — fetches data for RFMSegmentationPanel ──────────────────────
function RFMWrapper({ refreshKey }: { refreshKey: number }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [customersRaw, salesRaw] = await Promise.all([
        fetch("/api/customers?limit=500", { credentials: "include" }).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch("/api/sales?limit=1000", { credentials: "include" }).then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      setCustomers(Array.isArray(customersRaw) ? customersRaw : customersRaw.customers ?? customersRaw.data ?? []);
      setSales(Array.isArray(salesRaw) ? salesRaw : salesRaw.sales ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

  if (loading) return <S />;

  return (
    <Suspense fallback={<S />}>
      <RFMSegmentationPanel customers={customers} sales={sales} />
    </Suspense>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── MAIN MODULE ──────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export default function AnalyticsBIModule() {
  const [activeSection, setActiveSection] = useState<SectionId>("resumen");
  const [period, setPeriod] = useState<AnalyticsPeriod>("30d");
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  // ── Section content renderer ───────────────────────────────────────────────
  const renderSection = () => {
    switch (activeSection) {
      // ────────────────────────────────────────────────────────────────────────
      // SECCION 1: RESUMEN
      // ────────────────────────────────────────────────────────────────────────
      case "resumen":
        return (
          <div className="flex flex-col gap-6 max-w-7xl mx-auto" key={`resumen-${refreshKey}`}>
            {/* KPIs compactos — embebidos en la sección, no como barra separada */}
            <InlineKPIStrip />
            {/* Tendencia de ventas — el gráfico principal a pantalla completa */}
            <AnalyticsCard
              title="Tendencia de Ventas"
              subtitle="Ventas diarias con media movil y proyeccion"
              icon={TrendingUp}
            >
              <div className="min-h-80">
                <Suspense fallback={<S />}>
                  <SalesTrendChart />
                </Suspense>
              </div>
            </AnalyticsCard>
            {/* Alertas + Estrella + Top Clientes — unificados en 2 columnas */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TabbedCard
                title="Alertas y Destacados"
                subtitle="Lo más importante de un vistazo"
                icon={AlertTriangle}
                tabs={[
                  {
                    id: "alertas",
                    label: "Alertas",
                    content: <AnomalyDetectorWrapper refreshKey={refreshKey} />,
                  },
                  {
                    id: "estrella",
                    label: "Producto Estrella",
                    content: <StarProductCard refreshKey={refreshKey} />,
                  },
                ]}
              />
              <AnalyticsCard
                title="Top 10 Clientes"
                subtitle="Ranking por gasto total acumulado"
                icon={Trophy}
              >
                <Top10Clientes refreshKey={refreshKey} />
              </AnalyticsCard>
            </div>
          </div>
        );

      // ────────────────────────────────────────────────────────────────────────
      // SECCION 2: VENTAS
      // ────────────────────────────────────────────────────────────────────────
      case "ventas":
        return (
          <div className="flex flex-col gap-4 max-w-7xl mx-auto" key={`ventas-${refreshKey}`}>
            <SectionKPIStrip section="ventas" />
            {/* Sales Trend — chart principal */}
            <AnalyticsCard
              title="Tendencia de Ventas"
              subtitle="Ventas diarias con media movil y prediccion"
              icon={TrendingUp}
            >
              <div className="min-h-80">
                <Suspense fallback={<S />}>
                  <SalesTrendChart />
                </Suspense>
              </div>
            </AnalyticsCard>
            {/* Patrones de Venta — Heatmap + PeakHours unificados */}
            <TabbedCard
              title="Patrones de Venta"
              subtitle="¿Cuándo compran tus clientes? Mapa de calor y distribución horaria"
              icon={Clock}
              tabs={[
                {
                  id: "heatmap",
                  label: "Mapa de Calor",
                  content: (
                    <div className="min-h-70">
                      <Suspense fallback={<S />}>
                        <VentasHeatmap />
                      </Suspense>
                    </div>
                  ),
                },
                {
                  id: "horario",
                  label: "Por Hora",
                  content: (
                    <div className="min-h-70">
                      <PeakHoursTab period={period} />
                    </div>
                  ),
                },
              ]}
            />
          </div>
        );

      // ────────────────────────────────────────────────────────────────────────
      // SECCION 3: PRODUCTOS
      // ────────────────────────────────────────────────────────────────────────
      case "productos":
        return (
          <div className="flex flex-col gap-4 max-w-7xl mx-auto" key={`productos-${refreshKey}`}>
            <SectionKPIStrip section="productos" />
            {/* Clasificación de Productos — ABC + BCG unificados */}
            <TabbedCard
              title="Clasificación de Productos"
              subtitle="ABC: cuáles generan más ingresos · BCG: en qué etapa de vida están"
              icon={Package}
              tabs={[
                {
                  id: "abc",
                  label: "ABC (80/20)",
                  content: (
                    <div className="min-h-87.5">
                      <ABCAnalysisTab />
                    </div>
                  ),
                },
                {
                  id: "bcg",
                  label: "Matriz BCG",
                  content: (
                    <div className="min-h-87.5">
                      <BCGMatrixTab />
                    </div>
                  ),
                },
              ]}
            />
            {/* Rentabilidad — Márgenes + Cesta de compra unificados */}
            <TabbedCard
              title="Rentabilidad y Comportamiento"
              subtitle="Márgenes por producto · Qué se compra junto"
              icon={DollarSign}
              tabs={[
                {
                  id: "margenes",
                  label: "Márgenes",
                  content: (
                    <div className="min-h-75">
                      <Suspense fallback={<S />}>
                        <MarginWaterfallChart />
                      </Suspense>
                    </div>
                  ),
                },
                {
                  id: "cesta",
                  label: "Cesta de Compra",
                  content: <BasketAnalysisTab />,
                },
              ]}
            />
          </div>
        );

      // ────────────────────────────────────────────────────────────────────────
      // SECCION 4: CLIENTES
      // ────────────────────────────────────────────────────────────────────────
      case "clientes":
        return (
          <div className="flex flex-col gap-4 max-w-7xl mx-auto" key={`clientes-${refreshKey}`}>
            <SectionKPIStrip section="clientes" />
            {/* Inteligencia de Clientes — RFM + Top10 unificados */}
            <TabbedCard
              title="Inteligencia de Clientes"
              subtitle="Segmentación por comportamiento de compra · Ranking de los mejores"
              icon={Users}
              tabs={[
                {
                  id: "rfm",
                  label: "Segmentación RFM",
                  content: <RFMWrapper refreshKey={refreshKey} />,
                },
                {
                  id: "top10",
                  label: "Top 10 Ranking",
                  content: <Top10Clientes refreshKey={refreshKey} />,
                },
              ]}
            />
            {/* Fiados — Datos + IA unificados */}
            <TabbedCard
              title="Fiados — Deuda y Cobranza"
              subtitle="Cuánto te deben, quién paga y quién no · Análisis de riesgo IA"
              icon={CreditCard}
              tabs={[
                {
                  id: "resumen-fiados",
                  label: "Resumen",
                  content: (
                    <div className="min-h-75">
                      <Suspense fallback={<S />}>
                        <FiadoAnalyticsPanel />
                      </Suspense>
                    </div>
                  ),
                },
                {
                  id: "ia-fiados",
                  label: "Riesgo IA",
                  content: (
                    <div className="min-h-75">
                      <Suspense fallback={<S />}>
                        <AIFiadoDashboard />
                      </Suspense>
                    </div>
                  ),
                },
              ]}
            />
          </div>
        );

      // ────────────────────────────────────────────────────────────────────────
      // SECCION 5: PREDICCIONES
      // ────────────────────────────────────────────────────────────────────────
      case "predicciones":
        return (
          <div className="flex flex-col gap-4 max-w-5xl mx-auto" key={`pred-${refreshKey}`}>
            <PredictiveAnalyticsTab />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Analytics BI"
        description="Analítica avanzada de ventas, productos, clientes y predicciones"
        icon={BarChart3}
      />
      <AdminTabBar
        tabs={SECTIONS.map(s => ({ id: s.id, label: s.label, icon: s.icon }))}
        activeTab={activeSection}
        onTabChange={(id) => setActiveSection(id as SectionId)}
        moduleId={MODULE_ID}
      />

      {/* ── Section content with AnimatePresence ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeSection}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          {renderSection()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
