"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Store,
  Package,
  ShoppingCart,
  DollarSign,
  CheckCircle,
  AlertCircle,
  MessageSquare,
  BarChart3,
  Zap,
  ArrowRight,
  ExternalLink,
  EyeOff,
  Star,
  Target,
} from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { ORDER_STATUS_CONFIG, TableSkeleton } from "../types";

// ─────────────────────────────────────────────
// Admin Marketplace Overview (solo visible para admins de la plataforma)
// ─────────────────────────────────────────────
interface AdminOverviewData {
  stores: { total: number; active: number; pending: number };
  today: { orders: number; revenue: number };
  month: { orders: number; revenue: number; revenueGrowth: number };
  pendingOrders: number;
  commissions: { month: number };
  topStores: { name: string; slug: string; orders: number; revenue: number }[];
  recentOrders: { id: string; customerName: string; total: number; status: string; createdAt: string; storeName: string }[];
}

export function AdminMarketplaceOverview() {
  const [data, setData] = useState<AdminOverviewData | null>(null);

  useEffect(() => {
    fetch("/api/marketplace/admin/overview")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d as AdminOverviewData); })
      .catch((err) => { console.warn("[MarketplaceModule] fetch failed", err); });
  }, []);

  if (!data) return null;

  const fmtS = (n: number) => `S/${n.toFixed(2)}`;

  return (
    <div className="space-y-4 mb-6">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-primary" />
        <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Resumen del Marketplace</CardTitle>
        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">Admin</span>
      </div>

      {/* KPIs globales */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Tiendas activas", value: `${data.stores.active}/${data.stores.total}`, sub: data.stores.pending > 0 ? `${data.stores.pending} por aprobar` : "Todas aprobadas", color: "text-primary" },
          { label: "Pedidos hoy", value: String(data.today.orders), sub: fmtS(data.today.revenue), color: "text-[var(--data-success)]" },
          { label: "Ventas del mes", value: fmtS(data.month.revenue), sub: data.month.revenueGrowth !== 0 ? `${data.month.revenueGrowth > 0 ? "+" : ""}${data.month.revenueGrowth}% vs anterior` : "—", color: "text-[var(--text-secondary)]" },
          { label: "Comisiones del mes", value: fmtS(data.commissions.month), sub: `${data.month.orders} órdenes`, color: "text-[var(--data-warning)]" },
          { label: "Pedidos pendientes", value: String(data.pendingOrders), sub: data.pendingOrders > 0 ? "¡Requieren atención!" : "Todo al día", color: data.pendingOrders > 0 ? "text-[var(--data-error)]" : "text-[var(--data-success)]" },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="bg-white border border-[var(--rule-base)] rounded-xl p-3">
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">{label}</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Top tiendas + Últimos pedidos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-[var(--rule-base)] rounded-xl p-4">
          <h4 className="text-xs font-bold text-[var(--text-primary)] mb-3">Top tiendas este mes</h4>
          {data.topStores.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)] text-center py-3">Sin datos</p>
          ) : (
            <div className="space-y-2.5">
              {data.topStores.map((s, i) => (
                <div key={s.slug || i} className="flex items-center gap-3">
                  <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-extrabold shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{s.name}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">{s.orders} pedido(s)</p>
                  </div>
                  <span className="text-xs font-bold text-[var(--data-success)] shrink-0">{fmtS(s.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-[var(--rule-base)] rounded-xl p-4">
          <h4 className="text-xs font-bold text-[var(--text-primary)] mb-3">Últimos pedidos marketplace</h4>
          {data.recentOrders.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)] text-center py-3">Sin pedidos</p>
          ) : (
            <div className="space-y-2.5">
              {data.recentOrders.slice(0, 5).map((o) => {
                const cfg = ORDER_STATUS_CONFIG[o.status] ?? ORDER_STATUS_CONFIG.pendiente;
                return (
                  <div key={o.id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{o.customerName}</p>
                      <p className="text-xs text-[var(--text-tertiary)]">{o.storeName}</p>
                    </div>
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", cfg.className)}>
                      {cfg.label}
                    </span>
                    <span className="text-xs font-bold text-[var(--text-primary)] shrink-0">{fmtS(o.total)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="border-b border-[var(--rule-base)]" />
    </div>
  );
}

// ─────────────────────────────────────────────
// HealthGauge + HealthBreakdownBar (solo para DashboardTab)
// ─────────────────────────────────────────────

function HealthGauge({ score }: { score: number }) {
  const c = Math.max(0, Math.min(100, Math.round(score)));
  const tone =
    c >= 80 ? "text-[var(--data-success)]"
    : c >= 50 ? "text-[var(--data-warning)]"
    : "text-[var(--data-error)]";
  const stroke =
    c >= 80 ? "var(--data-success)"
    : c >= 50 ? "var(--data-warning)"
    : "var(--data-error)";
  const trackBg =
    c >= 80 ? "rgba(34,197,94,0.10)"
    : c >= 50 ? "rgba(245,158,11,0.10)"
    : "rgba(239,68,68,0.10)";
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (c / 100) * circumference;
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90 drop-shadow-sm">
        <circle cx="70" cy="70" r={radius} stroke={trackBg} strokeWidth="10" fill="none" />
        <circle
          cx="70"
          cy="70"
          r={radius}
          stroke={stroke}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          fill="none"
          style={{ transition: "stroke-dashoffset 800ms cubic-bezier(0.16, 1, 0.3, 1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("font-display text-4xl font-extrabold tabular-nums tracking-tight", tone)}>{c}</span>
        <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mt-0.5">
          de 100
        </span>
      </div>
    </div>
  );
}

function HealthBreakdownBar({
  label,
  pct,
  count,
  total,
}: {
  label: string;
  pct: number;
  count?: number;
  total?: number;
}) {
  const tone =
    pct >= 80 ? "bg-[var(--data-success)]"
    : pct >= 50 ? "bg-[var(--data-warning)]"
    : pct > 0 ? "bg-[var(--data-error)]"
    : "bg-[var(--rule-base)]";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-[var(--text-secondary)]">{label}</span>
        <span className="font-bold tabular-nums text-[var(--text-primary)]">
          {pct === 0 && total === 0 ? "—" : `${pct}%`}
          {typeof count === "number" && typeof total === "number" && total > 0 && (
            <span className="text-[var(--text-tertiary)] font-normal ml-1">({count}/{total})</span>
          )}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500 ease-out", tone)}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// MarketplaceQuickActions (salud de tienda + próximas acciones)
// ─────────────────────────────────────────────

type QuickAction = {
  id: string;
  label: string;
  count: number;
  tone: "warning" | "danger" | "info" | "success";
  icon: React.ElementType;
  cta: string;
  goTo: string;
};

interface QuickActionsState {
  loading: boolean;
  pendingOrders: number;
  productsIncomplete: number;
  reviewsUnreplied: number;
  commissionsToCollect: number;
  storePublished: boolean | null;
  productsTotal: number;
  productsWithImage: number;
  productsWithDesc: number;
  productsWithStock: number;
  reviewsTotal: number;
  reviewsReplied: number;
}

export function MarketplaceQuickActions({
  onNavigate,
}: {
  onNavigate: (subtab: string) => void;
}) {
  const [state, setState] = useState<QuickActionsState>({
    loading: true,
    pendingOrders: 0,
    productsIncomplete: 0,
    reviewsUnreplied: 0,
    commissionsToCollect: 0,
    storePublished: null,
    productsTotal: 0,
    productsWithImage: 0,
    productsWithDesc: 0,
    productsWithStock: 0,
    reviewsTotal: 0,
    reviewsReplied: 0,
  });

  useEffect(() => {
    let cancel = false;
    (async () => {
      const [ordersR, productsR, reviewsR, ledgerR, storeR] = await Promise.allSettled([
        fetch("/api/marketplace/orders").then((r) => (r.ok ? r.json() : [])),
        fetch("/api/marketplace/stores/my/products").then((r) => (r.ok ? r.json() : [])),
        fetch("/api/reviews?all=1").then((r) => (r.ok ? r.json() : [])),
        fetch("/api/commissions/ledger").then((r) => (r.ok ? r.json() : { entries: [] })),
        fetch("/api/marketplace/stores?my=true").then((r) => (r.ok ? r.json() : null)),
      ]);
      if (cancel) return;

      const orders = ordersR.status === "fulfilled" && Array.isArray(ordersR.value) ? ordersR.value : [];
      const products = productsR.status === "fulfilled" && Array.isArray(productsR.value) ? productsR.value : [];
      const reviewsRaw = reviewsR.status === "fulfilled" ? reviewsR.value : [];
      const reviews = Array.isArray(reviewsRaw)
        ? reviewsRaw
        : Array.isArray(reviewsRaw?.reviews)
          ? reviewsRaw.reviews
          : [];
      const ledger = ledgerR.status === "fulfilled" ? ledgerR.value?.entries ?? [] : [];
      const store = storeR.status === "fulfilled" ? storeR.value : null;

      const pendingOrders = orders.filter((o: { status: string }) =>
        o.status === "pendiente" || o.status === "confirmado",
      ).length;

      const productsTotal = products.length;
      const productsWithImage = products.filter((p: { image: string | null }) => !!p.image).length;
      const productsWithDesc = products.filter(
        (p: { description: string | null }) =>
          !!p.description && p.description.trim().length >= 10,
      ).length;
      const productsWithStock = products.filter((p: { stock: number }) => p.stock > 0).length;
      const productsIncomplete = products.filter((p: { image: string | null; description: string | null; stock: number; retailPrice: number }) =>
        !p.image ||
        !p.description ||
        p.description.trim().length < 10 ||
        p.stock <= 0 ||
        p.retailPrice <= 0,
      ).length;

      const reviewsTotal = reviews.length;
      const reviewsReplied = reviews.filter((r: { adminReply?: string | null }) =>
        r.adminReply && r.adminReply.trim().length > 0,
      ).length;
      const reviewsUnreplied = Math.max(0, reviewsTotal - reviewsReplied);

      const commissionsToCollect = ledger
        .filter((e: { status: string }) => e.status === "liquidado")
        .reduce((sum: number, e: { amount: number }) => sum + Number(e.amount ?? 0), 0);

      const storePublished =
        store && typeof store === "object" && "isActive" in store ? !!store.isActive : null;

      setState({
        loading: false,
        pendingOrders,
        productsIncomplete,
        reviewsUnreplied,
        commissionsToCollect,
        storePublished,
        productsTotal,
        productsWithImage,
        productsWithDesc,
        productsWithStock,
        reviewsTotal,
        reviewsReplied,
      });
    })().catch(() => {
      if (!cancel) setState((s) => ({ ...s, loading: false }));
    });
    return () => { cancel = true; };
  }, []);

  // Health score ponderado
  const healthScore = (() => {
    if (state.loading) return 0;
    let score = 0;
    if (state.storePublished) score += 15;
    if (state.productsTotal > 0) {
      score += Math.round((state.productsWithImage / state.productsTotal) * 25);
      score += Math.round((state.productsWithDesc / state.productsTotal) * 15);
      score += Math.round((state.productsWithStock / state.productsTotal) * 20);
    }
    if (state.reviewsTotal > 0) {
      score += Math.round((state.reviewsReplied / state.reviewsTotal) * 15);
    } else {
      score += 15;
    }
    if (state.pendingOrders === 0) score += 10;
    return Math.min(100, score);
  })();

  const actions: QuickAction[] = [];
  if (state.pendingOrders > 0) {
    actions.push({ id: "orders", label: state.pendingOrders === 1 ? "1 pedido por atender" : `${state.pendingOrders} pedidos por atender`, count: state.pendingOrders, tone: "danger", icon: ShoppingCart, cta: "Ver pipeline", goTo: "ordenes" });
  }
  if (state.commissionsToCollect > 0) {
    actions.push({ id: "commissions", label: `S/ ${state.commissionsToCollect.toFixed(2)} liquidado por cobrar`, count: 1, tone: "warning", icon: DollarSign, cta: "Ver comisiones", goTo: "comisiones" });
  }
  if (state.productsIncomplete > 0) {
    actions.push({ id: "products", label: `${state.productsIncomplete} producto${state.productsIncomplete !== 1 ? "s" : ""} sin completar`, count: state.productsIncomplete, tone: "warning", icon: Package, cta: "Completar fichas", goTo: "productos" });
  }
  if (state.reviewsUnreplied > 0) {
    actions.push({ id: "reviews", label: `${state.reviewsUnreplied} reseña${state.reviewsUnreplied !== 1 ? "s" : ""} sin responder`, count: state.reviewsUnreplied, tone: "info", icon: Star, cta: "Responder", goTo: "resenas" });
  }
  if (state.storePublished === false) {
    actions.push({ id: "publish", label: "Tu tienda está en borrador", count: 1, tone: "danger", icon: EyeOff, cta: "Publicar", goTo: "tienda" });
  }

  const toneStyles: Record<QuickAction["tone"], { bar: string; bg: string; iconBg: string; iconFg: string }> = {
    danger:  { bar: "before:bg-[var(--data-error)]",   bg: "bg-[var(--surface-raised)] border-[var(--rule-soft)] hover:bg-[var(--surface-sunken)]", iconBg: "bg-[var(--data-error)]/10",   iconFg: "text-[var(--data-error)]" },
    warning: { bar: "before:bg-[var(--data-warning)]", bg: "bg-[var(--surface-raised)] border-[var(--rule-soft)] hover:bg-[var(--surface-sunken)]", iconBg: "bg-[var(--data-warning)]/10", iconFg: "text-[var(--data-warning)]" },
    info:    { bar: "before:bg-primary",               bg: "bg-[var(--surface-raised)] border-[var(--rule-soft)] hover:bg-[var(--surface-sunken)]", iconBg: "bg-primary/10",               iconFg: "text-primary" },
    success: { bar: "before:bg-[var(--data-success)]", bg: "bg-[var(--surface-raised)] border-[var(--rule-soft)] hover:bg-[var(--surface-sunken)]", iconBg: "bg-[var(--data-success)]/10", iconFg: "text-[var(--data-success)]" },
  };

  const tonePriority: Record<QuickAction["tone"], number> = { danger: 0, warning: 1, info: 2, success: 3 };
  const sortedActions = [...actions].sort((a, b) => tonePriority[a.tone] - tonePriority[b.tone]);

  const pctImg   = state.productsTotal > 0 ? Math.round((state.productsWithImage / state.productsTotal) * 100) : 0;
  const pctDesc  = state.productsTotal > 0 ? Math.round((state.productsWithDesc / state.productsTotal) * 100) : 0;
  const pctStock = state.productsTotal > 0 ? Math.round((state.productsWithStock / state.productsTotal) * 100) : 0;
  const pctRev   = state.reviewsTotal > 0 ? Math.round((state.reviewsReplied / state.reviewsTotal) * 100) : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
      {/* Salud de la tienda */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Target className="h-4 w-4" />
            </span>
            <div>
              <CardTitle className="font-display text-sm leading-tight">Salud de mi tienda</CardTitle>
              <p className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mt-0.5">
                puesto en el marketplace
              </p>
            </div>
          </div>
          {!state.loading && (
            <span className={cn("px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider",
              healthScore >= 80 ? "bg-[var(--accent-soft)] text-[var(--data-success)]"
              : healthScore >= 50 ? "bg-[var(--data-warning-50)] text-[var(--data-warning)]"
              : "bg-[var(--data-error-50)] text-[var(--data-error)]"
            )}>
              {healthScore >= 80 ? "Excelente" : healthScore >= 50 ? "Mejorable" : "Urgente"}
            </span>
          )}
        </div>
        <div className="flex flex-col items-center gap-3">
          {state.loading ? (
            <div className="h-[140px] w-[140px] bg-[var(--surface-sunken)] rounded-full animate-pulse" />
          ) : (
            <HealthGauge score={healthScore} />
          )}
          <p className="text-xs text-center text-[var(--text-secondary)] max-w-[220px] leading-relaxed">
            {healthScore >= 80
              ? "Tu puesto está en gran forma. Mantenlo así actualizando productos y respondiendo reseñas."
              : healthScore >= 50
              ? "Hay margen para mejorar. Cierra los huecos del breakdown para subir tu visibilidad."
              : "Hay tareas urgentes. Cumple los criterios mínimos para no perder ranking."}
          </p>
        </div>
        <div className="space-y-2.5 mt-5 pt-4 border-t border-[var(--rule-base)]">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">Desglose por factor</p>
          <HealthBreakdownBar label="Productos con foto"        pct={pctImg}   count={state.productsWithImage}  total={state.productsTotal} />
          <HealthBreakdownBar label="Productos con descripción" pct={pctDesc}  count={state.productsWithDesc}   total={state.productsTotal} />
          <HealthBreakdownBar label="Productos con stock"       pct={pctStock} count={state.productsWithStock}  total={state.productsTotal} />
          <HealthBreakdownBar label="Reseñas respondidas"       pct={pctRev}   count={state.reviewsReplied}     total={state.reviewsTotal} />
        </div>
      </div>

      {/* Qué hacer ahora */}
      <div className="lg:col-span-2 bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Zap className="h-4 w-4" />
            </span>
            <div>
              <CardTitle className="font-display text-sm leading-tight">Qué hacer ahora</CardTitle>
              <p className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mt-0.5">
                acciones priorizadas para tu puesto
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider bg-[var(--surface-sunken)] text-[var(--text-tertiary)] tabular-nums">
            {state.loading ? "Cargando…" : `${actions.length} pendiente${actions.length !== 1 ? "s" : ""}`}
          </span>
        </div>
        {state.loading ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-[var(--surface-sunken)] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : actions.length === 0 ? (
          <div className="text-center py-10">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-soft)] mb-3">
              <CheckCircle className="h-6 w-6 text-[var(--data-success)]" />
            </span>
            <p className="font-display text-base font-bold text-[var(--text-primary)]">Todo en orden</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-xs mx-auto">
              Tu puesto en el marketplace no tiene tareas urgentes. Mantén la cadencia.
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {sortedActions.map((a) => {
              const Icon = a.icon;
              const t = toneStyles[a.tone];
              return (
                <li
                  key={a.id}
                  className={cn(
                    "relative flex items-center gap-3 pl-4 pr-3 py-3 rounded-xl border transition-all",
                    "before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-full",
                    t.bar, t.bg,
                  )}
                >
                  <span className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0", t.iconBg, t.iconFg)}>
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[var(--text-primary)] leading-tight truncate">{a.label}</p>
                    <p className="text-xs text-[var(--text-tertiary)] mt-0.5 font-medium uppercase tracking-wide">
                      {a.tone === "danger" ? "Urgente" : a.tone === "warning" ? "Importante" : a.tone === "info" ? "Por revisar" : "Listo"}
                    </p>
                  </div>
                  <button
                    onClick={() => onNavigate(a.goTo)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--rule-base)] text-xs font-bold transition-all shrink-0",
                      "hover:bg-primary hover:text-white hover:border-primary hover:shadow-sm",
                      "inline-flex items-center gap-1.5 text-[var(--text-primary)]",
                    )}
                  >
                    {a.cta}
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// DashboardTab (Vendor analytics)
// ─────────────────────────────────────────────
interface AnalyticsData {
  store: { name: string; slug: string; rating: number; reviewCount: number };
  today: { orders: number; revenue: number };
  month: { orders: number; revenue: number; avgTicket: number; revenueGrowth: number };
  week: { orders: number; revenue: number };
  products: { published: number; total: number; lowStock: number };
  pendingOrders: number;
  pendingReviews: number;
  topProducts: { name: string; qty: number; revenue: number }[];
  recentOrders: { id: string; customerName: string; total: number; status: string; createdAt: string; itemsCount: number }[];
  dailySales: { date: string; revenue: number; orders: number }[];
  allChannels?: { today: { orders: number; revenue: number }; month: { orders: number; revenue: number } };
}

export default function DashboardTab() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/marketplace/analytics")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d as AnalyticsData); })
      .catch((err) => { console.warn("[MarketplaceModule] fetch failed", err); })
      .finally(() => setLoading(false));
  }, []);

  const handleQuickConfirm = useCallback(async (orderId: string) => {
    setConfirmingId(orderId);
    try {
      const res = await fetch(`/api/marketplace/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "confirmado" }),
      });
      if (res.ok && data) {
        setData({
          ...data,
          pendingOrders: Math.max(0, data.pendingOrders - 1),
          recentOrders: data.recentOrders.map((o) =>
            o.id === orderId ? { ...o, status: "confirmado" } : o
          ),
        });
      }
    } catch { /* silent */ }
    setConfirmingId(null);
  }, [data]);

  if (loading) return <TableSkeleton />;
  if (!data) return (
    <div className="text-center py-12 text-[var(--text-tertiary)]">
      <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
      <p className="text-sm">No hay datos del marketplace todavía.</p>
      <p className="text-xs mt-1">Configura tu tienda primero en la pestaña &ldquo;Mi Tienda Personal&rdquo;.</p>
    </div>
  );

  const fmtS = (n: number) => `S/${n.toFixed(2)}`;
  const maxRevenue = Math.max(...data.dailySales.map((d) => d.revenue), 1);

  return (
    <div className="space-y-5">
      {/* KPIs rápidos */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Hoy", value: fmtS(data.today.revenue), sub: `${data.today.orders} pedido(s)`, color: "text-primary" },
          { label: "Este mes", value: fmtS(data.month.revenue), sub: `${data.month.orders} pedido(s)`, color: "text-[var(--data-success)]" },
          { label: "Ticket promedio", value: fmtS(data.month.avgTicket), sub: data.month.revenueGrowth !== 0 ? `${data.month.revenueGrowth > 0 ? "+" : ""}${data.month.revenueGrowth}% vs mes anterior` : "Sin comparación", color: "text-[var(--text-secondary)]" },
          { label: "Reseñas", value: `★ ${data.store.rating.toFixed(1)}`, sub: `${data.store.reviewCount} opiniones`, color: "text-[var(--data-warning)]" },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="bg-white border border-[var(--rule-base)] rounded-xl p-3 sm:p-4">
            <p className={cn("text-xl sm:text-2xl font-extrabold", color)}>{value}</p>
            <p className="text-xs sm:text-xs text-[var(--text-secondary)] mt-0.5 leading-tight">{label}</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Resumen todos los canales */}
      {data.allChannels && (data.allChannels.today.orders > data.today.orders || data.allChannels.month.orders > data.month.orders) && (
        <div className="bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl p-4">
          <CardTitle className="text-xs font-bold text-[var(--text-primary)] mb-2 flex items-center gap-1.5">
            <Store className="h-3.5 w-3.5 text-primary" />
            Resumen total (todos los canales)
          </CardTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div><p className="text-lg font-extrabold text-primary">{fmtS(data.allChannels.today.revenue)}</p><p className="text-xs text-[var(--text-secondary)]">Hoy (total)</p></div>
            <div><p className="text-lg font-extrabold text-[var(--data-success)]">{data.allChannels.today.orders}</p><p className="text-xs text-[var(--text-secondary)]">Pedidos hoy (total)</p></div>
            <div><p className="text-lg font-extrabold text-[var(--text-secondary)]">{fmtS(data.allChannels.month.revenue)}</p><p className="text-xs text-[var(--text-secondary)]">Este mes (total)</p></div>
            <div><p className="text-lg font-extrabold text-[var(--data-warning)]">{data.allChannels.month.orders}</p><p className="text-xs text-[var(--text-secondary)]">Pedidos mes (total)</p></div>
          </div>
          <p className="text-xs text-[var(--text-tertiary)] mt-2">Incluye ventas directas, POS y marketplace.</p>
        </div>
      )}

      {/* Alertas rápidas */}
      {(data.products.lowStock > 0 || data.pendingReviews > 0) && (
        <div className="flex flex-wrap gap-2">
          {data.products.lowStock > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--data-warning-50)] text-[var(--data-warning)] text-xs font-semibold">
              <AlertCircle className="h-3.5 w-3.5" />
              {data.products.lowStock} producto(s) con stock bajo
            </div>
          )}
          {data.pendingReviews > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent-soft)] text-[var(--data-success)] text-xs font-semibold">
              <MessageSquare className="h-3.5 w-3.5" />
              {data.pendingReviews} reseña(s) por moderar
            </div>
          )}
        </div>
      )}

      {/* Acciones rápidas */}
      <div className="bg-white border border-[var(--rule-base)] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Qué hacer ahora</CardTitle>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <a href={data.store.slug ? `/marketplace/${data.store.slug}` : "/marketplace"} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5 text-left transition-all hover:shadow-sm hover:bg-primary/10">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-primary/20 text-primary">
              <ExternalLink className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--text-primary)]">Ver mi tienda</p>
              <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1">Abrir en marketplace <ArrowRight className="h-3 w-3" /></p>
            </div>
          </a>
          <a href="/marketplace" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] text-left transition-all hover:shadow-sm">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-[var(--surface-sunken)] text-[var(--text-primary)]">
              <Store className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--text-primary)]">Ir al Marketplace</p>
              <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1">Ver todas las tiendas <ArrowRight className="h-3 w-3" /></p>
            </div>
          </a>
        </div>
      </div>

      {/* Gráfico de ventas 7 días */}
      <div className="bg-white border border-[var(--rule-base)] rounded-xl p-4">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-3">Ventas últimos 7 días</CardTitle>
        <div className="flex items-end gap-1.5 h-32">
          {data.dailySales.map((day) => {
            const pct = maxRevenue > 0 ? (day.revenue / maxRevenue) * 100 : 0;
            const dayLabel = new Date(day.date + "T12:00:00").toLocaleDateString("es-PE", { weekday: "short" });
            return (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full relative" style={{ height: "96px" }}>
                  <div
                    className="absolute bottom-0 w-full rounded-t-lg bg-primary transition-all duration-[var(--dur-slow)]"
                    style={{ height: `${Math.max(pct, 4)}%` }}
                    title={`${fmtS(day.revenue)} — ${day.orders} pedido(s)`}
                  />
                </div>
                <span className="text-xs text-[var(--text-tertiary)] capitalize">{dayLabel}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Top productos */}
        <div className="bg-white border border-[var(--rule-base)] rounded-xl p-4">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-3">Top 5 productos del mes</CardTitle>
          {data.topProducts.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)] py-4 text-center">Sin ventas este mes</p>
          ) : (
            <div className="space-y-2.5">
              {data.topProducts.map((p, i) => (
                <div key={p.name} className="flex items-center gap-3">
                  <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-extrabold shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{p.name}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">{p.qty} vendido(s)</p>
                  </div>
                  <span className="text-xs font-bold text-[var(--data-success)] shrink-0">{fmtS(p.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Últimos pedidos */}
        <div className="bg-white border border-[var(--rule-base)] rounded-xl p-4">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-3">Últimos pedidos</CardTitle>
          {data.recentOrders.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)] py-4 text-center">Sin pedidos aún</p>
          ) : (
            <div className="space-y-2.5">
              {data.recentOrders.map((o) => {
                const cfg = ORDER_STATUS_CONFIG[o.status] ?? ORDER_STATUS_CONFIG.pendiente;
                return (
                  <div key={o.id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{o.customerName}</p>
                      <p className="text-xs text-[var(--text-tertiary)]">
                        {o.itemsCount} producto(s) · {new Date(o.createdAt).toLocaleDateString("es-PE", { day: "numeric", month: "short" })}
                      </p>
                    </div>
                    {o.status === "pendiente" ? (
                      <button
                        onClick={() => handleQuickConfirm(o.id)}
                        disabled={confirmingId === o.id}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary text-white text-xs font-bold hover:bg-[#009B8D] transition-colors disabled:opacity-50 shrink-0"
                      >
                        <CheckCircle className="h-3 w-3" />
                        {confirmingId === o.id ? "..." : "Confirmar"}
                      </button>
                    ) : (
                      <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", cfg.className)}>{cfg.label}</span>
                    )}
                    <span className="text-xs font-bold text-[var(--text-primary)] shrink-0">{fmtS(o.total)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Inventario rápido */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-[var(--rule-base)] rounded-xl p-3 text-center">
          <p className="text-xl font-extrabold text-primary">{data.products.published}</p>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">Publicados</p>
        </div>
        <div className="bg-white border border-[var(--rule-base)] rounded-xl p-3 text-center">
          <p className="text-xl font-extrabold text-[var(--text-secondary)]">{data.products.total}</p>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">Total productos</p>
        </div>
        <div className="bg-white border border-[var(--rule-base)] rounded-xl p-3 text-center">
          <p className={cn("text-xl font-extrabold", data.products.lowStock > 0 ? "text-[var(--data-warning)]" : "text-[var(--data-success)]")}>
            {data.products.lowStock}
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">Stock bajo</p>
        </div>
      </div>
    </div>
  );
}
