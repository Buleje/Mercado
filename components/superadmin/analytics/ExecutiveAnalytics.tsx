"use client";

/**
 * ExecutiveAnalytics — vista profunda con foco en INSIGHTS, no en listas.
 *
 * Cada sección muestra un dato accionable + insight badge que cuenta una historia:
 *   1. Operations Health: order funnel + cancel rate + completion rate
 *   2. Hour-of-day Heatmap: cuándo compran los clientes (con pico destacado)
 *   3. Channel mix: direct vs marketplace vs wholesale
 *   4. Customer Health: repeat rate + avg orders per customer
 *   5. MRR Breakdown por plan (donut)
 *   6. AOV trend con delta
 *   7. Top customers + Top products
 *   8. Stock alerts cross-tenant (accionable: hay que reabastecer)
 */

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

const ExecutiveAnalyticsCharts = dynamic(
  () => import("./ExecutiveAnalyticsCharts"),
  {
    ssr: false,
    loading: () => (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-56 animate-pulse bg-[var(--color-muted)] rounded-xl" />
        <div className="h-56 animate-pulse bg-[var(--color-muted)] rounded-xl" />
      </div>
    ),
  },
);
import {
  CreditCard,
  Package,
  Phone,
  Loader2,
  AlertTriangle,
  Truck,
  Users,
  Repeat,
  Zap,
} from "@buleje/design-system/icons";
import SuperadminChartCard from "@/components/superadmin/_shared/SuperadminChartCard";

interface ExecutiveData {
  cohorts: Array<{ month: string; signups: number; payingNow: number; conversionPct: number }>;
  mrrByPlan: Array<{ plan: string; count: number; mrr: number }>;
  topCustomers: Array<{ phone: string; totalSpent: number; orders: number }>;
  paymentMethods: Array<{ method: string; orders: number; revenue: number }>;
  aov: Array<{ month: string; aov: number; orders: number }>;
  productVelocity: Array<{ productId: number | null; name: string; units: number; revenue: number }>;
  orderFunnel: Array<{ status: string; label: string; count: number }>;
  cancelRate: number;
  completionRate: number;
  heatmap: number[][];
  peakDay: number;
  peakHour: number;
  peakCount: number;
  channels: Array<{ channel: string; orders: number; revenue: number }>;
  repeatRate: number;
  repeatCustomers: number;
  totalCustomers: number;
  avgOrdersPerCustomer: number;
  stockAlerts: Array<{
    productId: number;
    name: string;
    stock: number;
    stockMin: number;
    tenantName: string;
    tenantSlug: string;
  }>;
}

const fmtSoles = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 }).format(n);


const CHANNEL_LABELS: Record<string, { label: string; color: string }> = {
  direct: { label: "Tienda directa", color: "#00B4A6" },
  marketplace: { label: "Marketplace", color: "#8B5CF6" },
  wholesale: { label: "Mayorista", color: "#F59E0B" },
};

const DAYS_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function maskPhone(p: string): string {
  if (!p || p.length < 4) return p;
  return `••• ••• ${p.slice(-3)}`;
}

function InsightBadge({ tone, text }: { tone: "positive" | "negative" | "neutral"; text: string }) {
  const styles = {
    positive: "bg-emerald-50 text-[var(--data-success-700)] border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/40",
    negative: "bg-rose-50 text-[var(--data-error-500)] border-rose-200 dark:bg-rose-950/30 dark:text-[var(--data-error-500)] dark:border-rose-800/40",
    neutral: "bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30",
  };
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-bold ${styles[tone]}`}>
      <Zap className="h-3.5 w-3.5" />
      {text}
    </div>
  );
}

export default function ExecutiveAnalytics() {
  const [data, setData] = useState<ExecutiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/superadmin/analytics/executive", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: ExecutiveData) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setError("No se pudo cargar el análisis ejecutivo");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Heatmap: máxima celda para escala de color
  const heatmapMax = useMemo(() => {
    if (!data) return 0;
    let max = 0;
    for (const row of data.heatmap) for (const v of row) if (v > max) max = v;
    return max;
  }, [data]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20 text-base text-[var(--text-tertiary)]">
        <Loader2 className="w-5 h-5 animate-spin mr-3" /> Cargando análisis ejecutivo…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-base text-[var(--data-error-500)]">
        {error ?? "Sin datos"}
      </div>
    );
  }

  const totalMRR = data.mrrByPlan.reduce((s, p) => s + p.mrr, 0);
  const totalChannelRev = data.channels.reduce((s, c) => s + c.revenue, 0);
  const aovDelta =
    data.aov.length >= 2
      ? data.aov[data.aov.length - 1].aov - data.aov[data.aov.length - 2].aov
      : 0;
  const aovDeltaPct =
    data.aov.length >= 2 && data.aov[data.aov.length - 2].aov > 0
      ? (aovDelta / data.aov[data.aov.length - 2].aov) * 100
      : 0;

  const peakLabel =
    data.peakCount > 0
      ? `${DAYS_ES[data.peakDay]} ${String(data.peakHour).padStart(2, "0")}:00 — pico de ${data.peakCount} pedidos`
      : "Sin pico claro todavía";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
          Análisis ejecutivo de plataforma
        </h2>
        <p className="text-base text-[var(--text-secondary)] mt-1">
          Insights accionables — todo en vivo desde la base de datos. Cada sección destaca una decisión.
        </p>
      </div>

      {/* ─── ROW 1: Operations Health (status funnel + heatmap) ───────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SuperadminChartCard
          kicker="OPERACIÓN"
          title="Embudo de pedidos — últimos 30 días"
          description="Estado actual de cada pedido. La tasa de cancelación es el indicador clave."
          actions={
            <InsightBadge
              tone={data.cancelRate > 15 ? "negative" : data.cancelRate > 5 ? "neutral" : "positive"}
              text={`Cancelación ${Number(data.cancelRate).toFixed(1)}%`}
            />
          }
        >
          <ul className="space-y-2.5">
            {data.orderFunnel.map((step, i) => {
              const total = data.orderFunnel.reduce((s, x) => s + x.count, 0) || 1;
              const pct = (step.count / total) * 100;
              const isOK = step.status === "entregado";
              const isBad = step.status === "cancelado";
              return (
                <li key={step.status}>
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className={`inline-flex items-center gap-2 text-base font-bold ${isOK ? "text-[var(--data-success-700)] dark:text-emerald-300" : isBad ? "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]" : "text-[var(--text-primary)]"}`}>
                      <span className={`h-2.5 w-2.5 rounded-full ${isOK ? "bg-[var(--data-success-500)]" : isBad ? "bg-rose-500" : "bg-[var(--accent)]"}`} />
                      {step.label}
                    </span>
                    <span className="text-base font-extrabold tabular-nums text-[var(--text-primary)]">
                      {step.count}
                      <span className="text-sm font-bold text-[var(--text-tertiary)] ml-1.5">
                        ({pct.toFixed(0)}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: isOK ? "#10B981" : isBad ? "#F43F5E" : "var(--accent)",
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 pt-4 border-t border-[var(--rule-soft)] grid grid-cols-2 gap-3">
            <div className="text-center">
              <p className="text-3xl font-extrabold text-[var(--data-success-600)] dark:text-emerald-400 tabular-nums">
                {Number(data.completionRate).toFixed(0)}%
              </p>
              <p className="text-sm text-[var(--text-secondary)]">Tasa de entrega</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-extrabold text-[var(--data-error-500)] dark:text-[var(--data-error-500)] tabular-nums">
                {Number(data.cancelRate).toFixed(0)}%
              </p>
              <p className="text-sm text-[var(--text-secondary)]">Tasa de cancelación</p>
            </div>
          </div>
        </SuperadminChartCard>

        <SuperadminChartCard
          kicker="HORARIO"
          title="¿Cuándo compran tus clientes?"
          description="Pedidos por día de semana y hora del día — últimos 30 días"
          actions={data.peakCount > 0 ? <InsightBadge tone="positive" text={peakLabel} /> : undefined}
        >
          <div className="grid grid-cols-[auto_1fr] gap-x-2 text-xs font-mono">
            {/* Header de horas: 0, 6, 12, 18 */}
            <div />
            <div className="grid grid-cols-24 gap-px text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mb-1" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="text-center">
                  {h % 6 === 0 ? String(h).padStart(2, "0") : ""}
                </div>
              ))}
            </div>
            {/* Filas: día × 24 horas */}
            {DAYS_ES.map((day, d) => (
              <div key={day} className="contents">
                <div className="text-sm font-bold text-[var(--text-secondary)] pr-2 self-center">
                  {day}
                </div>
                <div className="grid grid-cols-24 gap-px" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
                  {data.heatmap[d].map((count, h) => {
                    const intensity = heatmapMax > 0 ? count / heatmapMax : 0;
                    const isPeak = d === data.peakDay && h === data.peakHour && data.peakCount > 0;
                    return (
                      <div
                        key={h}
                        className={`aspect-square rounded-sm ${isPeak ? "ring-2 ring-[var(--accent)]" : ""}`}
                        style={{
                          backgroundColor:
                            count === 0
                              ? "var(--surface-sunken)"
                              : `color-mix(in oklch, var(--accent) ${20 + intensity * 80}%, transparent)`,
                        }}
                        title={count > 0 ? `${day} ${String(h).padStart(2, "0")}:00 — ${count} pedidos` : undefined}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-[var(--text-tertiary)] mt-3">
            Cada celda = pedidos en esa franja. Más oscuro = más actividad.
          </p>
        </SuperadminChartCard>
      </div>

      {/* ─── ROW 2: Channel mix + Customer Health ────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SuperadminChartCard
          kicker="CANALES"
          title="Mix de canales — últimos 30 días"
          description={`${fmtSoles(totalChannelRev)} en revenue cross-canal`}
        >
          {data.channels.length === 0 ? (
            <p className="text-base text-[var(--text-tertiary)] py-6 text-center">
              Sin pedidos en este período.
            </p>
          ) : (
            <div className="space-y-3">
              {data.channels.map((c) => {
                const meta = CHANNEL_LABELS[c.channel] ?? { label: c.channel, color: "#94A3B8" };
                const pct = totalChannelRev > 0 ? (c.revenue / totalChannelRev) * 100 : 0;
                return (
                  <div key={c.channel}>
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <span className="flex items-center gap-2 text-base font-bold text-[var(--text-primary)]">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: meta.color }}
                          aria-hidden
                        />
                        {meta.label}
                      </span>
                      <span className="text-base font-extrabold tabular-nums text-[var(--text-primary)]">
                        {fmtSoles(c.revenue)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-2.5 flex-1 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: meta.color }}
                        />
                      </div>
                      <span className="text-sm font-bold tabular-nums text-[var(--text-tertiary)] w-20 text-right">
                        {c.orders} ped · {pct.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SuperadminChartCard>

        <SuperadminChartCard
          kicker="CLIENTES"
          title="Salud del cliente"
          description="¿Vuelven o compran solo una vez?"
          actions={
            <InsightBadge
              tone={data.repeatRate >= 30 ? "positive" : data.repeatRate >= 15 ? "neutral" : "negative"}
              text={`${Number(data.repeatRate).toFixed(0)}% recurrentes`}
            />
          }
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-[var(--surface-sunken)] p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-4 w-4 text-[var(--text-tertiary)]" />
                <span className="text-sm font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Total clientes
                </span>
              </div>
              <p className="text-3xl font-extrabold text-[var(--text-primary)] tabular-nums">
                {data.totalCustomers}
              </p>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                con teléfono identificado
              </p>
            </div>
            <div className="rounded-xl bg-[var(--accent-soft)] p-4">
              <div className="flex items-center gap-2 mb-2">
                <Repeat className="h-4 w-4 text-[var(--accent)]" />
                <span className="text-sm font-bold uppercase tracking-wider text-[var(--accent)]">
                  Recurrentes
                </span>
              </div>
              <p className="text-3xl font-extrabold text-[var(--text-primary)] tabular-nums">
                {data.repeatCustomers}
              </p>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                compraron 2+ veces
              </p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-[var(--rule-soft)]">
            <div className="flex items-center justify-between">
              <span className="text-base text-[var(--text-secondary)]">Pedidos promedio por cliente</span>
              <span className="text-2xl font-extrabold text-[var(--text-primary)] tabular-nums">
                {Number(data.avgOrdersPerCustomer).toFixed(1)}
              </span>
            </div>
          </div>
        </SuperadminChartCard>
      </div>

      {/* ─── ROW 3: MRR + AOV ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6">
        <SuperadminChartCard
          kicker="REVENUE · AOV"
          title="MRR por plan y Average Order Value"
          description={`${fmtSoles(totalMRR)} de ingreso recurrente mensual`}
          actions={
            <InsightBadge
              tone="neutral"
              text={`${data.mrrByPlan.filter((p) => p.count > 0 && p.plan !== "free").reduce((s, p) => s + p.count, 0)} tenants pagando`}
            />
          }
        >
          <ExecutiveAnalyticsCharts
            mrrByPlan={data.mrrByPlan}
            aov={data.aov}
            aovDeltaPct={aovDeltaPct}
          />
        </SuperadminChartCard>
      </div>

      {/* ─── ROW 4: Top customers + Top products ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SuperadminChartCard
          kicker="VIPs"
          title="Top 10 clientes por gasto"
          description="Clientes finales con más gasto agregado cross-tenant"
        >
          {data.topCustomers.length === 0 ? (
            <p className="text-base text-[var(--text-tertiary)] py-6 text-center">
              Sin datos de clientes.
            </p>
          ) : (
            <ol className="space-y-2">
              {data.topCustomers.map((c, i) => (
                <li
                  key={c.phone}
                  className="flex items-center gap-3 rounded-xl border border-[var(--rule-soft)] px-4 py-3 hover:bg-[var(--surface-sunken)]"
                >
                  <span className="h-8 w-8 rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] flex items-center justify-center font-bold text-sm shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                      {maskPhone(c.phone)}
                    </p>
                    <p className="text-sm text-[var(--text-tertiary)]">
                      {c.orders} pedido{c.orders !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <p className="text-base font-extrabold text-[var(--text-primary)] tabular-nums">
                    {fmtSoles(c.totalSpent)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </SuperadminChartCard>

        <SuperadminChartCard
          kicker="VENDIDOS"
          title="Top 10 productos del mes"
          description="Productos con más unidades vendidas en el mes en curso"
        >
          {data.productVelocity.length === 0 ? (
            <p className="text-base text-[var(--text-tertiary)] py-6 text-center">
              Sin ventas este mes.
            </p>
          ) : (
            <ol className="space-y-2">
              {data.productVelocity.map((p, i) => (
                <li
                  key={`${p.productId}-${p.name}-${i}`}
                  className="flex items-center gap-3 rounded-xl border border-[var(--rule-soft)] px-4 py-3 hover:bg-[var(--surface-sunken)]"
                >
                  <span className="h-8 w-8 rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] flex items-center justify-center font-bold text-sm shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-[var(--text-primary)] truncate flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5 text-[var(--text-tertiary)] shrink-0" />
                      {p.name}
                    </p>
                    <p className="text-sm text-[var(--text-tertiary)] tabular-nums">
                      {fmtSoles(p.revenue)} en revenue
                    </p>
                  </div>
                  <p className="text-base font-extrabold tabular-nums text-[var(--accent)]">
                    {p.units}u
                  </p>
                </li>
              ))}
            </ol>
          )}
        </SuperadminChartCard>
      </div>

      {/* ─── ROW 5: Stock alerts (cross-tenant accionable) + Pagos ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SuperadminChartCard
          kicker="ALERTA"
          title="Stock crítico cross-tenant"
          description="Productos con stock ≤ 5. Avisá al merchant antes de que se agote."
          actions={
            data.stockAlerts.length > 0 ? (
              <InsightBadge tone="negative" text={`${data.stockAlerts.length} productos`} />
            ) : (
              <InsightBadge tone="positive" text="Sin alertas" />
            )
          }
        >
          {data.stockAlerts.length === 0 ? (
            <p className="text-base text-[var(--text-tertiary)] py-6 text-center">
              Todas las tiendas tienen stock saludable. 👌
            </p>
          ) : (
            <ul className="space-y-2">
              {data.stockAlerts.map((alert) => {
                const critical = alert.stock === 0;
                return (
                  <li
                    key={alert.productId}
                    className={[
                      "flex items-center gap-3 rounded-xl border px-4 py-3",
                      critical
                        ? "border-rose-300 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-900/40"
                        : "border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900/40",
                    ].join(" ")}
                  >
                    <AlertTriangle
                      className={`h-5 w-5 shrink-0 ${critical ? "text-[var(--data-error-500)]" : "text-[var(--data-warning-600)]"}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-bold text-[var(--text-primary)] truncate">
                        {alert.name}
                      </p>
                      <p className="text-sm text-[var(--text-tertiary)] truncate">
                        {alert.tenantName} · {alert.tenantSlug}
                      </p>
                    </div>
                    <p
                      className={`text-2xl font-extrabold tabular-nums shrink-0 ${critical ? "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]" : "text-[var(--data-warning-700)] dark:text-amber-300"}`}
                    >
                      {alert.stock === 0 ? "Agotado" : alert.stock}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </SuperadminChartCard>

        <SuperadminChartCard
          kicker="PAGOS"
          title="Métodos de pago — mes en curso"
          description="Distribución por revenue procesado"
        >
          {data.paymentMethods.length === 0 ? (
            <p className="text-base text-[var(--text-tertiary)] py-6 text-center">
              Sin pagos registrados este mes.
            </p>
          ) : (
            <div className="space-y-3">
              {data.paymentMethods.map((p, i) => {
                const palette = ["#00B4A6", "#10B981", "#0EA5E9", "#8B5CF6", "#F59E0B", "#F43F5E"];
                const totalRev = data.paymentMethods.reduce((s, x) => s + x.revenue, 0);
                const pct = totalRev > 0 ? (p.revenue / totalRev) * 100 : 0;
                return (
                  <div key={p.method}>
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <span className="flex items-center gap-2 text-base font-bold capitalize text-[var(--text-primary)]">
                        <CreditCard className="h-4 w-4 text-[var(--text-tertiary)]" />
                        {p.method}
                      </span>
                      <span className="text-base font-extrabold tabular-nums text-[var(--text-primary)]">
                        {fmtSoles(p.revenue)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-2.5 flex-1 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: palette[i % palette.length] }}
                        />
                      </div>
                      <span className="text-sm font-bold tabular-nums text-[var(--text-tertiary)] w-20 text-right">
                        {p.orders} ped · {pct.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SuperadminChartCard>
      </div>
    </div>
  );
}
