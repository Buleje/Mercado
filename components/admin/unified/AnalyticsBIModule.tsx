"use client";
import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3, Flame, TrendingUp, RefreshCw,
  CreditCard, Wallet, Users, Trophy, Package,
  LayoutDashboard, DollarSign, ShoppingBasket,
  Target, Clock, AlertTriangle, GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Sale, Customer } from "@/types/erp";

// ── Spinner ──────────────────────────────────────────────────────────────────
const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

// ── Existing components (dynamic imports) ────────────────────────────────────
const BusinessIntelligenceTab = dynamic(() => import("@/components/admin/BusinessIntelligenceTab"), { loading: S });
const _HeatMapTab = dynamic(() => import("@/components/admin/HeatMapTab"), { loading: S });
const ABCAnalysisTab = dynamic(() => import("@/components/admin/ABCAnalysisTab"), { loading: S });
const _ParetoAnalysisTab = dynamic(() => import("@/components/admin/ParetoAnalysisTab"), { loading: S });
const BCGMatrixTab = dynamic(() => import("@/components/admin/BCGMatrixTab"), { loading: S });
const BasketAnalysisTab = dynamic(() => import("@/components/admin/BasketAnalysisTab"), { loading: S });
const CustomKPITab = dynamic(() => import("@/components/admin/CustomKPITab"), { loading: S });
const PeakHoursTab = dynamic(() => import("@/components/admin/PeakHoursTab"), { loading: S });
const CompetitorPriceTracker = dynamic(() => import("@/components/admin/CompetitorPriceTracker"), { loading: S });

// ── New Analytics PRO components (React.lazy) ────────────────────────────────
const AnalyticsKPIBarV2 = lazy(() => import("@/components/admin/analytics/AnalyticsKPIBarV2"));
const SalesTrendChart = lazy(() => import("@/components/admin/analytics/SalesTrendChart"));
const VentasHeatmap = lazy(() => import("@/components/admin/analytics/VentasHeatmap"));
const MarginWaterfallChart = lazy(() => import("@/components/admin/analytics/MarginWaterfallChart"));
const FiadoAnalyticsPanel = lazy(() => import("@/components/admin/analytics/FiadoAnalyticsPanel"));
const CashFlowChart = lazy(() => import("@/components/admin/analytics/CashFlowChart"));
const AnomalyDetector = lazy(() => import("@/components/admin/analytics/AnomalyDetector"));
const RFMSegmentationPanel = lazy(() => import("@/components/admin/analytics/RFMSegmentationPanel"));

// ── Types ────────────────────────────────────────────────────────────────────
export type AnalyticsPeriod = "1d" | "7d" | "30d" | "90d" | "1y";

type SectionId = "resumen" | "ventas" | "productos" | "clientes" | "finanzas";

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

const SECTIONS: { id: SectionId; label: string; icon: typeof LayoutDashboard; description: string }[] = [
  { id: "resumen",   label: "Resumen",   icon: LayoutDashboard, description: "Vista general de tu negocio" },
  { id: "ventas",    label: "Ventas",    icon: TrendingUp,      description: "Tendencias, horarios y patrones de venta" },
  { id: "productos", label: "Productos", icon: Package,         description: "Clasificacion ABC, BCG y margenes" },
  { id: "clientes",  label: "Clientes",  icon: Users,           description: "Segmentación RFM (Recencia, Frecuencia, Monetario — clasifica clientes por comportamiento de compra), ranking y fidelidad" },
  { id: "finanzas",  label: "Finanzas",  icon: DollarSign,      description: "Flujo de caja, rentabilidad y KPIs" },
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
      "bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm transition-shadow hover:shadow-md",
      className,
    )}>
      <div className="mb-5">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <div className="h-9 w-9 rounded-lg bg-[#0f766e]/10 dark:bg-[#0f766e]/20 flex items-center justify-center shrink-0">
              <Icon className="h-4.5 w-4.5 text-[#0f766e] dark:text-[#14b8a6]" />
            </div>
          )}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white leading-tight">{title}</h3>
            {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
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
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h2>
      <div className="w-12 h-1 bg-[#0f766e] rounded-full mt-2" />
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{description}</p>
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
          <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
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
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
              <th className="px-3 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs">#</th>
              <th className="px-3 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs">Cliente</th>
              <th className="px-3 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs text-right">Gasto total</th>
              <th className="px-3 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs text-right hidden sm:table-cell">Compras</th>
              <th className="px-3 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs text-right hidden md:table-cell">Ticket prom</th>
              <th className="px-3 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs text-center">Tendencia</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c, i) => (
              <tr key={c.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer transition-colors">
                <td className="px-3 py-3 text-center">
                  {i < 3 ? <span className="text-lg">{medals[i]}</span> : <span className="text-xs font-bold text-gray-400">{i + 1}</span>}
                </td>
                <td className="px-3 py-3">
                  <p className="font-medium text-gray-900 dark:text-white truncate max-w-[200px]">{c.nombre}</p>
                </td>
                <td className="px-3 py-3 text-right font-bold text-[#0f766e] dark:text-[#14b8a6]">{formatCurrency(c.gastoTotal)}</td>
                <td className="px-3 py-3 text-right text-gray-500 dark:text-gray-400 hidden sm:table-cell">{c.compras} compras</td>
                <td className="px-3 py-3 text-right text-gray-500 dark:text-gray-400 hidden md:table-cell">{formatCurrency(c.ticketPromedio)}</td>
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
        <div className="h-5 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
        <div className="h-8 w-56 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    );
  }

  if (!star) {
    return (
      <div>
        <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <Flame className="h-4 w-4 text-[#f97316]" /> Producto Estrella
        </p>
        <p className="text-xs text-gray-400 mt-2">Aun no hay ventas esta semana</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-gradient-to-br from-[#f97316]/5 to-[#f97316]/10 dark:from-[#f97316]/10 dark:to-[#f97316]/20 p-4 border border-[#f97316]/20">
      <div className="flex items-start gap-3">
        {star.imageUrl && (
          <div className="w-16 h-16 rounded-xl overflow-hidden bg-white dark:bg-gray-800 shrink-0 border border-gray-200 dark:border-gray-700">
            <img src={star.imageUrl} alt={star.name} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-[#f97316] bg-[#f97316]/15 px-2.5 py-0.5 rounded-full">
              Mas vendido
            </span>
          </div>
          <p className="text-lg font-extrabold text-gray-900 dark:text-white truncate">{star.name}</p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-sm text-gray-500 dark:text-gray-400">{star.qty} unidades esta semana</span>
            <span className="text-sm font-bold text-[#0f766e] dark:text-[#14b8a6]">S/{star.revenue.toFixed(0)}</span>
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
        <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
          <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">Sin anomalias — Todo marcha bien</p>
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

  // ── Drag-and-drop section reordering ──
  const [sectionOrder, setSectionOrder] = useState<string[]>(() => {
    if (typeof window === "undefined") return SECTIONS.map(s => s.id);
    try {
      const saved = localStorage.getItem("analytics-tab-order");
      if (saved) {
        const parsed = JSON.parse(saved);
        const allIds: string[] = SECTIONS.map(s => s.id);
        const valid = (parsed as string[]).filter((id: string) => allIds.includes(id));
        const missing = allIds.filter((id: string) => !valid.includes(id));
        return [...valid, ...missing];
      }
    } catch { /* ignore */ }
    return SECTIONS.map(s => s.id);
  });
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  const [dragOverTab, setDragOverTab] = useState<string | null>(null);

  const orderedSections = useMemo(
    () => sectionOrder.map(id => SECTIONS.find(s => s.id === id)).filter(Boolean) as typeof SECTIONS,
    [sectionOrder],
  );

  function handleDropTab(targetId: string) {
    if (!draggedTab || draggedTab === targetId) return;
    const newOrder = [...sectionOrder];
    const fromIdx = newOrder.indexOf(draggedTab);
    const toIdx = newOrder.indexOf(targetId);
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, draggedTab);
    setSectionOrder(newOrder);
    localStorage.setItem("analytics-tab-order", JSON.stringify(newOrder));
    setDraggedTab(null);
    setDragOverTab(null);
  }

  const resetSectionOrder = () => {
    setSectionOrder(SECTIONS.map(s => s.id));
    localStorage.removeItem("analytics-tab-order");
  };

  // ── Section content renderer ───────────────────────────────────────────────
  const renderSection = () => {
    switch (activeSection) {
      // ────────────────────────────────────────────────────────────────────────
      // SECCION 1: RESUMEN
      // ────────────────────────────────────────────────────────────────────────
      case "resumen":
        return (
          <div className="flex flex-col gap-8 max-w-7xl mx-auto" key={`resumen-${refreshKey}`}>
            <SectionHeader
              title="Resumen General"
              description="Vista panoramica de indicadores clave, alertas y productos destacados"
            />

            {/* Anomaly Detector */}
            <AnalyticsCard
              title="Detector de Anomalias"
              subtitle="Alertas automaticas basadas en desviacion estadistica"
              icon={AlertTriangle}
            >
              <AnomalyDetectorWrapper refreshKey={refreshKey} />
            </AnalyticsCard>

            {/* Star Product + Top 10 — 2 cols on desktop */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <AnalyticsCard
                title="Producto Estrella de la Semana"
                subtitle="El mas vendido en los ultimos 7 dias"
                icon={Flame}
              >
                <StarProductCard refreshKey={refreshKey} />
              </AnalyticsCard>

              <AnalyticsCard
                title="Top 10 Clientes"
                subtitle="Ranking por gasto total acumulado"
                icon={Trophy}
              >
                <Top10Clientes refreshKey={refreshKey} />
              </AnalyticsCard>
            </div>

            {/* Sales Trend — full width, grande */}
            <AnalyticsCard
              title="Tendencia de Ventas"
              subtitle="Evolucion diaria con media movil y tendencia"
              icon={TrendingUp}
            >
              <div className="min-h-[450px]">
                <Suspense fallback={<S />}>
                  <SalesTrendChart />
                </Suspense>
              </div>
            </AnalyticsCard>
          </div>
        );

      // ────────────────────────────────────────────────────────────────────────
      // SECCION 2: VENTAS
      // ────────────────────────────────────────────────────────────────────────
      case "ventas":
        return (
          <div className="flex flex-col gap-8 max-w-7xl mx-auto" key={`ventas-${refreshKey}`}>
            <SectionHeader
              title="Analisis de Ventas"
              description="Tendencias, patrones horarios y mapa de calor de actividad"
            />

            {/* Sales Trend Chart — height 450px */}
            <AnalyticsCard
              title="Tendencia de Ventas"
              subtitle="Linea de ventas diarias con media movil de 7 dias y prediccion"
              icon={TrendingUp}
            >
              <div className="min-h-[450px]">
                <Suspense fallback={<S />}>
                  <SalesTrendChart />
                </Suspense>
              </div>
            </AnalyticsCard>

            {/* Heatmap — full width */}
            <AnalyticsCard
              title="Mapa de Calor — Cuando vendes mas?"
              subtitle="Intensidad de ventas por dia de la semana y franja horaria"
              icon={BarChart3}
            >
              <div className="min-h-[350px]">
                <Suspense fallback={<S />}>
                  <VentasHeatmap />
                </Suspense>
              </div>
            </AnalyticsCard>

            {/* Peak Hours — full width */}
            <AnalyticsCard
              title="Ventas por Hora"
              subtitle="Distribucion horaria — identifica picos y valles"
              icon={Clock}
            >
              <div className="min-h-[350px]">
                <PeakHoursTab period={period} />
              </div>
            </AnalyticsCard>
          </div>
        );

      // ────────────────────────────────────────────────────────────────────────
      // SECCION 3: PRODUCTOS
      // ────────────────────────────────────────────────────────────────────────
      case "productos":
        return (
          <div className="flex flex-col gap-8 max-w-7xl mx-auto" key={`productos-${refreshKey}`}>
            <SectionHeader
              title="Analisis de Productos"
              description="Clasificacion ABC, matriz BCG, margenes y asociaciones de compra"
            />

            {/* ABC / Pareto */}
            <AnalyticsCard
              title="Clasificacion ABC -- Pareto"
              subtitle="80/20: que productos generan el 80% de tus ingresos"
              icon={BarChart3}
            >
              <div className="min-h-[450px]">
                <ABCAnalysisTab />
              </div>
            </AnalyticsCard>

            {/* BCG Matrix */}
            <AnalyticsCard
              title="Matriz BCG -- Estrellas vs Perros"
              subtitle="Cuadrantes de crecimiento y participacion de mercado"
              icon={Target}
            >
              <div className="min-h-[450px]">
                <BCGMatrixTab />
              </div>
            </AnalyticsCard>

            {/* Margin Waterfall */}
            <AnalyticsCard
              title="Analisis de Margenes"
              subtitle="Waterfall de margen bruto por producto y categoria"
              icon={DollarSign}
            >
              <div className="min-h-[400px]">
                <Suspense fallback={<S />}>
                  <MarginWaterfallChart />
                </Suspense>
              </div>
            </AnalyticsCard>

            {/* Basket Analysis */}
            <AnalyticsCard
              title="Analisis de Cesta — Que se compra junto?"
              subtitle="Asociaciones frecuentes entre productos (reglas de confianza)"
              icon={ShoppingBasket}
            >
              <BasketAnalysisTab />
            </AnalyticsCard>
          </div>
        );

      // ────────────────────────────────────────────────────────────────────────
      // SECCION 4: CLIENTES
      // ────────────────────────────────────────────────────────────────────────
      case "clientes":
        return (
          <div className="flex flex-col gap-8 max-w-7xl mx-auto" key={`clientes-${refreshKey}`}>
            <SectionHeader
              title="Analisis de Clientes"
              description="Segmentacion RFM, ranking de mejores clientes y gestion de fiados"
            />

            {/* RFM Segmentation */}
            <AnalyticsCard
              title="Segmentacion RFM de Clientes"
              subtitle="Recencia, Frecuencia, Monto — identifica Champions, At Risk, Lost"
              icon={Users}
            >
              <RFMWrapper refreshKey={refreshKey} />
            </AnalyticsCard>

            {/* Top 10 Clientes */}
            <AnalyticsCard
              title="Top 10 Clientes"
              subtitle="Ranking por volumen de compra con tendencias"
              icon={Trophy}
            >
              <Top10Clientes refreshKey={refreshKey} />
            </AnalyticsCard>

            {/* Fiado Analytics */}
            <AnalyticsCard
              title="Fiado Analytics"
              subtitle="Deuda pendiente, tasa de recuperacion y tendencia de cobranza"
              icon={CreditCard}
            >
              <div className="min-h-[400px]">
                <Suspense fallback={<S />}>
                  <FiadoAnalyticsPanel />
                </Suspense>
              </div>
            </AnalyticsCard>
          </div>
        );

      // ────────────────────────────────────────────────────────────────────────
      // SECCION 5: FINANZAS
      // ────────────────────────────────────────────────────────────────────────
      case "finanzas":
        return (
          <div className="flex flex-col gap-8 max-w-7xl mx-auto" key={`finanzas-${refreshKey}`}>
            <SectionHeader
              title="Analisis Financiero"
              description="Flujo de caja, comparativos y KPIs personalizados"
            />

            {/* Cash Flow */}
            <AnalyticsCard
              title="Flujo de Caja -- 30 Dias"
              subtitle="Ingresos, egresos y balance proyectado con barras y linea acumulada"
              icon={Wallet}
            >
              <div className="min-h-[450px]">
                <Suspense fallback={<S />}>
                  <CashFlowChart />
                </Suspense>
              </div>
            </AnalyticsCard>

            {/* Business Intelligence / Forecasting */}
            <AnalyticsCard
              title="Inteligencia de Negocio"
              subtitle="Tendencias por categoria, anomalias y pronosticos de ingresos"
              icon={BarChart3}
            >
              <div className="min-h-[400px]">
                <BusinessIntelligenceTab />
              </div>
            </AnalyticsCard>

            {/* Custom KPIs */}
            <AnalyticsCard
              title="KPIs Personalizados"
              subtitle="Crea y monitorea metricas a tu medida"
              icon={Target}
            >
              <CustomKPITab />
            </AnalyticsCard>

            {/* Competitor Price Tracker */}
            <AnalyticsCard
              title="Dashboard Competencia"
              subtitle="Monitoreo de precios en el mercado local"
              icon={TrendingUp}
            >
              <CompetitorPriceTracker />
            </AnalyticsCard>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-[#0f766e] text-white flex items-center justify-center shadow-sm">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-white">
              Analytics PRO
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Analisis avanzado de tu negocio
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-full bg-[#0f766e]/10 text-[#0f766e] dark:text-[#14b8a6] text-xs font-bold border border-[#0f766e]/20">
            {PERIOD_DISPLAY[period]}
          </span>
          <button
            onClick={handleRefresh}
            title="Recargar datos"
            className="h-9 w-9 rounded-xl flex items-center justify-center text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-[#0f766e] transition-colors border border-gray-200 dark:border-gray-700"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── KPI Bar V2 — always visible ── */}
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm py-3 -mx-1 px-1 rounded-2xl">
        <Suspense fallback={
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
            ))}
          </div>
        }>
          <AnalyticsKPIBarV2 key={`kpi-${refreshKey}`} />
        </Suspense>
      </div>

      {/* ── Period selector ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 mr-1">Periodo:</span>
        {PERIODS.map(p => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold border transition-all",
              period === p.key
                ? "text-white border-transparent bg-[#0f766e] shadow-sm"
                : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* ── Section navigation — 5 pills grandes con icono + drag-and-drop ── */}
      <div className="flex gap-2.5 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1">
        {orderedSections.map(section => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;
          return (
            <button
              key={section.id}
              draggable
              onDragStart={() => setDraggedTab(section.id)}
              onDragOver={(e) => { e.preventDefault(); setDragOverTab(section.id); }}
              onDragLeave={() => setDragOverTab(null)}
              onDrop={() => handleDropTab(section.id)}
              onDragEnd={() => { setDraggedTab(null); setDragOverTab(null); }}
              onClick={() => setActiveSection(section.id)}
              className={cn(
                "shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all cursor-grab active:cursor-grabbing",
                isActive
                  ? "bg-[#0f766e] text-white shadow-sm"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700",
                draggedTab === section.id && "opacity-40 scale-95",
                dragOverTab === section.id && draggedTab !== section.id && "ring-2 ring-[#0f766e] ring-offset-1",
              )}
            >
              <GripVertical className="h-3 w-3 shrink-0 opacity-30" />
              <Icon className="h-4 w-4 shrink-0" />
              <span>{section.label}</span>
            </button>
          );
        })}
        {/* Reset section order button */}
        {JSON.stringify(sectionOrder) !== JSON.stringify(SECTIONS.map(s => s.id)) && (
          <button
            onClick={resetSectionOrder}
            className="shrink-0 ml-1 px-2 py-1.5 text-[10px] text-gray-400 dark:text-muted hover:text-[#0f766e] dark:hover:text-emerald-400 transition-colors whitespace-nowrap self-center"
            title="Restablecer orden de secciones"
          >
            Restablecer
          </button>
        )}
      </div>

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
