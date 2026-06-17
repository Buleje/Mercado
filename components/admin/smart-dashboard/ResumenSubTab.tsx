"use client";

import { useState, useMemo } from "react";
import {
  TrendingUp,
  Package,
  Users,
  AlertTriangle,
  Clock,
  DollarSign,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  ShoppingCart,
  BarChart3,
  LayoutDashboard,
  Lightbulb,
  Target,
} from "@buleje/design-system/icons";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { BusinessOverviewHero } from "@/components/admin/shared/BusinessOverviewHero";
import { DraggableWidgetGrid } from "@/components/admin/shared/DraggableWidgetGrid";
import type {
  Order,
  Payable,
  TopProduct,
  TopCustomer,
  HourBucket,
  DashboardAlerts,
  SectionId,
  Product,
  Sale,
} from "./types";

// ── Lazy-loaded high-level charts ──────────────────────────────────────────────

const BusinessOverviewChart = dynamic(
  () => import("./BusinessOverviewChart"),
  { ssr: false, loading: () => <div className="w-full h-[320px] bg-gray-100 dark:bg-zinc-700/40 animate-pulse rounded-xl" /> }
);

const CategoryDonutChart = dynamic(
  () => import("./CategoryDonutChart"),
  { ssr: false, loading: () => <div className="w-full h-[280px] bg-gray-100 dark:bg-zinc-700/40 animate-pulse rounded-xl" /> }
);

// ── Props ───────────────────────────────────────────────────────────────────────

export interface ResumenSubTabProps {
  loading: boolean;
  // KPI data
  revenueToday: number;
  revenueThisMonth: number;
  revenuePrevMonth: number;
  revenueYesterday: number;
  revenueFiltered: number;
  monthDelta: number;
  marginToday: number;
  rentabilidadHoy: number;
  clientesHoy: number;
  clientesAyer: number;
  clientesPromedio: number;
  hoyVsAyerPct: number;
  salesYesterdayCount: number;
  // Collections
  sales: Sale[];
  salesToday: Sale[];
  products: Product[];
  orders: Order[];
  payables: Payable[];
  topProducts: TopProduct[];
  topCustomers: TopCustomer[];
  hourBuckets: HourBucket[];
  maxProductQty: number;
  maxHourAmount: number;
  alerts: DashboardAlerts;
  // Derived data
  monthProjection: { ventasMes: number; proyeccion: number; porcentaje: number; diasTranscurridos: number; diasTotales: number } | null;
  cuentasPorCobrar: { total: number; vigentes: number; vencidas: number; count: number; vigentesCount: number; vencidasCount: number };
  cuentasPorPagar: { total: number; vigentes: number; vencidas: number; count: number };
  upcomingPayables: { overdue: number; upcoming: Payable[] };
  productsRunningOut: { id: number | string; name: string; stock: number; daysLeft: number }[];
  expiringBatchCount: number;
  bestDay: { best: { name: string; avg: number }; worst: { name: string; avg: number } | null; pctVsOthers: number } | null;
  growingCategory: { top: { cat: string; thisWeek: number; lastWeek: number; pct: number } | null; bottom: { cat: string; pct: number } | null } | null;
  topClientMonth: { name: string; total: number; orderCount: number; avg: number; monthName: string } | null;
  comboData: { nombre: string; products: { name: string; price: number; image?: string; found: boolean }[]; totalNormal: number; totalCombo: number; ahorro: number };
  insights: { type: "positive" | "negative" | "neutral"; text: string }[];
  semanaAnterior: { diaLabel: string; monto: number; pct: number } | null;
  hitoProximo: { falta: string | null; label: string } | null;
  bestHourToday: { hour: number; total: number; count: number } | null;
  productosSinVenderHoy: { name: string; qty: number }[];
  decliningProduct: { name: string; pct: number } | null;
  abandonedCartCount: number;
  abandonedCartValue: number;
  hasAnyAlert: boolean;
  // Chart data
  chartVentasCategoria: { name: string; value: number }[];
  monthlyDailyData: { name: string; ventas: number }[];
  // Widget order
  sectionOrder: SectionId[];
  setSectionOrder: (order: SectionId[]) => void;
  // Formatting
  fmtR: (n: number) => string;
  fmtShortR: (n: number) => string;
  // Logro
  showLogro: boolean;
  setShowLogro: (v: boolean) => void;
  logro: { texto: string } | null;
}

// ── Skeleton helpers ─────────────────────────────────────────────────────────────

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-[var(--rule-base)] dark:border-zinc-700 bg-white dark:bg-zinc-800 p-5 animate-pulse", className)}>
      <div className="h-3 w-1/3 rounded bg-gray-200 dark:bg-zinc-700 mb-3" />
      <div className="h-7 w-1/2 rounded bg-gray-200 dark:bg-zinc-700 mb-2" />
      <div className="h-1 w-full rounded bg-gray-200 dark:bg-zinc-700 mt-3" />
    </div>
  );
}

function SkeletonBar({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="h-3 w-28 rounded bg-gray-200 dark:bg-zinc-700 shrink-0" />
          <div className="h-5 rounded bg-gray-200 dark:bg-zinc-700" style={{ width: `${30 + (i % 4) * 15}%` }} />
        </div>
      ))}
    </div>
  );
}

// ── Alert Badge ─────────────────────────────────────────────────────────────────

type IconComponent = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

function AlertBadge({ Icon, label, count, colorClass }: { Icon: IconComponent; label: string; count: number; colorClass: string }) {
  if (count === 0) return null;
  return (
    <div className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium", colorClass)}>
      <Icon className="w-4 h-4 shrink-0" />
      <span>{label}</span>
      <span className="ml-auto font-bold tabular-nums">{count}</span>
    </div>
  );
}

// ── Default section order ────────────────────────────────────────────────────────

const DEFAULT_ORDER: SectionId[] = ["kpis", "margen-comparador", "top-productos", "horario-pico", "clientes-alertas"];

// ── Component ────────────────────────────────────────────────────────────────────

export function ResumenSubTab(props: ResumenSubTabProps) {
  const [now] = useState(() => Date.now());
  const {
    loading, revenueToday, revenueThisMonth, revenuePrevMonth, revenueYesterday,
    monthDelta, clientesHoy, clientesAyer, clientesPromedio, hoyVsAyerPct,
    salesYesterdayCount, sales, salesToday, products, orders, payables,
    topProducts, topCustomers, hourBuckets, maxProductQty, maxHourAmount, alerts,
    monthProjection, cuentasPorCobrar, cuentasPorPagar, upcomingPayables,
    productsRunningOut, expiringBatchCount, bestDay, growingCategory,
    topClientMonth, comboData, insights, semanaAnterior, hitoProximo,
    bestHourToday, productosSinVenderHoy, decliningProduct,
    abandonedCartCount, abandonedCartValue, hasAnyAlert,
    chartVentasCategoria, monthlyDailyData,
    sectionOrder, setSectionOrder,
    fmtR, fmtShortR, showLogro, setShowLogro, logro,
  } = props;

  const [noClosedYesterday, setNoClosedYesterday] = useState(() => {
    try {
      const lastClose = localStorage.getItem("last-daily-close");
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().slice(0, 10);
      return !lastClose || lastClose < yStr;
    } catch { return false; }
  });
  const [ignoredClose, setIgnoredClose] = useState(false);
  const [diasSinCierre] = useState<number | null>(() => {
    try {
      const lastClose = localStorage.getItem("last-daily-close");
      if (!lastClose) return 7;
      return Math.floor((now - new Date(lastClose).getTime()) / 86400000);
    } catch { return null; }
  });

  const isDefaultOrder = sectionOrder.every((id, i) => id === DEFAULT_ORDER[i]);

  const resetOrder = () => {
    setSectionOrder(DEFAULT_ORDER);
    localStorage.removeItem("dashboard-widget-order");
  };

  // ── Logros ────────────────────────────────────────────────────────────────────

  const logrosData = useMemo(() => {
    type Achievement = { id: string; titulo: string; desc: string; condicion: boolean; progreso?: number; meta?: number };
    const ventasCount = sales.length;
    const fiadosActivos = payables.filter(p => p.status !== "pagado").length;
    const clientesTotal = new Set(sales.map(s => (s as unknown as { customerPhone?: string }).customerPhone ?? "anon").filter(p => p !== "anon")).size;
    const salesDays = new Set<string>();
    for (const s of sales) {
      try { salesDays.add(new Date(s.createdAt).toISOString().slice(0, 10)); } catch { /* ignore */ }
    }
    let streak = 0;
    const todayDate = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(todayDate);
      d.setDate(d.getDate() - i);
      if (salesDays.has(d.toISOString().slice(0, 10))) streak++;
      else break;
    }
    let recordDiario = 0;
    try { recordDiario = Number(localStorage.getItem("business-record-daily")) || 0; } catch { /* ignore */ }
    if (revenueToday > recordDiario) {
      try { localStorage.setItem("business-record-daily", String(revenueToday)); recordDiario = revenueToday; } catch { /* ignore */ }
    }
    const cobradoMes = payables.filter(p => p.status === "pagado").reduce((s, p) => s + p.paidAmount, 0);
    const LOGROS: Achievement[] = [
      { id: "first-sale", titulo: "Primera venta", desc: "Registraste tu primera venta", condicion: ventasCount > 0 },
      { id: "100-sales", titulo: "100 ventas", desc: "Has registrado 100 ventas", condicion: ventasCount >= 100, progreso: Math.min(ventasCount, 100), meta: 100 },
      { id: "1000-sales", titulo: "1,000 ventas", desc: "Mil ventas!", condicion: ventasCount >= 1000, progreso: Math.min(ventasCount, 1000), meta: 1000 },
      { id: "best-day", titulo: "Mejor dia", desc: "Superaste tu record diario", condicion: revenueToday >= recordDiario && revenueToday > 0 },
      { id: "streak-7", titulo: "7 dias seguidos", desc: "Vendiste 7 dias consecutivos", condicion: streak >= 7, progreso: Math.min(streak, 7), meta: 7 },
      { id: "streak-30", titulo: "Mes completo", desc: "30 dias vendiendo sin parar", condicion: streak >= 30, progreso: Math.min(streak, 30), meta: 30 },
      { id: "all-paid", titulo: "Sin deudas", desc: "Todos los fiados pagados", condicion: fiadosActivos === 0 },
      { id: "collector", titulo: "Cobrador estrella", desc: "Cobraste S/1,000+ en un mes", condicion: cobradoMes >= 1000, progreso: Math.min(cobradoMes, 1000), meta: 1000 },
      { id: "50-clients", titulo: "50 clientes", desc: "Tu bodega tiene 50+ clientes", condicion: clientesTotal >= 50, progreso: Math.min(clientesTotal, 50), meta: 50 },
    ];
    const unlocked = LOGROS.filter(l => l.condicion);
    return { unlocked: unlocked.length, total: LOGROS.length, streak };
  }, [sales, payables, revenueToday]);

  // ── Pending items for BusinessOverviewHero ────────────────────────────────────

  const pendingItems = useMemo(() => {
    return [
      alerts.pendingOrders > 0
        ? { label: "Pedidos pendientes", value: String(alerts.pendingOrders), detail: "Atiendelos hoy para no frenar ventas", Icon: ShoppingCart, emphasis: "danger" as const }
        : null,
      upcomingPayables.overdue > 0
        ? { label: "Pagos vencidos", value: String(upcomingPayables.overdue), detail: "Ordena caja para no cortar credito", Icon: DollarSign, emphasis: "warning" as const }
        : null,
      productsRunningOut.length > 0
        ? { label: "Productos por agotarse", value: String(productsRunningOut.length), detail: "Repone lo que mas rota esta semana", Icon: Package, emphasis: "warning" as const }
        : null,
      expiringBatchCount > 0
        ? { label: "Lotes por vencer", value: String(expiringBatchCount), detail: "Muevelos antes de perder margen", Icon: AlertTriangle, emphasis: "warning" as const }
        : null,
    ].filter(Boolean) as Array<{ label: string; value: string; detail: string; Icon: typeof ShoppingCart; emphasis: "warning" | "danger" }>;
  }, [alerts.pendingOrders, upcomingPayables.overdue, productsRunningOut.length, expiringBatchCount]);

  // ── Sections filtered for resumen tab ─────────────────────────────────────────

  const filteredSections = sectionOrder.filter(sid => {
    const tabMap: Record<string, string[]> = {
      "kpis": ["resumen", "ventas"],
      "margen-comparador": ["resumen", "finanzas"],
      "top-productos": ["ventas", "resumen"],
      "horario-pico": ["ventas", "resumen"],
      "clientes-alertas": ["clientes", "resumen"],
    };
    return (tabMap[sid] ?? ["resumen"]).includes("resumen");
  });

  const overviewTitle = monthDelta >= 0
    ? "Tu negocio mantiene buen ritmo este mes"
    : "Tu negocio necesita recuperar ritmo este mes";

  const overviewDescription = monthDelta >= 0
    ? `Vas ${monthDelta >= 0 ? "+" : ""}${monthDelta.toFixed(1)}% frente al mes anterior y ya puedes ver hacia donde empuja tu negocio.`
    : `${monthDelta.toFixed(1)}% vs el mes anterior. Conviene mirar ventas, caja y reposicion en un solo lugar.`;

  return (
    <>
      {/* Banner motivacional — tienda nueva sin datos */}
      {!loading && products.length === 0 && orders.length === 0 && sales.length === 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10 p-5 flex items-start gap-4">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-primary dark:text-[var(--data-success-500)] text-sm">Tu tienda esta lista.</p>
            <p className="text-xs text-[var(--text-secondary)] dark:text-zinc-400 mt-0.5">Agrega productos y empieza a vender. Los datos apareceran aqui automaticamente.</p>
          </div>
        </div>
      )}

      {!loading && (
        <BusinessOverviewHero
          eyebrow="Panorama del negocio"
          title={overviewTitle}
          description={overviewDescription}
          icon={LayoutDashboard}
          tone={monthDelta >= 0 ? (pendingItems.length === 0 ? "positive" : "neutral") : "warning"}
          metrics={[
            {
              label: "Ventas del mes",
              value: fmtR(revenueThisMonth),
              detail: `${monthDelta >= 0 ? "+" : ""}${monthDelta.toFixed(1)}% vs mes anterior`,
              emphasis: monthDelta >= 0 ? "positive" : "danger",
            },
            {
              label: "Cierre estimado",
              value: monthProjection ? fmtR(monthProjection.proyeccion) : "Sin base",
              detail: monthProjection
                ? `Promedio actual proyecta ${fmtR(monthProjection.proyeccion)}`
                : "Necesitas mas dias de ventas para proyectar con confianza",
            },
            {
              label: "Pendiente por cobrar",
              value: fmtR(cuentasPorCobrar.total),
              detail: `${cuentasPorCobrar.count} documento${cuentasPorCobrar.count !== 1 ? "s" : ""} abiertos`,
              emphasis: cuentasPorCobrar.total > 0 ? "warning" : "default",
            },
          ]}
          highlights={[
            {
              label: "Mejor dia",
              value: bestDay ? bestDay.best.name : "Sin suficiente data",
              detail: bestDay ? `Promedio ${fmtR(bestDay.best.avg)}` : "Aun no hay patron estable",
            },
            {
              label: "Categoria que empuja",
              value: growingCategory?.top ? growingCategory.top.cat : "Sin tendencia clara",
              detail: growingCategory?.top
                ? `${Number(growingCategory.top.pct).toFixed(0)}% esta semana frente a la anterior`
                : "Aun no hay suficientes ventas para comparar",
              emphasis: growingCategory?.top ? "positive" : "default",
            },
            {
              label: "Cliente mas valioso",
              value: topClientMonth ? topClientMonth.name : "Sin cliente lider",
              detail: topClientMonth
                ? `${topClientMonth.orderCount} compras · ${fmtR(topClientMonth.total)}`
                : "Todavia no hay compras suficientes este mes",
            },
          ]}
          actionsTitle="Pendientes que mueven caja"
          actionsDescription="Esto es lo que conviene resolver primero para proteger ventas y margen."
          actions={pendingItems.map((item) => ({
            label: item.label,
            value: item.value,
            detail: item.detail,
            icon: item.Icon,
            emphasis: item.emphasis,
          }))}
          emptyActionTitle="Hoy no hay bloqueos fuertes"
          emptyActionDescription="Tu negocio esta operando sin alertas criticas de caja, stock o vencimientos."
        />
      )}

      {/* Insights */}
      {!loading && insights.length > 0 && (
        <div className="space-y-2">
          {insights.map((insight, i) => (
            <div
              key={i}
              className={cn(
                "border-l-4 p-3 rounded-r-xl text-sm",
                insight.type === "positive" && "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-[var(--data-success-500)]/30 text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
                insight.type === "negative" && "bg-[var(--data-error-50)] dark:bg-red-950/20 border-[var(--data-error-500)] text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",
                insight.type === "neutral" && "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-[var(--data-success-500)]/30 text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
              )}
            >
              <span className="font-medium">{insight.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Combo del día */}
      {!loading && comboData.products.some(p => p.found) && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 flex items-center justify-center">
              <Lightbulb className="h-5 w-5 text-[var(--data-warning-500)]" />
            </div>
            <div>
              <p className="text-sm font-bold text-[var(--text-primary)]">Combo del día disponible</p>
              <p className="text-xs text-[var(--text-tertiary)]">La IA tiene sugerencias de combos para ti</p>
            </div>
          </div>
        </div>
      )}

      {/* Logro desbloqueado */}
      {showLogro && logro && (
        <div className="relative border border-[var(--data-success-500)]/40 bg-[var(--surface-sunken)] rounded-xl p-4 flex items-center gap-3">
          <TrendingUp className="w-8 h-8 text-[var(--data-success-500)]" />
          <div className="flex-1">
            <p className="text-xs font-extrabold text-[var(--data-success-500)]">Logro desbloqueado!</p>
            <p className="text-sm font-bold text-[var(--text-primary)] dark:text-zinc-100">{logro.texto}</p>
          </div>
          <button onClick={() => setShowLogro(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] p-1 shrink-0"><span className="text-lg">&times;</span></button>
        </div>
      )}

      {/* Context badges */}
      {!loading && (
        <div className="flex flex-wrap items-center gap-2">
          {semanaAnterior && (
            <span className={cn("inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border", semanaAnterior.pct >= 0 ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" : "bg-[var(--data-error-50)] dark:bg-red-950/20 border-[var(--data-error-500)] dark:border-[var(--data-error-500)] text-[var(--data-error-500)] dark:text-[var(--data-error-500)]")}>
              Hace 1 sem ({semanaAnterior.diaLabel}): {fmtR(semanaAnterior.monto)} {semanaAnterior.pct >= 0 ? "+" : ""}{Number(semanaAnterior.pct).toFixed(0)}%
            </span>
          )}
          {hitoProximo && (
            <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[var(--data-warning-50)] dark:bg-amber-950/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)] text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">
              {hitoProximo.falta ? `Te faltan ${hitoProximo.falta} para ${hitoProximo.label}` : hitoProximo.label}
            </span>
          )}
          {bestHourToday && (
            <span className="inline-flex items-center gap-1 text-xs bg-white dark:bg-zinc-800 border border-[var(--rule-base)] dark:border-zinc-700 rounded-lg px-3 py-2">
              <Clock className="h-3.5 w-3.5 text-primary" />
              <span className="text-[var(--text-secondary)] dark:text-zinc-300">Mejor hora: <span className="font-bold">{bestHourToday.hour}:00</span> (S/{Number(bestHourToday.total).toFixed(0)})</span>
            </span>
          )}
          {diasSinCierre != null && diasSinCierre >= 1 && (
            <span className={cn(
              "inline-flex items-center gap-1 text-xs font-bold rounded-lg px-3 py-2",
              diasSinCierre >= 2
                ? "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 text-[var(--data-error-500)] dark:text-[var(--data-error-500)] border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/30"
                : "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/30"
            )}>
              <AlertTriangle className="h-3.5 w-3.5" />
              {diasSinCierre >= 2 ? `${diasSinCierre} dias sin cerrar caja` : "Ayer no cerraste caja"}
            </span>
          )}
        </div>
      )}

      {/* Widget order controls */}
      {!isDefaultOrder && (
        <div className="flex items-center justify-end">
          <button
            onClick={resetOrder}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-zinc-700 text-[var(--text-secondary)] dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-600 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restablecer orden
          </button>
        </div>
      )}

      {/* Draggable widget sections — charts + cards all draggable */}
      <DraggableWidgetGrid storageKey="dashboard-resumen-order" columns={2}>
        {/* Chart A — Resumen del negocio (full-width) */}
        <div key="chart-resumen" className="col-span-1 md:col-span-2">
          <div className="rounded-xl border border-[var(--rule-base)] dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-4 h-4" style={{ color: "var(--color-primary)" }} />
              <span className="text-sm font-semibold text-[var(--text-primary)]">Resumen del negocio</span>
            </div>
            {loading ? (
              <div className="w-full h-[320px] bg-gray-100 dark:bg-zinc-700/40 animate-pulse rounded" />
            ) : monthlyDailyData.length === 0 ? (
              <p className="text-sm text-[var(--text-tertiary)] dark:text-zinc-500 py-12 text-center">Sin datos suficientes para graficar.</p>
            ) : (
              <BusinessOverviewChart data={monthlyDailyData} fmtR={fmtR} fmtShortR={fmtShortR} />
            )}
          </div>
        </div>

        {/* Chart B — Donut de categorias */}
        <div key="chart-categorias" className="col-span-1">
          <div className="rounded-xl border border-[var(--rule-base)] dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 h-full">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4" style={{ color: "#8b5cf6" }} />
              <span className="text-sm font-semibold text-[var(--text-primary)]">Ventas por categoria</span>
            </div>
            {loading ? (
              <div className="w-full h-[200px] bg-gray-100 dark:bg-zinc-700/40 animate-pulse rounded" />
            ) : chartVentasCategoria.length === 0 ? (
              <p className="text-sm text-[var(--text-tertiary)] dark:text-zinc-500 py-12 text-center">Sin datos de categorias.</p>
            ) : (
              <CategoryDonutChart data={chartVentasCategoria} fmtR={fmtR} />
            )}
          </div>
        </div>

        {/* Top 10 productos section */}
        <div key="top-productos" className="col-span-1">
          <div className="rounded-xl border border-[var(--rule-base)] dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 h-full">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4" style={{ color: "var(--color-primary)" }} />
              <span className="text-sm font-semibold text-[var(--text-primary)]">Top 10 productos</span>
            </div>
            {loading ? (
              <SkeletonBar rows={10} />
            ) : topProducts.length === 0 ? (
              <p className="text-sm text-[var(--text-tertiary)] dark:text-zinc-500">No hay datos de ventas aun.</p>
            ) : (
              <div className="space-y-2">
                {topProducts.map((prod, idx) => {
                  const pct = Math.max(4, (prod.qty / maxProductQty) * 100);
                  return (
                    <div key={String(prod.id)} className="flex items-center gap-2 text-sm">
                      <span className="w-5 text-right text-xs text-[var(--text-tertiary)] dark:text-zinc-500 font-mono shrink-0">{idx + 1}</span>
                      <span className="w-36 sm:w-44 truncate text-[var(--text-primary)] dark:text-zinc-300 shrink-0 text-xs" title={prod.name}>{prod.name}</span>
                      <div className="flex-1 h-5 rounded bg-gray-100 dark:bg-zinc-700 relative overflow-hidden">
                        <div className="absolute inset-y-0 left-0 rounded transition-all" style={{ width: `${pct}%`, backgroundColor: idx === 0 ? "var(--color-primary)" : "var(--color-primary)60" }} />
                        <span className="absolute inset-y-0 left-2 flex items-center text-[length:var(--ts-2xs)] font-semibold text-white z-10">{prod.qty} uds</span>
                      </div>
                      <span className="text-xs text-[var(--text-tertiary)] dark:text-zinc-500 shrink-0 w-20 text-right tabular-nums">{fmtR(prod.revenue)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Horario pico section */}
        <div key="horario-pico" className="col-span-1">
          <div className="rounded-xl border border-[var(--rule-base)] dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 h-full">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4" style={{ color: "#ff6b5b" }} />
              <span className="text-sm font-semibold text-[var(--text-primary)]">Ventas por hora (hoy)</span>
            </div>
            {loading ? (
              <SkeletonBar rows={4} />
            ) : salesToday.length === 0 ? (
              <p className="text-sm text-[var(--text-tertiary)] dark:text-zinc-500">Sin ventas registradas hoy.</p>
            ) : (
              <div className="space-y-1">
                {hourBuckets.map((bucket) => {
                  const pct = Math.max(0, (bucket.amount / maxHourAmount) * 100);
                  const isActive = bucket.hour === new Date().getHours();
                  return (
                    <div key={bucket.hour} className="flex items-center gap-2 text-xs">
                      <span className={cn("w-8 text-right shrink-0 font-mono", isActive ? "text-[var(--data-warning-500)] font-bold" : "text-[var(--text-tertiary)] dark:text-zinc-500")}>{bucket.label}</span>
                      <div className="flex-1 h-4 rounded bg-gray-100 dark:bg-zinc-700 relative overflow-hidden">
                        {pct > 0 && <div className="absolute inset-y-0 left-0 rounded transition-all" style={{ width: `${pct}%`, backgroundColor: isActive ? "#ff6b5b" : "var(--color-primary)80" }} />}
                        {pct > 10 && <span className="absolute inset-y-0 left-2 flex items-center text-[length:var(--ts-2xs)] font-semibold text-white z-10">{fmtR(bucket.amount)}</span>}
                      </div>
                      {pct === 0 && <span className="text-[var(--text-tertiary)] dark:text-zinc-600 text-[length:var(--ts-2xs)]">--</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Comparador mes actual vs anterior */}
        <div key="margen-comparador" className="col-span-1">
            {loading ? (
              <SkeletonCard />
            ) : (
              <div className="rounded-xl border border-[var(--rule-base)] dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="w-4 h-4" style={{ color: "#ff6b5b" }} />
                  <span className="text-sm font-semibold text-[var(--text-primary)]">Este mes vs anterior</span>
                </div>
                <div className="flex items-end gap-3">
                  <div>
                    <p className="text-2xl font-bold font-mono text-[var(--text-primary)] dark:text-zinc-100">{fmtR(revenueThisMonth)}</p>
                    <p className="text-xs text-[var(--text-tertiary)] dark:text-zinc-500">mes actual</p>
                  </div>
                  <div className={cn("flex items-center gap-1 text-sm font-semibold pb-1", monthDelta >= 0 ? "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" : "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]")}>
                    {monthDelta >= 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                    {Math.abs(monthDelta).toFixed(1)}%
                  </div>
                </div>
                <p className="text-xs text-[var(--text-tertiary)] dark:text-zinc-500 mt-1">
                  Mes anterior: <span className="font-medium text-[var(--text-secondary)] dark:text-zinc-400">{fmtR(revenuePrevMonth)}</span>
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[
                    { label: "Este mes", value: revenueThisMonth, color: "var(--color-primary)", max: Math.max(revenueThisMonth, revenuePrevMonth, 1) },
                    { label: "Anterior", value: revenuePrevMonth, color: "#94a3b8", max: Math.max(revenueThisMonth, revenuePrevMonth, 1) },
                  ].map((bar) => (
                    <div key={bar.label}>
                      <div className="flex justify-between text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-zinc-500 mb-1">
                        <span>{bar.label}</span>
                        <span>{fmtR(bar.value)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100 dark:bg-zinc-700">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (bar.value / bar.max) * 100)}%`, backgroundColor: bar.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>

        {/* KPIs extra section */}
        {!loading && (
          <div key="kpis-extra" className="col-span-1 md:col-span-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {monthProjection && (
              <div className="rounded-xl border border-[var(--rule-base)] dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
                <span className="text-sm font-semibold text-[var(--text-primary)]">Proyeccion mensual</span>
                <p className="text-lg font-bold font-mono text-[var(--text-primary)] dark:text-zinc-100 mt-1">
                  {fmtR(monthProjection.ventasMes)} <span className="text-xs font-normal text-[var(--text-tertiary)]">de {fmtR(monthProjection.proyeccion)}</span>
                </p>
                <div className="w-full bg-gray-200 dark:bg-zinc-700 rounded-full h-2 mt-2">
                  <div className={cn("h-2 rounded-full transition-all", monthProjection.porcentaje >= 80 ? "bg-[var(--accent-soft)]" : monthProjection.porcentaje >= 50 ? "bg-[var(--data-warning-500)]" : "bg-[var(--data-error-500)]")} style={{ width: `${Math.min(100, monthProjection.porcentaje)}%` }} />
                </div>
                <p className="text-xs mt-1 text-[var(--text-tertiary)]">
                  {monthProjection.porcentaje > 100 ? "Superando proyeccion!" : `${monthProjection.porcentaje}% — dia ${monthProjection.diasTranscurridos}/${monthProjection.diasTotales}`}
                </p>
              </div>
            )}
            {noClosedYesterday && !ignoredClose && revenueYesterday > 0 && (
              <div className="rounded-xl border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/30 bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 p-4">
                <span className="text-xs font-bold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">No cerraste ayer</span>
                <p className="text-sm text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] mt-1">
                  Ventas: <span className="font-bold">{fmtR(revenueYesterday)}</span> &middot; {salesYesterdayCount} transacciones
                </p>
                <button
                  onClick={() => { localStorage.setItem("last-daily-close", new Date().toISOString().slice(0, 10)); setIgnoredClose(true); }}
                  className="mt-2 text-xs font-bold text-[var(--data-warning-500)] hover:underline"
                >
                  Ignorar
                </button>
              </div>
            )}
            {productosSinVenderHoy.length > 0 && (
              <div className="rounded-xl border border-[var(--rule-base)] dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
                <span className="text-sm font-semibold text-[var(--text-primary)]">Sin vender hoy</span>
                <div className="mt-2 space-y-1">
                  {productosSinVenderHoy.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-[var(--text-primary)] dark:text-zinc-300 truncate">{p.name}</span>
                      <span className="text-[var(--text-tertiary)] dark:text-zinc-500 shrink-0 ml-2">Ayer: {p.qty}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {decliningProduct && (
              <div className="rounded-xl border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/30 bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 p-4">
                <span className="text-xs font-bold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">En declive</span>
                <p className="text-sm text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] mt-1 font-medium">
                  {decliningProduct.name} (-{decliningProduct.pct}% vs semana pasada)
                </p>
                <p className="text-xs text-[var(--data-warning-500)] mt-0.5">Revisa stock, precio o visibilidad</p>
              </div>
            )}
            </div>
          </div>
        )}

        {/* Clientes + Alertas section */}
        <div key="clientes-alertas" className="col-span-1 md:col-span-2">
          <div className="space-y-6">
            {abandonedCartCount > 0 && (
              <div className="rounded-xl border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/40 flex items-center justify-center shrink-0">
                    <ShoppingCart className="w-5 h-5 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">
                      {abandonedCartCount} carrito{abandonedCartCount !== 1 ? "s" : ""} abandonado{abandonedCartCount !== 1 ? "s" : ""} hoy
                    </p>
                    <p className="text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">{fmtR(abandonedCartValue)} en ventas potenciales</p>
                  </div>
                  <a href="/admin?module=notificaciones" className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] bg-[var(--data-warning-500)]/60 dark:bg-[var(--data-warning-500)]/40 hover:bg-[var(--data-warning-500)] dark:hover:bg-[var(--data-warning-500)]/60 transition-colors">
                    Ver y contactar
                  </a>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Top 5 clientes */}
              <div className="rounded-xl border border-[var(--rule-base)] dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Users className="w-4 h-4" style={{ color: "var(--color-primary)" }} />
                  <span className="text-sm font-semibold text-[var(--text-primary)]">Top 5 clientes del mes</span>
                </div>
                {loading ? (
                  <div className="space-y-3 animate-pulse">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-zinc-700 shrink-0" />
                        <div className="flex-1 h-3 rounded bg-gray-200 dark:bg-zinc-700" />
                        <div className="w-14 h-3 rounded bg-gray-200 dark:bg-zinc-700" />
                      </div>
                    ))}
                  </div>
                ) : topCustomers.length === 0 ? (
                  <p className="text-sm text-[var(--text-tertiary)] dark:text-zinc-500">Sin pedidos este mes.</p>
                ) : (
                  <ol className="space-y-2">
                    {topCustomers.map((c, idx) => (
                      <li key={c.phone ?? c.name} className="flex items-center gap-2 text-sm">
                        <span className="flex items-center justify-center w-5 h-5 rounded-full text-[length:var(--ts-2xs)] font-bold shrink-0 text-white" style={{ backgroundColor: idx === 0 ? "var(--color-primary)" : "#94a3b8" }}>
                          {idx + 1}
                        </span>
                        <span className="flex-1 truncate text-[var(--text-primary)] dark:text-zinc-300 text-xs" title={c.name}>{c.name}</span>
                        <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-zinc-500 shrink-0">{c.orderCount} ped.</span>
                        <span className="text-xs font-semibold tabular-nums shrink-0 text-[var(--color-primary)]" style={{ color: "var(--color-primary)" }}>{fmtR(c.total)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {/* Alertas activas */}
              <div className="rounded-xl border border-[var(--rule-base)] dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-4 h-4 text-[var(--data-warning-500)]" />
                  <span className="text-sm font-semibold text-[var(--text-primary)]">Alertas activas</span>
                </div>
                {loading ? (
                  <div className="space-y-2 animate-pulse">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-9 rounded-lg bg-gray-200 dark:bg-zinc-700" />
                    ))}
                  </div>
                ) : !hasAnyAlert ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-4 text-center">
                    <TrendingUp className="w-8 h-8 text-[var(--data-success-500)] mx-auto" />
                    <p className="text-sm font-medium text-[var(--text-secondary)] dark:text-zinc-400">Todo bajo control</p>
                    <p className="text-xs text-[var(--text-tertiary)] dark:text-zinc-500">No hay alertas pendientes</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <AlertBadge Icon={Package} label="Productos con stock bajo" count={alerts.lowStock} colorClass="bg-red-50 dark:bg-red-900/20 text-[var(--data-error-700)] dark:text-red-400 border border-red-200 dark:border-red-800" />
                    <AlertBadge Icon={AlertTriangle} label="Lotes por vencer (7 dias)" count={expiringBatchCount} colorClass="bg-amber-50 dark:bg-amber-900/20 text-[var(--data-warning-700)] dark:text-amber-400 border border-amber-200 dark:border-amber-800" />
                    <AlertBadge Icon={DollarSign} label="Fiados vencidos" count={alerts.overduePayables} colorClass="bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Logros y Streaks */}
        <div key="logros" className="col-span-1 md:col-span-2">
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 flex items-center justify-center"><Target className="h-5 w-5 text-[var(--data-warning-500)]" /></div>
              <div>
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  {logrosData.unlocked}/{logrosData.total} logros desbloqueados
                </p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  {logrosData.streak > 0 ? `Racha: ${logrosData.streak} dias` : "Empieza tu racha vendiendo hoy"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </DraggableWidgetGrid>
    </>
  );
}
