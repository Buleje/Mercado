"use client";

/**
 * /superadmin/analytics — Analytics global con filtro de fechas.
 *
 * Mejoras 2026-05-11:
 *  - Toolbar fija con 6 modos: Día · Semana · Mes · Año · Rango · Fecha
 *  - Period range visible en cada KPI + chart (no más "este mes" fijo)
 *  - Re-fetch al cambiar el periodo (pasa from/to a la API)
 *  - KPI cards alineados al patrón canónico
 *  - Tabla de comisiones con tokens DS + status pills consistentes
 */

import { SAMetricCard } from "@/components/superadmin/_shared/SAMetricCard";
import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  DollarSign,
  CheckCircle2,
  Clock,
  TrendingUp,
  AlertTriangle,
  XCircle,
  Loader2,
  BarChart3,
  Calendar,
  ChevronDown,
  type LucideIcon,
} from "@buleje/design-system/icons";
import type { TenantRow, CommissionRow, PlanId } from "@/lib/superadmin-types";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";
import { AdminTabShell } from "../_components/_shared";
import { ARPUMiniChart } from "@/components/superadmin/dashboard/ARPUMiniChart";
import ExecutiveAnalytics from "@/components/superadmin/analytics/ExecutiveAnalytics";
import { SuperAdminModuleTabs, ANALYTICS_TABS } from "@/components/superadmin/_shared/ModuleTabs";

const RevenueCharts = dynamic(() => import("@/components/RevenueCharts"), { ssr: false });

// ─── Types ─────────────────────────────────────────────────────────────

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

// ─── Period state ──────────────────────────────────────────────────────

type PeriodMode = "day" | "week" | "month" | "year" | "range" | "custom";

interface Period {
  mode: PeriodMode;
  from: Date;
  to: Date;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = (day + 6) % 7; // lunes = 0
  x.setDate(x.getDate() - diff);
  return x;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
}
function endOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);
}

function periodFromMode(mode: PeriodMode, anchor: Date = new Date()): Period {
  switch (mode) {
    case "day":
      return { mode, from: startOfDay(anchor), to: endOfDay(anchor) };
    case "week": {
      const from = startOfWeek(anchor);
      const to = endOfDay(new Date(from.getTime() + 6 * 86_400_000));
      return { mode, from, to };
    }
    case "month":
      return { mode, from: startOfMonth(anchor), to: endOfMonth(anchor) };
    case "year":
      return { mode, from: startOfYear(anchor), to: endOfYear(anchor) };
    case "range":
      // Default range: últimos 30 días
      return {
        mode,
        from: startOfDay(new Date(anchor.getTime() - 29 * 86_400_000)),
        to: endOfDay(anchor),
      };
    case "custom":
      return { mode, from: startOfDay(anchor), to: endOfDay(anchor) };
  }
}

function fmtISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtPeriodLabel(p: Period): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
  if (p.mode === "day" || p.mode === "custom") return fmt(p.from);
  if (p.mode === "month")
    return p.from.toLocaleDateString("es-PE", { month: "long", year: "numeric" });
  if (p.mode === "year") return p.from.getFullYear().toString();
  return `${fmt(p.from)} → ${fmt(p.to)}`;
}

function fmtPeriodShortLabel(p: Period): string {
  switch (p.mode) {
    case "day":
      return "hoy";
    case "week":
      return "esta semana";
    case "month":
      return "este mes";
    case "year":
      return "este año";
    case "range":
      return "rango personalizado";
    case "custom":
      return "fecha específica";
  }
}

// ─── Plan badge ─────────────────────────────────────────────────────────

// Labels alineados con plan-tiers.ts mayo 2026 v2.
// PlanId DB ↔ Label visible: free→Free, pro→Starter, business→Pro, enterprise→Business.
const PLAN_LABELS: Record<PlanId, { label: string; cls: string }> = {
  free: {
    label: "Free",
    cls: "bg-[var(--surface-sunken)] text-[var(--text-secondary)] border border-[var(--rule-base)]",
  },
  pro: {
    label: "Starter",
    cls: "bg-[var(--accent)]/10 text-[var(--accent)]",
  },
  business: {
    label: "Pro",
    cls: "bg-violet-100 text-[var(--accent)] dark:bg-violet-950/40 dark:text-[var(--accent)]",
  },
  enterprise: {
    label: "Business",
    cls: "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
  },
};

function PlanBadge({ plan }: { plan: PlanId }) {
  const cfg = PLAN_LABELS[plan] ?? PLAN_LABELS.free;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}

// ─── Component ─────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>(() => periodFromMode("month"));
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [commissions, setCommissions] = useState<CommissionRow[]>([]);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [commLoading, setCommLoading] = useState(true);
  const [error, setError] = useState("");
  const [arpuSeries, setArpuSeries] = useState<Array<{ month: string; arpu: number }>>([]);

  const fmtAmount = (n: number) =>
    new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

  const fmtDate = (d: string | null) =>
    d
      ? new Date(d).toLocaleDateString("es-PE", {
          day: "2-digit",
          month: "short",
          year: "2-digit",
        })
      : "—";

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = `?from=${fmtISODate(period.from)}&to=${fmtISODate(period.to)}`;
      const [analyticsRes, tenantsRes] = await Promise.all([
        fetchSuperadmin(`/api/superadmin/analytics${qs}`),
        fetchSuperadmin("/api/superadmin/tenants"),
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
  }, [period]);

  const loadCommissions = useCallback(async () => {
    setCommLoading(true);
    try {
      const qs = `?limit=20&from=${fmtISODate(period.from)}&to=${fmtISODate(period.to)}`;
      const res = await fetch(`/api/superadmin/commissions${qs}`, { credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as { commissions: CommissionRow[] };
      setCommissions(data.commissions ?? []);
    } finally {
      setCommLoading(false);
    }
  }, [period]);

  const loadArpu = useCallback(async () => {
    try {
      const res = await fetch("/api/superadmin/dashboard/widgets", { credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as { arpuSeries?: Array<{ month: string; arpu: number }> };
      setArpuSeries(data.arpuSeries ?? []);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    void loadData();
    void loadCommissions();
  }, [loadData, loadCommissions]);

  useEffect(() => {
    void loadArpu();
  }, [loadArpu]);

  const commThisPeriod = commissions
    .filter((c) => c.status !== "paid")
    .reduce((s, c) => s + c.amount, 0);
  const commPaid = commissions.filter((c) => c.status === "paid").reduce((s, c) => s + c.amount, 0);
  const commPending = commissions
    .filter((c) => c.status === "pending")
    .reduce((s, c) => s + c.amount, 0);

  const riskTenants = useMemo(
    () =>
      tenants.filter(
        (t) =>
          t.cancelAtPeriodEnd ||
          !t.active ||
          (t.trialEndsAt && new Date(t.trialEndsAt) < new Date()),
      ),
    [tenants],
  );

  return (
    <>
      <SuperAdminModuleTabs tabs={ANALYTICS_TABS} />
      <AdminTabShell
        info={{
          what: "Muestra MRR, ARR, crecimiento de tenants, pedidos, comisiones y tiendas en riesgo consolidados de toda la plataforma.",
          affects:
            "Solo visible en el superadmin. Las métricas reflejan datos reales de todos los tenants activos.",
          example:
            "Si una tienda cancela su plan, aparece en 'Tiendas en riesgo' y su MRR deja de sumarse al total del mes.",
        }}
        title="Analytics de plataforma"
        description="Métricas globales de todos los tenants — ingresos, registros, conversión, churn."
        icon={BarChart3}
        kicker="Plataforma · Analytics"
        stats={
          <>
            <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 py-2 min-w-[88px]">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
                Periodo
              </p>
              <p className="font-display text-sm font-extrabold tracking-tight mt-1 leading-none text-[var(--accent)] inline-flex items-center gap-1.5">
                <Calendar className="h-3 w-3" aria-hidden />
                {fmtPeriodShortLabel(period)}
              </p>
            </div>
            {analytics && (
              <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 py-2 min-w-[88px]">
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
                  MRR
                </p>
                <p className="font-display text-xl font-extrabold tabular-nums tracking-tight mt-1 leading-none text-[var(--text-primary)]">
                  {fmtAmount(analytics.overview.mrr)}
                </p>
              </div>
            )}
          </>
        }
      >
        {/* ─── Date filter toolbar (sticky) ──────────────────────── */}
        <PeriodToolbar period={period} onChange={setPeriod} />

        {/* Loading overlay */}
        {loading && (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-4 py-3 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
            Cargando analytics para {fmtPeriodLabel(period)}…
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-xl border border-rose-300/60 bg-rose-50/40 px-4 py-3 text-sm font-semibold text-[var(--accent)] dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-[var(--accent)]"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void loadData()}
              className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white hover:brightness-110"
            >
              Reintentar
            </button>
          </div>
        )}

        {analytics && (
          <>
            {/* ─── Growth KPIs (canonical) ─────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <SAMetricCard
                icon={TrendingUp}
                label="Nuevos tenants"
                value={analytics.growth.tenantsThisMonth}
                sub={`${analytics.growth.tenantGrowthPct > 0 ? "+" : ""}${analytics.growth.tenantGrowthPct}% vs periodo anterior`}
                tone={analytics.growth.tenantGrowthPct >= 0 ? "success" : "danger"}
                periodHint={fmtPeriodShortLabel(period)}
              />
              <SAMetricCard
                icon={CheckCircle2}
                label="Pedidos"
                value={analytics.growth.ordersThisMonth}
                sub={`${analytics.growth.orderGrowthPct > 0 ? "+" : ""}${analytics.growth.orderGrowthPct}% vs periodo anterior`}
                tone={analytics.growth.orderGrowthPct >= 0 ? "success" : "danger"}
                periodHint={fmtPeriodShortLabel(period)}
              />
              <SAMetricCard
                icon={DollarSign}
                label="MRR"
                value={fmtAmount(analytics.overview.mrr)}
                sub={`ARR: ${fmtAmount(analytics.overview.arr)}`}
                tone="accent"
              />
              <SAMetricCard
                icon={AlertTriangle}
                label="Tiendas en riesgo"
                value={analytics.atRiskCount}
                sub="Cancelando o trial vencido"
                tone={analytics.atRiskCount > 0 ? "warning" : "neutral"}
              />
            </div>

            {/* ─── Charts (revenue + signups + orders) ─────────────── */}
            <RevenueCharts
              from={fmtISODate(period.from)}
              to={fmtISODate(period.to)}
              periodLabel={fmtPeriodLabel(period)}
            />

            <ExecutiveAnalytics
              from={fmtISODate(period.from)}
              to={fmtISODate(period.to)}
              periodLabel={fmtPeriodLabel(period)}
            />

            {arpuSeries.length > 0 && (
              <ARPUMiniChart data={arpuSeries} currentARPU={analytics.overview.arpu} />
            )}

            {/* ─── Comisiones ────────────────────────────────────── */}
            <SectionHeading
              icon={DollarSign}
              title="Comisiones"
              subtitle={`Liquidaciones del marketplace · ${fmtPeriodLabel(period)}`}
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <CommissionStat
                icon={DollarSign}
                label="Comisiones del periodo"
                value={fmtAmount(commThisPeriod)}
                sub="No liquidadas aún"
                loading={commLoading}
                tone="accent"
              />
              <CommissionStat
                icon={CheckCircle2}
                label="Pagadas"
                value={fmtAmount(commPaid)}
                sub="Status: paid"
                loading={commLoading}
                tone="success"
              />
              <CommissionStat
                icon={Clock}
                label="Pendientes"
                value={fmtAmount(commPending)}
                sub="Status: pending"
                loading={commLoading}
                tone="warning"
              />
            </div>

            {/* Tabla comisiones */}
            <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
              <header className="flex items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
                <div>
                  <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
                    Comisiones recientes
                  </h3>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    Últimas 20 del periodo seleccionado
                  </p>
                </div>
                <span className="rounded-full bg-[var(--accent)]/10 px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">
                  {commissions.length}
                </span>
              </header>
              {commLoading ? (
                <div className="flex items-center justify-center gap-3 py-12 text-[var(--text-tertiary)]">
                  <Loader2 className="w-5 h-5 animate-spin" /> Cargando…
                </div>
              ) : commissions.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] mb-3">
                    <DollarSign className="h-5 w-5 text-[var(--text-tertiary)]" aria-hidden />
                  </div>
                  <p className="font-display text-sm font-extrabold text-[var(--text-primary)]">
                    Sin comisiones en el periodo
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">
                    Probá cambiar el filtro de fechas o ampliar el rango.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--rule-soft)] text-left text-[length:var(--ts-2xs)] uppercase tracking-wider text-[var(--text-tertiary)]">
                        <th className="px-5 py-3 font-extrabold">Orden</th>
                        <th className="px-4 py-3 font-extrabold">Tienda</th>
                        <th className="px-4 py-3 font-extrabold">Tipo</th>
                        <th className="px-4 py-3 font-extrabold text-right">Monto</th>
                        <th className="px-4 py-3 font-extrabold text-right">Tasa</th>
                        <th className="px-4 py-3 font-extrabold">Estado</th>
                        <th className="px-5 py-3 font-extrabold">Fecha</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--rule-soft)]">
                      {commissions.map((c) => (
                        <tr key={c.id} className="transition hover:bg-[var(--surface-sunken)]/50">
                          <td className="px-5 py-3 font-mono text-xs text-[var(--text-secondary)] truncate max-w-32">
                            {c.orderId}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-[var(--text-tertiary)]">
                            {c.storeId ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                            {c.type}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-[var(--text-primary)]">
                            {fmtAmount(c.amount)}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-[var(--text-tertiary)]">
                            {(c.rate * 100).toFixed(1)}%
                          </td>
                          <td className="px-4 py-3">
                            <CommissionStatusPill status={c.status} />
                          </td>
                          <td className="px-5 py-3 text-xs text-[var(--text-tertiary)]">
                            {fmtDate(c.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* ─── Tiendas en riesgo ──────────────────────────────── */}
            <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
              <header className="flex items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300">
                    <AlertTriangle className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  </span>
                  <div>
                    <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
                      Tiendas en riesgo
                    </h3>
                    <p className="text-xs text-[var(--text-tertiary)]">
                      Tiendas que cancelarán pronto, tienen trial vencido o están suspendidas
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-teal-700 dark:bg-teal-900/50 dark:text-teal-300">
                  {riskTenants.length}
                </span>
              </header>
              <div className="p-4">
                {riskTenants.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="font-display text-sm font-extrabold text-[var(--text-primary)]">
                      No hay tiendas en riesgo
                    </p>
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">
                      Todas las tiendas están activas y sin trial vencido.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {riskTenants.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-4 py-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="min-w-0">
                            <p className="font-bold text-sm text-[var(--text-primary)] truncate">
                              {t.name}
                            </p>
                            <p className="font-mono text-xs text-[var(--text-tertiary)]">
                              {t.slug}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap shrink-0">
                          <PlanBadge plan={t.plan} />
                          {t.cancelAtPeriodEnd && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-teal-300/60 bg-teal-50/60 px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-teal-700 dark:border-teal-700/40 dark:bg-teal-950/30 dark:text-teal-300">
                              <Clock className="h-2.5 w-2.5" />
                              Cancela
                            </span>
                          )}
                          {!t.active && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-rose-300/60 bg-rose-50/60 px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)] dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-[var(--accent)]">
                              <XCircle className="h-2.5 w-2.5" />
                              Suspendida
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </>
        )}
      </AdminTabShell>
    </>
  );
}

/* ═══════════════════════════ components ═══════════════════════════ */

function PeriodToolbar({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  const [showRange, setShowRange] = useState(false);
  const [showCustom, setShowCustom] = useState(false);

  const MODES: Array<{ key: PeriodMode; label: string }> = [
    { key: "day", label: "Día" },
    { key: "week", label: "Semana" },
    { key: "month", label: "Mes" },
    { key: "year", label: "Año" },
    { key: "range", label: "Rango" },
    { key: "custom", label: "Fecha" },
  ];

  const handleModeChange = (mode: PeriodMode) => {
    if (mode === "range") {
      setShowRange(true);
      setShowCustom(false);
      onChange(periodFromMode("range"));
      return;
    }
    if (mode === "custom") {
      setShowCustom(true);
      setShowRange(false);
      onChange(periodFromMode("custom"));
      return;
    }
    setShowRange(false);
    setShowCustom(false);
    onChange(periodFromMode(mode));
  };

  const shiftAnchor = (delta: number) => {
    const anchor = new Date(period.from);
    if (period.mode === "day") anchor.setDate(anchor.getDate() + delta);
    else if (period.mode === "week") anchor.setDate(anchor.getDate() + delta * 7);
    else if (period.mode === "month") anchor.setMonth(anchor.getMonth() + delta);
    else if (period.mode === "year") anchor.setFullYear(anchor.getFullYear() + delta);
    onChange(periodFromMode(period.mode, anchor));
  };

  return (
    <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Mode tabs */}
        <div className="flex gap-1 rounded-xl bg-[var(--surface-sunken)] p-1 overflow-x-auto">
          {MODES.map((m) => {
            const isActive = period.mode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => handleModeChange(m.key)}
                className={`inline-flex shrink-0 items-center rounded-lg px-3.5 py-1.5 text-sm font-bold transition ${
                  isActive
                    ? "bg-[var(--surface-raised)] text-[var(--accent)] shadow-sm"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Period label + navigation */}
        <div className="flex items-center gap-2">
          {(period.mode === "day" ||
            period.mode === "week" ||
            period.mode === "month" ||
            period.mode === "year") && (
            <>
              <button
                type="button"
                onClick={() => shiftAnchor(-1)}
                aria-label="Periodo anterior"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-canvas)] text-[var(--text-tertiary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
              >
                ‹
              </button>
              <span className="inline-flex h-9 items-center rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] capitalize">
                {fmtPeriodLabel(period)}
              </span>
              <button
                type="button"
                onClick={() => shiftAnchor(1)}
                aria-label="Periodo siguiente"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-canvas)] text-[var(--text-tertiary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
              >
                ›
              </button>
            </>
          )}

          {period.mode === "range" && showRange && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={fmtISODate(period.from)}
                onChange={(e) => {
                  const from = startOfDay(new Date(e.target.value + "T12:00:00"));
                  onChange({ ...period, from });
                }}
                className="h-9 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-2.5 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
              <span className="text-[var(--text-tertiary)] text-xs">→</span>
              <input
                type="date"
                value={fmtISODate(period.to)}
                onChange={(e) => {
                  const to = endOfDay(new Date(e.target.value + "T12:00:00"));
                  onChange({ ...period, to });
                }}
                className="h-9 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-2.5 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
            </div>
          )}

          {period.mode === "custom" && showCustom && (
            <input
              type="date"
              value={fmtISODate(period.from)}
              onChange={(e) => {
                const d = new Date(e.target.value + "T12:00:00");
                onChange({ mode: "custom", from: startOfDay(d), to: endOfDay(d) });
              }}
              className="h-9 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          )}

          {/* Reset to today */}
          <button
            type="button"
            onClick={() => onChange(periodFromMode(period.mode))}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 text-sm font-extrabold uppercase tracking-wider text-white transition hover:brightness-110"
          >
            Hoy
          </button>
        </div>
      </div>

      {/* Period summary line */}
      <div className="mt-3 flex items-center gap-2 border-t border-[var(--rule-soft)] pt-3 text-xs text-[var(--text-tertiary)]">
        <Calendar className="h-3 w-3" aria-hidden />
        Mostrando datos del{" "}
        <strong className="text-[var(--text-primary)]">{fmtPeriodLabel(period)}</strong>
        <span className="text-[var(--text-tertiary)]">·</span>
        <span>{Math.ceil((period.to.getTime() - period.from.getTime()) / 86_400_000)} días</span>
      </div>
    </div>
  );
}

function CommissionStat({
  icon: Icon,
  label,
  value,
  sub,
  loading,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  loading: boolean;
  tone: "accent" | "success" | "warning";
}) {
  const iconBg = {
    accent: "bg-[var(--accent)]/10 text-[var(--accent)]",
    success: "bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]",
    warning: "bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300",
  }[tone];
  return (
    <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5">
      <div className="flex items-center gap-2.5">
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </span>
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-tight">
          {label}
        </p>
      </div>
      {loading ? (
        <div className="mt-3 h-8 w-24 bg-[var(--surface-sunken)] animate-pulse rounded" />
      ) : (
        <p className="mt-3 font-display text-2xl font-extrabold tabular-nums tracking-tight text-[var(--text-primary)]">
          {value}
        </p>
      )}
      <p className="mt-1 text-xs text-[var(--text-tertiary)]">{sub}</p>
    </div>
  );
}

function CommissionStatusPill({ status }: { status: CommissionRow["status"] }) {
  const cfg =
    status === "paid"
      ? {
          label: "Pagada",
          cls: "border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5 text-[var(--data-success-500)]",
          dot: "bg-[var(--data-success-500)]",
        }
      : status === "pending"
        ? {
            label: "Pendiente",
            cls: "border-teal-300/60 bg-teal-50/60 text-teal-700 dark:border-teal-700/40 dark:bg-teal-950/30 dark:text-teal-300",
            dot: "bg-teal-500",
          }
        : {
            label: status,
            cls: "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)]",
            dot: "bg-[var(--text-tertiary)]",
          };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider ${cfg.cls}`}
    >
      <span className={`h-1 w-1 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--rule-soft)] pb-3">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
        <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </span>
      <div>
        <h2 className="font-display text-lg sm:text-xl font-extrabold tracking-tight text-[var(--text-primary)]">
          {title}
        </h2>
        <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{subtitle}</p>
      </div>
    </div>
  );
}
