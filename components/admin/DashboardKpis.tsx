"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { Loader2, TrendingUp, ShoppingCart, AlertTriangle, Wallet, ShoppingBag } from "lucide-react";

/**
 * components/admin/DashboardKpis.tsx
 *
 * Thin client widget that fetches `/api/admin/dashboard/aggregates` and
 * renders four KPI cards. All math is server-side — this component NEVER
 * computes totals from raw rows (rule #6 in CLAUDE.md).
 *
 * The backend returns a pre-aggregated payload (< 2 KB). We `safeParse` it
 * with Zod (rule #2) and render the four numbers. On any parse or network
 * failure we fall back to the "unavailable" state without crashing the tab.
 */

// ── Zod schema ───────────────────────────────────────────────────────────────

const DashboardAggregatesSchema = z.object({
  tenantId: z.string(),
  today: z.object({
    salesCount: z.number(),
    revenue: z.number(),
  }),
  week: z.object({
    salesCount: z.number(),
    revenue: z.number(),
  }),
  activeCarts: z.number(),
  lowStockCount: z.number(),
  abandonedCarts: z.object({
    count: z.number(),
    estimatedValue: z.number(),
  }),
  generatedAt: z.string(),
});

type DashboardAggregates = z.infer<typeof DashboardAggregatesSchema>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return `S/ ${value.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export function DashboardKpis() {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; data: DashboardAggregates }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/admin/dashboard/aggregates", {
          credentials: "include",
        });
        if (!res.ok) {
          if (!cancelled) {
            setState({
              kind: "error",
              message: `HTTP ${res.status}`,
            });
          }
          return;
        }
        const json = await res.json();
        const parsed = DashboardAggregatesSchema.safeParse(json);
        if (!parsed.success) {
          if (!cancelled) {
            setState({
              kind: "error",
              message: "Invalid response shape",
            });
          }
          return;
        }
        if (!cancelled) setState({ kind: "ready", data: parsed.data });
      } catch (e) {
        if (!cancelled) {
          setState({
            kind: "error",
            message: (e as Error).message,
          });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "loading") {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
        Dashboard KPIs unavailable: {state.message}
      </div>
    );
  }

  const { data } = state;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <KpiCard
        label="Ventas hoy"
        value={formatCurrency(data.today.revenue)}
        sub={`${data.today.salesCount} pedidos`}
        icon={<TrendingUp className="h-5 w-5" />}
      />
      <KpiCard
        label="Ingresos 7d"
        value={formatCurrency(data.week.revenue)}
        sub={`${data.week.salesCount} pedidos`}
        icon={<Wallet className="h-5 w-5" />}
      />
      <KpiCard
        label="Carritos activos"
        value={data.activeCarts.toString()}
        sub="pedidos en curso"
        icon={<ShoppingCart className="h-5 w-5" />}
      />
      <KpiCard
        label="Carritos abandonados"
        value={data.abandonedCarts.count.toString()}
        sub={`${formatCurrency(data.abandonedCarts.estimatedValue)} en ventas por recuperar`}
        icon={<ShoppingBag className="h-5 w-5" />}
        danger={data.abandonedCarts.count > 0}
      />
      <KpiCard
        label="Bajo stock"
        value={data.lowStockCount.toString()}
        sub="productos bajo mínimo"
        icon={<AlertTriangle className="h-5 w-5" />}
        danger={data.lowStockCount > 0}
      />
    </div>
  );
}

// ── Sub-component ────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  danger?: boolean;
}

function KpiCard({ label, value, sub, icon, danger }: KpiCardProps) {
  return (
    <div
      className={
        "rounded-lg border bg-white p-4  dark:bg-card " +
        (danger
          ? "border-amber-300 dark:border-amber-700"
          : "border-gray-200 dark:border-gray-800")
      }
    >
      <div className="flex items-center justify-between text-gray-500 dark:text-gray-400">
        <span className="text-sm font-medium">{label}</span>
        {icon}
      </div>
      <div className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-50">
        {value}
      </div>
      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sub}</div>
    </div>
  );
}
