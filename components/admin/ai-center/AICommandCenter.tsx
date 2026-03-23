"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Brain, RefreshCw, ClipboardList, Stethoscope, GraduationCap,
  FlaskConical, Newspaper, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import AIDailyBriefing from "./AIDailyBriefing";
import AIActionPlan from "./AIActionPlan";
import AIBusinessHealthScore from "./AIBusinessHealthScore";
import AIPerformanceCoach from "./AIPerformanceCoach";
import AIWhatIfSimulator from "./AIWhatIfSimulator";
import AIRiskRadar from "./AIRiskRadar";
import AIOpportunityFinder from "./AIOpportunityFinder";
import AINaturalQueryEngine from "./AINaturalQueryEngine";
import AIWeeklyReport from "./AIWeeklyReport";

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

type TabId = "briefing" | "plan" | "diagnostico" | "coach" | "simulador";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "briefing", label: "Briefing", icon: Newspaper },
  { id: "plan", label: "Plan", icon: ClipboardList },
  { id: "diagnostico", label: "Diagnostico", icon: Stethoscope },
  { id: "coach", label: "Coach", icon: GraduationCap },
  { id: "simulador", label: "Simulador", icon: FlaskConical },
];

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 min

// ── Main Component ─────────────────────────────────────────────────────────────

export default function AICommandCenter() {
  const [activeTab, setActiveTab] = useState<TabId>("briefing");
  const [data, setData] = useState<BusinessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      console.error("[AICommandCenter] fetch error:", e);
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

  const handleRefresh = () => {
    setLoading(true);
    fetchData();
  };

  return (
    <div className="flex flex-col gap-4 w-full min-h-screen bg-gray-50 dark:bg-gray-950 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#2d6a4f] text-white shadow-md">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50 tracking-tight">
              Centro de Comando IA
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Consultor de negocio — analisis local en tiempo real
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">
              Actualizado {lastRefresh.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
              "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700",
              "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700",
              loading && "opacity-50 cursor-not-allowed"
            )}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            {loading ? "Cargando..." : "Actualizar"}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error} Los analisis se ejecutan con datos parciales disponibles.</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                isActive
                  ? "bg-[#2d6a4f] text-white shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1">
        {loading && !data ? (
          <LoadingSkeleton />
        ) : (
          <>
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
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <AIActionPlan data={data} />
                </div>
                <div>
                  <AINaturalQueryEngine data={data} />
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
              <AIWhatIfSimulator data={data} />
            )}
          </>
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
