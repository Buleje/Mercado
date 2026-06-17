"use client";

import { CardTitle } from "@buleje/design-system";
import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Users,
  Package,
  Activity,
  Clock,
  Sparkles,
  ArrowRight,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { BusinessData } from "../ai-center.types";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return `S/${n.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos dias";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function isToday(dateStr?: string): boolean {
  return !!dateStr && dateStr.slice(0, 10) === todayStr();
}

function isYesterday(dateStr?: string): boolean {
  return !!dateStr && dateStr.slice(0, 10) === yesterdayStr();
}

function trendPct(today: number, yesterday: number): number | null {
  if (yesterday === 0) return null;
  return Math.round(((today - yesterday) / yesterday) * 100);
}

function healthScoreColor(score: number): {
  text: string;
  badge: string;
  label: string;
} {
  if (score >= 80)
    return {
      text: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
      badge:
        "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
      label: "Saludable",
    };
  if (score >= 60)
    return {
      text: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
      badge:
        "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
      label: "Bueno",
    };
  if (score >= 40)
    return {
      text: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",
      badge:
        "bg-[var(--data-warning-50)] dark:bg-amber-950/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",
      label: "Regular",
    };
  return {
    text: "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",
    badge: "bg-[var(--data-error-50)] dark:bg-red-950/30 text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",
    label: "Critico",
  };
}

function dayAbbr(date: Date): string {
  return date.toLocaleDateString("es-PE", { weekday: "short" }).slice(0, 3);
}

function formatDateHeader(): string {
  return new Date().toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

// ── Health score calculation ───────────────────────────────────────────────────

function computeHealthScore(data: BusinessData): number {
  const { products, orders, sales, customers } = data;

  const activeProducts = products.filter((p) => p.active !== false);

  // revenueGrowth (25%): today vs yesterday
  const todayRev = sales
    .filter((s) => isToday(s.createdAt))
    .reduce((a, s) => a + s.total, 0);
  const yestRev = sales
    .filter((s) => isYesterday(s.createdAt))
    .reduce((a, s) => a + s.total, 0);
  const revenueGrowth =
    yestRev > 0
      ? Math.min(100, Math.max(0, 50 + ((todayRev - yestRev) / yestRev) * 50))
      : todayRev > 0
      ? 75
      : 50;

  // inventoryHealth (20%): % of active products NOT in low stock
  const lowStockCount = activeProducts.filter(
    (p) =>
      p.stock != null &&
      p.stockMin != null &&
      p.active !== false &&
      p.stock <= p.stockMin
  ).length;
  const inventoryHealth =
    activeProducts.length > 0
      ? ((activeProducts.length - lowStockCount) / activeProducts.length) * 100
      : 100;

  // marginStrength (20%): avg margin % across products with price + costPrice
  const pricedProducts = activeProducts.filter(
    (p) => p.price != null && p.costPrice != null && p.price > 0
  );
  const avgMargin =
    pricedProducts.length > 0
      ? pricedProducts.reduce(
          (a, p) => a + (p.price! - p.costPrice!) / p.price!,
          0
        ) / pricedProducts.length
      : 0.3;
  const marginStrength = Math.min(100, Math.max(0, avgMargin * 200));

  // fiadoRisk (15%): inverse of overdue ratio — use alerts if available
  const overdueRatio =
    (data.alerts?.overduePayables ?? 0) > 0
      ? Math.min(1, (data.alerts?.overduePayables ?? 0) / 10)
      : 0;
  const fiadoScore = (1 - overdueRatio) * 100;

  // customerGrowth (10%): new customers in last 30 days ratio
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const newCustomers = customers.filter(
    (c) => (c.createdAt?.slice(0, 10) ?? "") >= thirtyDaysAgo
  ).length;
  const customerGrowth = Math.min(
    100,
    customers.length > 0 ? (newCustomers / customers.length) * 200 : 0
  );

  // operationalEfficiency (10%): % of orders NOT pending
  const pendingOrders = orders.filter(
    (o) => o.status === "pendiente" || o.status === "en_proceso"
  ).length;
  const operationalEfficiency =
    orders.length > 0
      ? ((orders.length - pendingOrders) / orders.length) * 100
      : 100;

  const score =
    revenueGrowth * 0.25 +
    inventoryHealth * 0.2 +
    marginStrength * 0.2 +
    fiadoScore * 0.15 +
    customerGrowth * 0.1 +
    operationalEfficiency * 0.1;

  return Math.round(Math.min(100, Math.max(0, score)));
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface TrendBadgeProps {
  pct: number | null;
  size?: "sm" | "xs";
}

function TrendBadge({ pct, size = "sm" }: TrendBadgeProps) {
  if (pct === null)
    return (
      <span
        className={cn(
          "text-[var(--text-tertiary)]",
          size === "xs" ? "text-[length:var(--ts-2xs)]" : "text-xs"
        )}
      >
        Sin datos previos
      </span>
    );
  const positive = pct >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-medium",
        size === "xs" ? "text-[length:var(--ts-2xs)]" : "text-xs",
        positive
          ? "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]"
          : "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]"
      )}
    >
      {positive ? (
        <TrendingUp className="w-3 h-3" />
      ) : (
        <TrendingDown className="w-3 h-3" />
      )}
      {positive ? "+" : ""}
      {pct}% vs ayer
    </span>
  );
}

interface KPICardProps {
  label: string;
  value: string;
  sub?: React.ReactNode;
  icon: React.ReactNode;
}

function KPICard({ label, value, sub, icon }: KPICardProps) {
  // 2026-04-24: tipografia subida (text-xs -> text-xs uppercase tracking;
  // text-lg -> text-2xl extrabold) + padding generoso. Hereda --section-primary
  // del wrapper para que el valor tome el accent rotativo de la posicion.
  // 2026-04-25: empty-state ("Sin datos") usa tipografia secundaria muted
  // para no competir visualmente con KPIs reales.
  const isEmpty = typeof value === "string" && /sin datos/i.test(value);
  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-5 h-full flex flex-col justify-between gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          {label}
        </span>
        <span className="text-[var(--text-tertiary)]">{icon}</span>
      </div>
      <p
        className={
          isEmpty
            ? "text-base font-medium text-[var(--text-tertiary)] leading-none"
            : "text-2xl sm:text-3xl font-extrabold text-[color:var(--section-primary,var(--text-primary))] leading-none tabular-nums tracking-tight"
        }
      >
        {value}
      </p>
      {sub && <div className="text-xs text-[var(--text-secondary)] font-medium">{sub}</div>}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  data: BusinessData;
}

export default function ResumenSection({ data }: Props) {
  const { products, orders, sales, customers } = data;

  // "Now" cachado al primer render — evita llamar Date.now() impuramente
  // dentro del cuerpo render (react-hooks/purity). useState con lazy init
  // se ejecuta una sola vez y React la considera pura.
  const [now] = useState<number>(() => Date.now());

  // ── KPI computations ──────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const todaySales = sales.filter((s) => isToday(s.createdAt));
    const yestSales = sales.filter((s) => isYesterday(s.createdAt));

    const todayRev = todaySales.reduce((a, s) => a + s.total, 0);
    const yestRev = yestSales.reduce((a, s) => a + s.total, 0);

    const todayTx = todaySales.length;
    const yestTx = yestSales.length;

    const todayTicket = todayTx > 0 ? todayRev / todayTx : 0;
    const yestTicket = yestTx > 0 ? yestRev / yestTx : 0;

    return {
      revenue: { today: todayRev, trend: trendPct(todayRev, yestRev) },
      transactions: { today: todayTx, trend: trendPct(todayTx, yestTx) },
      ticket: { today: todayTicket, trend: trendPct(todayTicket, yestTicket) },
    };
  }, [sales]);

  const healthScore = useMemo(() => computeHealthScore(data), [data]);
  const healthColor = healthScoreColor(healthScore);

  // ── Alerts ────────────────────────────────────────────────────────────────

  const alerts = useMemo(() => {
    const list: { text: string; level: "urgente" | "importante" }[] = [];

    const activeProducts = products.filter((p) => p.active !== false);

    // Low stock
    const lowStock = activeProducts.filter(
      (p) =>
        p.stock != null &&
        p.stockMin != null &&
        p.stock <= p.stockMin
    );
    if (lowStock.length > 0) {
      list.push({
        text: `${lowStock.length} producto${lowStock.length > 1 ? "s" : ""} con stock bajo`,
        level: "urgente",
      });
    }

    // Pending orders
    const pendingOrders = orders.filter(
      (o) => o.status === "pendiente" || o.status === "en_proceso"
    );
    if (pendingOrders.length > 0) {
      list.push({
        text: `${pendingOrders.length} pedido${pendingOrders.length > 1 ? "s" : ""} pendiente${pendingOrders.length > 1 ? "s" : ""}`,
        level: "importante",
      });
    }

    // Expiring products
    const in7Days = new Date(now + 7 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const today = todayStr();
    const expiring = activeProducts.filter(
      (p) =>
        p.expiresAt &&
        p.expiresAt.slice(0, 10) >= today &&
        p.expiresAt.slice(0, 10) <= in7Days
    );
    if (expiring.length > 0) {
      list.push({
        text: `${expiring.length} producto${expiring.length > 1 ? "s" : ""} por vencer en 7 dias`,
        level: "importante",
      });
    }

    return list;
  }, [products, orders, now]);

  // ── 7-day sales chart ─────────────────────────────────────────────────────

  const chartData = useMemo(() => {
    const days: { date: string; label: string; total: number; isToday: boolean }[] =
      [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().slice(0, 10);
      const total = sales
        .filter((s) => s.createdAt?.slice(0, 10) === dateKey)
        .reduce((a, s) => a + s.total, 0);
      days.push({
        date: dateKey,
        label: dayAbbr(d),
        total,
        isToday: i === 0,
      });
    }
    return days;
  }, [sales]);

  const weekOverWeek = useMemo(() => {
    const thisWeek = chartData.reduce((a, d) => a + d.total, 0);
    const lastWeekStart = new Date(now - 14 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const lastWeekEnd = new Date(now - 7 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const lastWeek = sales
      .filter((s) => {
        const d = s.createdAt?.slice(0, 10) ?? "";
        return d >= lastWeekStart && d < lastWeekEnd;
      })
      .reduce((a, s) => a + s.total, 0);
    return trendPct(thisWeek, lastWeek);
  }, [chartData, sales, now]);

  // ── Opportunities ─────────────────────────────────────────────────────────

  const opportunities = useMemo(() => {
    const list: { title: string; detail: string; impact: string }[] = [];

    // 1. High margin potential
    const activeWithPrice = products.filter(
      (p) =>
        p.active !== false &&
        p.price != null &&
        p.costPrice != null &&
        p.price > 0
    );
    const topMarginProduct = activeWithPrice.sort((a, b) => {
      const ma = (a.price! - a.costPrice!) / a.price!;
      const mb = (b.price! - b.costPrice!) / b.price!;
      return mb - ma;
    })[0];
    if (topMarginProduct) {
      const margin = Math.round(
        ((topMarginProduct.price! - topMarginProduct.costPrice!) /
          topMarginProduct.price!) *
          100
      );
      list.push({
        title: "Margen alto disponible",
        detail: `${topMarginProduct.name} tiene ${margin}% de margen`,
        impact: "Potencial de subir precio sin perder clientes",
      });
    }

    // 2. Most co-purchased products
    const coMap: Record<string, number> = {};
    for (const sale of sales) {
      const ids = sale.items.map((i) => String(i.productId));
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const key = [ids[i], ids[j]].sort().join("|");
          coMap[key] = (coMap[key] ?? 0) + 1;
        }
      }
    }
    const topPair = Object.entries(coMap).sort((a, b) => b[1] - a[1])[0];
    if (topPair && topPair[1] >= 2) {
      const [idA, idB] = topPair[0].split("|");
      const nameA =
        products.find((p) => String(p.id) === idA)?.name ?? idA;
      const nameB =
        products.find((p) => String(p.id) === idB)?.name ?? idB;
      list.push({
        title: "Combo frecuente",
        detail: `${nameA} + ${nameB} se compran juntos`,
        impact: `${topPair[1]} veces — ofrecer como combo con descuento`,
      });
    }

    // 3. Inactive customers (no purchase in 30+ days)
    const thirtyDaysAgo = new Date(now - 30 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const inactiveCustomers = customers.filter(
      (c) =>
        c.lastPurchase == null ||
        c.lastPurchase.slice(0, 10) < thirtyDaysAgo
    );
    if (inactiveCustomers.length > 0) {
      list.push({
        title: "Clientes inactivos",
        detail: `${inactiveCustomers.length} cliente${inactiveCustomers.length > 1 ? "s" : ""} sin compra en 30+ dias`,
        impact: "Mensaje de reactivacion puede recuperar ventas",
      });
    }

    return list.slice(0, 3);
  }, [products, sales, customers, now]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Greeting bar ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-1">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {getGreeting()}
          </p>
          <p className="text-xs text-[var(--text-tertiary)] capitalize">
            {formatDateHeader()}
          </p>
        </div>

        {/* CTA principal — ver oportunidades del día (módulo Sugerencias IA) */}
        <a
          href="?tab=sugerencias-ia"
          className="inline-flex items-center gap-2 self-start sm:self-auto rounded-lg bg-[var(--accent)] px-3.5 py-2 text-xs font-bold text-white hover:bg-[var(--accent-dark)] dark:text-[var(--surface-canvas)] transition-colors shrink-0 shadow-sm"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Ver oportunidades del día
          <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* ── KPI grid — paleta rotativa por posicion ──
          Cada celda hereda --section-primary distinto: slate / cyan / orange /
          green. El KPICard usa esta CSS var para colorear el numero principal
          de manera diferenciada. Salud negocio se mantiene con su healthColor
          dinámico (verde/amber/rojo segun valor real). */}
      <div
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 [&>*:nth-child(1)]:[--section-primary:#0f172a] [&>*:nth-child(2)]:[--section-primary:#0891b2] [&>*:nth-child(3)]:[--section-primary:#c2410c] [&>*:nth-child(4)]:[--section-primary:#15803d]"
      >
        <KPICard
          label="Ventas hoy"
          value={fmt(kpis.revenue.today)}
          sub={<TrendBadge pct={kpis.revenue.trend} size="xs" />}
          icon={<TrendingUp className="w-4 h-4" />}
        />
        <KPICard
          label="Transacciones"
          value={String(kpis.transactions.today)}
          sub={<TrendBadge pct={kpis.transactions.trend} size="xs" />}
          icon={<ShoppingCart className="w-4 h-4" />}
        />
        <KPICard
          label="Ticket promedio"
          value={kpis.ticket.today > 0 ? fmt(kpis.ticket.today) : "Sin datos"}
          sub={
            kpis.ticket.today > 0 ? (
              <TrendBadge pct={kpis.ticket.trend} size="xs" />
            ) : undefined
          }
          icon={<Activity className="w-4 h-4" />}
        />
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-5 h-full flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Salud negocio
            </span>
            <Users className="w-4 h-4 text-[var(--text-tertiary)]" />
          </div>
          <p
            className={cn(
              "text-2xl sm:text-3xl font-extrabold leading-none tabular-nums tracking-tight",
              healthColor.text
            )}
          >
            {healthScore}
            <span className="text-sm font-bold text-[var(--text-tertiary)] ml-1">
              /100
            </span>
          </p>
          <div>
            <span
              className={cn(
                "text-xs px-2 py-0.5 rounded-full font-extrabold uppercase tracking-wider",
                healthColor.badge
              )}
            >
              {healthColor.label}
            </span>
          </div>
        </div>
      </div>

      {/* ── Two-column grid ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Alertas activas */}
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-[var(--text-tertiary)]" />
            <CardTitle className="text-sm font-semibold text-[var(--text-secondary)]">
              Alertas activas
            </CardTitle>
            {alerts.length > 0 && (
              <span className="ml-auto text-[length:var(--ts-2xs)] px-1.5 py-0.5 rounded-full bg-[var(--data-error-50)] dark:bg-red-950/30 text-[var(--data-error-500)] dark:text-[var(--data-error-500)] font-medium">
                {alerts.length}
              </span>
            )}
          </div>
          {alerts.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)]">
              Sin alertas activas
            </p>
          ) : (
            <ul className="space-y-2">
              {alerts.map((alert, i) => (
                <li key={i} className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      alert.level === "urgente"
                        ? "bg-[var(--data-error-500)]"
                        : "bg-[var(--data-warning-500)]"
                    )}
                  />
                  <span className="text-xs text-[var(--text-secondary)]">
                    {alert.text}
                  </span>
                  <span
                    className={cn(
                      "ml-auto text-[length:var(--ts-2xs)] font-medium shrink-0",
                      alert.level === "urgente"
                        ? "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]"
                        : "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]"
                    )}
                  >
                    {alert.level}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Ventas ultimos 7 dias */}
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[var(--text-tertiary)]" />
              <CardTitle className="text-sm font-semibold text-[var(--text-secondary)]">
                Ultimos 7 dias
              </CardTitle>
            </div>
            <TrendBadge pct={weekOverWeek} size="xs" />
          </div>
          {chartData.every((d) => d.total === 0) ? (
            <div className="flex items-center justify-center h-20">
              <p className="text-xs text-[var(--text-tertiary)]">
                Sin datos de ventas
              </p>
            </div>
          ) : (
            <ResponsiveContainer minWidth={0} width="100%" height={80}>
              <BarChart
                data={chartData}
                margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                barCategoryGap="20%"
              >
                <XAxis
                  dataKey="label"
                  tick={{
                    fontSize: 10,
                    fill: "currentColor",
                    className: "text-[var(--text-tertiary)]",
                  }}
                  axisLine={false}
                  tickLine={false}
                />
                <Bar dataKey="total" radius={[3, 3, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.isToday ? "var(--accent)" : "#6ee7b7"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Oportunidades — paleta rotativa ──
          Cada card hereda --opp-accent y --opp-bg distintos para que las 3
          oportunidades sean visualmente distinguibles a primera vista. */}
      {opportunities.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3 px-1">
            <Package className="w-4 h-4 text-[var(--text-tertiary)]" />
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Oportunidades detectadas
            </CardTitle>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 [&>*:nth-child(1)]:[--opp-accent:#15803d] [&>*:nth-child(1)]:[--opp-bg:rgb(220_252_231)] [&>*:nth-child(1)]:[--opp-accent-dark:#4ade80] [&>*:nth-child(1)]:[--opp-bg-dark:rgb(20_83_45/0.35)] [&>*:nth-child(2)]:[--opp-accent:#0891b2] [&>*:nth-child(2)]:[--opp-bg:rgb(207_250_254)] [&>*:nth-child(2)]:[--opp-accent-dark:#22d3ee] [&>*:nth-child(2)]:[--opp-bg-dark:rgb(22_78_99/0.35)] [&>*:nth-child(3)]:[--opp-accent:#c2410c] [&>*:nth-child(3)]:[--opp-bg:rgb(255_237_213)] [&>*:nth-child(3)]:[--opp-accent-dark:#ff8676] [&>*:nth-child(3)]:[--opp-bg-dark:rgb(124_45_18/0.35)]">
            {opportunities.map((opp, i) => (
              <div
                key={i}
                className="rounded-xl p-5 border-2 transition-transform hover:scale-[1.02] bg-[var(--opp-bg)] dark:bg-[var(--opp-bg-dark)] border-[color-mix(in_srgb,var(--opp-accent)_30%,transparent)] dark:border-[color-mix(in_srgb,var(--opp-accent-dark)_40%,transparent)]"
              >
                <p className="text-sm font-extrabold mb-2 leading-tight text-[var(--opp-accent)] dark:text-[var(--opp-accent-dark)]">
                  {opp.title}
                </p>
                <p className="text-sm text-[var(--text-primary)] mb-2 leading-relaxed font-medium">
                  {opp.detail}
                </p>
                <p className="text-xs font-semibold leading-relaxed text-[var(--opp-accent)] dark:text-[var(--opp-accent-dark)]">
                  {opp.impact}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
