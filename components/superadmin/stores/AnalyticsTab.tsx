"use client";

import { useState, useEffect, useMemo } from "react";
import { BarChart3, ShoppingBag, Users, TrendingUp } from "@buleje/design-system/icons";
import { StatCard } from "./StatCard";
import type { StoreRow, MarketplaceOrder } from "./types";

function fmt(n: number) {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);
}

const SEVEN_DAYS_AGO = Date.now() - 7 * 24 * 60 * 60 * 1000;

interface AnalyticsTabProps {
  stores: StoreRow[] | undefined;
}

export function AnalyticsTab({ stores }: AnalyticsTabProps) {
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);

  useEffect(() => {
    fetch("/api/superadmin/marketplace/orders", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { orders: [] }))
      .then((d) => setOrders(d.orders ?? []))
      .catch(() => {});
  }, []);

  const revenueByStore = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; orders: number }>();
    for (const o of orders) {
      if (o.status === "cancelado") continue;
      const existing = map.get(o.storeSlug) ?? { name: o.storeName, revenue: 0, orders: 0 };
      map.set(o.storeSlug, {
        name: o.storeName,
        revenue: existing.revenue + o.total,
        orders: existing.orders + 1,
      });
    }
    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [orders]);

  const categoryDist = useMemo(() => {
    if (!stores) return [];
    const map = new Map<string, number>();
    for (const s of stores) {
      map.set(s.category, (map.get(s.category) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => ({ category, count }));
  }, [stores]);

  const recentOrders = orders.filter((o) => new Date(o.createdAt).getTime() > SEVEN_DAYS_AGO);
  const recentRevenue = recentOrders
    .filter((o) => o.status !== "cancelado")
    .reduce((s, o) => s + o.total, 0);

  return (
    <div className="space-y-6">
      {/* Overview KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<BarChart3 className="w-5 h-5" />}
          label="Ventas últimos 7 días"
          value={fmt(recentRevenue)}
          trend="up"
          sub={`${recentOrders.length} pedidos`}
        />
        <StatCard
          icon={<ShoppingBag className="w-5 h-5" />}
          label="Tiendas activas"
          value={stores?.filter((s) => s.isPublished).length ?? 0}
          sub={`de ${stores?.length ?? 0} totales`}
        />
        <StatCard
          icon={<Users className="w-5 h-5" />}
          label="Ticket promedio"
          value={fmt(recentOrders.length ? recentRevenue / recentOrders.length : 0)}
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Tasa completados"
          value={`${
            orders.length
              ? Math.round(
                  (orders.filter((o) => o.status === "completado").length / orders.length) * 100,
                )
              : 0
          }%`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top stores by revenue */}
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Top tiendas por ingresos
          </h3>
          {revenueByStore.length === 0 ? (
            <p className="text-sm text-gray-400">Sin datos</p>
          ) : (
            <div className="space-y-3">
              {revenueByStore.map((s, i) => {
                const maxRevenue = revenueByStore[0]?.revenue || 1;
                const pct = (s.revenue / maxRevenue) * 100;
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-[var(--text-secondary)]">
                        {s.name}
                      </span>
                      <span className="text-sm font-bold text-primary tabular-nums">
                        {fmt(s.revenue)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-linear-to-r from-primary to-primary/60"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-[length:var(--ts-xs)] text-gray-400 mt-0.5">{s.orders} pedidos</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Category distribution */}
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-primary" />
            Distribución por categoría
          </h3>
          {categoryDist.length === 0 ? (
            <p className="text-sm text-gray-400">Sin datos</p>
          ) : (
            <div className="space-y-3">
              {categoryDist.map((c, i) => {
                const maxCount = categoryDist[0]?.count || 1;
                const pct = (c.count / maxCount) * 100;
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-[var(--text-secondary)] capitalize">
                        {c.category}
                      </span>
                      <span className="text-sm font-bold text-[var(--text-primary)] tabular-nums">
                        {c.count}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-linear-to-r from-secondary to-secondary/60"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
