"use client";

import { useState, useEffect } from "react";
import {
  ShoppingCart,
  Package,
  AlertTriangle,
  TrendingUp,
  Users,
  Clock,
  DollarSign,
  ShoppingBag,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface WidgetData {
  ventasHoy: number;
  pedidosPendientes: number;
  stockBajo: number;
  clientesNuevos: number;
}

const EMPTY_DATA: WidgetData = {
  ventasHoy: 0,
  pedidosPendientes: 0,
  stockBajo: 0,
  clientesNuevos: 0,
};

interface DashboardWidgetsProps {
  onNavigate?: (tab: string) => void;
}

/**
 * Compact widget strip for the admin dashboard.
 * Shows key metrics at a glance with click-to-navigate.
 */
export default function DashboardWidgets({ onNavigate }: DashboardWidgetsProps) {
  const [data, setData] = useState<WidgetData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch("/api/admin/dashboard");
        if (!res.ok) throw new Error("fetch failed");
        const json = await res.json();
        if (!active) return;
        setData({
          ventasHoy: json.totalSalesToday ?? json.todaySales ?? 0,
          pedidosPendientes: json.pendingOrders ?? 0,
          stockBajo: json.lowStockCount ?? json.lowStock ?? 0,
          clientesNuevos: json.newCustomersThisWeek ?? json.newCustomers ?? 0,
        });
      } catch {
        // Fallback to zeros
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  const widgets = [
    {
      label: "Ventas hoy",
      value: `S/${data.ventasHoy.toFixed(0)}`,
      icon: DollarSign,
      color: "text-[var(--data-success)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",
      tab: "analytics-pro",
    },
    {
      label: "Pedidos pendientes",
      value: String(data.pedidosPendientes),
      icon: ShoppingBag,
      color: "text-[var(--data-warning)] bg-[var(--data-warning-50)] dark:bg-orange-950/30",
      tab: "pedidos",
      alert: data.pedidosPendientes > 0,
    },
    {
      label: "Stock bajo",
      value: String(data.stockBajo),
      icon: AlertTriangle,
      color: "text-[var(--data-error)] bg-[var(--data-error-50)] dark:bg-red-950/30",
      tab: "inventario",
      alert: data.stockBajo > 0,
    },
    {
      label: "Clientes nuevos",
      value: String(data.clientesNuevos),
      icon: Users,
      color: "text-[var(--data-success)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",
      tab: "clientes",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {widgets.map((w) => {
        const Icon = w.icon;
        return (
          <button
            key={w.label}
            onClick={() => onNavigate?.(w.tab)}
            className={cn(
              "relative flex items-center gap-3 p-4 rounded-xl border transition-all text-left",
              "bg-white dark:bg-card border-[var(--rule-soft)] dark:border-card-border",
              "hover:shadow-sm hover:border-gray-200 dark:hover:border-gray-600",
              loading && "animate-pulse"
            )}
          >
            <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", w.color)}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-extrabold text-foreground leading-tight">
                {loading ? "—" : w.value}
              </p>
              <p className="text-[length:var(--ts-xs)] text-muted truncate">{w.label}</p>
            </div>
            {w.alert && !loading && (
              <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-[var(--data-error)] animate-pulse" />
            )}
          </button>
        );
      })}
    </div>
  );
}
