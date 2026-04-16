"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";
import {
  ClipboardList, Stethoscope, GraduationCap,
  FlaskConical, Newspaper, AlertCircle, CreditCard, BookOpen, WifiOff, ChevronLeft, ChevronRight, TrendingUp, MessageSquare,
  DollarSign } from "lucide-react";
import * as Sentry from "@sentry/nextjs";
import { cn } from "@/lib/utils";

// ── Lazy load ALL heavy tab components ─────────────────────────────────────────
const AIDailyBriefing = React.lazy(() => import("./AIDailyBriefing"));
const AIActionPlan = React.lazy(() => import("./AIActionPlan"));
const AIBusinessHealthScore = React.lazy(() => import("./AIBusinessHealthScore"));
const AIPerformanceCoach = React.lazy(() => import("./AIPerformanceCoach"));
const AIWhatIfSimulator = React.lazy(() => import("./AIWhatIfSimulator"));
const AIRiskRadar = React.lazy(() => import("./AIRiskRadar"));
const AIOpportunityFinder = React.lazy(() => import("./AIOpportunityFinder"));
const AINaturalQueryEngine = React.lazy(() => import("./AINaturalQueryEngine"));
const AIWeeklyReport = React.lazy(() => import("./AIWeeklyReport"));
const AIFiadoDashboard = React.lazy(() => import("./AIFiadoDashboard"));
const AIDecisionLog = React.lazy(() => import("./AIDecisionLog"));
const AIMarketResearch = React.lazy(() => import("./AIMarketResearch"));
const AIStrategicAdvisor = React.lazy(() => import("./AIStrategicAdvisor"));
const AISmartPricing = React.lazy(() => import("./AISmartPricing"));
// HITL banner — polling ligero, no lazy (es pequeño y necesita estar siempre activo)
import HITLApprovalsBanner from "./HITLApprovalsBanner";

// ── Types ──────────────────────────────────────────────────────────────────────

export type Product = {
  id: number | string;
  name: string;
  stock?: number;
  stockMin?: number;
  price?: number;
  costPrice?: number;
  active?: boolean;
  category?: string;
  unit?: string;
  expiresAt?: string;
};

export type OrderItem = {
  id: number | string;
  name: string;
  quantity: number;
  price: number;
};

export type Order = {
  id: string;
  status: string;
  total: number;
  createdAt?: string;
  items: OrderItem[];
  customer?: { name?: string; phone?: string };
};

export type SaleItem = {
  productId: number | string;
  name: string;
  quantity: number;
  price: number;
};

export type Sale = {
  id: string;
  total: number;
  createdAt?: string;
  items: SaleItem[];
  payment?: string;
  customerPhone?: string;
};

export type Customer = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  createdAt?: string;
  totalSpent?: number;
  lastPurchase?: string;
};

export type ExpenseSummary = {
  totalMonth?: number;
  totalWeek?: number;
  byCategory?: Record<string, number>;
};

export type BusinessData = {
  products: Product[];
  orders: Order[];
  sales: Sale[];
  customers: Customer[];
  expenses: ExpenseSummary;
  alerts?: { lowStock: number; pendingOrders: number; overduePayables: number };
  lastUpdated: number;
};

// ── Tabs ───────────────────────────────────────────────────────────────────────

type TabId = "briefing" | "plan" | "diagnostico" | "coach" | "simulador" | "fiado" | "decisiones" | "mercado" | "asesor" | "precios";

const TABS: { id: TabId; label: string; icon: React.ElementType; shortcut: string }[] = [
  { id: "briefing", label: "Briefing", icon: Newspaper, shortcut: "Alt+1" },
  { id: "plan", label: "Plan", icon: ClipboardList, shortcut: "Alt+2" },
  { id: "mercado", label: "Mercado", icon: TrendingUp, shortcut: "Alt+3" },
  { id: "asesor", label: "Asesor IA", icon: MessageSquare, shortcut: "Alt+4" },
  { id: "precios", label: "Precios", icon: DollarSign, shortcut: "Alt+5" },
  { id: "diagnostico", label: "Diagnostico", icon: Stethoscope, shortcut: "Alt+6" },
  { id: "coach", label: "Coach", icon: GraduationCap, shortcut: "Alt+7" },
  { id: "simulador", label: "Simulador", icon: FlaskConical, shortcut: "Alt+8" },
  { id: "fiado", label: "Fiado Dashboard", icon: CreditCard, shortcut: "Alt+9" },
  { id: "decisiones", label: "Decisiones", icon: BookOpen, shortcut: "Alt+0" },
];

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 min

// ── Helpers ────────────────────────────────────────────────────────────────────

function _getRelativeTime(date: Date): string {
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return "hace unos segundos";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `hace ${min} min`;
  const hrs = Math.floor(min / 60);
  return `hace ${hrs}h ${min % 60}min`;
}

function _getFreshnessColor(date: Date): string {
  const diffMin = (Date.now() - date.getTime()) / 60_000;
  if (diffMin < 1) return "bg-emerald-500";
  if (diffMin < 5) return "bg-amber-400";
  return "bg-red-400";
}

function getStoredTab(): TabId {
  try {
    const stored = localStorage.getItem("ai-center-active-tab");
    if (stored && TABS.some(t => t.id === stored)) return stored as TabId;
  } catch { /* noop */ }
  return "briefing";
}

// ── Business Calculators ─────────────────────────────────────────────────────

function BusinessCalculators() {
  const [margenCosto, setMargenCosto] = React.useState("");
  const [margenPct, setMargenPct] = React.useState("");
  const [eqGastos, setEqGastos] = React.useState("");
  const [eqMargen, setEqMargen] = React.useState("");
  const [roiInversion, setRoiInversion] = React.useState("");
  const [roiGanancia, setRoiGanancia] = React.useState("");

  const precioSugerido = margenCosto && margenPct && parseFloat(margenPct) < 100 && parseFloat(margenPct) > 0
    ? (parseFloat(margenCosto) / (1 - parseFloat(margenPct) / 100)).toFixed(2)
    : null;
  const gananciaMargen = precioSugerido && margenCosto ? (parseFloat(precioSugerido) - parseFloat(margenCosto)).toFixed(2) : null;

  const ventasNecesarias = eqGastos && eqMargen && parseFloat(eqMargen) > 0
    ? (parseFloat(eqGastos) / (parseFloat(eqMargen) / 100)).toFixed(2)
    : null;

  const roiPct = roiInversion && roiGanancia && parseFloat(roiInversion) > 0
    ? ((parseFloat(roiGanancia) / parseFloat(roiInversion)) * 100).toFixed(1)
    : null;
  const mesesRecuperar = roiInversion && roiGanancia && parseFloat(roiGanancia) > 0
    ? Math.ceil(parseFloat(roiInversion) / parseFloat(roiGanancia))
    : null;

  const inputCls = "w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#00B4A6]/30";

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3">Calculadoras de negocio</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Margen */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 space-y-2">
          <p className="text-xs font-bold text-gray-600 dark:text-gray-400">Calculadora de Margen</p>
          <div>
            <label className="text-[10px] text-gray-400">Costo (S/)</label>
            <input type="number" value={margenCosto} onChange={e => setMargenCosto(e.target.value)} placeholder="Ej: 10" className={inputCls} />
          </div>
          <div>
            <label className="text-[10px] text-gray-400">Margen deseado (%)</label>
            <input type="number" value={margenPct} onChange={e => setMargenPct(e.target.value)} placeholder="Ej: 30" className={inputCls} />
          </div>
          {precioSugerido && (
            <div className="bg-[#00B4A6]/10 rounded-lg p-2 text-center">
              <p className="text-[10px] text-gray-500">Precio sugerido</p>
              <p className="text-lg font-bold text-[#00B4A6]">S/{precioSugerido}</p>
              <p className="text-[10px] text-gray-400">Ganancia: S/{gananciaMargen}</p>
            </div>
          )}
        </div>

        {/* Punto de equilibrio */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 space-y-2">
          <p className="text-xs font-bold text-gray-600 dark:text-gray-400">Punto de Equilibrio</p>
          <div>
            <label className="text-[10px] text-gray-400">Gastos fijos mensuales (S/)</label>
            <input type="number" value={eqGastos} onChange={e => setEqGastos(e.target.value)} placeholder="Ej: 3000" className={inputCls} />
          </div>
          <div>
            <label className="text-[10px] text-gray-400">Margen promedio (%)</label>
            <input type="number" value={eqMargen} onChange={e => setEqMargen(e.target.value)} placeholder="Ej: 25" className={inputCls} />
          </div>
          {ventasNecesarias && (
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2 text-center">
              <p className="text-[10px] text-gray-500">Ventas necesarias/mes</p>
              <p className="text-lg font-bold text-amber-600">S/{ventasNecesarias}</p>
              <p className="text-[10px] text-gray-400">Para cubrir tus gastos fijos</p>
            </div>
          )}
        </div>

        {/* ROI */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 space-y-2">
          <p className="text-xs font-bold text-gray-600 dark:text-gray-400">Calculadora ROI</p>
          <div>
            <label className="text-[10px] text-gray-400">Inversion total (S/)</label>
            <input type="number" value={roiInversion} onChange={e => setRoiInversion(e.target.value)} placeholder="Ej: 5000" className={inputCls} />
          </div>
          <div>
            <label className="text-[10px] text-gray-400">Ganancia mensual (S/)</label>
            <input type="number" value={roiGanancia} onChange={e => setRoiGanancia(e.target.value)} placeholder="Ej: 800" className={inputCls} />
          </div>
          {roiPct && mesesRecuperar && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-2 text-center">
              <p className="text-[10px] text-gray-500">ROI mensual</p>
              <p className="text-lg font-bold text-emerald-600">{roiPct}%</p>
              <p className="text-[10px] text-gray-400">Recuperas en {mesesRecuperar} mes{mesesRecuperar !== 1 ? "es" : ""}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Daily Checklist ──────────────────────────────────────────────────────────

const DAILY_TASKS = [
  "Revisar stock bajo",
  "Cobrar fiados vencidos",
  "Verificar caja",
  "Revisar pedidos pendientes",
  "Contactar proveedores",
];

function DailyChecklist() {
  const todayKey = `daily-checklist-${new Date().toISOString().slice(0, 10)}`;
  const [checked, setChecked] = React.useState<boolean[]>(() => {
    try {
      const raw = localStorage.getItem(todayKey);
      if (raw) return JSON.parse(raw);
    } catch { /* noop */ }
    return DAILY_TASKS.map(() => false);
  });

  const toggle = (idx: number) => {
    setChecked(prev => {
      const next = [...prev];
      next[idx] = !next[idx];
      try { localStorage.setItem(todayKey, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  const completadas = checked.filter(Boolean).length;
  const total = DAILY_TASKS.length;
  const allDone = completadas === total;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Checklist del dia</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{completadas} de {total} completadas</span>
          {allDone && (
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold">
              Dia productivo!
            </span>
          )}
        </div>
      </div>
      {/* Progress bar */}
      <div className="relative h-2 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden mb-3">
        <div className={cn("h-full rounded-full transition-all", allDone ? "bg-emerald-500" : "bg-[#00B4A6]")} style={{ width: `${(completadas / total) * 100}%` }} />
      </div>
      <div className="space-y-1.5">
        {DAILY_TASKS.map((task, i) => (
          <button
            key={i}
            onClick={() => toggle(i)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors",
              checked[i] ? "bg-emerald-50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-400" : "hover:bg-gray-50 dark:hover:bg-white/5 text-gray-700 dark:text-gray-300"
            )}
          >
            <span className={cn(
              "h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 text-xs transition-colors",
              checked[i] ? "bg-emerald-500 border-emerald-500 text-white" : "border-gray-300 dark:border-gray-600"
            )}>
              {checked[i] && "\u2713"}
            </span>
            <span className={checked[i] ? "line-through" : ""}>{task}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Tab Badges (notification counts) ─────────────────────────────────────────

function useTabBadges(data: BusinessData | null) {
  return useMemo(() => {
    if (!data) return {} as Record<TabId, number>;
    const lowStock = data.products.filter(p => p.stock != null && p.stockMin != null && p.stock <= p.stockMin && p.active !== false).length;
    const pendingOrders = data.orders.filter(o => o.status === "pendiente" || o.status === "en_proceso").length;
    const fiadosPendientes = data.orders.filter(o => o.status === "pendiente").length;
    const riskCount = lowStock + (pendingOrders > 5 ? 1 : 0);

    const badges: Partial<Record<TabId, number>> = {};
    if (riskCount > 0) badges.diagnostico = riskCount;
    if (fiadosPendientes > 0) badges.fiado = fiadosPendientes;
    if (pendingOrders > 0) badges.plan = pendingOrders;
    return badges;
  }, [data]);
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function AICommandCenter() {
  const [activeTab, setActiveTab] = useState<TabId>(getStoredTab);
  const [data, setData] = useState<BusinessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [_lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [_showShortcuts, _setShowShortcuts] = useState(false);
  const [, setTick] = useState(0); // force re-render for relative time
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);

  const tabBadges = useTabBadges(data);

  // Persist active tab
  const changeTab = useCallback((tab: TabId) => {
    setActiveTab(tab);
    try { localStorage.setItem("ai-center-active-tab", tab); } catch { /* noop */ }
  }, []);

  // Keyboard shortcuts: Alt+1..9 for tabs
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        if (TABS[idx]) changeTab(TABS[idx].id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [changeTab]);

  // Online/offline detection
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => { setIsOffline(false); handleRefresh(); };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    setIsOffline(!navigator.onLine);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick every 30s to update relative time
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Auto-scroll active tab into view on mobile
  useEffect(() => {
    if (!tabBarRef.current) return;
    const activeBtn = tabBarRef.current.querySelector("[data-active-tab]") as HTMLElement | null;
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [activeTab]);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [dashRes, salesRes, customersRes, expensesRes] = await Promise.allSettled([
        fetch("/api/admin/dashboard"),
        fetch("/api/sales?limit=500"),
        fetch("/api/customers"),
        fetch("/api/expenses/summary"),
      ]);

      const dashboard =
        dashRes.status === "fulfilled" && dashRes.value.ok
          ? await dashRes.value.json()
          : {};

      const salesRaw =
        salesRes.status === "fulfilled" && salesRes.value.ok
          ? await salesRes.value.json()
          : [];

      const customersRaw =
        customersRes.status === "fulfilled" && customersRes.value.ok
          ? await customersRes.value.json()
          : [];

      const expensesRaw =
        expensesRes.status === "fulfilled" && expensesRes.value.ok
          ? await expensesRes.value.json()
          : {};

      setData({
        products: dashboard.products ?? [],
        orders: dashboard.orders ?? [],
        sales: Array.isArray(salesRaw) ? salesRaw : (salesRaw.sales ?? []),
        customers: Array.isArray(customersRaw) ? customersRaw : (customersRaw.customers ?? []),
        expenses: expensesRaw,
        alerts: dashboard.alerts,
        lastUpdated: Date.now(),
      });
      setLastRefresh(new Date());
    } catch (e) {
      setError("No se pudo cargar los datos del negocio.");
      Sentry.captureException(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, REFRESH_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  return (
    <div className="flex flex-col gap-4 w-full min-h-screen bg-gray-50 dark:bg-gray-950 p-4">
      {/* HITL approvals banner (Excel Agentes IA #10 — TD-025) — autónomo, se renderiza
          solo cuando hay pendientes. Polling interno cada 5s. */}
      <HITLApprovalsBanner />

      {/* Offline banner */}
      {isOffline && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-400 text-sm">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>Sin conexion a internet. Los datos mostrados pueden estar desactualizados.</span>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error} Los analisis se ejecutan con datos parciales disponibles.</span>
        </div>
      )}

      {/* Tabs with badges and scroll arrows on mobile */}
      <div className="relative">
        {/* Left scroll arrow (mobile) */}
        <button
          onClick={() => tabBarRef.current?.scrollBy({ left: -120, behavior: "smooth" })}
          className="absolute left-0 top-0 bottom-0 z-10 flex items-center px-1 bg-gradient-to-r from-white dark:from-gray-900 to-transparent sm:hidden"
          aria-label="Scroll tabs left"
        >
          <ChevronLeft className="w-4 h-4 text-gray-400" />
        </button>
        <div
          ref={tabBarRef}
          className="flex items-center gap-1 p-1 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto scrollbar-hide"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const badge = tabBadges[tab.id];
            return (
              <button
                key={tab.id}
                onClick={() => changeTab(tab.id)}
                {...(isActive ? { "data-active-tab": true } : {})}
                className={cn(
                  "relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                  isActive
                    ? "bg-[#00B4A6] text-white shadow-sm"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                )}
                title={tab.shortcut}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {badge != null && badge > 0 && (
                  <span className={cn(
                    "absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1",
                    isActive
                      ? "bg-white text-[#00B4A6]"
                      : "bg-red-500 text-white"
                  )}>
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {/* Right scroll arrow (mobile) */}
        <button
          onClick={() => tabBarRef.current?.scrollBy({ left: 120, behavior: "smooth" })}
          className="absolute right-0 top-0 bottom-0 z-10 flex items-center px-1 bg-gradient-to-l from-white dark:from-gray-900 to-transparent sm:hidden"
          aria-label="Scroll tabs right"
        >
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1">
        {loading && !data ? (
          <LoadingSkeleton />
        ) : !data ? (
          <div className="text-center py-12 text-gray-400">No se pudieron cargar los datos. Intenta recargar.</div>
        ) : (
          <Suspense fallback={<LoadingSkeleton />}>
            {activeTab === "briefing" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <AIDailyBriefing data={data} />
                </div>
                <div className="flex flex-col gap-4">
                  <AIRiskRadar data={data} compact />
                  <AIOpportunityFinder data={data} compact />
                </div>
              </div>
            )}
            {activeTab === "plan" && (
              <div className="space-y-4">
                <DailyChecklist />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    <AIActionPlan data={data} />
                  </div>
                  <div>
                    <AINaturalQueryEngine data={data} />
                  </div>
                </div>
              </div>
            )}
            {activeTab === "diagnostico" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <AIBusinessHealthScore data={data} />
                <div className="flex flex-col gap-4">
                  <AIRiskRadar data={data} />
                  <AIOpportunityFinder data={data} />
                </div>
              </div>
            )}
            {activeTab === "coach" && (
              <div className="grid grid-cols-1 gap-4">
                <AIPerformanceCoach data={data} />
                <AIWeeklyReport data={data} />
              </div>
            )}
            {activeTab === "simulador" && (
              <div className="space-y-4">
                <AIWhatIfSimulator data={data} />
                <BusinessCalculators />
              </div>
            )}
            {activeTab === "fiado" && (
              <AIFiadoDashboard />
            )}
            {activeTab === "decisiones" && (
              <AIDecisionLog />
            )}
            {activeTab === "mercado" && (
              <AIMarketResearch data={data} />
            )}
            {activeTab === "asesor" && (
              <AIStrategicAdvisor data={data} />
            )}
            {activeTab === "precios" && (
              <AISmartPricing data={data} />
            )}
          </Suspense>
        )}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className={cn(
            "h-64 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse",
            i === 1 && "lg:col-span-2"
          )}
        />
      ))}
    </div>
  );
}