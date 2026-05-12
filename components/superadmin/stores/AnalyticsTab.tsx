"use client";

/**
 * AnalyticsTab — Dashboard analítico completo del marketplace.
 *
 * Rediseño 2026-05-11 — más datos, más gráficos, más insights:
 *  - Filtro de período (7d / 30d / 90d / todo)
 *  - 8 KPIs hero (Revenue, Orders, AOV, Tiendas, Completion, Cancel, Repeat, Customers)
 *  - Revenue trend (área temporal)
 *  - Orders trend (bar stacked: completados vs cancelados)
 *  - Status funnel (barra horizontal apilada)
 *  - Top tiendas por revenue + Top tiendas por # orders
 *  - Top clientes por gasto (cross-store)
 *  - Categorías + Métodos de pago + Zonas
 *  - Heatmap día-de-semana × hora
 *  - AOV trend
 */

import { useState, useEffect, useMemo } from "react";
import {
  BarChart3,
  ShoppingBag,
  Users,
  TrendingUp,
  DollarSign,
  CheckCircle2,
  XCircle,
  Repeat,
  Calendar,
  CreditCard,
  MapPin,
  Tag,
  Trophy,
  Clock,
  type LucideIcon,
} from "@buleje/design-system/icons";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { StoreRow, MarketplaceOrder } from "./types";

const PERIODS = [
  { id: "7d" as const, label: "7 días", days: 7 },
  { id: "30d" as const, label: "30 días", days: 30 },
  { id: "90d" as const, label: "90 días", days: 90 },
  { id: "all" as const, label: "Todo", days: 9999 },
];

type PeriodId = (typeof PERIODS)[number]["id"];

const DOW_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function fmt(n: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtFull(n: number) {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);
}

function fmtNum(n: number) {
  return new Intl.NumberFormat("es-PE").format(n);
}

function fmtPct(pct: number, decimals = 0) {
  return `${pct.toFixed(decimals)}%`;
}

// ─── Component ────────────────────────────────────────────────────────

interface AnalyticsTabProps {
  stores: StoreRow[] | undefined;
}

export function AnalyticsTab({ stores }: AnalyticsTabProps) {
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodId>("30d");

  useEffect(() => {
    setLoading(true);
    fetch("/api/superadmin/marketplace/orders", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { orders: [] }))
      .then((d) => setOrders(d.orders ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Filter by period
  const periodConfig = PERIODS.find((p) => p.id === period) ?? PERIODS[1];
  const cutoffMs = periodConfig.id === "all" ? 0 : Date.now() - periodConfig.days * 86_400_000;
  const filteredOrders = useMemo(
    () => orders.filter((o) => new Date(o.createdAt).getTime() >= cutoffMs),
    [orders, cutoffMs],
  );

  // ─── Aggregations ─────────────────────────────────────────────────

  const validOrders = useMemo(
    () => filteredOrders.filter((o) => o.status !== "cancelado"),
    [filteredOrders],
  );

  const totalRevenue = validOrders.reduce((s, o) => s + o.total, 0);
  const totalOrders = validOrders.length;
  const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const cancelCount = filteredOrders.filter((o) => o.status === "cancelado").length;
  const cancelRate =
    filteredOrders.length > 0 ? (cancelCount / filteredOrders.length) * 100 : 0;
  const completedCount = filteredOrders.filter(
    (o) => o.status === "completado" || o.status === "entregado",
  ).length;
  const completionRate =
    filteredOrders.length > 0 ? (completedCount / filteredOrders.length) * 100 : 0;

  // Unique customers
  const customerMap = useMemo(() => {
    const map = new Map<string, { spent: number; orders: number; name: string }>();
    for (const o of validOrders) {
      const k = (o.customerPhone || "").trim() || `name:${o.customerName}`;
      const cur = map.get(k) ?? { spent: 0, orders: 0, name: o.customerName };
      cur.spent += o.total;
      cur.orders += 1;
      map.set(k, cur);
    }
    return map;
  }, [validOrders]);
  const uniqueCustomers = customerMap.size;
  const repeatCustomers = Array.from(customerMap.values()).filter((c) => c.orders > 1).length;
  const repeatRate = uniqueCustomers > 0 ? (repeatCustomers / uniqueCustomers) * 100 : 0;

  // Revenue + orders trend (bucketed)
  const trend = useMemo(() => {
    if (filteredOrders.length === 0) return [];
    const days = periodConfig.id === "all" ? 90 : periodConfig.days;
    const granularity: "hour" | "day" | "month" =
      days <= 2 ? "hour" : days <= 90 ? "day" : "month";
    const buckets = new Map<
      string,
      { bucket: string; revenue: number; orders: number; cancelled: number }
    >();
    const now = Date.now();
    const start = days >= 9999 ? 0 : now - days * 86_400_000;
    for (const o of filteredOrders) {
      const t = new Date(o.createdAt).getTime();
      if (t < start) continue;
      let key: string;
      const d = new Date(t);
      if (granularity === "hour") {
        key = `${d.getHours()}h`;
      } else if (granularity === "day") {
        key = d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
      } else {
        key = d.toLocaleDateString("es-PE", { month: "short", year: "2-digit" });
      }
      const cur = buckets.get(key) ?? { bucket: key, revenue: 0, orders: 0, cancelled: 0 };
      if (o.status === "cancelado") {
        cur.cancelled += 1;
      } else {
        cur.revenue += o.total;
        cur.orders += 1;
      }
      buckets.set(key, cur);
    }
    return Array.from(buckets.values());
  }, [filteredOrders, periodConfig]);

  // AOV trend (mismo bucketing)
  const aovTrend = useMemo(
    () =>
      trend.map((b) => ({
        bucket: b.bucket,
        aov: b.orders > 0 ? b.revenue / b.orders : 0,
      })),
    [trend],
  );

  // Status distribution
  const statusBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of filteredOrders) {
      map.set(o.status, (map.get(o.status) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredOrders]);

  // Top stores by revenue
  const topStoresRevenue = useMemo(() => {
    const map = new Map<string, { name: string; slug: string; revenue: number; orders: number }>();
    for (const o of validOrders) {
      const key = o.storeSlug || o.storeName;
      const cur = map.get(key) ?? {
        name: o.storeName,
        slug: o.storeSlug,
        revenue: 0,
        orders: 0,
      };
      cur.revenue += o.total;
      cur.orders += 1;
      map.set(key, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [validOrders]);

  // Top stores by orders count
  const topStoresOrders = useMemo(() => {
    return [...topStoresRevenue].sort((a, b) => b.orders - a.orders).slice(0, 10);
  }, [topStoresRevenue]);

  // Top customers
  const topCustomers = useMemo(() => {
    return Array.from(customerMap.entries())
      .map(([k, v]) => ({ key: k, ...v }))
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 10);
  }, [customerMap]);

  // Categories from stores
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

  // Payment methods
  const paymentMethods = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const o of validOrders) {
      const pm = o.paymentMethod?.trim() || "Desconocido";
      const cur = map.get(pm) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += o.total;
      map.set(pm, cur);
    }
    return Array.from(map.entries())
      .map(([method, v]) => ({ method, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [validOrders]);

  // Zones (customerLocation)
  const zones = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of validOrders) {
      const loc = (o.customerLocation ?? "").trim();
      if (!loc) continue;
      map.set(loc, (map.get(loc) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([zone, count]) => ({ zone, count }));
  }, [validOrders]);

  // Heatmap: day-of-week × hour
  const heatmap = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const o of validOrders) {
      const d = new Date(o.createdAt);
      grid[d.getDay()][d.getHours()] += 1;
    }
    let max = 0;
    for (const row of grid) for (const v of row) if (v > max) max = v;
    const peak = { dow: 0, hour: 0, count: 0 };
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        if (grid[d][h] > peak.count) peak.count = grid[d][h], (peak.dow = d), (peak.hour = h);
      }
    }
    return { grid, max, peak };
  }, [validOrders]);

  return (
    <div className="space-y-5">
      {/* ── Hero + period filter ─────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)]">
              <BarChart3 className="h-6 w-6" strokeWidth={1.75} aria-hidden />
            </span>
            <div>
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">
                Marketplace · Analítica
              </p>
              <h2 className="font-display text-lg sm:text-xl font-extrabold tracking-tight text-[var(--text-primary)]">
                Dashboard de performance
              </h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {validOrders.length} pedidos válidos · {fmt(totalRevenue)} en revenue · {uniqueCustomers}{" "}
                clientes únicos
              </p>
            </div>
          </div>
          <div className="flex gap-1 rounded-xl bg-[var(--surface-sunken)] p-1">
            {PERIODS.map((p) => {
              const isActive = period === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriod(p.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                    isActive
                      ? "bg-[var(--surface-raised)] text-[var(--accent)] shadow-sm"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <Calendar className="h-3 w-3" strokeWidth={2.25} />
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 8 KPI cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={DollarSign}
          label="Revenue"
          value={fmt(totalRevenue)}
          sub={`${validOrders.length} pedidos`}
          tone="success"
        />
        <KpiCard
          icon={ShoppingBag}
          label="Ticket promedio"
          value={fmt(aov)}
          sub="AOV"
          tone="accent"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Completados"
          value={`${completionRate.toFixed(0)}%`}
          sub={`${completedCount} de ${filteredOrders.length}`}
          tone={completionRate >= 80 ? "success" : completionRate >= 50 ? "warning" : "danger"}
        />
        <KpiCard
          icon={XCircle}
          label="Cancelados"
          value={`${cancelRate.toFixed(1)}%`}
          sub={`${cancelCount} pedidos`}
          tone={cancelRate < 5 ? "success" : cancelRate < 15 ? "warning" : "danger"}
        />
        <KpiCard
          icon={Users}
          label="Clientes únicos"
          value={fmtNum(uniqueCustomers)}
          sub={`${repeatCustomers} recurrentes`}
          tone="neutral"
        />
        <KpiCard
          icon={Repeat}
          label="Tasa recurrencia"
          value={`${repeatRate.toFixed(0)}%`}
          sub="Clientes con 2+ pedidos"
          tone={repeatRate > 30 ? "success" : "neutral"}
        />
        <KpiCard
          icon={ShoppingBag}
          label="Tiendas activas"
          value={fmtNum(stores?.filter((s) => s.isPublished).length ?? 0)}
          sub={`de ${stores?.length ?? 0} totales`}
          tone="accent"
        />
        <KpiCard
          icon={Trophy}
          label="Tienda top"
          value={topStoresRevenue[0]?.name ?? "—"}
          sub={topStoresRevenue[0] ? fmt(topStoresRevenue[0].revenue) : ""}
          tone="warning"
          textValue
        />
      </div>

      {/* ── Revenue trend ────────────────────────────────────── */}
      <ChartCard
        icon={TrendingUp}
        title="Tendencia de revenue"
        subtitle={`Ingresos del marketplace · ${periodConfig.label}`}
        iconTone="success"
      >
        {loading ? (
          <ChartSkeleton />
        ) : trend.length === 0 ? (
          <ChartEmpty message="Sin datos en el periodo" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trend} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="atRevGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-soft)" />
              <XAxis
                dataKey="bucket"
                stroke="var(--text-tertiary)"
                tick={{ fontSize: 11, fontWeight: 600 }}
              />
              <YAxis
                stroke="var(--text-tertiary)"
                tick={{ fontSize: 11, fontWeight: 600 }}
                tickFormatter={(v) => `S/${v}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--surface-raised)",
                  border: "1px solid var(--rule-base)",
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: 600,
                }}
                formatter={((value: number) => [fmtFull(value), "Revenue"]) as never}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="var(--accent)"
                strokeWidth={2.5}
                fill="url(#atRevGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* ── Orders + Cancellations stacked ──────────────────── */}
      <ChartCard
        icon={ShoppingBag}
        title="Pedidos por período"
        subtitle="Completados vs cancelados"
        iconTone="accent"
      >
        {loading ? (
          <ChartSkeleton />
        ) : trend.length === 0 ? (
          <ChartEmpty message="Sin datos en el periodo" />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={trend} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-soft)" />
              <XAxis
                dataKey="bucket"
                stroke="var(--text-tertiary)"
                tick={{ fontSize: 11, fontWeight: 600 }}
              />
              <YAxis
                stroke="var(--text-tertiary)"
                tick={{ fontSize: 11, fontWeight: 600 }}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--surface-raised)",
                  border: "1px solid var(--rule-base)",
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
              <Bar
                dataKey="orders"
                stackId="a"
                fill="var(--accent)"
                radius={[0, 0, 0, 0]}
                name="Completados"
              />
              <Bar
                dataKey="cancelled"
                stackId="a"
                fill="rgb(244 63 94)"
                radius={[6, 6, 0, 0]}
                name="Cancelados"
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* ── AOV trend ────────────────────────────────────────── */}
      <ChartCard
        icon={DollarSign}
        title="Ticket promedio en el tiempo"
        subtitle="Average Order Value por período"
        iconTone="warning"
      >
        {loading ? (
          <ChartSkeleton />
        ) : aovTrend.length === 0 ? (
          <ChartEmpty message="Sin datos en el periodo" />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={aovTrend} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-soft)" />
              <XAxis
                dataKey="bucket"
                stroke="var(--text-tertiary)"
                tick={{ fontSize: 11, fontWeight: 600 }}
              />
              <YAxis
                stroke="var(--text-tertiary)"
                tick={{ fontSize: 11, fontWeight: 600 }}
                tickFormatter={(v) => `S/${Number(v).toFixed(0)}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--surface-raised)",
                  border: "1px solid var(--rule-base)",
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: 600,
                }}
                formatter={((value: number) => [fmtFull(value), "AOV"]) as never}
              />
              <Line
                type="monotone"
                dataKey="aov"
                stroke="rgb(245 158 11)"
                strokeWidth={2.5}
                dot={{ fill: "rgb(245 158 11)", r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* ── Status funnel ────────────────────────────────────── */}
      {statusBreakdown.length > 0 && (
        <SectionCard
          icon={CheckCircle2}
          title="Distribución por estado"
          subtitle="% del total de pedidos en el periodo"
        >
          <StatusFunnel breakdown={statusBreakdown} total={filteredOrders.length} />
        </SectionCard>
      )}

      {/* ── Top stores: revenue + orders ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard
          icon={Trophy}
          title="Top tiendas · Revenue"
          subtitle="Mayor facturación"
        >
          <RankedList
            items={topStoresRevenue.map((s, i) => ({
              rank: i + 1,
              label: s.name,
              sub: `${s.orders} pedidos`,
              value: fmt(s.revenue),
              progress: topStoresRevenue[0]
                ? (s.revenue / topStoresRevenue[0].revenue) * 100
                : 0,
              color: "var(--accent)",
            }))}
          />
        </SectionCard>

        <SectionCard
          icon={ShoppingBag}
          title="Top tiendas · Pedidos"
          subtitle="Mayor volumen"
        >
          <RankedList
            items={topStoresOrders.map((s, i) => ({
              rank: i + 1,
              label: s.name,
              sub: fmt(s.revenue),
              value: `${s.orders}`,
              progress: topStoresOrders[0]
                ? (s.orders / topStoresOrders[0].orders) * 100
                : 0,
              color: "rgb(245 158 11)",
            }))}
          />
        </SectionCard>
      </div>

      {/* ── Top customers + Categories ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard
          icon={Users}
          title="Top clientes · Gasto cross-store"
          subtitle="Clientes con mayor lifetime value"
        >
          {topCustomers.length === 0 ? (
            <ChartEmpty message="Sin clientes en el periodo" />
          ) : (
            <RankedList
              items={topCustomers.map((c, i) => ({
                rank: i + 1,
                label: c.name || "Anónimo",
                sub: `${c.orders} pedido${c.orders === 1 ? "" : "s"}`,
                value: fmt(c.spent),
                progress: topCustomers[0] ? (c.spent / topCustomers[0].spent) * 100 : 0,
                color: "rgb(139 92 246)",
              }))}
            />
          )}
        </SectionCard>

        <SectionCard
          icon={Tag}
          title="Categorías de tienda"
          subtitle="Distribución del marketplace"
        >
          {categoryDist.length === 0 ? (
            <ChartEmpty message="Sin tiendas" />
          ) : (
            <RankedList
              items={categoryDist.map((c, i) => ({
                rank: i + 1,
                label: c.category,
                sub: "tiendas",
                value: `${c.count}`,
                progress: categoryDist[0] ? (c.count / categoryDist[0].count) * 100 : 0,
                color: "var(--accent)",
                capitalize: true,
              }))}
            />
          )}
        </SectionCard>
      </div>

      {/* ── Payment + Zones ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard
          icon={CreditCard}
          title="Métodos de pago"
          subtitle="Distribución por monto"
        >
          {paymentMethods.length === 0 ? (
            <ChartEmpty message="Sin métodos registrados" />
          ) : (
            <div className="space-y-2">
              {paymentMethods.map((pm) => {
                const pct =
                  totalRevenue > 0 ? (pm.total / totalRevenue) * 100 : 0;
                return (
                  <div
                    key={pm.method}
                    className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="font-bold text-sm text-[var(--text-primary)] capitalize">
                        {pm.method}
                      </span>
                      <div className="text-right">
                        <p className="font-display text-base font-extrabold tabular-nums text-[var(--text-primary)]">
                          {fmt(pm.total)}
                        </p>
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                          {pm.count} pedidos · {fmtPct(pct, 1)}
                        </p>
                      </div>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                      <div
                        className="h-full rounded-full bg-[var(--accent)] transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard
          icon={MapPin}
          title="Top zonas de entrega"
          subtitle="Distritos / ubicaciones de clientes"
        >
          {zones.length === 0 ? (
            <ChartEmpty message="Sin ubicaciones registradas" />
          ) : (
            <RankedList
              items={zones.map((z, i) => ({
                rank: i + 1,
                label: z.zone,
                sub: "pedidos",
                value: `${z.count}`,
                progress: zones[0] ? (z.count / zones[0].count) * 100 : 0,
                color: "rgb(14 165 233)",
              }))}
            />
          )}
        </SectionCard>
      </div>

      {/* ── Heatmap hour x dow ───────────────────────────────── */}
      <SectionCard
        icon={Clock}
        title="Cuándo compran los clientes"
        subtitle={
          heatmap.peak.count > 0
            ? `Pico: ${DOW_LABELS[heatmap.peak.dow]} ${String(heatmap.peak.hour).padStart(2, "0")}:00 — ${heatmap.peak.count} pedidos`
            : "Sin pedidos suficientes para detectar pico"
        }
      >
        <HourHeatmap grid={heatmap.grid} max={heatmap.max} />
      </SectionCard>
    </div>
  );
}

/* ═══════════════════════════ components ═══════════════════════════ */

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
  textValue,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone: "accent" | "success" | "warning" | "danger" | "neutral";
  textValue?: boolean;
}) {
  const iconBg = {
    accent: "bg-[var(--accent)]/10 text-[var(--accent)]",
    success: "bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    danger: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
    neutral: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
  }[tone];
  return (
    <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center gap-2.5">
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </span>
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-tight">
          {label}
        </p>
      </div>
      <p
        className={`mt-3 font-display ${textValue ? "text-base truncate" : "text-2xl"} font-extrabold tabular-nums tracking-tight text-[var(--text-primary)]`}
        title={textValue ? value : undefined}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-[var(--text-tertiary)] truncate">{sub}</p>}
    </div>
  );
}

function ChartCard({
  icon: Icon,
  title,
  subtitle,
  iconTone,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  iconTone: "accent" | "success" | "warning";
  children: React.ReactNode;
}) {
  const iconBg = {
    accent: "bg-[var(--accent)]/10 text-[var(--accent)]",
    success: "bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  }[iconTone];
  return (
    <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
      <header className="flex items-center gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </span>
        <div>
          <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
            {title}
          </h3>
          <p className="text-xs text-[var(--text-tertiary)]">{subtitle}</p>
        </div>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function SectionCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
      <header className="flex items-center gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </span>
        <div>
          <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
            {title}
          </h3>
          <p className="text-xs text-[var(--text-tertiary)]">{subtitle}</p>
        </div>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function ChartSkeleton() {
  return <div className="h-56 rounded-xl bg-[var(--surface-sunken)] animate-pulse" />;
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="py-12 text-center">
      <p className="text-sm text-[var(--text-tertiary)]">{message}</p>
    </div>
  );
}

function RankedList({
  items,
}: {
  items: Array<{
    rank: number;
    label: string;
    sub?: string;
    value: string;
    progress: number;
    color: string;
    capitalize?: boolean;
  }>;
}) {
  if (items.length === 0) return <ChartEmpty message="Sin datos" />;
  return (
    <div className="space-y-2.5">
      {items.map((item) => (
        <div
          key={item.rank}
          className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3"
        >
          <div className="flex items-center gap-3 mb-2">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-sunken)] font-display text-xs font-extrabold tabular-nums text-[var(--text-tertiary)]">
              #{item.rank}
            </span>
            <div className="flex-1 min-w-0">
              <p
                className={`font-bold text-sm text-[var(--text-primary)] truncate ${item.capitalize ? "capitalize" : ""}`}
              >
                {item.label}
              </p>
              {item.sub && (
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate">{item.sub}</p>
              )}
            </div>
            <p className="font-display text-sm font-extrabold tabular-nums text-[var(--text-primary)] shrink-0">
              {item.value}
            </p>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${item.progress}%`, background: item.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusFunnel({
  breakdown,
  total,
}: {
  breakdown: Array<[string, number]>;
  total: number;
}) {
  const STATUS_TONE: Record<string, { color: string; label: string }> = {
    completado: { color: "var(--data-success-500)", label: "Completado" },
    entregado: { color: "var(--data-success-500)", label: "Entregado" },
    en_camino: { color: "var(--accent)", label: "En camino" },
    confirmado: { color: "rgb(59 130 246)", label: "Confirmado" },
    pendiente: { color: "rgb(245 158 11)", label: "Pendiente" },
    cancelado: { color: "rgb(244 63 94)", label: "Cancelado" },
  };
  return (
    <div className="space-y-3">
      {/* Stacked bar */}
      <div className="h-4 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
        <div className="flex h-full">
          {breakdown.map(([status, count]) => {
            const pct = total > 0 ? (count / total) * 100 : 0;
            const meta = STATUS_TONE[status] ?? {
              color: "var(--text-tertiary)",
              label: status,
            };
            return (
              <div
                key={status}
                className="transition-all"
                style={{ width: `${pct}%`, background: meta.color }}
                title={`${meta.label}: ${count} (${pct.toFixed(1)}%)`}
              />
            );
          })}
        </div>
      </div>
      {/* Legend */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {breakdown.map(([status, count]) => {
          const meta = STATUS_TONE[status] ?? {
            color: "var(--text-tertiary)",
            label: status,
          };
          const pct = total > 0 ? (count / total) * 100 : 0;
          return (
            <div
              key={status}
              className="flex items-center gap-2 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-2.5 py-1.5"
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ background: meta.color }}
              />
              <span className="text-xs font-bold text-[var(--text-primary)] capitalize flex-1">
                {meta.label}
              </span>
              <span className="font-display text-xs font-extrabold tabular-nums text-[var(--text-primary)]">
                {count}
              </span>
              <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{fmtPct(pct, 0)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HourHeatmap({ grid, max }: { grid: number[][]; max: number }) {
  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        <div className="grid grid-cols-[auto_repeat(24,1fr)] gap-0.5">
          {/* Header: hour labels */}
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div
              key={h}
              className="text-center text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] tabular-nums"
            >
              {h % 3 === 0 ? h : ""}
            </div>
          ))}
          {/* Rows */}
          {grid.map((row, d) => (
            <div key={d} className="contents">
              <div className="pr-2 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] flex items-center">
                {DOW_LABELS[d]}
              </div>
              {row.map((v, h) => {
                const intensity = max > 0 ? v / max : 0;
                const bg =
                  intensity === 0
                    ? "var(--surface-sunken)"
                    : `color-mix(in oklch, var(--accent) ${Math.max(8, intensity * 100)}%, transparent)`;
                return (
                  <div
                    key={h}
                    className="aspect-square rounded-sm border border-[var(--rule-soft)]/50"
                    style={{ background: bg }}
                    title={`${DOW_LABELS[d]} ${String(h).padStart(2, "0")}:00 — ${v} pedido${v === 1 ? "" : "s"}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 justify-end text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
          <span>Menos</span>
          <div className="flex gap-0.5">
            {[0.1, 0.3, 0.5, 0.7, 1].map((i) => (
              <div
                key={i}
                className="h-3 w-3 rounded-sm border border-[var(--rule-soft)]/50"
                style={{ background: `color-mix(in oklch, var(--accent) ${i * 100}%, transparent)` }}
              />
            ))}
          </div>
          <span>Más</span>
        </div>
      </div>
    </div>
  );
}
