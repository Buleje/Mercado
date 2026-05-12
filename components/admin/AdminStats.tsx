"use client";

import { ShoppingCart, TrendingUp, AlertTriangle, HandCoins } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { Tab } from "./admin-types";

export type QuickStatsData = {
  pendingOrders: number;
  todayRevenue: number;
  lowStockProducts: number;
  overduePayables?: number;
  oldPendingOrders?: number;
};

interface AdminStatsProps {
  quickStats: QuickStatsData;
  navigateTab: (id: Tab) => void;
}

/** Mobile quick stats strip (horizontal scroll) */
export function AdminStatsMobile({ quickStats, navigateTab }: AdminStatsProps) {
  return (
    <div className="sm:hidden flex items-center gap-1 px-2.5 py-1.5 bg-[var(--surface-raised)] border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] overflow-x-auto scrollbar-none text-[length:var(--ts-xs)]">
      <button
        onClick={() => navigateTab("pedidos")}
        className={cn(
          "flex items-center gap-1 px-2 py-1 rounded-full font-semibold shrink-0 transition-colors",
          quickStats.pendingOrders > 0 ? "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
        )}
      >
        <ShoppingCart className="h-3 w-3" />
        {quickStats.pendingOrders} pend.
      </button>
      <span className="text-[var(--text-tertiary)] dark:text-card-border shrink-0">|</span>
      <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--accent-soft)] text-[var(--data-success-500)] font-semibold shrink-0">
        <TrendingUp className="h-3 w-3" />
        S/{Number(quickStats.todayRevenue).toFixed(2)}
      </span>
      {quickStats.lowStockProducts > 0 && (
        <>
          <span className="text-[var(--text-tertiary)] dark:text-card-border shrink-0">|</span>
          <button
            onClick={() => navigateTab("inventario")}
            className="flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--data-error-100)] text-[var(--data-error-500)] font-semibold shrink-0 transition-colors"
          >
            <AlertTriangle className="h-3 w-3" />
            {quickStats.lowStockProducts} bajo
          </button>
        </>
      )}
      {(quickStats.overduePayables ?? 0) > 0 && (
        <>
          <span className="text-[var(--text-tertiary)] dark:text-card-border shrink-0">|</span>
          <button
            onClick={() => navigateTab("plata" as Tab)}
            className="flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--data-warning-100)] text-[var(--data-warning-500)] font-semibold shrink-0 transition-colors"
          >
            <HandCoins className="h-3 w-3" />
            {quickStats.overduePayables} venc.
          </button>
        </>
      )}
    </div>
  );
}

/** Desktop quick stats bar */
export function AdminStatsDesktop({ quickStats, navigateTab }: AdminStatsProps) {
  return (
    <div className="hidden sm:flex items-center gap-1 px-6 py-1.5 bg-[var(--surface-raised)] border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] text-xs">
      <button
        onClick={() => navigateTab("pedidos")}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold transition-colors",
          quickStats.pendingOrders > 0
            ? "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] hover:bg-[var(--data-warning-500)]"
            : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--rule-soft)]"
        )}
      >
        <ShoppingCart className="h-4 w-4" />
        {quickStats.pendingOrders} pendiente{quickStats.pendingOrders !== 1 ? "s" : ""}
      </button>
      <span className="text-[var(--text-tertiary)] dark:text-card-border">|</span>
      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--accent-soft)] text-[var(--data-success-500)] font-semibold">
        <TrendingUp className="h-4 w-4" />
        S/{Number(quickStats.todayRevenue).toFixed(2)} hoy
      </span>
      {quickStats.lowStockProducts > 0 && (
        <>
          <span className="text-[var(--text-tertiary)] dark:text-card-border">|</span>
          <button
            onClick={() => navigateTab("inventario")}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--data-error-100)] text-[var(--data-error-500)] font-semibold hover:bg-[var(--data-error-500)] transition-colors"
          >
            <AlertTriangle className="h-4 w-4" />
            {quickStats.lowStockProducts} stock bajo
          </button>
        </>
      )}
      {(quickStats.overduePayables ?? 0) > 0 && (
        <>
          <span className="text-[var(--text-tertiary)] dark:text-card-border">|</span>
          <button
            onClick={() => navigateTab("plata" as Tab)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--data-warning-100)] text-[var(--data-warning-500)] font-semibold hover:bg-[var(--data-warning-500)] transition-colors"
          >
            <HandCoins className="h-4 w-4" />
            {quickStats.overduePayables} cuentas vencidas
          </button>
        </>
      )}
      <span className="ml-auto text-[var(--text-tertiary)] text-[length:var(--ts-2xs)]">Actualizado hace &lt;1 min</span>
    </div>
  );
}
