"use client";

import { CardTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import { BarChart3, TrendingUp, Users, Award } from "@buleje/design-system/icons";
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
  bronce: "bg-[var(--data-warning-500)]",
  plata: "bg-slate-400",
  oro: "bg-[var(--data-warning-500)]",
  diamante: "bg-[var(--data-info-500)]",
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
      <div className="text-center py-12 text-[var(--text-tertiary)]">
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
      color: "text-[var(--data-warning-500)]",
    },
    {
      label: "Emitidos (30 días)",
      value: `+${summary.pointsIssuedLast30d.toLocaleString("es-PE")}`,
      sub: `${summary.earnTransactions} transacciones`,
      icon: TrendingUp,
      color: "text-[var(--data-success-500)]",
    },
    {
      label: "Canjeados (30 días)",
      value: summary.pointsRedeemedLast30d.toLocaleString("es-PE"),
      sub: `Tasa canje: ${redemptionRate}%`,
      icon: BarChart3,
      color: "text-[var(--data-info-500)]",
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
              <span className="text-[length:var(--ts-2xs)] sm:text-xs text-[var(--text-secondary)] font-medium">
                {k.label}
              </span>
            </div>
            <p className={cn("text-xl sm:text-2xl font-extrabold", k.color)}>{k.value}</p>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Tier distribution */}
      <div className="rounded-xl border border-[var(--rule-soft)] dark:border-card-border bg-white dark:bg-card p-5">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground mb-4">
          Distribución por nivel
        </CardTitle>
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
                  <span className="font-semibold text-[var(--text-primary)] dark:text-foreground capitalize">
                    {tier}
                  </span>
                  <span className="text-[var(--text-secondary)]">
                    {count} clientes · {points.toLocaleString("es-PE")} pts
                  </span>
                </div>
                <div className="h-3 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
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
        <CardTitle className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground mb-4">
          Top 10 clientes con más puntos
        </CardTitle>
        {topCustomers.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)] text-center py-6">
            Aún no hay clientes con puntos
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--rule-soft)] text-left text-xs text-[var(--text-secondary)]">
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
                    <td className="py-2 pr-3 font-bold text-[var(--text-tertiary)]">{i + 1}</td>
                    <td className="py-2 pr-3">
                      <p className="font-semibold text-[var(--text-primary)] dark:text-foreground text-xs">
                        {c.name ?? "Sin nombre"}
                      </p>
                      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{c.phone}</p>
                    </td>
                    <td className="py-2 pr-3 text-center">
                      <span className="text-xs">
                        {c.tier ?? "bronce"}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right font-bold text-primary">
                      {c.points.toLocaleString("es-PE")}
                    </td>
                    <td className="py-2 text-right text-xs text-[var(--text-secondary)]">
                      S/{Number(c.totalSpent).toFixed(2)}
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
