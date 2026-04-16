"use client";

import { useState, useEffect, useRef } from "react";
import {
  DollarSign,
  TrendingUp,
  Package,
  Percent,
  ShoppingCart,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SaleItem {
  productId: number | null;
  name: string;
  price: number;
  costPrice?: number;
  quantity: number;
  unit: string;
}

interface Sale {
  id: number;
  total: number;
  totalCogs?: number;
  payment: string;
  createdAt: string;
  items: SaleItem[];
}

interface DashboardPayload {
  sales: Sale[];
}

interface DayBucket {
  date: string; // "YYYY-MM-DD"
  label: string; // "15 abr"
  revenue: number;
}

interface TopProduct {
  name: string;
  units: number;
  revenue: number;
  pct: number; // 0-100
}

interface FinancialMetrics {
  ventasBrutas: number;
  costoProductos: number;
  gananciaBruta: number;
  margenPct: number;
  ticketPromedio: number;
  ventasPorHora: number;
  productosVendidosHoy: number;
  dias: DayBucket[];
  topProductos: TopProduct[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toYMD(iso: string): string {
  return iso.slice(0, 10);
}

function buildMetrics(sales: Sale[]): FinancialMetrics {
  const now = new Date();
  const todayYMD = toYMD(now.toISOString());

  // Last 30 days bucket map
  const buckets = new Map<string, DayBucket>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const ymd = toYMD(d.toISOString());
    const label = d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
    buckets.set(ymd, { date: ymd, label, revenue: 0 });
  }

  let ventasBrutas = 0;
  let costoProductos = 0;
  let productosVendidosHoy = 0;
  const productMap = new Map<string, { units: number; revenue: number }>();

  for (const sale of sales) {
    const ymd = toYMD(sale.createdAt);
    ventasBrutas += sale.total;

    // COGS
    if (sale.totalCogs != null) {
      costoProductos += sale.totalCogs;
    } else {
      for (const item of sale.items) {
        if (item.costPrice != null) {
          costoProductos += item.costPrice * item.quantity;
        }
      }
    }

    // Daily buckets (last 30 days)
    const bucket = buckets.get(ymd);
    if (bucket) {
      bucket.revenue += sale.total;
    }

    // Products today
    if (ymd === todayYMD) {
      for (const item of sale.items) {
        productosVendidosHoy += item.quantity;
        const existing = productMap.get(item.name) ?? { units: 0, revenue: 0 };
        existing.units += item.quantity;
        existing.revenue += item.price * item.quantity;
        productMap.set(item.name, existing);
      }
    } else {
      // Still accumulate products for top-5 (all time is fine for a demo,
      // but we build the top-5 from the last 30 days to keep it relevant)
      const bucket30 = buckets.has(ymd);
      if (bucket30) {
        for (const item of sale.items) {
          const existing = productMap.get(item.name) ?? { units: 0, revenue: 0 };
          existing.units += item.quantity;
          existing.revenue += item.price * item.quantity;
          productMap.set(item.name, existing);
        }
      }
    }
  }

  const gananciaBruta = ventasBrutas - costoProductos;
  const margenPct = ventasBrutas > 0 ? (gananciaBruta / ventasBrutas) * 100 : 0;

  // Ticket promedio (all sales)
  const ticketPromedio = sales.length > 0 ? ventasBrutas / sales.length : 0;

  // Ventas por hora hoy
  const ventasHoy = [...buckets.values()].at(-1)?.revenue ?? 0;
  const horaActual = now.getHours() || 1;
  const ventasPorHora = ventasHoy / horaActual;

  // Top 5 productos por revenue (last 30 days)
  const sorted = [...productMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const totalRevTop = sorted.reduce((s, p) => s + p.revenue, 0);
  const topProductos: TopProduct[] = sorted.map((p) => ({
    name: p.name,
    units: p.units,
    revenue: p.revenue,
    pct: totalRevTop > 0 ? (p.revenue / totalRevTop) * 100 : 0,
  }));

  return {
    ventasBrutas,
    costoProductos,
    gananciaBruta,
    margenPct,
    ticketPromedio,
    ventasPorHora,
    productosVendidosHoy,
    dias: [...buckets.values()],
    topProductos,
  };
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-5 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="h-8 w-8 rounded-xl bg-gray-200 dark:bg-gray-700" />
        <div className="h-4 w-12 rounded bg-gray-200 dark:bg-gray-700" />
      </div>
      <div className="h-7 w-24 rounded bg-gray-200 dark:bg-gray-700 mb-1" />
      <div className="h-3 w-20 rounded bg-gray-100 dark:bg-gray-800" />
    </div>
  );
}

function SkeletonChart() {
  return (
    <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-5 animate-pulse">
      <div className="h-5 w-40 rounded bg-gray-200 dark:bg-gray-700 mb-4" />
      <div className="flex items-end gap-[3px] h-28">
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-sm bg-gray-100 dark:bg-gray-800"
            style={{ height: `${20 + ((i * 37 + 13) % 80)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── P&L Card ─────────────────────────────────────────────────────────────────

interface PLCardProps {
  label: string;
  value: string;
  icon: React.ElementType;
  accent: string;       // Tailwind bg class for icon container
  iconColor: string;    // Tailwind text class for icon
  borderColor: string;  // CSS hex for left border
  badge?: string;
}

function PLCard({ label, value, icon: Icon, accent, iconColor, borderColor, badge }: PLCardProps) {
  return (
    <div
      className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-5 border-l-[3px] flex flex-col gap-3 shadow-sm"
      style={{ borderLeftColor: borderColor }}
    >
      <div className="flex items-center justify-between">
        <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center", accent)}>
          <Icon className={cn("h-4 w-4", iconColor)} />
        </div>
        {badge && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {badge}
          </span>
        )}
      </div>
      <div>
        <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider leading-none mb-1">
          {label}
        </p>
        <p className="text-2xl font-black font-mono text-gray-900 dark:text-white leading-tight">
          {value}
        </p>
      </div>
    </div>
  );
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────

function RevenueBarChart({ dias }: { dias: DayBucket[] }) {
  const [tooltip, setTooltip] = useState<{ index: number; x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const maxRevenue = Math.max(...dias.map((d) => d.revenue), 1);

  return (
    <div
      ref={containerRef}
      className="relative flex items-end gap-[3px] h-32 px-1"
      onMouseLeave={() => setTooltip(null)}
    >
      {dias.map((day, i) => {
        const heightPct = Math.max((day.revenue / maxRevenue) * 100, day.revenue > 0 ? 4 : 1.5);
        const isActive = tooltip?.index === i;

        return (
          <div
            key={day.date}
            className="relative flex-1 flex flex-col items-center justify-end h-full group cursor-default"
            onMouseEnter={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const parentRect = containerRef.current?.getBoundingClientRect();
              if (!parentRect) return;
              setTooltip({
                index: i,
                x: rect.left - parentRect.left + rect.width / 2,
                y: rect.top - parentRect.top,
              });
            }}
          >
            <div
              className={cn(
                "w-full rounded-t-[3px] transition-all duration-150",
                isActive
                  ? "bg-primary"
                  : day.revenue > 0
                  ? "bg-primary/50 group-hover:bg-primary"
                  : "bg-gray-100 dark:bg-gray-800"
              )}
              style={{ height: `${heightPct}%` }}
            />
          </div>
        );
      })}

      {tooltip && (
        <div
          className="absolute z-20 pointer-events-none bg-gray-900 dark:bg-gray-700 text-white text-[11px] rounded-lg px-2.5 py-1.5 shadow-xl whitespace-nowrap"
          style={{
            left: tooltip.x,
            top: tooltip.y - 52,
            transform: "translateX(-50%)",
          }}
        >
          <p className="font-semibold">{dias[tooltip.index].label}</p>
          <p className="text-primary font-mono">{formatCurrency(dias[tooltip.index].revenue)}</p>
          <div
            className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0"
            style={{ borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "5px solid #111827" }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Top Products Table ───────────────────────────────────────────────────────

function TopProductsTable({ productos }: { productos: TopProduct[] }) {
  if (productos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Package className="h-8 w-8 text-gray-300 dark:text-gray-600 mb-2" />
        <p className="text-sm text-gray-400 dark:text-gray-500">Sin ventas en los ultimos 30 dias</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {productos.map((p, i) => (
        <div key={p.name} className="flex items-center gap-3">
          <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 w-4 shrink-0 text-right">
            {i + 1}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[12px] font-semibold text-gray-800 dark:text-gray-200 truncate max-w-[140px] sm:max-w-none">
                {p.name}
              </p>
              <div className="flex items-center gap-3 shrink-0 ml-2">
                <span className="text-[11px] text-gray-400 dark:text-gray-500">
                  {p.units} uds
                </span>
                <span className="text-[12px] font-mono font-bold text-gray-900 dark:text-white">
                  {formatCurrency(p.revenue)}
                </span>
                <span className="text-[11px] text-gray-400 dark:text-gray-500 w-10 text-right">
                  {p.pct.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${p.pct}%`,
                  background: i === 0 ? "var(--color-primary)" : i === 1 ? "#f4a261" : `var(--color-primary)${Math.round(80 - i * 15).toString(16).padStart(2, "0")}`,
                }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Quick Stat Pill ──────────────────────────────────────────────────────────

interface QuickStatProps {
  icon: React.ElementType;
  label: string;
  value: string;
}

function QuickStat({ icon: Icon, label, value }: QuickStatProps) {
  return (
    <div className="flex items-center gap-2.5 bg-gray-50 dark:bg-gray-900/50 rounded-xl px-4 py-3 flex-1 min-w-0">
      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium truncate">
          {label}
        </p>
        <p className="text-sm font-black font-mono text-gray-900 dark:text-white truncate">
          {value}
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FinancialDashboard() {
  const [metrics, setMetrics] = useState<FinancialMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/dashboard");
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const json: DashboardPayload = await res.json();
        if (!active) return;
        const sales: Sale[] = Array.isArray(json.sales) ? json.sales : [];
        setMetrics(buildMetrics(sales));
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Error al cargar datos");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  // ── Loading state ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <SkeletonChart />
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-5 animate-pulse">
          <div className="h-5 w-32 rounded bg-gray-200 dark:bg-gray-700 mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 rounded bg-gray-100 dark:bg-gray-800" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-14 w-14 rounded-2xl bg-red-50 dark:bg-red-950/30 flex items-center justify-center mb-4">
          <BarChart3 className="h-7 w-7 text-red-500" />
        </div>
        <p className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-1">
          No se pudo cargar el resumen financiero
        </p>
        <p className="text-sm text-gray-400 dark:text-gray-500">{error}</p>
        <button
          onClick={() => {
            setLoading(true);
            setError(null);
            // Re-mount via key would need parent; instead re-trigger effect by resetting
            fetch("/api/admin/dashboard")
              .then((r) => r.json())
              .then((json: DashboardPayload) => {
                const sales: Sale[] = Array.isArray(json.sales) ? json.sales : [];
                setMetrics(buildMetrics(sales));
              })
              .catch((e) => setError(e instanceof Error ? e.message : "Error"))
              .finally(() => setLoading(false));
          }}
          className="mt-4 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-[#009e92] transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────────
  if (!metrics || metrics.ventasBrutas === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <DollarSign className="h-7 w-7 text-primary" />
        </div>
        <p className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-1">
          Aun no hay ventas registradas
        </p>
        <p className="text-sm text-gray-400 dark:text-gray-500">
          Los indicadores financieros apareceran aqui en cuanto registres tu primera venta.
        </p>
      </div>
    );
  }

  const { ventasBrutas, costoProductos, gananciaBruta, margenPct, ticketPromedio, ventasPorHora, productosVendidosHoy, dias, topProductos } = metrics;

  // ── Healthy data ──────────────────────────────────────────────────────────────
  return (
    <section className="space-y-5" aria-label="Resumen financiero">

      {/* P&L Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <PLCard
          label="Ventas brutas"
          value={formatCurrency(ventasBrutas)}
          icon={DollarSign}
          accent="bg-emerald-50 dark:bg-emerald-950/30"
          iconColor="text-emerald-600 dark:text-emerald-400"
          borderColor="#10b981"
        />
        <PLCard
          label="Costo de productos"
          value={formatCurrency(costoProductos)}
          icon={Package}
          accent="bg-red-50 dark:bg-red-950/30"
          iconColor="text-red-500 dark:text-red-400"
          borderColor="#ef4444"
        />
        <PLCard
          label="Ganancia bruta"
          value={formatCurrency(gananciaBruta)}
          icon={TrendingUp}
          accent="bg-primary/10"
          iconColor="text-primary"
          borderColor="var(--color-primary)"
          badge={gananciaBruta > 0 ? "positivo" : "negativo"}
        />
        <PLCard
          label="Margen %"
          value={`${margenPct.toFixed(1)}%`}
          icon={Percent}
          accent="bg-blue-50 dark:bg-blue-950/30"
          iconColor="text-blue-500 dark:text-blue-400"
          borderColor="#3b82f6"
        />
      </div>

      {/* Trend Chart */}
      <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">
              Tendencia de ingresos
            </h3>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
              Ultimos 30 dias — pasa el cursor sobre una barra para ver el detalle
            </p>
          </div>
          <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <BarChart3 className="h-4 w-4 text-primary" />
          </div>
        </div>

        <RevenueBarChart dias={dias} />

        {/* X-axis labels — show every 5th day */}
        <div className="flex items-center mt-1.5 px-1">
          {dias.map((d, i) => (
            <div key={d.date} className="flex-1 text-center">
              {i % 5 === 0 && (
                <span className="text-[9px] text-gray-300 dark:text-gray-600">
                  {d.label.split(" ")[0]}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Top 5 Products */}
      <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">
              Top 5 productos por ingresos
            </h3>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
              Ultimos 30 dias
            </p>
          </div>
          <div className="h-8 w-8 rounded-xl bg-[#f4a261]/10 flex items-center justify-center">
            <TrendingUp className="h-4 w-4 text-[#f4a261]" />
          </div>
        </div>

        <TopProductsTable productos={topProductos} />
      </div>

      {/* Quick Stats Footer */}
      <div className="flex flex-col sm:flex-row gap-3">
        <QuickStat
          icon={ShoppingCart}
          label="Ticket promedio"
          value={formatCurrency(ticketPromedio)}
        />
        <QuickStat
          icon={DollarSign}
          label="Ventas por hora (hoy)"
          value={formatCurrency(ventasPorHora)}
        />
        <QuickStat
          icon={Package}
          label="Productos vendidos hoy"
          value={`${productosVendidosHoy} uds`}
        />
      </div>
    </section>
  );
}
