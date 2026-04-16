"use client";

import type { VendorKPIs } from "./vendor-dashboard.types";
import { TrendingUp, TrendingDown, Minus, ShoppingBag, AlertTriangle, Package } from "lucide-react";

type Props = {
  kpis: VendorKPIs;
};

function formatSoles(value: number): string {
  return `S/ ${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function TrendBadge({ today, reference, label }: { today: number; reference: number; label: string }) {
  if (reference === 0) return null;
  const pct = ((today - reference) / reference) * 100;
  const up = pct >= 0;
  const Icon = pct === 0 ? Minus : up ? TrendingUp : TrendingDown;
  const color = pct === 0
    ? "text-gray-500 bg-gray-100 dark:bg-gray-800"
    : up
      ? "text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400"
      : "text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400";

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>
      <Icon className="h-3 w-3" />
      {Math.abs(pct).toFixed(0)}% vs {label}
    </span>
  );
}

function PendingBadge({ count }: { count: number }) {
  const color =
    count === 0
      ? "text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20"
      : count <= 3
        ? "text-yellow-700 bg-yellow-50 dark:bg-yellow-900/20"
        : "text-red-600 bg-red-50 dark:bg-red-900/20";

  return (
    <span className={`inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>
      {count === 0 ? "Al día" : count <= 3 ? "Atender pronto" : "Urgente"}
    </span>
  );
}

export function VendorKPICards({ kpis }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {/* Ventas hoy */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-4  flex flex-col gap-2">
        <div className="flex items-center gap-2 text-gray-500 dark:text-muted text-xs font-medium">
          <ShoppingBag className="h-4 w-4 text-[#00B4A6]" />
          Ventas hoy
        </div>
        <p className="text-2xl font-extrabold text-gray-900 dark:text-foreground leading-none">
          {formatSoles(kpis.salesToday)}
        </p>
        <div className="flex flex-col gap-1">
          <TrendBadge today={kpis.salesToday} reference={kpis.salesYesterday} label="ayer" />
          <TrendBadge today={kpis.salesToday} reference={kpis.salesLastWeek} label="sem. pasada" />
        </div>
      </div>

      {/* Pedidos pendientes */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-4  flex flex-col gap-2">
        <div className="flex items-center gap-2 text-gray-500 dark:text-muted text-xs font-medium">
          <Package className="h-4 w-4 text-[#f97316]" />
          Sin atender
        </div>
        <p className="text-2xl font-extrabold text-gray-900 dark:text-foreground leading-none">
          {kpis.pendingOrdersCount}
        </p>
        <PendingBadge count={kpis.pendingOrdersCount} />
      </div>

      {/* Stock bajo */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-4  flex flex-col gap-2">
        <div className="flex items-center gap-2 text-gray-500 dark:text-muted text-xs font-medium">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          Stock bajo
        </div>
        <p className="text-2xl font-extrabold text-gray-900 dark:text-foreground leading-none">
          {kpis.lowStockCount}
        </p>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full w-fit ${
          kpis.lowStockCount === 0
            ? "text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20"
            : "text-yellow-700 bg-yellow-50 dark:bg-yellow-900/20"
        }`}>
          {kpis.lowStockCount === 0 ? "Todo OK" : "Reponer pronto"}
        </span>
      </div>

      {/* Ingreso ayer */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-4  flex flex-col gap-2">
        <div className="flex items-center gap-2 text-gray-500 dark:text-muted text-xs font-medium">
          <TrendingUp className="h-4 w-4 text-[#00B4A6]" />
          Ayer
        </div>
        <p className="text-2xl font-extrabold text-gray-900 dark:text-foreground leading-none">
          {formatSoles(kpis.salesYesterday)}
        </p>
        <span className="text-xs text-gray-400 dark:text-muted">ventas del día anterior</span>
      </div>
    </div>
  );
}
