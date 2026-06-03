"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import {
  Store,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  Banknote,
  Wallet,
  Package,
  AlertCircle,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import {
  LazyBarChart,
  LazyPieChart,
  ChartSkeleton,
} from "@/components/charts";
import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  Pie,
  ResponsiveContainer,
} from "recharts";
import ProductImagePlaceholder from "@/components/store/ProductImagePlaceholder";

// ── Tipos del contrato de API ────────────────────────────────────────────────

type Range = "hoy" | "7d" | "30d";

interface ChannelStat {
  label: string;
  revenue: number;
  orders: number;
}

interface SeriesPoint {
  date: string;
  marketplace: number;
  tienda: number;
  pos: number;
}

interface Payments {
  efectivo: number;
  yape: number;
  plin: number;
  tarjeta: number;
  fiado: number;
}

interface CashState {
  abierta: boolean;
  saldoActual: number;
  ingresos: number;
  egresos: number;
}

interface TopProduct {
  name: string;
  image: string | null;
  qty: number;
  revenue: number;
}

interface OverviewData {
  range: Range;
  channels: {
    marketplace: ChannelStat;
    tienda: ChannelStat;
    pos: ChannelStat;
  };
  totals: { revenue: number; orders: number };
  series: SeriesPoint[];
  payments: Payments;
  cash: CashState;
  topProducts: TopProduct[];
}

// ── Colores de series — hex fijos del DS (recharts no resuelve CSS vars en SVG) ─
// Brand: primary #2d6a4f (verde bosque) / secondary #f4a261 (naranja cálido)
// data-success-500 ~#22c55e, data-warning-500 ~#f59e0b

const CHART_COLORS = {
  marketplace: "#2d6a4f",   // primary DS verde bosque
  tienda:      "#f4a261",   // secondary DS naranja cálido
  pos:         "#3b82f6",   // azul informativo
} as const;

const PAYMENT_COLORS = [
  "#22c55e",  // efectivo → verde
  "#8b5cf6",  // yape → violeta
  "#0ea5e9",  // plin → celeste
  "#f59e0b",  // tarjeta → amarillo
  "#f97316",  // fiado → naranja
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(n: number) {
  return `S/ ${n.toFixed(2)}`;
}

function fmtMoneyRound(n: number) {
  return `S/ ${Math.round(n)}`;
}

function pct(part: number, total: number) {
  if (total === 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function shortDate(iso: string) {
  // "2026-05-27" → "27/05"
  const parts = iso.split("-");
  if (parts.length < 3) return iso;
  return `${parts[2]}/${parts[1]}`;
}

// ── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonBox({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-[var(--surface-sunken)]",
        className
      )}
    />
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <SkeletonBox key={i} className="h-24" />
        ))}
      </div>
      <ChartSkeleton height={220} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ChartSkeleton height={180} />
        <SkeletonBox className="h-44" />
      </div>
      <SkeletonBox className="h-40" />
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ range }: { range: Range }) {
  const label = range === "hoy" ? "hoy" : range === "7d" ? "los últimos 7 días" : "los últimos 30 días";
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-[var(--text-tertiary)]">
      <TrendingUp className="h-10 w-10 opacity-30" />
      <p className="text-sm font-semibold">Aún no hay ventas en {label}</p>
      <p className="text-xs">Cuando se registren ventas aparecerán aquí automáticamente.</p>
    </div>
  );
}

// ── Error state ───────────────────────────────────────────────────────────────

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-[var(--data-error-500)]">
      <AlertCircle className="h-8 w-8 opacity-70" />
      <p className="text-sm font-semibold">No se pudo cargar el tablero</p>
      <button
        onClick={onRetry}
        className="flex items-center gap-1.5 text-xs font-bold underline underline-offset-2 hover:opacity-70 transition-opacity"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Reintentar
      </button>
    </div>
  );
}

// ── Card canal ────────────────────────────────────────────────────────────────

interface ChannelCardProps {
  label: string;
  revenue: number;
  orders: number;
  totalRevenue: number;
  icon: React.ReactNode;
  accentHex: string;
}

function ChannelCard({ label, revenue, orders, totalRevenue, icon, accentHex }: ChannelCardProps) {
  return (
    <div
      className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4 flex flex-col gap-2"
      style={{ borderLeft: `3px solid ${accentHex}` }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color: accentHex }}>{icon}</span>
        <span className="text-xs font-bold text-[var(--text-secondary)] leading-tight">{label}</span>
      </div>
      <p className="text-xl font-extrabold text-[var(--text-primary)] tracking-tight leading-none">
        {fmtMoneyRound(revenue)}
      </p>
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--text-tertiary)]">{orders} operaciones</span>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: `${accentHex}1a`, color: accentHex }}
        >
          {pct(revenue, totalRevenue)}
        </span>
      </div>
    </div>
  );
}

// ── Tooltip personalizado para el bar chart ───────────────────────────────────

function CustomBarTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--surface-canvas)] border border-[var(--rule-base)] rounded-xl p-3 shadow-[var(--shadow-md)] text-xs space-y-1.5 min-w-[160px]">
      <p className="font-bold text-[var(--text-primary)] mb-1">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
            <span className="text-[var(--text-secondary)]">{entry.name}</span>
          </div>
          <span className="font-bold text-[var(--text-primary)]">{fmtMoney(entry.value)}</span>
        </div>
      ))}
      <div className="border-t border-[var(--rule-soft)] pt-1.5 flex justify-between font-bold">
        <span className="text-[var(--text-secondary)]">Total</span>
        <span className="text-[var(--text-primary)]">
          {fmtMoney(payload.reduce((s, e) => s + e.value, 0))}
        </span>
      </div>
    </div>
  );
}

// ── Tooltip para pie ──────────────────────────────────────────────────────────

function CustomPieTooltip({ active, payload }: {
  active?: boolean;
  payload?: { name: string; value: number; payload: { fill: string } }[];
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="bg-[var(--surface-canvas)] border border-[var(--rule-base)] rounded-xl p-2.5 shadow-[var(--shadow-md)] text-xs">
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full" style={{ background: item.payload.fill }} />
        <span className="text-[var(--text-secondary)]">{item.name}</span>
      </div>
      <p className="font-bold text-[var(--text-primary)] mt-0.5">{fmtMoney(item.value)}</p>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function VentasOverviewTab() {
  const [range, setRange] = useState<Range>("7d");
  const [data, setData] = useState<OverviewData | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error" | "empty">("loading");
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (r: Range) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStatus("loading");
    setData(null);

    try {
      const res = await fetch(`/api/admin/ventas-overview?range=${r}`, {
        signal: ctrl.signal,
      });

      if (!res.ok) {
        setStatus("error");
        return;
      }

      const json: OverviewData = await res.json();
      setData(json);

      const hasData =
        json.totals.revenue > 0 ||
        json.totals.orders > 0 ||
        json.series.some((s) => s.marketplace + s.tienda + s.pos > 0);

      setStatus(hasData ? "ok" : "empty");
    } catch (err: unknown) {
      if ((err as { name?: string }).name === "AbortError") return;
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void fetchData(range);
    return () => abortRef.current?.abort();
  }, [range, fetchData]);

  // Datos preparados para recharts
  const seriesData = (data?.series ?? []).map((p) => ({
    date: shortDate(p.date),
    Marketplace: p.marketplace,
    "Tienda online": p.tienda,
    "Punto de venta": p.pos,
  }));

  const paymentsData = data
    ? [
        { name: "Efectivo", value: data.payments.efectivo, fill: PAYMENT_COLORS[0] },
        { name: "Yape",     value: data.payments.yape,     fill: PAYMENT_COLORS[1] },
        { name: "Plin",     value: data.payments.plin,     fill: PAYMENT_COLORS[2] },
        { name: "Tarjeta",  value: data.payments.tarjeta,  fill: PAYMENT_COLORS[3] },
        { name: "Fiado",    value: data.payments.fiado,    fill: PAYMENT_COLORS[4] },
      ].filter((p) => p.value > 0)
    : [];

  const RANGE_TABS: { id: Range; label: string }[] = [
    { id: "hoy", label: "Hoy" },
    { id: "7d",  label: "7 días" },
    { id: "30d", label: "30 días" },
  ];

  return (
    <div className="space-y-5 pb-6">
      {/* ── Header + segmented control ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wide">
            Ventas por canal
          </p>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Marketplace · Tienda online · Punto de venta
          </p>
        </div>

        <div className="flex items-center rounded-lg border border-[var(--rule-base)] overflow-hidden bg-[var(--surface-sunken)] p-0.5 gap-0.5">
          {RANGE_TABS.map((rt) => (
            <button
              key={rt.id}
              onClick={() => setRange(rt.id)}
              aria-pressed={range === rt.id}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-md transition-all",
                range === rt.id
                  ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
            >
              {rt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Estados: loading / error / empty / ok ── */}
      {status === "loading" && <LoadingState />}
      {status === "error"   && <ErrorState onRetry={() => void fetchData(range)} />}
      {status === "empty"   && <EmptyState range={range} />}

      {status === "ok" && data && (
        <div className="space-y-5">
          {/* ── Fila de 3 cards + total ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <ChannelCard
              label={data.channels.marketplace.label}
              revenue={data.channels.marketplace.revenue}
              orders={data.channels.marketplace.orders}
              totalRevenue={data.totals.revenue}
              icon={<Store className="h-4 w-4" />}
              accentHex={CHART_COLORS.marketplace}
            />
            <ChannelCard
              label={data.channels.tienda.label}
              revenue={data.channels.tienda.revenue}
              orders={data.channels.tienda.orders}
              totalRevenue={data.totals.revenue}
              icon={<ShoppingBag className="h-4 w-4" />}
              accentHex={CHART_COLORS.tienda}
            />
            <ChannelCard
              label={data.channels.pos.label}
              revenue={data.channels.pos.revenue}
              orders={data.channels.pos.orders}
              totalRevenue={data.totals.revenue}
              icon={<ShoppingCart className="h-4 w-4" />}
              accentHex={CHART_COLORS.pos}
            />

            {/* Card total */}
            <div className="bg-[var(--surface-raised)] border border-[var(--rule-strong)] rounded-xl p-4 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[var(--text-secondary)]" />
                <span className="text-xs font-bold text-[var(--text-secondary)]">Total</span>
              </div>
              <p className="text-xl font-extrabold text-[var(--text-primary)] tracking-tight leading-none">
                {fmtMoneyRound(data.totals.revenue)}
              </p>
              <span className="text-xs text-[var(--text-tertiary)]">
                {data.totals.orders} operaciones
              </span>
            </div>
          </div>

          {/* ── Chart principal: barras apiladas por canal ── */}
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4">
            <p className="text-xs font-bold text-[var(--text-primary)] mb-4">
              Ingresos por día y canal
            </p>
            {seriesData.length === 0 ? (
              <ChartSkeleton height={200} />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LazyBarChart data={seriesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-soft)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `S/${Math.round(v)}`}
                    width={52}
                  />
                  <Tooltip content={<CustomBarTooltip />} cursor={{ fill: "var(--surface-sunken)" }} />
                  <Legend
                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                    formatter={(value) => (
                      <span style={{ color: "var(--text-secondary)" }}>{value}</span>
                    )}
                  />
                  <Bar dataKey="Marketplace"    stackId="a" fill={CHART_COLORS.marketplace} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Tienda online"  stackId="a" fill={CHART_COLORS.tienda}      radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Punto de venta" stackId="a" fill={CHART_COLORS.pos}          radius={[4, 4, 0, 0]} />
                </LazyBarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* ── Desglose de pagos + estado de caja ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Desglose pagos */}
            <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4">
              <p className="text-xs font-bold text-[var(--text-primary)] mb-3">Desglose por método de pago</p>

              {paymentsData.length === 0 ? (
                <p className="text-xs text-[var(--text-tertiary)] py-4 text-center">Sin pagos registrados</p>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="w-full sm:w-40 flex-shrink-0">
                    <ResponsiveContainer width={160} height={160}>
                      <LazyPieChart>
                        <Pie
                          data={paymentsData}
                          cx={75}
                          cy={75}
                          innerRadius={45}
                          outerRadius={70}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {paymentsData.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomPieTooltip />} />
                      </LazyPieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Leyenda con barras horizontales */}
                  <div className="flex-1 space-y-2 w-full">
                    {paymentsData.map((p) => (
                      <div key={p.name} className="space-y-0.5">
                        <div className="flex justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ background: p.fill }} />
                            <span className="text-[var(--text-secondary)]">{p.name}</span>
                          </div>
                          <span className="font-bold text-[var(--text-primary)]">{fmtMoney(p.value)}</span>
                        </div>
                        <div className="h-1.5 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: pct(p.value, data.totals.revenue),
                              background: p.fill,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Estado de caja */}
            <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-[var(--text-primary)]">Estado de Caja</p>
                <div
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full",
                    data.cash.abierta
                      ? "bg-[var(--data-success-50)] text-[var(--data-success-500)]"
                      : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
                  )}
                >
                  {data.cash.abierta ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5" />
                  )}
                  {data.cash.abierta ? "Abierta" : "Cerrada"}
                </div>
              </div>

              <div className="text-center py-3 border-y border-[var(--rule-soft)]">
                <p className="text-xs text-[var(--text-tertiary)] mb-0.5">Saldo actual</p>
                <p className="text-2xl font-extrabold text-[var(--text-primary)]">
                  {fmtMoney(data.cash.saldoActual)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-[var(--data-success-50)] rounded-lg p-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Banknote className="h-3.5 w-3.5 text-[var(--data-success-500)]" />
                    <span className="text-xs font-bold text-[var(--data-success-500)]">Ingresos</span>
                  </div>
                  <p className="text-sm font-extrabold text-[var(--data-success-500)]">
                    {fmtMoney(data.cash.ingresos)}
                  </p>
                </div>
                <div className="bg-[var(--data-error-50)] rounded-lg p-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Wallet className="h-3.5 w-3.5 text-[var(--data-error-500)]" />
                    <span className="text-xs font-bold text-[var(--data-error-500)]">Egresos</span>
                  </div>
                  <p className="text-sm font-extrabold text-[var(--data-error-500)]">
                    {fmtMoney(data.cash.egresos)}
                  </p>
                </div>
              </div>

              {!data.cash.abierta && (
                <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] bg-[var(--surface-sunken)] rounded-lg px-3 py-2">
                  <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                  Caja cerrada — abre un turno para registrar movimientos
                </div>
              )}
            </div>
          </div>

          {/* ── Top productos ── */}
          {data.topProducts.length > 0 && (
            <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Package className="h-4 w-4 text-[var(--text-secondary)]" />
                <p className="text-xs font-bold text-[var(--text-primary)]">Top productos</p>
              </div>

              <div className="space-y-2">
                {data.topProducts.slice(0, 8).map((prod, i) => (
                  <div
                    key={prod.name}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors"
                  >
                    {/* Ranking */}
                    <span className="text-xs font-extrabold text-[var(--text-tertiary)] w-4 text-center flex-shrink-0">
                      {i + 1}
                    </span>

                    {/* Imagen */}
                    <div className="relative h-10 w-10 flex-shrink-0 rounded-lg overflow-hidden border border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
                      {prod.image ? (
                        <Image
                          src={prod.image}
                          alt={prod.name}
                          fill
                          sizes="40px"
                          className="object-cover"
                          onError={(e) => {
                            // Ocultar imagen rota — placeholder ya es el bg
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <ProductImagePlaceholder showLabel={false} size={16} />
                      )}
                    </div>

                    {/* Nombre + qty */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                        {prod.name}
                      </p>
                      <p className="text-xs text-[var(--text-tertiary)]">
                        {prod.qty} {prod.qty === 1 ? "unidad" : "unidades"}
                      </p>
                    </div>

                    {/* Revenue */}
                    <span className="text-xs font-bold text-[var(--text-primary)] flex-shrink-0">
                      {fmtMoney(prod.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Pie total sin datos de pago ── */}
          {paymentsData.length === 0 && data.totals.orders === 0 && (
            <EmptyState range={range} />
          )}
        </div>
      )}
    </div>
  );
}
