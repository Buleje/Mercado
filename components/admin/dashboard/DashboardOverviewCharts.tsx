"use client";

/**
 * DashboardOverviewCharts — 6 charts de alto nivel, 1 por categoría.
 *
 * Categorías: Ventas | Compras | Clientes | Inventario | Productos | Caja
 * Cada chart respeta el filtro `period` (y `dateRange` en modo custom).
 *
 * Buckets por período:
 *   hoy   → 24 puntos (por hora)
 *   semana → 7 puntos (por día)
 *   mes   → 4-5 puntos (por semana)
 *   año   → 12 puntos (por mes)
 *   custom → por día (max 90 puntos)
 */

import {
  ResponsiveContainer,
  AreaChart,
  BarChart,
  LineChart,
  Area,
  Bar,
  Line,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  DollarSign,
  Truck,
  Users,
  Package,
  Tag,
  Banknote,
} from "@buleje/design-system/icons";
import { ChartCard } from "@buleje/design-system/dashboard";
import { cn } from "@/lib/utils";
import type { Period, DateRange } from "@buleje/design-system/dashboard";
import type { Sale, Purchase } from "@/types/erp";

// ── Tipos locales ─────────────────────────────────────────────────────────────

interface OrderItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
  unit: string;
  image: string;
}

interface Order {
  id: string;
  customer: { name: string; phone?: string; location: string; reference: string };
  items: OrderItem[];
  total: number;
  status: "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado";
  paymentMethod?: string;
  createdAt: string;
  updatedAt: string;
}

interface Product {
  id: string | number;
  name: string;
  category?: string;
  stock?: number;
  price: number;
  costPrice?: number;
  active?: boolean;
}

export interface DashboardOverviewChartsProps {
  period: Period;
  dateRange?: DateRange;
  orders: Order[];
  sales: Sale[];
  purchases: Purchase[];
  products: Product[];
  customers: { phone?: string; createdAt?: string }[];
}

// ── Helpers de bucketing ──────────────────────────────────────────────────────

function dateKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weekKey(iso: string) {
  const d = new Date(iso);
  // ISO week start = lunes
  const day = d.getDay() || 7;
  const mon = new Date(d);
  mon.setDate(d.getDate() - day + 1);
  return `${mon.getFullYear()}-W${String(Math.ceil((mon.getDate()) / 7)).padStart(2, "0")}-${mon.toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}`;
}

function monthKey(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-PE", { month: "short", year: "numeric" });
}

function hourKey(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:00`;
}

type BucketFn = (iso: string) => string;

function getBucketFn(period: Period): BucketFn {
  if (period === "hoy")   return hourKey;
  if (period === "semana") return (iso) => new Date(iso).toLocaleDateString("es-PE", { weekday: "short", day: "numeric" });
  if (period === "mes")   return weekKey;
  if (period === "año")   return monthKey;
  return dateKey; // custom
}

function isInPeriod(iso: string, period: Period, dateRange?: DateRange): boolean {
  const d = new Date(iso);
  const now = new Date();
  if (period === "hoy") return d.toDateString() === now.toDateString();
  if (period === "semana") {
    const w = new Date(now); w.setDate(w.getDate() - 7); return d >= w;
  }
  if (period === "mes") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  if (period === "año")  return d.getFullYear() === now.getFullYear();
  if (period === "custom" && dateRange?.from && dateRange?.to) {
    const from = new Date(dateRange.from + "T00:00:00");
    const to   = new Date(dateRange.to   + "T23:59:59");
    return d >= from && d <= to;
  }
  return true;
}

/** Acumula una serie numérica en buckets y devuelve array [{label, value}] ordenado. */
function buildBuckets(
  entries: { iso: string; value: number }[],
  bucketFn: BucketFn,
): { label: string; value: number }[] {
  const map = new Map<string, number>();
  entries.forEach(({ iso, value }) => {
    const k = bucketFn(iso);
    map.set(k, (map.get(k) ?? 0) + value);
  });
  // Para hoy, ordenar numéricamente por hora
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, value]) => ({ label, value }));
}

// ── Tooltip styles ────────────────────────────────────────────────────────────

const tooltipStyle = {
  contentStyle: {
    background: "var(--surface-raised)",
    border: "1px solid var(--rule-soft)",
    borderRadius: "8px",
    fontSize: "11px",
    color: "var(--text-primary)",
  },
  cursor: { fill: "var(--surface-sunken)" },
};

// ── Etiquetas de eje X truncadas ──────────────────────────────────────────────

function shortLabel(label: string, period: Period): string {
  if (period === "hoy") return label; // "08:00"
  if (period === "semana") return label.split(" ")[0]; // "lun."
  if (period === "año") return label.slice(0, 3); // "ene"
  return label.length > 6 ? label.slice(0, 6) : label;
}

// ── Colores de categorías (tokens CSS) ────────────────────────────────────────

const CAT_COLORS_TOKEN: Record<string, string> = {
  "frutas-verduras": "var(--data-success)",
  abarrotes:         "var(--data-warning)",
  carnes:            "var(--data-error)",
  lacteos:           "var(--accent)",
  bebidas:           "#8b5cf6",
  limpieza:          "#06b6d4",
};

// ── Sub-charts ────────────────────────────────────────────────────────────────

// 1. Ventas — AreaChart ingresos agregados
function ChartVentas({
  data,
  period,
}: {
  data: { label: string; value: number }[];
  period: Period;
}) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <ResponsiveContainer minWidth={0} width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="oc-ventas-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="var(--data-success)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--data-success)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-soft)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
          tickFormatter={(v) => shortLabel(String(v), period)}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
          tickFormatter={(v: number) => `S/${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <Tooltip
          formatter={(v) => [`S/${Number(v).toFixed(2)}`, "Ingresos"]}
          {...tooltipStyle}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--data-success)"
          strokeWidth={2}
          fill="url(#oc-ventas-grad)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// 2. Compras por proveedor — BarChart
function ChartCompras({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <ResponsiveContainer minWidth={0} width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-soft)" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
          tickFormatter={(v: number) => `S/${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={80}
          tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) => v.length > 10 ? v.slice(0, 10) + "…" : v}
        />
        <Tooltip
          formatter={(v) => [`S/${Number(v).toFixed(2)}`, "Total compras"]}
          {...tooltipStyle}
        />
        <Bar dataKey="value" fill="var(--data-warning)" radius={[0, 4, 4, 0]} maxBarSize={20} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// 3. Nuevos clientes — LineChart
function ChartClientes({
  data,
  period,
}: {
  data: { label: string; value: number }[];
  period: Period;
}) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <ResponsiveContainer minWidth={0} width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-soft)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
          tickFormatter={(v) => shortLabel(String(v), period)}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
          axisLine={false}
          tickLine={false}
          width={28}
        />
        <Tooltip
          formatter={(v) => [Number(v), "Nuevos clientes"]}
          {...tooltipStyle}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="var(--accent)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--accent)", strokeWidth: 0 }}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// 4. Stock por categoría — BarChart
function ChartInventario({
  data,
}: {
  data: { label: string; value: number; color: string }[];
}) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <ResponsiveContainer minWidth={0} width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-soft)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) => v.length > 7 ? v.slice(0, 7) + "…" : v}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
          axisLine={false}
          tickLine={false}
          width={32}
        />
        <Tooltip
          formatter={(v) => [Number(v), "Uds. en stock"]}
          {...tooltipStyle}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={32}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// 5. Top categorías por ingresos — BarChart
function ChartProductos({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <ResponsiveContainer minWidth={0} width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-soft)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) => v.length > 7 ? v.slice(0, 7) + "…" : v}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
          tickFormatter={(v: number) => `S/${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <Tooltip
          formatter={(v) => [`S/${Number(v).toFixed(2)}`, "Ingresos"]}
          {...tooltipStyle}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40}>
          {data.map((entry, i) => {
            const catKey = Object.keys(CAT_COLORS_TOKEN).find((k) =>
              entry.label.toLowerCase().includes(k.split("-")[0]),
            );
            const color = catKey ? CAT_COLORS_TOKEN[catKey] : "var(--accent)";
            return <rect key={i} fill={color} />;
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// 6. Flujo de caja — BarChart entrada vs salida
function ChartCaja({
  data,
  period,
}: {
  data: { label: string; entrada: number; salida: number }[];
  period: Period;
}) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <ResponsiveContainer minWidth={0} width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-soft)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
          tickFormatter={(v) => shortLabel(String(v), period)}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
          tickFormatter={(v: number) => `S/${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <Tooltip
          formatter={(v, name) => [
            `S/${Number(v).toFixed(2)}`,
            name === "entrada" ? "Ingresos" : "Compras",
          ]}
          {...tooltipStyle}
        />
        <Bar dataKey="entrada" fill="var(--data-success)" radius={[4, 4, 0, 0]} maxBarSize={24} />
        <Bar dataKey="salida"  fill="var(--data-error)"   radius={[4, 4, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-xs text-[var(--text-tertiary)]">Sin datos para el período</p>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

const CAT_LABEL_MAP: Record<string, string> = {
  "frutas-verduras": "Frutas",
  abarrotes:         "Abarrotes",
  carnes:            "Carnes",
  lacteos:           "Lácteos",
  bebidas:           "Bebidas",
  limpieza:          "Limpieza",
};

export function DashboardOverviewCharts({
  period,
  dateRange,
  orders = [],
  sales = [],
  purchases = [],
  products = [],
  customers = [],
}: DashboardOverviewChartsProps) {
  const bucketFn = getBucketFn(period);
  const inPeriod = (iso: string) => isInPeriod(iso, period, dateRange);

  // ── 1. Ventas: ingresos por bucket ──────────────────────────────────────
  const ventasData = buildBuckets(
    [
      ...orders
        .filter((o) => o.status !== "cancelado" && inPeriod(o.createdAt))
        .map((o) => ({ iso: o.createdAt, value: o.total })),
      ...sales
        .filter((s) => inPeriod(s.createdAt))
        .map((s) => ({ iso: s.createdAt, value: s.total })),
    ],
    bucketFn,
  );

  // ── 2. Compras por proveedor ─────────────────────────────────────────────
  const supMap = new Map<string, number>();
  purchases
    .filter((p) => p.createdAt && inPeriod(p.createdAt))
    .forEach((p) => {
      const n = (p.supplierName as string | undefined) ?? "Sin proveedor";
      supMap.set(n, (supMap.get(n) ?? 0) + (p.total ?? 0));
    });
  const comprasData = [...supMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([label, value]) => ({ label, value }));

  // ── 3. Nuevos clientes por bucket ────────────────────────────────────────
  const clientesData = buildBuckets(
    customers
      .filter((c) => c.createdAt && inPeriod(c.createdAt))
      .map((c) => ({ iso: c.createdAt!, value: 1 })),
    bucketFn,
  );

  // ── 4. Stock por categoría ───────────────────────────────────────────────
  const catStockMap = new Map<string, number>();
  products.filter((p) => p.active && (p.stock ?? 0) > 0).forEach((p) => {
    const cat = p.category ?? "otros";
    catStockMap.set(cat, (catStockMap.get(cat) ?? 0) + (p.stock ?? 0));
  });
  const inventarioData = [...catStockMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([cat, value]) => ({
      label: CAT_LABEL_MAP[cat] ?? cat,
      value,
      color: CAT_COLORS_TOKEN[cat] ?? "var(--text-tertiary)",
    }));

  // ── 5. Top categorías por ingresos ───────────────────────────────────────
  const catRevMap = new Map<string, number>();
  orders
    .filter((o) => o.status !== "cancelado" && inPeriod(o.createdAt))
    .forEach((o) =>
      o.items.forEach((i) => {
        const cat = products.find((p) => p.id === i.id)?.category ?? "otros";
        catRevMap.set(cat, (catRevMap.get(cat) ?? 0) + i.price * i.quantity);
      }),
    );
  sales
    .filter((s) => inPeriod(s.createdAt))
    .forEach((s) =>
      (s.items ?? []).forEach((i) => {
        const cat =
          products.find((p) => p.id === +(i.productId ?? 0))?.category ?? "otros";
        catRevMap.set(cat, (catRevMap.get(cat) ?? 0) + +(i.price ?? 0) * i.quantity);
      }),
    );
  const productosData = [...catRevMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([cat, value]) => ({
      label: CAT_LABEL_MAP[cat] ?? cat,
      value,
    }));

  // ── 6. Flujo de caja (entrada vs salida) ─────────────────────────────────
  const entradaMap = new Map<string, number>();
  const salidaMap  = new Map<string, number>();

  [
    ...orders
      .filter((o) => o.status !== "cancelado" && inPeriod(o.createdAt))
      .map((o) => ({ iso: o.createdAt, value: o.total })),
    ...sales
      .filter((s) => inPeriod(s.createdAt))
      .map((s) => ({ iso: s.createdAt, value: s.total })),
  ].forEach(({ iso, value }) => {
    const k = bucketFn(iso);
    entradaMap.set(k, (entradaMap.get(k) ?? 0) + value);
  });

  purchases
    .filter((p) => p.createdAt && inPeriod(p.createdAt))
    .forEach((p) => {
      const k = bucketFn(p.createdAt!);
      salidaMap.set(k, (salidaMap.get(k) ?? 0) + (p.total ?? 0));
    });

  const allCajaKeys = new Set([...entradaMap.keys(), ...salidaMap.keys()]);
  const cajaData = [...allCajaKeys]
    .sort((a, b) => a.localeCompare(b))
    .map((label) => ({
      label,
      entrada: entradaMap.get(label) ?? 0,
      salida:  salidaMap.get(label)  ?? 0,
    }));

  // ── Subtítulo dinámico según período ─────────────────────────────────────
  const periodLabel: Record<Period, string> = {
    hoy:    "hoy (por hora)",
    semana: "últimos 7 días",
    mes:    "este mes (por semana)",
    año:    "este año (por mes)",
    custom: dateRange?.from && dateRange?.to
      ? `${dateRange.from} — ${dateRange.to}`
      : "rango personalizado",
  };
  const sub = periodLabel[period];

  // ── Chart height ──────────────────────────────────────────────────────────
  const H = 180;

  return (
    <div
      className={cn("grid grid-cols-1 sm:grid-cols-2 gap-4")}
      data-testid="overview-charts"
    >
      {/* 1. Ventas */}
      <ChartCard
        eyebrow="Ventas"
        title="Ingresos del período"
        subtitle={sub}
        icon={DollarSign}
        tone="accent"
        height={H}
        data-testid="chart-ventas"
      >
        <ChartVentas data={ventasData} period={period} />
      </ChartCard>

      {/* 2. Compras por proveedor */}
      <ChartCard
        eyebrow="Compras"
        title="Por proveedor"
        subtitle={sub}
        icon={Truck}
        tone="warning"
        height={H}
        data-testid="chart-compras"
      >
        <ChartCompras data={comprasData} />
      </ChartCard>

      {/* 3. Nuevos clientes */}
      <ChartCard
        eyebrow="Clientes"
        title="Nuevos clientes"
        subtitle={sub}
        icon={Users}
        tone="neutral"
        height={H}
        data-testid="chart-clientes"
      >
        <ChartClientes data={clientesData} period={period} />
      </ChartCard>

      {/* 4. Stock por categoría */}
      <ChartCard
        eyebrow="Inventario"
        title="Stock por categoría"
        subtitle="unidades actuales"
        icon={Package}
        tone="neutral"
        height={H}
        data-testid="chart-inventario"
      >
        <ChartInventario data={inventarioData} />
      </ChartCard>

      {/* 5. Top categorías */}
      <ChartCard
        eyebrow="Productos"
        title="Top categorías"
        subtitle={sub}
        icon={Tag}
        tone="neutral"
        height={H}
        data-testid="chart-productos"
      >
        <ChartProductos data={productosData} />
      </ChartCard>

      {/* 6. Flujo de caja */}
      <ChartCard
        eyebrow="Caja"
        title="Flujo de caja"
        subtitle={`entrada vs salida — ${sub}`}
        icon={Banknote}
        tone="neutral"
        height={H}
        data-testid="chart-caja"
      >
        <ChartCaja data={cajaData} period={period} />
      </ChartCard>
    </div>
  );
}
