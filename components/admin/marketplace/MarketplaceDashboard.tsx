"use client";

/**
 * MarketplaceDashboard — Resumen del puesto del negocio dentro del Marketplace.
 *
 * Importante: TODOS los KPIs y gráficos representan SOLO la actividad del
 * negocio (esta tienda) DENTRO del marketplace global. No mide la performance
 * del marketplace completo ni la de la tienda individual (página propia).
 *
 *   Mide: pedidos recibidos vía marketplace, GMV propio, productos publicados
 *         en la vitrina del marketplace, comisión que paga el negocio,
 *         crecimiento de su tráfico/ventas dentro del marketplace, top
 *         productos propios, canales por los que llegan los compradores y
 *         tasa de conversión propia.
 *
 *   No mide: total de tiendas, ranking entre tiendas, GMV global del
 *           marketplace ni metrics agregados de toda la plataforma.
 *
 * Estructura visual:
 *   Hero       → filtro temporal + meta del período + barra de progreso
 *   Row 1 (4)  → StatCards: Pedidos · GMV propio · Productos publicados · Comisión
 *   Row 2      → Compound chart: GMV + Pedidos + Ticket promedio (mismo bucket)
 *   Row 3 (2)  → Crecimiento de mi tienda (visitas + pedidos WoW)
 *                · Pedidos por canal (Web/Mobile/WhatsApp/Instagram)
 *   Row 4 (3)  → Top productos propios · Categorías top propias · Tasa de conversión
 *   Footer     → Alerta de comisión pendiente
 */

import { useEffect, useMemo, useState } from "react";
import { CardTitle, SectionTitle, StatCard } from "@buleje/design-system";
import {
  ShoppingCart,
  DollarSign,
  TrendingUp,
  Layers,
  Target,
  Smartphone,
  CreditCard,
  Package,
} from "@buleje/design-system/icons";
import {
  BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
  Line, Area, ComposedChart,
} from "recharts";
import {
  ChartCard,
  ChartTooltip,
  CHART_TOKENS,
  MicroDonut,
  MicroList,
  MicroGauge,
} from "@/components/admin/inicio/_shared";
import { BulejeComposedChart } from "@/components/ui-system/charts";
import DashboardDateRange, {
  type DateRange,
  getDefaultRange,
} from "@/components/admin/inicio/DashboardDateRange";

const T = CHART_TOKENS;

// ── Props ────────────────────────────────────────────────────────────────────
interface MarketplaceDashboardProps {
  kpis: { publishedProducts: number; monthOrders: number; pendingCommissions: number };
  loading?: boolean;
}

// ── Modelo de datos del DASHBOARD DEL NEGOCIO (no del marketplace global) ────
interface MyStoreDashboardData {
  /** Pedidos recibidos por mi tienda vía marketplace, en el rango. */
  myOrders: number;
  /** Ventas brutas (GMV) que recibí vía marketplace, en el rango. */
  myGmv: number;
  /** Productos míos actualmente publicados en la vitrina del marketplace. */
  publishedProducts: number;
  /** Comisión que pago al marketplace por las ventas del rango. */
  myCommission: number;
  /** Δ% pedidos vs período anterior comparable. */
  dOrders: number | null;
  /** Δ% GMV vs período anterior comparable. */
  dGmv: number | null;
  /** Serie temporal por bucket (hora/día/semana/mes) — alineada al rango. */
  series: { dia: string; gmv: number; orders: number }[];
  /** Crecimiento WoW de MI tienda: visitas + pedidos últimas 8 semanas. */
  myGrowth: { semana: string; visitas: number; pedidos: number }[];
  /** Pedidos míos por canal de origen (de dónde vino el comprador). */
  channelData: { name: string; value: number; color: string }[];
  /** GMV propio distribuido por categoría de mis productos. */
  categoryData: { name: string; value: number; color: string }[];
  /** Top 5 productos propios por revenue. */
  topProducts: { name: string; value: number; label: string; sublabel: string }[];
  /** Tasa de conversión: visitas → pedidos en mi puesto. */
  conversionRate: number;
  /** Visitas a mi puesto en el rango (denominador de conversión). */
  visits: number;
  /** Sparklines últimos 7 buckets. */
  sparkOrders: number[];
  sparkGmv: number[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtSoles = (v: number) =>
  v >= 1000 ? `S/ ${(v / 1000).toFixed(1)}k` : `S/ ${Math.round(v)}`;

const fmtNum = (v: number) => v.toLocaleString("es-PE");

const PRESET_META_LABEL: Record<string, string> = {
  diario: "Meta del día",
  semanal: "Meta de la semana",
  mensual: "Meta del mes",
  anual: "Meta del año",
  personalizado: "Meta del período",
};

const PRESET_PROYECCION_LABEL: Record<string, string> = {
  diario: "Proyección hoy",
  semanal: "Proyección semana",
  mensual: "Proyección mes",
  anual: "Proyección año",
  personalizado: "Proyección período",
};

const PRESET_RANGE_LABEL: Record<string, string> = {
  diario: "Hoy",
  semanal: "Esta semana",
  mensual: "Este mes",
  anual: "Este año",
  personalizado: "Período",
};

function daysInRange(range: DateRange): number {
  const ms = range.to.getTime() - range.from.getTime();
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)) + 1);
}

function bucketStrategy(nDays: number): "hour" | "day" | "week" | "month" {
  if (nDays <= 1) return "hour";
  if (nDays <= 31) return "day";
  if (nDays <= 120) return "week";
  return "month";
}

// ── Mock determinista: simula la actividad de MI tienda en marketplace ───────
function buildMockData(
  kpis: { publishedProducts: number; monthOrders: number; pendingCommissions: number },
  range: DateRange,
): MyStoreDashboardData {
  const seed = kpis.monthOrders + kpis.publishedProducts;
  const variar = (i: number) => 0.7 + ((seed + i * 7) % 13) / 20;
  const nDays = daysInRange(range);
  const strategy = bucketStrategy(nDays);

  const ratio = nDays / 30;
  const ordersTarget = Math.max(0, Math.round(kpis.monthOrders * ratio));
  const baselineGmv = kpis.publishedProducts > 0 && ordersTarget === 0 ? 800 * ratio : 0;
  const gmvTarget = ordersTarget * 25 + baselineGmv;

  // Buckets temporales
  let buckets: { dia: string; gmv: number; orders: number }[];
  if (strategy === "hour") {
    buckets = Array.from({ length: 24 }, (_, i) => ({
      dia: `${String(i).padStart(2, "0")}:00`,
      gmv: 0, orders: 0,
    }));
  } else if (strategy === "day") {
    buckets = Array.from({ length: nDays }, (_, i) => {
      const d = new Date(range.from);
      d.setDate(d.getDate() + i);
      return {
        dia: d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" }),
        gmv: 0, orders: 0,
      };
    });
  } else if (strategy === "week") {
    const nWeeks = Math.ceil(nDays / 7);
    buckets = Array.from({ length: nWeeks }, (_, i) => {
      const d = new Date(range.from);
      d.setDate(d.getDate() + i * 7);
      return {
        dia: `Sem ${i + 1}`,
        gmv: 0, orders: 0,
      };
    });
  } else {
    const nMonths = Math.max(1, Math.round(nDays / 30));
    buckets = Array.from({ length: nMonths }, (_, i) => {
      const d = new Date(range.from);
      d.setMonth(d.getMonth() + i);
      return {
        dia: d.toLocaleDateString("es-PE", { month: "short", year: "2-digit" }),
        gmv: 0, orders: 0,
      };
    });
  }

  const nB = buckets.length;
  buckets = buckets.map((b, i) => {
    const gmv = Math.round(variar(i) * (gmvTarget / nB) * 100) / 100;
    const orders = Math.max(0, Math.round(variar(i) * (ordersTarget / nB)));
    return { ...b, gmv, orders };
  });

  const myOrders = buckets.reduce((s, b) => s + b.orders, 0);
  const myGmv = Math.round(buckets.reduce((s, b) => s + b.gmv, 0) * 100) / 100;
  const dOrders = myOrders > 0 ? 8 + ((seed + 1) % 11) : null;
  const dGmv = myGmv > 0 ? 5 + ((seed + 3) % 14) : null;

  // Crecimiento WoW de MI tienda — visitas + pedidos últimas 8 semanas
  const myGrowth = Array.from({ length: 8 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (7 - i) * 7);
    const baseV = Math.max(20, Math.round((40 + i * 8) * (1 + ((seed + i) % 5) / 20)));
    const baseP = Math.max(1, Math.round(myOrders / 8 + ((seed + i) % 3)));
    return {
      semana: `Sem ${i + 1}`,
      visitas: baseV,
      pedidos: baseP,
    };
  });

  // Canales por los que mis compradores llegaron al marketplace.
  // Colores leídos del DS (--data-N) — sincronizados con globals.css.
  const channelData = [
    { name: "Web",       ratio: 0.42, color: T.brand   },  // --data-5 teal
    { name: "Mobile",    ratio: 0.32, color: T.primary },  // --data-1 dark
    { name: "WhatsApp",  ratio: 0.18, color: T.emerald },  // --data-success
    { name: "Instagram", ratio: 0.08, color: T.violet  },  // --data-8
  ]
    .map((c) => ({ name: c.name, value: Math.round(myOrders * c.ratio), color: c.color }))
    .filter((c) => c.value > 0);

  // Categorías de MIS productos por GMV — paleta del DS (data-1..8).
  const categoryData = [
    { name: "Abarrotes", ratio: 0.35, color: T.primary  }, // --data-1
    { name: "Bebidas",   ratio: 0.20, color: T.brand    }, // --data-5
    { name: "Lácteos",   ratio: 0.15, color: T.blue     }, // --data-6
    { name: "Carnes",    ratio: 0.12, color: T.amber    }, // --data-7
    { name: "Frutas",    ratio: 0.10, color: T.violet   }, // --data-8
    { name: "Otros",     ratio: 0.08, color: T.tertiary }, // --data-3
  ]
    .map((c) => ({ name: c.name, value: Math.round(myGmv * c.ratio), color: c.color }))
    .filter((c) => c.value > 0);

  // Top 5 PRODUCTOS PROPIOS por revenue (no top tiendas, mis productos)
  const topProductNames = [
    "Arroz Costeño 5kg",
    "Aceite Primor 1L",
    "Leche Gloria 400g",
    "Pollo entero 2kg",
    "Cerveza Cusqueña x6",
  ];
  const topProducts = topProductNames
    .map((n, i) => {
      const v = Math.round(myGmv * (0.22 - i * 0.035));
      const units = Math.max(1, Math.round(myOrders * (0.28 - i * 0.045)));
      return {
        name: n,
        value: v,
        label: fmtSoles(v),
        sublabel: `${units} unid.`,
      };
    })
    .filter((p) => p.value > 0);

  const myCommission = Math.round(kpis.pendingCommissions * ratio * 100) / 100;
  const visits = myGrowth.reduce((s, g) => s + g.visitas, 0);
  const conversionRate = visits > 0 ? Math.round((myOrders / visits) * 1000) / 10 : 0;

  const sparkSlice = buckets.slice(-Math.min(7, buckets.length));

  return {
    myOrders,
    myGmv,
    publishedProducts: kpis.publishedProducts,
    myCommission,
    dOrders,
    dGmv,
    series: buckets,
    myGrowth,
    channelData,
    categoryData,
    topProducts,
    conversionRate,
    visits,
    sparkOrders: sparkSlice.map((b) => b.orders),
    sparkGmv: sparkSlice.map((b) => b.gmv),
  };
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function MarketplaceDashboard({ kpis, loading }: MarketplaceDashboardProps) {
  const [dateRange, setDateRange] = useState<DateRange>(() => getDefaultRange());
  const [apiData, setApiData] = useState<MyStoreDashboardData | null>(null);

  const rangeQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("from", dateRange.from.toISOString());
    params.set("to", dateRange.to.toISOString());
    params.set("preset", dateRange.preset);
    return `?${params.toString()}`;
  }, [dateRange]);

  useEffect(() => {
    let active = true;
    fetch(`/api/marketplace/dashboard${rangeQuery}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d && typeof d === "object") setApiData(d as MyStoreDashboardData);
      })
      .catch(() => { /* silent fallback to mock */ });
    return () => { active = false; };
  }, [rangeQuery]);

  const data = useMemo<MyStoreDashboardData>(
    () => apiData ?? buildMockData(kpis, dateRange),
    [apiData, kpis, dateRange],
  );

  // ── Métricas del hero ───────────────────────────────────────────────────────
  const presetKey = dateRange.preset;
  const nDays = daysInRange(dateRange);
  const avgPerBucket = data.myGmv / Math.max(1, data.series.length);
  const metaFloor =
    presetKey === "diario" ? 200
    : presetKey === "semanal" ? 1500
    : presetKey === "anual" ? 80000
    : presetKey === "personalizado" ? Math.max(300, nDays * 100)
    : 6000;
  const metaTarget = Math.max(metaFloor, Math.round(avgPerBucket * data.series.length * 1.1));
  const metaPct = Math.min(100, Math.round((data.myGmv / Math.max(1, metaTarget)) * 100));
  const proyTotal = Math.round(avgPerBucket * data.series.length);
  const proyPct = Math.min(150, Math.round((proyTotal / Math.max(1, metaTarget)) * 100));
  const topChannel = data.channelData.length > 0
    ? [...data.channelData].sort((a, b) => b.value - a.value)[0]
    : null;

  // Compound chart: GMV bar + Pedidos line + AOV area por bucket
  const compound = useMemo(
    () =>
      data.series.map((d) => ({
        dia: d.dia,
        gmv: d.gmv,
        pedidos: d.orders,
        aov: d.orders > 0 ? Math.round((d.gmv / d.orders) * 100) / 100 : 0,
      })),
    [data.series],
  );

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-5">
      {/* ── HERO: filtro + meta del período ─────────────────────────────── */}
      <section
        data-testid="marketplace-resumen-hero"
        className="rounded-2xl border border-[var(--rule-base)] bg-linear-to-br from-[var(--surface-raised)] via-[var(--surface-raised)] to-primary/5 p-6 sm:p-8 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-primary mb-2">
              {PRESET_RANGE_LABEL[presetKey]} · mi puesto en el marketplace
            </p>
            <SectionTitle className="font-display tracking-tight">
              {PRESET_META_LABEL[presetKey] ?? PRESET_META_LABEL.mensual}
            </SectionTitle>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] mt-1.5 max-w-xl">
              Solo mide la actividad de tu negocio dentro del marketplace, no tu tienda individual.
            </p>
          </div>
          <DashboardDateRange value={dateRange} onChange={setDateRange} />
        </div>

        <div className="flex flex-wrap items-end justify-between gap-5 mb-4">
          <p className="font-display text-[var(--text-primary)] tabular-nums tracking-tight leading-none">
            <span className="text-xl sm:text-2xl font-bold align-top text-[var(--text-secondary)] mr-1">S/</span>
            <span className="text-4xl sm:text-5xl lg:text-6xl font-extrabold">
              {Math.round(data.myGmv).toLocaleString("es-PE")}
            </span>
            <span className="text-[var(--text-tertiary)] font-medium mx-2 text-base sm:text-lg">de</span>
            <span className="text-xl sm:text-2xl font-bold text-[var(--text-secondary)]">
              S/ {metaTarget.toLocaleString("es-PE")}
            </span>
            <span className="ml-3 text-[var(--text-tertiary)] font-extrabold text-base sm:text-lg">
              ({metaPct}%)
            </span>
          </p>
          <div className="flex items-center gap-2.5 flex-wrap">
            {topChannel && (
              <span className="inline-flex items-center gap-2.5 rounded-full border border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-2">
                <span className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  Canal pico
                </span>
                <span className="text-base font-extrabold tabular-nums text-[var(--text-primary)]">
                  {topChannel.name}
                </span>
              </span>
            )}
            <span className="inline-flex items-center gap-2.5 rounded-full border border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-2">
              <span className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                {PRESET_PROYECCION_LABEL[presetKey] ?? PRESET_PROYECCION_LABEL.mensual}
              </span>
              <span
                className={
                  "text-base font-extrabold tabular-nums " +
                  (proyPct >= 100 ? "text-[var(--data-success-500)]" : "text-[var(--data-warning-500)]")
                }
              >
                {proyPct}%
              </span>
            </span>
          </div>
        </div>

        <div className="h-3 rounded-full bg-[var(--surface-sunken)] overflow-hidden ring-1 ring-[var(--rule-soft)]">
          <div
            className={
              "h-full rounded-full transition-all duration-700 ease-out " +
              (metaPct >= 75
                ? "bg-linear-to-r from-[var(--data-success-500)] to-emerald-400"
                : metaPct >= 40
                  ? "bg-linear-to-r from-primary to-[var(--data-6)]"
                  : "bg-linear-to-r from-[var(--data-warning-500)] to-amber-400")
            }
            style={{ width: `${Math.max(2, metaPct)}%` }}
          />
        </div>
      </section>

      {/* ── ROW 1: KPIs principales del puesto ─────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="marketplace-kpi-row">
        <StatCard
          label={`Pedidos · ${PRESET_RANGE_LABEL[presetKey].toLowerCase()}`}
          value={fmtNum(data.myOrders)}
          icon={ShoppingCart}
          delta={data.dOrders}
          sparkline={data.sparkOrders.length >= 2 ? { data: data.sparkOrders } : undefined}
        />
        <StatCard
          label={`GMV · ${PRESET_RANGE_LABEL[presetKey].toLowerCase()}`}
          value={fmtSoles(data.myGmv)}
          icon={DollarSign}
          delta={data.dGmv}
          sparkline={data.sparkGmv.length >= 2 ? { data: data.sparkGmv } : undefined}
        />
        <StatCard
          label="Productos publicados"
          value={fmtNum(data.publishedProducts)}
          icon={Package}
        />
        <StatCard
          label="Comisión del período"
          value={`S/ ${data.myCommission.toFixed(2)}`}
          icon={TrendingUp}
          emphasis={data.myCommission > 0 ? "warning" : "neutral"}
        />
      </div>

      {/* ── ROW 2: Compound chart — GMV + Pedidos + Ticket promedio ───── */}
      <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 sm:p-7 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1.5">
              {PRESET_RANGE_LABEL[presetKey]} · 3 series correlacionadas
            </p>
            <CardTitle className="font-display tracking-tight text-xl sm:text-2xl font-extrabold">
              Mi GMV, Pedidos y Ticket promedio
            </CardTitle>
            <p className="text-sm font-medium text-[var(--text-secondary)] mt-1">
              Cómo se mueve tu puesto a lo largo del rango seleccionado.
            </p>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <LegendDot color="var(--color-primary)" label="GMV" />
            <LegendDot color={T.brand} label="Pedidos" filled={false} />
            <LegendDot color={T.tertiary} label="Ticket prom." filled />
          </div>
        </div>
        <BulejeComposedChart
          data={compound}
          xKey="dia"
          bars={[{ key: "gmv", label: "GMV (S/)", color: "primary", yAxis: "left" }]}
          lines={[{ key: "pedidos", label: "Pedidos", color: "accent", yAxis: "right" }]}
          areas={[
            { key: "aov", label: "Ticket prom. (S/)", color: "tertiary", yAxis: "right", opacity: 0.18 },
          ]}
          leftAxisFormat={(v) => `S/${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
          rightAxisFormat={(v) => v.toString()}
          tooltipFormat={(v, name) => {
            const lower = (name ?? "").toLowerCase();
            if (lower.includes("gmv") || lower.includes("ticket")) {
              return `S/ ${Number(v).toLocaleString("es-PE")}`;
            }
            return Number(v).toLocaleString("es-PE");
          }}
          height={340}
          minDataPoints={2}
        />
      </section>

      {/* ── ROW 3: Crecimiento de mi tienda + Pedidos por canal ─────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard
          title="Crecimiento de mi tienda"
          Icon={TrendingUp}
          height={300}
          subtitle="Visitas y pedidos por semana · últimas 8 semanas"
          isEmpty={data.myGrowth.length === 0}
          emptyText="Sin datos históricos"
        >
          <ResponsiveContainer minWidth={0} width="100%" height="100%">
            <ComposedChart data={data.myGrowth} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="visitsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"  stopColor={T.brand} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={T.brand} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="0" stroke={T.grid} vertical={false} />
              <XAxis dataKey="semana" tick={{ fontSize: T.axisFontSize, fill: T.tickFill, fontWeight: T.axisFontWeight }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left"  tick={{ fontSize: T.axisFontSize, fill: T.tickFill, fontWeight: T.axisFontWeight }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: T.axisFontSize, fill: T.tickFill, fontWeight: T.axisFontWeight }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="visitas"
                name="Visitas"
                stroke={T.brand}
                strokeWidth={2.5}
                fill="url(#visitsGradient)"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="pedidos"
                name="Pedidos"
                stroke={T.primary}
                strokeWidth={3}
                dot={{ r: 4, fill: T.primary }}
                activeDot={{ r: 6 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Pedidos por canal"
          Icon={Smartphone}
          height={300}
          subtitle={`${PRESET_RANGE_LABEL[presetKey]} · de dónde vienen tus compradores`}
          isEmpty={data.channelData.length === 0}
          emptyText="Sin pedidos en el período"
        >
          <ResponsiveContainer minWidth={0} width="100%" height="100%">
            <BarChart data={data.channelData} barCategoryGap="22%" margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="0" stroke={T.grid} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: T.axisFontSize, fill: T.tickFill, fontWeight: T.axisFontWeight }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: T.axisFontSize, fill: T.tickFill, fontWeight: T.axisFontWeight }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--rule-soft)", opacity: 0.5 }} />
              <Bar dataKey="value" name="Pedidos" radius={[10, 10, 0, 0]} maxBarSize={56}>
                {data.channelData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── ROW 4: Top productos + Categorías + Conversión ─────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ChartCard
          title="Mis categorías top"
          Icon={CreditCard}
          height={280}
          subtitle={`${PRESET_RANGE_LABEL[presetKey]} · GMV por categoría`}
          isEmpty={data.categoryData.length === 0}
          emptyText="Sin ventas"
        >
          <MicroDonut
            data={data.categoryData}
            centerLabel={fmtSoles(data.myGmv)}
            centerSubLabel="GMV total"
            tooltipFormatter={(v) => `S/ ${v.toFixed(2)}`}
            height={210}
          />
        </ChartCard>

        <ChartCard
          title="Top 5 productos vendidos"
          Icon={Layers}
          height={280}
          subtitle={`${PRESET_RANGE_LABEL[presetKey]} · revenue por producto`}
          isEmpty={data.topProducts.length === 0}
          emptyText="Sin productos con ventas"
        >
          <MicroList items={data.topProducts} barColor="var(--data-1)" showRank />
        </ChartCard>

        <ChartCard
          title="Tasa de conversión"
          Icon={Target}
          height={280}
          subtitle={`${fmtNum(data.visits)} visitas → ${fmtNum(data.myOrders)} pedidos`}
        >
          <MicroGauge
            value={Math.min(data.conversionRate * 20, 100)}
            max={100}
            size={210}
            strokeWidth={14}
            centerLabel={`${data.conversionRate.toFixed(1)}%`}
            centerSubLabel="visita → pedido"
            footerText={
              data.conversionRate >= 4
                ? "Conversión excelente"
                : data.conversionRate >= 2
                  ? "Conversión media"
                  : data.conversionRate > 0
                    ? "Optimizar funnel"
                    : "Sin datos"
            }
          />
        </ChartCard>
      </div>

      {/* ── FOOTER: alerta de comisión pendiente ──────────────────── */}
      {data.myCommission > 0 && (
        <div className="rounded-2xl border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] dark:bg-amber-950/20 px-6 py-5 flex items-center gap-4 flex-wrap shadow-sm">
          <span className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-[var(--data-warning-500)]/10 text-[var(--data-warning-500)] shrink-0">
            <DollarSign className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--data-warning-500)]">
              Comisión pendiente
            </p>
            <p className="font-display text-lg sm:text-xl font-extrabold text-[var(--data-warning-500)] tabular-nums tracking-tight mt-0.5">
              S/ {data.myCommission.toFixed(2)} <span className="text-sm font-semibold text-[var(--text-secondary)] tracking-normal">pendientes de liquidación al marketplace</span>
            </p>
          </div>
          <a
            href="/admin?module=negocio&section=marketplace&tab=comisiones"
            className="text-sm font-extrabold text-[var(--data-warning-500)] underline underline-offset-2 hover:opacity-80 shrink-0"
          >
            Ver detalle →
          </a>
        </div>
      )}
    </div>
  );
}

// ── Componentes auxiliares ───────────────────────────────────────────────────
function LegendDot({ color, label, filled = true }: { color: string; label: string; filled?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-secondary)]">
      <span
        className="h-3 w-3 rounded-full ring-2"
        style={{
          backgroundColor: filled ? color : "transparent",
          boxShadow: `inset 0 0 0 ${filled ? 0 : 2}px ${color}`,
          // @ts-expect-error css custom prop
          "--tw-ring-color": color,
        }}
      />
      {label}
    </span>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="rounded-2xl bg-[var(--surface-sunken)] h-36" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-[var(--surface-sunken)] rounded-2xl h-28" />)}
      </div>
      <div className="bg-[var(--surface-sunken)] rounded-2xl h-[360px]" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="bg-[var(--surface-sunken)] rounded-2xl h-[320px]" />
        <div className="bg-[var(--surface-sunken)] rounded-2xl h-[320px]" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-[var(--surface-sunken)] rounded-2xl h-[280px]" />)}
      </div>
    </div>
  );
}
