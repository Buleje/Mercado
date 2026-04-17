"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";
import {
  BarChart3, ClipboardList, CreditCard, LineChart, AlertCircle, WifiOff,
} from "lucide-react";
import * as Sentry from "@sentry/nextjs";
import { cn } from "@/lib/utils";
import type { BusinessData } from "./ai-center.types";
export type {
  Product, OrderItem, Order, SaleItem, Sale, Customer, ExpenseSummary, BusinessData,
} from "./ai-center.types";
import HITLApprovalsBanner from "./HITLApprovalsBanner";

// Lazy load sections
const ResumenSection = React.lazy(() => import("./sections/ResumenSection"));
const AccionesSection = React.lazy(() => import("./sections/AccionesSection"));
const AnalisisSection = React.lazy(() => import("./sections/AnalisisSection"));
const FiadosSection = React.lazy(() => import("./sections/FiadosSection"));

// ── Types ─────────────────────────────────────────────────────────────────────

type SectionId = "resumen" | "acciones" | "analisis" | "fiados";

type SectionDef = {
  id: SectionId;
  label: string;
  icon: React.ElementType;
};

const SECTIONS: SectionDef[] = [
  { id: "resumen", label: "Resumen", icon: BarChart3 },
  { id: "acciones", label: "Acciones", icon: ClipboardList },
  { id: "analisis", label: "Analisis", icon: LineChart },
  { id: "fiados", label: "Fiados", icon: CreditCard },
];

const REFRESH_INTERVAL = 5 * 60 * 1000;
const STORAGE_KEY = "ai-center-section-v2";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRelativeTime(date: Date): string {
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return "hace unos segundos";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `hace ${min} min`;
  const hrs = Math.floor(min / 60);
  return `hace ${hrs}h ${min % 60}min`;
}

function getStoredSection(): SectionId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SECTIONS.some(s => s.id === stored)) return stored as SectionId;
  } catch { /* noop */ }
  return "resumen";
}

// ── Badge hook ────────────────────────────────────────────────────────────────

function useSectionBadges(data: BusinessData | null) {
  return useMemo(() => {
    const badges: Partial<Record<SectionId, number>> = {};
    if (!data) return badges;

    const lowStock = data.products.filter(
      p => p.stock != null && p.stockMin != null && p.stock <= p.stockMin && p.active !== false,
    ).length;
    const pendingOrders = data.orders.filter(
      o => o.status === "pendiente" || o.status === "en_proceso",
    ).length;
    const actionCount = lowStock + pendingOrders;
    if (actionCount > 0) badges.acciones = actionCount;

    return badges;
  }, [data]);
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AICommandCenter() {
  const [activeSection, setActiveSection] = useState<SectionId>(getStoredSection);
  const [data, setData] = useState<BusinessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const badges = useSectionBadges(data);

  const changeSection = useCallback((id: SectionId) => {
    setActiveSection(id);
    try { localStorage.setItem(STORAGE_KEY, id); } catch { /* noop */ }
  }, []);

  // Keyboard shortcuts: Alt+1..4
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key >= "1" && e.key <= "4") {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        if (SECTIONS[idx]) changeSection(SECTIONS[idx].id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [changeSection]);

  // Online/offline detection
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => { setIsOffline(false); fetchData(); };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    setIsOffline(!navigator.onLine);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick every 30s for relative time
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Centralized data fetching (preserved from original)
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
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchData]);

  return (
    <div className="flex min-h-[600px] bg-white dark:bg-gray-950 rounded-xl border border-[var(--rule-base)] overflow-hidden">
      {/* ── Inline sidebar ──────────────────────────────────────────── */}
      <aside className="hidden sm:flex w-48 flex-col border-r border-[var(--rule-base)] bg-gray-50/80 dark:bg-gray-900/60 shrink-0">
        <div className="px-3 py-3.5 border-b border-[var(--rule-base)]">
          <p className="text-[length:var(--ts-xs)] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Centro IA
          </p>
        </div>

        <nav className="flex-1 py-2 px-2">
          {SECTIONS.map(s => {
            const Icon = s.icon;
            const isActive = activeSection === s.id;
            const badge = badges[s.id];
            return (
              <button
                key={s.id}
                onClick={() => changeSection(s.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[length:var(--ts-sm)] font-medium transition-all mb-0.5",
                  isActive
                    ? "bg-primary/10 text-primary dark:bg-primary/20 font-semibold border-l-[3px] border-primary"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 border-l-[3px] border-transparent",
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-gray-400")} />
                <span className="truncate flex-1 text-left">{s.label}</span>
                {badge != null && badge > 0 && (
                  <span className={cn(
                    "text-[length:var(--ts-2xs)] font-bold rounded-full px-1.5 py-0.5 min-w-5 text-center",
                    isActive ? "bg-primary/20 text-primary" : "bg-red-500 text-white",
                  )}>
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-[var(--rule-base)] px-3 py-2">
          <p className="text-[length:var(--ts-2xs)] text-gray-400 dark:text-gray-500 truncate">
            {lastRefresh ? getRelativeTime(lastRefresh) : "Cargando..."}
          </p>
        </div>
      </aside>

      {/* ── Mobile nav (visible < sm) ─────────────────────────────── */}
      <div className="sm:hidden flex items-center gap-1 p-1 border-b border-[var(--rule-base)] bg-gray-50 dark:bg-gray-900 overflow-x-auto scrollbar-hide w-full absolute top-0 left-0 z-10">
        {SECTIONS.map(s => {
          const Icon = s.icon;
          const isActive = activeSection === s.id;
          const badge = badges[s.id];
          return (
            <button
              key={s.id}
              onClick={() => changeSection(s.id)}
              className={cn(
                "relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
                isActive
                  ? "bg-primary text-white"
                  : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800",
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {s.label}
              {badge != null && badge > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[length:var(--ts-2xs)] font-bold rounded-full px-1 min-w-4 text-center">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Content area ──────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 sm:pt-0 pt-12">
        <HITLApprovalsBanner />

        {isOffline && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-400 text-sm">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>Sin conexion. Datos pueden estar desactualizados.</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex-1 p-4 overflow-auto">
          {loading && !data ? (
            <LoadingSkeleton />
          ) : !data ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              No se pudieron cargar los datos. Intenta recargar.
            </div>
          ) : (
            <Suspense fallback={<LoadingSkeleton />}>
              {activeSection === "resumen" && <ResumenSection data={data} />}
              {activeSection === "acciones" && <AccionesSection data={data} />}
              {activeSection === "analisis" && <AnalisisSection data={data} />}
              {activeSection === "fiados" && <FiadosSection />}
            </Suspense>
          )}
        </div>
      </main>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="h-32 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
      ))}
    </div>
  );
}
