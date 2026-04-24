"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";
import {
  BarChart3, ClipboardList, CreditCard, LineChart, AlertCircle, WifiOff,
  Maximize2, Minimize2, RefreshCw,
} from "@buleje/design-system/icons";
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
  { id: "analisis", label: "Análisis", icon: LineChart },
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
  const [maximized, setMaximized] = useState(false);
  const [, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const badges = useSectionBadges(data);

  const changeSection = useCallback((id: SectionId) => {
    setActiveSection(id);
    try { localStorage.setItem(STORAGE_KEY, id); } catch { /* noop */ }
  }, []);

  // Keyboard shortcuts: Alt+1..4 y Esc para salir de maximize
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key >= "1" && e.key <= "4") {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        if (SECTIONS[idx]) changeSection(SECTIONS[idx].id);
      } else if (e.key === "Escape" && maximized) {
        setMaximized(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [changeSection, maximized]);

  // Body scroll lock mientras maximizado
  useEffect(() => {
    if (!maximized) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [maximized]);

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
    <div
      className={cn(
        "flex flex-col bg-white dark:bg-card overflow-hidden",
        maximized
          ? "fixed inset-0 z-[9999]"
          : "rounded-xl border border-[var(--rule-base)] min-h-[600px]",
      )}
    >
      {/* ── Toolbar superior: tabs horizontales + acciones ──────────── */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)] shrink-0">
        <nav className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const isActive = activeSection === s.id;
            const badge = badges[s.id];
            return (
              <button
                key={s.id}
                onClick={() => changeSection(s.id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap",
                  isActive
                    ? "bg-[var(--text-primary)] text-white"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]",
                )}
                title={`${s.label} (Alt+${SECTIONS.indexOf(s) + 1})`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{s.label}</span>
                {badge != null && badge > 0 && (
                  <span
                    className={cn(
                      "text-[10px] font-extrabold rounded-full px-1.5 py-0.5 min-w-[20px] text-center",
                      isActive
                        ? "bg-white/25 text-white"
                        : "bg-[var(--data-error)] text-white",
                    )}
                  >
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)] px-2 py-1">
            <RefreshCw className="h-3 w-3" />
            {lastRefresh ? getRelativeTime(lastRefresh) : "Cargando…"}
          </span>
          <button
            type="button"
            onClick={() => setMaximized((m) => !m)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--rule-soft)] text-xs font-semibold text-[var(--text-secondary)] hover:border-[var(--rule-base)] hover:text-[var(--text-primary)] transition-colors"
            aria-label={maximized ? "Salir pantalla completa" : "Pantalla completa"}
            title={maximized ? "Volver al panel (Esc)" : "Pantalla completa"}
          >
            {maximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{maximized ? "Salir" : "Maximizar"}</span>
          </button>
        </div>
      </div>

      {/* ── Banners (approvals, offline, error) ─────────────────────── */}
      <HITLApprovalsBanner />

      {isOffline && (
        <div className="flex items-center gap-2 px-5 py-2.5 bg-[var(--data-warning-50)] dark:bg-amber-950/30 border-b border-[var(--data-warning)] dark:border-[var(--data-warning)]/40 text-[var(--data-warning)] dark:text-[var(--data-warning)] text-sm font-semibold">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>Sin conexión. Los datos pueden estar desactualizados.</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-5 py-2.5 bg-[var(--data-error-50)] dark:bg-red-950/30 border-b border-[var(--data-error)] dark:border-[var(--data-error)]/40 text-[var(--data-error)] dark:text-[var(--data-error)] text-sm font-semibold">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Content area ──────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto">
        <div className="p-5 sm:p-6">
          {loading && !data ? (
            <LoadingSkeleton />
          ) : !data ? (
            <div className="text-center py-16 text-[var(--text-tertiary)] text-sm">
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
        <div key={i} className="h-32 rounded-lg bg-[var(--surface-sunken)] animate-pulse" />
      ))}
    </div>
  );
}
