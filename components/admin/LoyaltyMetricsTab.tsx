"use client";

import { useState, useEffect, useCallback } from "react";
import { BarChart3, TrendingUp, Users, Award } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoyaltyMetrics {
  summary: {
    totalCustomers: number;
    activeMembers: number;
    totalPointsCirculating: number;
    pointsIssuedLast30d: number;
    pointsRedeemedLast30d: number;
    earnTransactions: number;
    redeemTransactions: number;
  };
  tierDistribution: { tier: string; customers: number; totalPoints: number }[];
  topCustomers: {
    phone: string;
    name: string | null;
    points: number;
    tier: string | null;
    totalSpent: number;
  }[];
}

const TIER_COLORS: Record<string, string> = {
  bronce: "bg-amber-500",
  plata: "bg-slate-400",
  oro: "bg-yellow-500",
  diamante: "bg-sky-500",
};

export default function LoyaltyMetricsTab() {
  const [data, setData] = useState<LoyaltyMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(() => {
    setLoading(true);
    fetch("/api/loyalty/metrics")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-gray-200 rounded-xl" />
          ))}
        </div>
        <div className="h-48 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-gray-400">
        <BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No se pudieron cargar las métricas</p>
      </div>
    );
  }

  const { summary, tierDistribution, topCustomers } = data;
  const redemptionRate =
    summary.pointsIssuedLast30d > 0
      ? Math.round((summary.pointsRedeemedLast30d / summary.pointsIssuedLast30d) * 100)
      : 0;

  const membershipRate =
    summary.totalCustomers > 0
      ? Math.round((summary.activeMembers / summary.totalCustomers) * 100)
      : 0;

  const kpis = [
    {
      label: "Miembros activos",
      value: summary.activeMembers.toLocaleString("es-PE"),
      sub: `${membershipRate}% de ${summary.totalCustomers} clientes`,
      icon: Users,
      color: "text-primary",
    },
    {
      label: "Puntos en circulación",
      value: summary.totalPointsCirculating.toLocaleString("es-PE"),
      sub: `≈ S/${Math.floor(summary.totalPointsCirculating / 50)} en valor`,
      icon: Award,
      color: "text-amber-600",
    },
    {
      label: "Emitidos (30 días)",
      value: `+${summary.pointsIssuedLast30d.toLocaleString("es-PE")}`,
      sub: `${summary.earnTransactions} transacciones`,
      icon: TrendingUp,
      color: "text-emerald-600",
    },
    {
      label: "Canjeados (30 días)",
      value: summary.pointsRedeemedLast30d.toLocaleString("es-PE"),
      sub: `Tasa canje: ${redemptionRate}%`,
      icon: BarChart3,
      color: "text-sky-600",
    },
  ];

  // Max for tier bar chart
  const maxTierCustomers = Math.max(...tierDistribution.map((t) => t.customers), 1);

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-xl border border-[var(--rule-soft)] dark:border-card-border bg-white dark:bg-card p-4 space-y-1"
          >
            <div className="flex items-center gap-2">
              <k.icon className={cn("h-4 w-4", k.color)} />
              <span className="text-[length:var(--ts-2xs)] sm:text-xs text-gray-500 font-medium">
                {k.label}
              </span>
            </div>
            <p className={cn("text-xl sm:text-2xl font-extrabold", k.color)}>{k.value}</p>
            <p className="text-[length:var(--ts-2xs)] text-gray-400">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Tier distribution */}
      <div className="rounded-xl border border-[var(--rule-soft)] dark:border-card-border bg-white dark:bg-card p-5">
        <h3 className="text-sm font-bold text-gray-900 dark:text-foreground mb-4">
          Distribución por nivel
        </h3>
        <div className="space-y-3">
          {["bronce", "plata", "oro", "diamante"].map((tier) => {
            const entry = tierDistribution.find(
              (t) => (t.tier ?? "bronce").toLowerCase() === tier,
            );
            const count = entry?.customers ?? 0;
            const points = entry?.totalPoints ?? 0;
            const pct = maxTierCustomers > 0 ? (count / maxTierCustomers) * 100 : 0;

            return (
              <div key={tier} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-gray-700 dark:text-foreground capitalize">
                    {tier}
                  </span>
                  <span className="text-gray-500">
                    {count} clientes · {points.toLocaleString("es-PE")} pts
                  </span>
                </div>
                <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-[var(--dur-slow)]", TIER_COLORS[tier])}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top customers table */}
      <div className="rounded-xl border border-[var(--rule-soft)] dark:border-card-border bg-white dark:bg-card p-5">
        <h3 className="text-sm font-bold text-gray-900 dark:text-foreground mb-4">
          Top 10 clientes con más puntos
        </h3>
        {topCustomers.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            Aún no hay clientes con puntos
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--rule-soft)] text-left text-xs text-gray-500">
                  <th className="pb-2 pr-3">#</th>
                  <th className="pb-2 pr-3">Cliente</th>
                  <th className="pb-2 pr-3 text-center">Nivel</th>
                  <th className="pb-2 pr-3 text-right">Puntos</th>
                  <th className="pb-2 text-right">Total gastado</th>
                </tr>
              </thead>
              <tbody>
                {topCustomers.map((c, i) => (
                  <tr key={c.phone} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-2 pr-3 font-bold text-gray-400">{i + 1}</td>
                    <td className="py-2 pr-3">
                      <p className="font-semibold text-gray-900 dark:text-foreground text-xs">
                        {c.name ?? "Sin nombre"}
                      </p>
                      <p className="text-[length:var(--ts-2xs)] text-gray-400">{c.phone}</p>
                    </td>
                    <td className="py-2 pr-3 text-center">
                      <span className="text-xs">
                        {c.tier ?? "bronce"}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right font-bold text-primary">
                      {c.points.toLocaleString("es-PE")}
                    </td>
                    <td className="py-2 text-right text-xs text-gray-600">
                      S/{c.totalSpent.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
