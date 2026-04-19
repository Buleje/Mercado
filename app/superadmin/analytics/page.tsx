"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  DollarSign, CheckCircle2, Clock, TrendingUp, Package,
  AlertTriangle, XCircle, Loader2,
} from "@buleje/design-system/icons";
import type { TenantRow, CommissionRow, PlanId } from "@/lib/superadmin-types";

const RevenueCharts = dynamic(() => import("@/components/RevenueCharts"), { ssr: false });

interface AnalyticsData {
  overview: {
    totalTenants: number;
    activeTenants: number;
    payingTenants: number;
    mrr: number;
    arr: number;
    arpu: number;
  };
  growth: {
    tenantsThisMonth: number;
    tenantsLastMonth: number;
    tenantGrowthPct: number;
    ordersThisMonth: number;
    ordersLastMonth: number;
    orderGrowthPct: number;
  };
  totals: {
    totalOrders: number;
    totalProducts: number;
    totalAdminUsers: number;
  };
  planDistribution: Record<string, number>;
  atRiskCount: number;
  monthlySignups: { month: string; count: number }[];
  monthlyRevenue: { month: string; revenue: number }[];
}

const PLAN_LABELS: Record<PlanId, { label: string; color: string }> = {
  free:       { label: "Free",       color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" },
  pro:        { label: "Pro",        color: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300" },
  business:   { label: "Business",   color: "bg-[var(--surface-sunken)] text-[var(--text-primary)] dark:bg-[var(--surface-sunken)] dark:text-[var(--text-primary)]" },
  enterprise: { label: "Enterprise", color: "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-[var(--data-warning)] dark:text-[var(--data-warning)]" },
};

function PlanBadge({ plan }: { plan: PlanId }) {
  const cfg = PLAN_LABELS[plan] ?? PLAN_LABELS.free;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [commissions, setCommissions] = useState<CommissionRow[]>([]);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [commLoading, setCommLoading] = useState(true);
  const [error, setError] = useState("");

  const fmtAmount = (n: number) =>
    new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit" }) : "—";

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [analyticsRes, tenantsRes] = await Promise.all([
        fetch("/api/superadmin/analytics", { credentials: "include" }),
        fetch("/api/superadmin/tenants", { credentials: "include" }),
      ]);
      if (!analyticsRes.ok || !tenantsRes.ok) {
        setError("Error al cargar datos de analytics");
        return;
      }
      const [analyticsData, tenantsData] = await Promise.all([
        analyticsRes.json() as Promise<AnalyticsData>,
        tenantsRes.json() as Promise<{ tenants: TenantRow[] }>,
      ]);
      setAnalytics(analyticsData);
      setTenants(tenantsData.tenants);
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCommissions = useCallback(async () => {
    setCommLoading(true);
    try {
      const res = await fetch("/api/superadmin/commissions?limit=20", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json() as { commissions: CommissionRow[] };
      setCommissions(data.commissions ?? []);
    } finally {
      setCommLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    void loadCommissions();
  }, [loadData, loadCommissions]);

  const commThisMonth = commissions.filter((c) => c.status !== "paid").reduce((s, c) => s + c.amount, 0);
  const commPaid = commissions.filter((c) => c.status === "paid").reduce((s, c) => s + c.amount, 0);
  const commPending = commissions.filter((c) => c.status === "pending").reduce((s, c) => s + c.amount, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mr-3" /> Cargando analytics…
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4 text-gray-400">
        <p className="text-[var(--data-error)]">{error || "Error desconocido"}</p>
        <button
          type="button"
          onClick={() => void loadData()}
          className="px-4 py-2 rounded-xl bg-teal-600 text-white text-sm hover:bg-teal-700 transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Analytics de plataforma</h1>
        <p className="text-gray-500 text-sm mt-1">Métricas globales de todos los tenants.</p>
      </div>

      {/* Growth metrics — Ola 3: removido border-top gradient semaforo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: "Nuevos tenants (mes)",
            value: analytics.growth.tenantsThisMonth,
            sub: `${analytics.growth.tenantGrowthPct > 0 ? "+" : ""}${analytics.growth.tenantGrowthPct}% vs mes anterior`,
          },
          {
            label: "Pedidos este mes",
            value: analytics.growth.ordersThisMonth,
            sub: `${analytics.growth.orderGrowthPct > 0 ? "+" : ""}${analytics.growth.orderGrowthPct}% vs mes anterior`,
          },
          {
            label: "MRR",
            value: fmtAmount(analytics.overview.mrr),
            sub: `ARR: ${fmtAmount(analytics.overview.arr)}`,
          },
          {
            label: "Tiendas en riesgo",
            value: analytics.atRiskCount,
            sub: "Cancelando o trial vencido",
          },
        ].map(({ label, value, sub }) => (
          <div
            key={label}
            className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-5"
          >
            <div className="text-[var(--text-tertiary)] text-xs mb-2">{label}</div>
            <div className="text-2xl font-bold text-[var(--text-primary)]">{value}</div>
            <div className="text-[var(--text-tertiary)] text-xs mt-1">{sub}</div>
          </div>
        ))}
      </div>

      {/* Revenue charts */}
      <RevenueCharts />

      {/* Plan distribution */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-6 shadow-sm dark:shadow-none">
        <h3 className="text-base font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-[var(--text-secondary)]" /> Distribución por plan
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {(["free", "pro", "business", "enterprise"] as PlanId[]).map((plan) => (
            <div key={plan} className="bg-[var(--surface-sunken)]/50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-[var(--text-primary)]">
                {analytics.planDistribution[plan] ?? 0}
              </div>
              <div className="mt-1.5">
                <PlanBadge plan={plan} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Comisiones */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-[var(--text-secondary)]" /> Comisiones
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              label: "Comisiones del mes",
              value: commThisMonth,
              sub: "No liquidadas aún",
              icon: <DollarSign className="w-3.5 h-3.5 text-[var(--text-secondary)]" />,
            },
            {
              label: "Comisiones pagadas",
              value: commPaid,
              sub: "Status: paid",
              icon: <CheckCircle2 className="w-3.5 h-3.5 text-[var(--text-secondary)]" />,
            },
            {
              label: "Pendiente de liquidar",
              value: commPending,
              sub: "Status: pending",
              icon: <Clock className="w-3.5 h-3.5 text-[var(--text-secondary)]" />,
            },
          ].map(({ label, value, sub, icon }) => (
            <div
              key={label}
              className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-5"
            >
              <div className="text-[var(--text-tertiary)] text-xs mb-2 flex items-center gap-1.5">
                {icon} {label}
              </div>
              {commLoading ? (
                <div className="h-8 w-24 bg-[var(--surface-sunken)] animate-pulse rounded" />
              ) : (
                <div className="text-2xl font-bold text-[var(--text-primary)] font-mono">
                  {fmtAmount(value)}
                </div>
              )}
              <div className="text-[var(--text-tertiary)] text-xs mt-1">{sub}</div>
            </div>
          ))}
        </div>

        {/* Tabla comisiones recientes */}
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl overflow-hidden shadow-sm dark:shadow-none">
          <div className="px-5 py-4 border-b border-[var(--rule-base)] flex items-center justify-between">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Comisiones recientes</span>
            <span className="text-xs text-gray-400">Últimas 20</span>
          </div>
          {commLoading ? (
            <div className="flex items-center justify-center gap-3 py-12 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" /> Cargando…
            </div>
          ) : commissions.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">Sin registros de comisiones</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--rule-base)] text-gray-400 text-xs uppercase tracking-wider">
                    <th className="text-left px-5 py-3">Orden</th>
                    <th className="text-left px-4 py-3">Tienda</th>
                    <th className="text-left px-4 py-3">Tipo</th>
                    <th className="text-right px-4 py-3">Monto</th>
                    <th className="text-right px-4 py-3">Tasa</th>
                    <th className="text-left px-4 py-3">Estado</th>
                    <th className="text-left px-4 py-3">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
                  {commissions.map((c) => (
                    <tr key={c.id} className="hover:bg-teal-50 dark:hover:bg-teal-950/20 transition-colors">
                      <td className="px-5 py-3 text-xs font-mono text-gray-400 truncate max-w-32">{c.orderId}</td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-400">{c.storeId ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">{c.type}</td>
                      <td className="px-4 py-3 text-right font-semibold text-[var(--text-primary)] font-mono">
                        {fmtAmount(c.amount)}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-400">
                        {(c.rate * 100).toFixed(1)}%
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            c.status === "paid"
                              ? "bg-[var(--data-success-100)] dark:bg-[var(--data-success)] text-[var(--data-success)] dark:text-[var(--data-success)]"
                              : c.status === "pending"
                                ? "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning)] text-[var(--data-warning)] dark:text-[var(--data-warning)]"
                                : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(c.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Resumen de uso agregado */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-6 shadow-sm dark:shadow-none">
        <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
          <Package className="w-5 h-5 text-[var(--text-secondary)]" /> Resumen de uso agregado
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              value: tenants.reduce((s, t) => s + (t.usage?.products ?? 0), 0),
              label: "Productos activos total",
            },
            {
              value: tenants.reduce((s, t) => s + (t.usage?.users ?? 0), 0),
              label: "Usuarios admin total",
            },
            {
              value: tenants.reduce((s, t) => s + (t.usage?.ordersThisMonth ?? 0), 0),
              label: "Pedidos este mes (total)",
            },
          ].map(({ value, label }) => (
            <div key={label} className="bg-[var(--surface-sunken)]/50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-[var(--text-primary)]">
                {value.toLocaleString("es-PE")}
              </div>
              <div className="text-gray-400 text-xs mt-1">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Top tenants por actividad */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-6 shadow-sm dark:shadow-none">
        <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-[var(--text-secondary)]" /> Top tiendas por actividad
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--rule-base)] text-gray-400 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3">#</th>
                <th className="text-left px-4 py-3">Tienda</th>
                <th className="text-left px-4 py-3">Plan</th>
                <th className="text-right px-4 py-3">Pedidos/mes</th>
                <th className="text-right px-4 py-3">Productos</th>
                <th className="text-right px-4 py-3">Usuarios</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
              {[...tenants]
                .sort((a, b) => (b.usage?.ordersThisMonth ?? 0) - (a.usage?.ordersThisMonth ?? 0))
                .slice(0, 10)
                .map((t, i) => (
                  <tr key={t.id} className="hover:bg-teal-50 dark:hover:bg-teal-950/20 transition-colors">
                    <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[var(--text-primary)]">{t.name}</div>
                      <div className="text-gray-400 text-xs font-mono">{t.slug}</div>
                    </td>
                    <td className="px-4 py-3">
                      <PlanBadge plan={t.plan} />
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-[var(--text-primary)]">
                      {t.usage?.ordersThisMonth ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">{t.usage?.products ?? 0}</td>
                    <td className="px-4 py-3 text-right text-gray-400">{t.usage?.users ?? 0}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tiendas en riesgo */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-6 shadow-sm dark:shadow-none">
        <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-[var(--data-warning)]" /> Tiendas en riesgo
        </h3>
        <p className="text-gray-400 text-xs mb-4">
          Tiendas que cancelarán pronto, tienen trial vencido, o están suspendidas
        </p>
        <div className="space-y-2">
          {tenants
            .filter(
              (t) =>
                t.cancelAtPeriodEnd ||
                !t.active ||
                (t.trialEndsAt && new Date(t.trialEndsAt) < new Date()),
            )
            .map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between bg-[var(--surface-sunken)]/50 rounded-xl px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div>
                    <span className="text-[var(--text-primary)] font-semibold text-sm">{t.name}</span>
                    <span className="text-gray-400 text-xs ml-2 font-mono">{t.slug}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <PlanBadge plan={t.plan} />
                  {t.cancelAtPeriodEnd && (
                    <span className="text-[var(--data-warning)] dark:text-[var(--data-warning)] text-xs flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Cancela pronto
                    </span>
                  )}
                  {!t.active && (
                    <span className="text-[var(--data-error)] dark:text-[var(--data-error)] text-xs flex items-center gap-1">
                      <XCircle className="w-3 h-3" /> Suspendida
                    </span>
                  )}
                </div>
              </div>
            ))}
          {tenants.filter(
            (t) =>
              t.cancelAtPeriodEnd ||
              !t.active ||
              (t.trialEndsAt && new Date(t.trialEndsAt) < new Date()),
          ).length === 0 && (
            <p className="text-gray-400 text-sm text-center py-6">No hay tiendas en riesgo</p>
          )}
        </div>
      </div>
    </div>
  );
}
