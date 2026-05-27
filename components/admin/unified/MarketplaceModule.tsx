"use client";

import { CardTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import {
  Store,
  Package,
  ShoppingCart,
  DollarSign,
  RefreshCw,
  Eye,
  EyeOff,
  CheckCircle,
  Clock,
  AlertCircle,
  XCircle,
  Save,
  X,
  TrendingUp,
  Star,
  MessageSquare,
  BarChart3,
  Ticket,
  Gift,
  ExternalLink,
  Zap,
  ArrowRight,
  Globe,
  MapPin,
  Search,
  ImageOff,
  ChevronUp,
  ChevronDown,
  Pencil,
  Check,
  Sparkles,
  TrendingDown,
  Minus,
  PackageX,
  Megaphone,
  MessageCircle,
  Download,
  MoreHorizontal,
  Trash2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import ImageUpload from "@/components/admin/ImageUpload";

// ── Hooks de datos ──
import { useMarketplaceKpis } from "@/components/admin/marketplace/hooks/use-marketplace-kpis";
import { useMarketplaceProducts, type MarketplaceProduct } from "@/components/admin/marketplace/hooks/use-marketplace-products";
import {
  useMarketplaceOrders,
  type MarketplaceOrderDetail,
  type OrderTargetStatus,
} from "@/components/admin/marketplace/hooks/use-marketplace-orders";
import { OrderDetailModal } from "@/components/admin/marketplace/OrderDetailModal";
import { useMarketplaceCommissions } from "@/components/admin/marketplace/hooks/use-marketplace-commissions";
import { useMarketplaceCoupons } from "@/components/admin/marketplace/hooks/use-marketplace-coupons";
import { useMarketplaceReviews } from "@/components/admin/marketplace/hooks/use-marketplace-reviews";
import { useMarketplaceTienda } from "@/components/admin/marketplace/hooks/use-marketplace-tienda";
import CategoryZonePicker from "@/components/admin/unified/marketplace/CategoryZonePicker";
import { MarketplaceFidelidadTab } from "@/components/admin/marketplace/tabs/FidelidadTab";
import { csrfHeaders } from "@/lib/csrf-client";

// Dynamic import del tab de precios competitivos
const CompetitivePricingTab = lazy(() => import("@/components/admin/CompetitivePricingTab"));
// Dynamic import del dashboard del marketplace (charts unificados)
const MarketplaceDashboardTab = lazy(() => import("@/components/admin/marketplace/MarketplaceDashboard"));

// ── Spinner compacto ──
const Spinner = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

// ── Loading skeleton ──
const TableSkeleton = () => (
  <div className="space-y-3 animate-pulse">
    {[1, 2, 3, 4].map((i) => (
      <div key={i} className="flex items-center gap-4">
        <div className="h-10 w-10 bg-gray-200 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-3 bg-gray-200 rounded w-1/3" />
        </div>
        <div className="h-8 w-20 bg-gray-200 rounded-lg" />
      </div>
    ))}
  </div>
);

// ── SortIcon top-level ───────────────────────────────────────────────────────
// Brandon 2026-05-17: extraído de 2 definiciones inline dentro de
// MarketplaceProductosTab (L1202) y MarketplaceOrdenesTab (L2140). La regla
// "Cannot create components during render" del lint las bloqueaba — cada
// render del parent creaba un componente nuevo, perdiendo identidad y
// causando re-mount innecesario de las flechas en cada tipeo del query.
function SortIcon({
  k,
  currentKey,
  currentDir,
}: {
  k: string;
  currentKey: string;
  currentDir: "asc" | "desc";
}) {
  if (currentKey !== k) return <ChevronDown className="h-3 w-3 opacity-30" aria-hidden />;
  return currentDir === "asc" ? (
    <ChevronUp className="h-3 w-3 text-[var(--accent)]" aria-hidden />
  ) : (
    <ChevronDown className="h-3 w-3 text-[var(--accent)]" aria-hidden />
  );
}

// ── Types (interfaces compartidas con los hooks via re-export de tipos) ──
interface StoreData {
  id?: string;
  slug: string;
  name: string;
  description: string;
  logoUrl: string;
  category: string;
  zone: string;
  commissionRate: number;
  isActive: boolean;
  vacationMode?: boolean;
  vacationMessage?: string;
}

// ── Status badge helpers ──
const ORDER_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pendiente:   { label: "Pendiente",  className: "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-500)]" },
  confirmado:  { label: "Confirmado", className: "bg-[var(--accent-soft)] text-[var(--accent)]" },
  preparando:  { label: "Preparando", className: "bg-[#a78bfa]/15 text-[#7c3aed]" },
  en_camino:   { label: "En camino",  className: "bg-[#fbbf24]/15 text-[#d97706]" },
  entregado:   { label: "Entregado",  className: "bg-[var(--data-success-500)]/15 text-[var(--data-success-500)]" },
  cancelado:   { label: "Cancelado",  className: "bg-[var(--data-error-500)]/15 text-[var(--data-error-500)]" },
};

const COMMISSION_STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  pendiente:  { label: "Pendiente",  className: "bg-[var(--data-warning-100)] text-[var(--data-warning)]",     icon: Clock },
  liquidado:  { label: "Liquidado",  className: "bg-[var(--accent-soft)] text-[var(--data-success)]",         icon: CheckCircle },
  pagado:     { label: "Pagado",     className: "bg-[var(--accent-soft)] text-[var(--data-success)]", icon: CheckCircle },
};

const REVIEW_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:  { label: "Pendiente", className: "bg-[var(--data-warning-100)] text-[var(--data-warning)]" },
  approved: { label: "Aprobada",  className: "bg-[var(--accent-soft)] text-[var(--data-success)]" },
  rejected: { label: "Rechazada", className: "bg-[var(--data-error-100)] text-[var(--data-error)]" },
};

const TIER_CONFIG: Record<string, { label: string; className: string; minPoints: string }> = {
  bronce: { label: "Bronce", className: "bg-[var(--data-warning-100)] text-[var(--data-warning)]", minPoints: "0 - 499" },
  plata:  { label: "Plata",  className: "bg-gray-100 text-[var(--text-secondary)]",   minPoints: "500 - 999" },
  oro:    { label: "Oro",    className: "bg-[var(--data-warning-100)] text-[var(--data-warning)]", minPoints: "1000+" },
};

const MODULE_ID = "marketplace";

const TABS = [
  { id: "resumen",      label: "Resumen",      icon: BarChart3 },
  { id: "tienda",       label: "Mi Tienda Personal",    icon: Store },
  { id: "productos",    label: "Productos",    icon: Package },
  { id: "ordenes",      label: "Órdenes",      icon: ShoppingCart },
  { id: "comisiones",   label: "Comisiones",   icon: DollarSign },
  { id: "precios",      label: "Precios",      icon: TrendingUp },
  { id: "cupones",      label: "Cupones",      icon: Ticket },
  { id: "resenas",      label: "Reseñas",      icon: Star },
  { id: "fidelidad",    label: "Fidelidad",    icon: Gift },
];

type TabId = string;

// CATEGORIAS y ZONAS legacy migrados a <CategoryZonePicker /> (consume catálogo
// del superadmin via /api/marketplace/categories + lib/marketplace-zones).

// ─────────────────────────────────────────────
// Admin Marketplace Overview (only visible for platform admins)
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
      .catch((err) => { void err; /* fire-and-forget */ });
  }, []);

  if (!data) return null;

  const fmtS = (n: number) => `S/${n.toFixed(2)}`;

  return (
    <div className="space-y-4 mb-6">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-primary" />
        <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Resumen del Marketplace</CardTitle>
        <span className="text-[length:var(--ts-2xs)] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">Admin</span>
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
          <div key={label} className="bg-white border border-[var(--rule-base)] rounded-xl p-3 ">
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)] mt-0.5">{label}</p>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Top tiendas + Últimos pedidos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-[var(--rule-base)] rounded-xl p-4 ">
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
                    <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{s.orders} pedido(s)</p>
                  </div>
                  <span className="text-xs font-bold text-[var(--data-success)] shrink-0">{fmtS(s.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-[var(--rule-base)] rounded-xl p-4 ">
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
                      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{o.storeName}</p>
                    </div>
                    <span className={cn("px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold", cfg.className)}>
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
// Sub-tab: Dashboard (Vendor) — Reexportado como DashboardVendorTab
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

function DashboardVendorTab() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/marketplace/analytics")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d as AnalyticsData); })
      .catch((err) => { void err; /* fire-and-forget */ })
      .finally(() => setLoading(false));
  }, []);

  const handleQuickConfirm = useCallback(async (orderId: string) => {
    setConfirmingId(orderId);
    try {
      const res = await fetch(`/api/marketplace/orders/${orderId}`, {
        method: "PATCH",
        // Brandon 2026-05-17 (audit csrf): mutating fetch debe incluir CSRF token.
        headers: csrfHeaders({ "Content-Type": "application/json" }),
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
      {/* ── Admin overview (solo visible para admins de la plataforma) ── */}
      <AdminMarketplaceOverview />

      {/* ── KPIs rápidos (Marketplace) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Hoy", value: fmtS(data.today.revenue), sub: `${data.today.orders} pedido(s)`, color: "text-primary" },
          { label: "Este mes", value: fmtS(data.month.revenue), sub: `${data.month.orders} pedido(s)`, color: "text-[var(--data-success)]" },
          { label: "Ticket promedio", value: fmtS(data.month.avgTicket), sub: data.month.revenueGrowth !== 0 ? `${data.month.revenueGrowth > 0 ? "+" : ""}${data.month.revenueGrowth}% vs mes anterior` : "Sin comparación", color: "text-[var(--text-secondary)]" },
          { label: "Reseñas", value: `★ ${data.store.rating.toFixed(1)}`, sub: `${data.store.reviewCount} opiniones`, color: "text-[var(--data-warning)]" },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="bg-white border border-[var(--rule-base)] rounded-xl p-3 sm:p-4 ">
            <p className={cn("text-xl sm:text-2xl font-extrabold", color)}>{value}</p>
            <p className="text-[length:var(--ts-2xs)] sm:text-xs text-[var(--text-secondary)] mt-0.5 leading-tight">{label}</p>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Resumen todos los canales (Marketplace + Directa + POS) ── */}
      {data.allChannels && (data.allChannels.today.orders > data.today.orders || data.allChannels.month.orders > data.month.orders) && (
        <div className="bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl p-4 ">
          <CardTitle className="text-xs font-bold text-[var(--text-primary)] mb-2 flex items-center gap-1.5">
            <Store className="h-3.5 w-3.5 text-primary" />
            Resumen total (todos los canales)
          </CardTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <p className="text-lg font-extrabold text-primary">{fmtS(data.allChannels.today.revenue)}</p>
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">Hoy (total)</p>
            </div>
            <div>
              <p className="text-lg font-extrabold text-[var(--data-success)]">{data.allChannels.today.orders}</p>
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">Pedidos hoy (total)</p>
            </div>
            <div>
              <p className="text-lg font-extrabold text-[var(--text-secondary)]">{fmtS(data.allChannels.month.revenue)}</p>
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">Este mes (total)</p>
            </div>
            <div>
              <p className="text-lg font-extrabold text-[var(--data-warning)]">{data.allChannels.month.orders}</p>
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">Pedidos mes (total)</p>
            </div>
          </div>
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-2">Incluye ventas directas, POS y marketplace.</p>
        </div>
      )}

      {/* ── Alertas rápidas ── */}
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

      {/* ── Acciones rápidas del vendedor ── */}
      <div className="bg-white border border-[var(--rule-base)] rounded-xl p-4 ">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Qué hacer ahora</CardTitle>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Pedidos pendientes */}
          <button
            onClick={() => {
              const tabBar = document.querySelector('[data-module-id="marketplace"]');
              if (tabBar) {
                const ordenesBtn = tabBar.querySelector('button[data-tab-id="ordenes"]') as HTMLButtonElement;
                if (ordenesBtn) ordenesBtn.click();
              }
            }}
            className={cn(
              "flex items-center gap-3 p-3 rounded-xl border text-left transition-all hover:shadow-sm",
              (data.pendingOrders ?? 0) > 0
                ? "border-[var(--data-warning)] bg-[var(--data-warning-50)] hover:bg-[var(--data-warning-100)]"
                : "border-[var(--rule-base)] bg-gray-50 hover:bg-gray-100"
            )}
          >
            <div className={cn(
              "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
              (data.pendingOrders ?? 0) > 0 ? "bg-[var(--data-warning)] text-[var(--data-warning)]" : "bg-gray-200 text-[var(--text-secondary)]"
            )}>
              <ShoppingCart className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--text-primary)]">
                {(data.pendingOrders ?? 0) > 0
                  ? `${data.pendingOrders} pedido(s) por confirmar`
                  : "Sin pedidos pendientes"}
              </p>
              <p className="text-xs text-[var(--text-secondary)]">Ver órdenes</p>
            </div>
            <ArrowRight className="h-4 w-4 text-[var(--text-tertiary)] ml-auto shrink-0" />
          </button>

          {/* Stock bajo */}
          <button
            onClick={() => {
              const tabBar = document.querySelector('[data-module-id="marketplace"]');
              if (tabBar) {
                const prodBtn = tabBar.querySelector('button[data-tab-id="productos"]') as HTMLButtonElement;
                if (prodBtn) prodBtn.click();
              }
            }}
            className={cn(
              "flex items-center gap-3 p-3 rounded-xl border text-left transition-all hover:shadow-sm",
              data.products.lowStock > 0
                ? "border-[var(--data-error)] bg-[var(--data-error-50)] hover:bg-[var(--data-error-100)]"
                : "border-[var(--rule-base)] bg-gray-50 hover:bg-gray-100"
            )}
          >
            <div className={cn(
              "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
              data.products.lowStock > 0 ? "bg-[var(--data-error-100)] text-[var(--data-error)]" : "bg-gray-200 text-[var(--text-secondary)]"
            )}>
              <Package className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--text-primary)]">
                {data.products.lowStock > 0
                  ? `${data.products.lowStock} prod. con stock bajo`
                  : "Stock OK"}
              </p>
              <p className="text-xs text-[var(--text-secondary)]">{data.products.published}/{data.products.total} publicados</p>
            </div>
            <ArrowRight className="h-4 w-4 text-[var(--text-tertiary)] ml-auto shrink-0" />
          </button>

          {/* Reseñas pendientes */}
          <button
            onClick={() => {
              const tabBar = document.querySelector('[data-module-id="marketplace"]');
              if (tabBar) {
                const resenasBtn = tabBar.querySelector('button[data-tab-id="resenas"]') as HTMLButtonElement;
                if (resenasBtn) resenasBtn.click();
              }
            }}
            className={cn(
              "flex items-center gap-3 p-3 rounded-xl border text-left transition-all hover:shadow-sm",
              data.pendingReviews > 0
                ? "border-primary/30 bg-primary/5 hover:bg-primary/10"
                : "border-[var(--rule-base)] bg-gray-50 hover:bg-gray-100"
            )}
          >
            <div className={cn(
              "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
              data.pendingReviews > 0 ? "bg-primary/10 text-primary" : "bg-gray-200 text-[var(--text-secondary)]"
            )}>
              <Star className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--text-primary)]">
                {data.pendingReviews > 0 ? `${data.pendingReviews} reseña(s) por moderar` : "Reseñas al día"}
              </p>
              <p className="text-xs text-[var(--text-secondary)]">★ {data.store.rating.toFixed(1)} promedio</p>
            </div>
            <ArrowRight className="h-4 w-4 text-[var(--text-tertiary)] ml-auto shrink-0" />
          </button>
        </div>
      </div>

      {/* ── Pedidos recientes con confirmación rápida ── */}
      {data.recentOrders.filter((o) => o.status === "pendiente").length > 0 && (
        <div className="bg-white border border-[var(--rule-base)] rounded-xl p-4 ">
          <div className="flex items-center gap-2 mb-3">
            <ShoppingCart className="h-4 w-4 text-[var(--data-warning)]" />
            <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Confirmar pedidos pendientes</CardTitle>
          </div>
          <div className="space-y-2">
            {data.recentOrders.filter((o) => o.status === "pendiente").map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-[var(--data-warning-50)] border border-[var(--data-warning)]/30">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{o.customerName}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{o.itemsCount} producto(s) · S/{o.total.toFixed(2)}</p>
                </div>
                <button
                  onClick={() => handleQuickConfirm(o.id)}
                  disabled={confirmingId === o.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--data-success)] text-white text-xs font-bold hover:opacity-90 transition disabled:opacity-60 shrink-0"
                >
                  {confirmingId === o.id ? (
                    <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <CheckCircle className="h-3.5 w-3.5" />
                  )}
                  Confirmar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Gráfico de ventas diarias ── */}
      {data.dailySales.length > 0 && (
        <div className="bg-white border border-[var(--rule-base)] rounded-xl p-4 ">
          <div className="flex items-center justify-between mb-4">
            <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Ventas diarias (últimos días)</CardTitle>
            <span className="text-xs text-[var(--text-tertiary)]">{data.dailySales.length} días</span>
          </div>
          <div className="flex items-end gap-1.5 h-28">
            {data.dailySales.map((d) => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group">
                <div
                  className="w-full bg-primary/20 group-hover:bg-primary/40 rounded-t transition-colors relative"
                  style={{ height: `${Math.round((d.revenue / maxRevenue) * 100)}%`, minHeight: d.revenue > 0 ? "4px" : "0" }}
                >
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap bg-[var(--text-primary)] text-white text-[length:var(--ts-2xs)] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    S/{d.revenue.toFixed(0)}
                  </div>
                </div>
                <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] rotate-45 origin-left truncate max-w-6">
                  {new Date(d.date).toLocaleDateString("es-PE", { day: "numeric", month: "short" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Top productos ── */}
      {data.topProducts.length > 0 && (
        <div className="bg-white border border-[var(--rule-base)] rounded-xl p-4 ">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Top productos del mes</CardTitle>
          </div>
          <div className="space-y-2">
            {data.topProducts.map((p, i) => (
              <div key={p.name} className="flex items-center gap-3">
                <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-extrabold shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{p.name}</p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{p.qty} unidades</p>
                </div>
                <span className="text-xs font-bold text-[var(--data-success)] shrink-0">S/{p.revenue.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Ver tienda en marketplace ── */}
      {data.store.slug && (
        <a
          href={`/marketplace/${data.store.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between p-3 rounded-xl border border-[var(--rule-base)] bg-gray-50 hover:bg-gray-100 transition-colors group"
        >
          <div className="flex items-center gap-2">
            <ExternalLink className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-[var(--text-primary)]">Ver mi tienda en el marketplace</span>
          </div>
          <ArrowRight className="h-4 w-4 text-[var(--text-tertiary)] group-hover:translate-x-1 transition-transform" />
        </a>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-tab: Mi Tienda Personal
// ─────────────────────────────────────────────
function MarketplaceTiendaTab() {
  const { store, setStore, loading, saving, error, saved, handleSave } = useMarketplaceTienda();

  if (loading) return <Spinner />;

  // Iniciales para el avatar fallback (cuando no hay logo)
  const initials = (store.name || store.slug || "BS")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "BS";

  const statusBadge = !store.isActive
    ? { label: "Borrador", className: "bg-[var(--surface-sunken)] text-[var(--text-secondary)] border-2 border-[var(--rule-base)]" }
    : store.vacationMode
    ? { label: "Vacaciones", className: "bg-[var(--data-warning-50)] text-[var(--data-warning)] border-2 border-[var(--data-warning)]/40" }
    : { label: "Publicada", className: "bg-[var(--data-success-50)] text-[var(--data-success)] border-2 border-[var(--data-success)]/40" };

  return (
    <div className="space-y-6 pb-24">
      {error && (
        <div className="flex items-center gap-3 p-4 bg-[var(--data-error-50)] border-2 border-[var(--data-error)] rounded-2xl text-base font-medium text-[var(--data-error)]">
          <AlertCircle className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      {/* ── HERO BANNER ───────────────────────────────── */}
      <header className="relative overflow-hidden rounded-3xl border-2 border-[var(--rule-base)] bg-linear-to-br from-primary/8 via-[var(--surface-canvas)] to-[var(--accent-soft)]/30 px-6 py-7 sm:px-8 sm:py-8">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-[var(--accent)]/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row items-start md:items-center gap-6">
          {/* Logo grande */}
          <div className="relative shrink-0">
            <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-3xl overflow-hidden border-4 border-[var(--surface-canvas)] shadow-xl bg-[var(--surface-raised)] flex items-center justify-center">
              {store.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={store.logoUrl} alt={store.name || store.slug} className="h-full w-full object-cover" />
              ) : (
                <span className="text-3xl font-extrabold text-primary">{initials}</span>
              )}
            </div>
          </div>

          {/* Identidad */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <span className={cn("inline-flex items-center h-7 px-3 rounded-full text-xs font-extrabold uppercase tracking-wider", statusBadge.className)}>
                {statusBadge.label}
              </span>
              {store.slug && (
                <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-tertiary)]">
                  <Globe className="h-3.5 w-3.5" />
                  <span className="font-mono">/marketplace/{store.slug}</span>
                </span>
              )}
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight truncate">
              {store.name || "Tu tienda en el marketplace"}
            </h2>
            <p className="mt-2 text-base text-[var(--text-secondary)] line-clamp-2 max-w-2xl leading-relaxed">
              {store.description || "Sin descripción todavía. Cuéntale a los clientes qué te hace especial."}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[var(--surface-canvas)] border border-[var(--rule-base)] text-sm font-bold text-[var(--text-primary)]">
                <Store className="h-4 w-4 text-primary" />
                {store.category || "Sin categoría"}
              </span>
              <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[var(--surface-canvas)] border border-[var(--rule-base)] text-sm font-bold text-[var(--text-primary)]">
                <MapPin className="h-4 w-4 text-[var(--accent)]" />
                {(store.coverageZones?.length ?? 0) > 0
                  ? `${store.coverageZones!.length} zona${store.coverageZones!.length === 1 ? "" : "s"}`
                  : store.zone || "Sin zonas"}
              </span>
              <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[var(--surface-canvas)] border border-[var(--rule-base)] text-sm font-bold text-[var(--text-primary)]">
                <DollarSign className="h-4 w-4 text-[var(--data-success)]" />
                {store.commissionRate}% comisión
              </span>
            </div>
          </div>

          {/* CTAs */}
          {store.slug && (
            <a
              href={`/marketplace/${store.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 inline-flex items-center gap-2 h-12 px-5 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-base font-extrabold text-[var(--text-primary)] hover:border-primary hover:text-primary hover:shadow-md transition-all"
            >
              <Eye className="h-5 w-5" />
              Ver pública
              <ExternalLink className="h-4 w-4 opacity-60" />
            </a>
          )}
        </div>
      </header>

      {/* ── LAYOUT 2-COLUMNAS ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ── COLUMNA PRINCIPAL ────────────────────────── */}
        <div className="lg:col-span-8 space-y-6">
          {/* Identidad */}
          <section className="bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] rounded-2xl overflow-hidden">
            <header className="flex items-start gap-3 px-6 pt-5 pb-4 border-b-2 border-[var(--rule-base)]">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary shrink-0">
                <Store className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-[var(--text-primary)]">Identidad</h3>
                <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
                  Cómo te encuentran los clientes en el marketplace.
                </p>
              </div>
            </header>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2 sm:col-span-1">
                <label className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
                  <Globe className="h-4 w-4" /> URL pública
                </label>
                <div className="flex items-stretch h-12 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary transition-all overflow-hidden">
                  <span className="inline-flex items-center px-4 text-sm font-extrabold text-[var(--text-tertiary)] bg-[var(--surface-sunken)] border-r-2 border-[var(--rule-base)] whitespace-nowrap">/marketplace/</span>
                  <input
                    type="text"
                    value={store.slug}
                    onChange={(e) => setStore((p) => ({ ...p, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") }))}
                    placeholder="mi-bodega"
                    className="flex-1 min-w-0 px-4 bg-transparent text-base font-semibold text-[var(--text-primary)] outline-none"
                  />
                </div>
                <p className="text-sm text-[var(--text-tertiary)] leading-relaxed">
                  Solo minúsculas y guiones. Evita cambiarla — los links viejos dejan de funcionar.
                </p>
              </div>
              <div className="space-y-2 sm:col-span-1">
                <label className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  Nombre visible <span className="text-[var(--data-error)]">*</span>
                </label>
                <input
                  type="text"
                  value={store.name}
                  onChange={(e) => setStore((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Bodega San Martín"
                  maxLength={60}
                  className="w-full h-12 px-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-semibold text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
                <p className="text-sm text-[var(--text-tertiary)]">
                  <span className="font-bold tabular-nums">{store.name.length}</span>/60 caracteres
                </p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">Descripción</label>
                  <span className="text-sm text-[var(--text-tertiary)] tabular-nums">
                    <span className="font-bold">{(store.description ?? "").length}</span>/240
                  </span>
                </div>
                <textarea
                  rows={3}
                  maxLength={240}
                  value={store.description}
                  onChange={(e) => setStore((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Describe tu tienda: horarios, especialidades, qué te hace única…"
                  className="w-full px-4 py-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-medium text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none transition-all leading-relaxed"
                />
              </div>
            </div>
          </section>

          {/* Categoría + subcategoría + zonas de cobertura */}
          <CategoryZonePicker
            value={{
              category: store.category ?? "",
              subcategory: store.subcategory ?? null,
              coverageZones: store.coverageZones ?? [],
              customCategories: store.customCategories ?? [],
            }}
            onChange={(next) =>
              setStore((p) => ({
                ...p,
                category: next.category,
                subcategory: next.subcategory,
                coverageZones: next.coverageZones,
                customCategories: next.customCategories,
                // Mantiene `zone` legacy en sync con el 1er coverageZone marcado.
                zone: next.coverageZones[0] ?? p.zone,
              }))
            }
          />

          {/* Comisión */}
          <section className="bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] rounded-2xl overflow-hidden">
            <header className="flex items-start gap-3 px-6 pt-5 pb-4 border-b-2 border-[var(--rule-base)]">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--data-success)]/10 text-[var(--data-success)] shrink-0">
                <DollarSign className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-[var(--text-primary)]">Comisión Buleje</h3>
                <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
                  Lo que Buleje cobra por cada venta. La fija la plataforma — para revisarla, contáctanos por WhatsApp.
                </p>
              </div>
            </header>
            <div className="p-6">
              <div className="flex items-center justify-between gap-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-6 py-5">
                <span className="text-4xl font-extrabold tabular-nums text-[var(--text-primary)]">
                  {store.commissionRate}%
                </span>
                <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Solo lectura
                </span>
              </div>
            </div>
          </section>

          {/* Marca visual: logo + URL backup */}
          <section className="bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] rounded-2xl overflow-hidden">
            <header className="flex items-start gap-3 px-6 pt-5 pb-4 border-b-2 border-[var(--rule-base)]">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)] shrink-0">
                <Star className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-[var(--text-primary)]">Imagen de la tienda</h3>
                <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
                  Logo cuadrado 200×200 — aparece en la tarjeta de tu tienda en /tiendas y en cada pedido.
                </p>
              </div>
            </header>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-6 items-start">
              <ImageUpload
                value={store.logoUrl}
                onChange={(url) => setStore((p) => ({ ...p, logoUrl: url }))}
                onClear={() => setStore((p) => ({ ...p, logoUrl: "" }))}
                folder="marketplace-logos"
                label=""
                hint=""
                aspectRatio="square"
              />
              <div className="space-y-3">
                <label className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  …o pega una URL de imagen
                </label>
                <input
                  type="url"
                  value={store.logoUrl}
                  onChange={(e) => setStore((p) => ({ ...p, logoUrl: e.target.value }))}
                  placeholder="https://…"
                  className="w-full h-12 px-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-medium text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
                {store.logoUrl ? (
                  <div className="flex items-center gap-2 text-sm font-bold text-[var(--data-success)]">
                    <CheckCircle className="h-4 w-4" /> Logo configurado
                  </div>
                ) : (
                  <div className="flex items-start gap-2 text-sm text-[var(--text-secondary)] leading-relaxed">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
                    Sin logo, usaremos las iniciales de tu tienda como avatar.
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* ── ASIDE (sticky) ────────────────────────────── */}
        <aside className="lg:col-span-4 space-y-6 lg:sticky lg:top-4 self-start">
          {/* Vista previa */}
          <section className="bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] rounded-2xl overflow-hidden">
            <header className="flex items-start gap-3 px-6 pt-5 pb-4 border-b-2 border-[var(--rule-base)]">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary shrink-0">
                <Eye className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-[var(--text-primary)]">Vista previa</h3>
                <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
                  Cómo te ven los clientes en el listado.
                </p>
              </div>
            </header>
            <div className="p-5">
              <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] overflow-hidden">
                <div className="relative h-24 bg-linear-to-br from-primary/15 via-[var(--surface-raised)] to-[var(--accent-soft)]/40">
                  {(store.coverageZones?.length ?? 0) > 0 && (
                    <span className="absolute top-3 left-3 inline-flex items-center gap-1 h-7 px-3 rounded-full bg-[var(--surface-canvas)]/95 backdrop-blur text-xs font-extrabold text-[var(--text-primary)] shadow-sm">
                      <MapPin className="h-3.5 w-3.5 text-[var(--accent)]" />
                      {store.coverageZones![0]}
                    </span>
                  )}
                </div>
                <div className="px-5 pb-5 -mt-9">
                  <div className="h-16 w-16 rounded-2xl border-4 border-[var(--surface-canvas)] bg-[var(--surface-raised)] shadow-md overflow-hidden flex items-center justify-center">
                    {store.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={store.logoUrl} alt={store.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xl font-extrabold text-primary">{initials}</span>
                    )}
                  </div>
                  <h4 className="mt-3 text-base font-extrabold text-[var(--text-primary)] truncate">
                    {store.name || "Tu tienda"}
                  </h4>
                  <p className="mt-1 text-sm text-[var(--text-secondary)] line-clamp-2 min-h-[2.6em] leading-relaxed">
                    {store.description || "Agrega una descripción atractiva para que los clientes te conozcan."}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {store.category && (
                      <span className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full bg-[var(--surface-sunken)] text-xs font-extrabold text-[var(--text-primary)]">
                        <Store className="h-3 w-3" /> {store.category}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full bg-[var(--surface-sunken)] text-xs font-extrabold text-[var(--text-primary)]">
                      <DollarSign className="h-3 w-3" /> {store.commissionRate}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Estado de la tienda */}
          <section className="bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] rounded-2xl overflow-hidden">
            <header className="flex items-start gap-3 px-6 pt-5 pb-4 border-b-2 border-[var(--rule-base)]">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--data-warning)]/10 text-[var(--data-warning)] shrink-0">
                <Zap className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-[var(--text-primary)]">Estado</h3>
                <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
                  Controla la visibilidad de tu tienda.
                </p>
              </div>
            </header>
            <div className="p-4">
              <ToggleRow
                active={store.isActive}
                onToggle={() => setStore((p) => ({ ...p, isActive: !p.isActive }))}
                title="Publicada en marketplace"
                desc={store.isActive ? "Visible y aceptando pedidos." : "Borrador — solo tú la ves."}
                tone="primary"
                icon={store.isActive ? CheckCircle : EyeOff}
              />
              <div className="border-t-2 border-[var(--rule-base)] my-1" />
              <ToggleRow
                active={!!store.vacationMode}
                onToggle={() => setStore((p) => ({ ...p, vacationMode: !p.vacationMode }))}
                title="Modo vacaciones"
                desc="Pausa pedidos sin despublicar."
                tone="warning"
                icon={Clock}
              />
              {store.vacationMode && (
                <div className="mt-3 px-2 space-y-2">
                  <label className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                    Mensaje a clientes
                  </label>
                  <input
                    type="text"
                    value={store.vacationMessage ?? ""}
                    onChange={(e) => setStore((p) => ({ ...p, vacationMessage: e.target.value }))}
                    placeholder="Ej: Volvemos el lunes 15"
                    maxLength={140}
                    className="w-full h-12 px-4 rounded-2xl border-2 border-[var(--data-warning)]/50 bg-[var(--data-warning-50)] text-base font-medium text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--data-warning)]/30 transition-all"
                  />
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>

      {/* ── STICKY SAVE BAR ─────────────────────────────── */}
      <div className="sticky bottom-4 z-20 flex items-center justify-between gap-4 px-5 py-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]/95 backdrop-blur shadow-xl">
        <p className="text-sm text-[var(--text-tertiary)] hidden sm:block font-medium">
          Los cambios se aplican al instante en tu tienda pública.
        </p>
        <div className="flex items-center gap-3 ml-auto">
          {saved && (
            <span className="inline-flex items-center gap-2 text-base font-bold text-[var(--data-success)]">
              <CheckCircle className="h-5 w-5" /> Guardado
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-primary text-white text-base font-extrabold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
          >
            {saving ? (
              <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="h-5 w-5" />
            )}
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ToggleRow — fila de toggle reutilizable para el aside "Estado"
// ─────────────────────────────────────────────
function ToggleRow({
  active,
  onToggle,
  title,
  desc,
  tone = "primary",
  icon: Icon,
}: {
  active: boolean;
  onToggle: () => void;
  title: string;
  desc: string;
  tone?: "primary" | "warning";
  icon?: React.ElementType;
}) {
  const onColor = tone === "warning" ? "bg-[var(--data-warning)]" : "bg-primary";
  const iconBg = active
    ? tone === "warning"
      ? "bg-[var(--data-warning)]/15 text-[var(--data-warning)]"
      : "bg-primary/15 text-primary"
    : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]";
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-3 px-2 py-3 rounded-xl hover:bg-[var(--surface-sunken)] transition-colors text-left"
      aria-pressed={active}
    >
      <div className="flex items-start gap-3 min-w-0">
        {Icon && (
          <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl shrink-0 transition-colors", iconBg)}>
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-base font-extrabold text-[var(--text-primary)]">{title}</p>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5 leading-relaxed">{desc}</p>
        </div>
      </div>
      <span
        className={cn(
          "relative inline-flex h-7 w-12 items-center rounded-full transition-colors shrink-0",
          active ? onColor : "bg-[var(--rule-strong)]",
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform",
            active ? "translate-x-6" : "translate-x-1",
          )}
        />
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────
// Sub-tab: Productos
// ─────────────────────────────────────────────
type SortKey = "name" | "retailPrice" | "wholesalePrice" | "stock";

function MarketplaceProductosTab() {
  const {
    products, loading, error, toggling, syncing, syncResult, bulkBusy, pricingId,
    load, handleSync, toggleActive, bulkSetActive, updatePrice, createBoost, stopBoost,
  } = useMarketplaceProducts();
  const { store } = useMarketplaceTienda();
  const storeSlug = store.slug;
  const storeId = store.id ?? "";

  // Brandon mayo 2026 v7 — Nivel A + B:
  // A: búsqueda, filtros estado/stock, KPI strip, imagen, sticky header, link público.
  // B: selección múltiple + bulk publish/despublicar, sort por columna, filtro
  //    por categoría, editar precio retail/mayorista inline.
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "publicados" | "inactivos">("todos");
  const [stockFilter, setStockFilter] = useState<"todos" | "ok" | "critico" | "sin-stock">("todos");
  const [categoryFilter, setCategoryFilter] = useState<string>("todos");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingPrice, setEditingPrice] = useState<{ id: string; field: "retailPrice" | "wholesalePrice"; value: string } | null>(null);
  // Brandon mayo 2026 v7 (Nivel C): modal para destacar producto en marketplace.
  const [boostingProduct, setBoostingProduct] = useState<MarketplaceProduct | null>(null);

  if (loading) return <TableSkeleton />;

  const counters = {
    publicados: products.filter((p) => p.isActive).length,
    inactivos: products.filter((p) => !p.isActive).length,
    sinStock: products.filter((p) => p.stock <= 0).length,
    stockCritico: products.filter((p) => p.stock > 0 && p.stock <= 5).length,
  };

  // Lista única de categorías presentes en el catálogo — para el filtro.
  const availableCategories = Array.from(
    new Set(products.map((p) => p.category).filter((c): c is string => !!c)),
  ).sort();

  const filteredUnsorted = products.filter((p) => {
    if (statusFilter === "publicados" && !p.isActive) return false;
    if (statusFilter === "inactivos" && p.isActive) return false;
    if (stockFilter === "ok" && p.stock <= 5) return false;
    if (stockFilter === "critico" && (p.stock <= 0 || p.stock > 5)) return false;
    if (stockFilter === "sin-stock" && p.stock > 0) return false;
    if (categoryFilter !== "todos" && p.category !== categoryFilter) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      const hit =
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.category?.toLowerCase().includes(q) ?? false);
      if (!hit) return false;
    }
    return true;
  });

  // Sort por columna activa.
  const filtered = [...filteredUnsorted].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === "string" && typeof bv === "string") {
      return av.localeCompare(bv) * dir;
    }
    if (typeof av === "number" && typeof bv === "number") {
      return (av - bv) * dir;
    }
    return 0;
  });

  const allFilteredIds = filtered.map((p) => p.id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedIds.has(id));
  const someSelected = allFilteredIds.some((id) => selectedIds.has(id));
  const selectedCount = selectedIds.size;

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        allFilteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        allFilteredIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }

  function clickHeader(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  async function handleBulk(isActive: boolean) {
    const ids = Array.from(selectedIds);
    const result = await bulkSetActive(ids, isActive);
    if (result.ok) {
      setSelectedIds(new Set());
    }
  }

  function startEditPrice(id: string, field: "retailPrice" | "wholesalePrice", current: number) {
    setEditingPrice({ id, field, value: current.toFixed(2) });
  }

  async function commitEditPrice() {
    if (!editingPrice) return;
    const num = Number(editingPrice.value);
    if (!Number.isFinite(num) || num < 0) {
      setEditingPrice(null);
      return;
    }
    const result = await updatePrice(editingPrice.id, { [editingPrice.field]: num });
    if (result.ok) setEditingPrice(null);
  }

  return (
    <div className="space-y-4">
      {/* ── KPI strip — pulso del marketplace al primer vistazo ─────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <CounterChip
          label="Publicados"
          value={counters.publicados}
          tone="success"
          onClick={() => {
            setStatusFilter(statusFilter === "publicados" ? "todos" : "publicados");
            setStockFilter("todos");
          }}
          active={statusFilter === "publicados"}
        />
        <CounterChip
          label="Inactivos"
          value={counters.inactivos}
          tone="neutral"
          onClick={() => {
            setStatusFilter(statusFilter === "inactivos" ? "todos" : "inactivos");
            setStockFilter("todos");
          }}
          active={statusFilter === "inactivos"}
        />
        <CounterChip
          label="Stock crítico"
          value={counters.stockCritico}
          tone="warning"
          onClick={() => {
            setStockFilter(stockFilter === "critico" ? "todos" : "critico");
            setStatusFilter("todos");
          }}
          active={stockFilter === "critico"}
        />
        <CounterChip
          label="Sin stock"
          value={counters.sinStock}
          tone="danger"
          onClick={() => {
            setStockFilter(stockFilter === "sin-stock" ? "todos" : "sin-stock");
            setStatusFilter("todos");
          }}
          active={stockFilter === "sin-stock"}
        />
      </div>

      {/* ── Toolbar: search + categoria + sync ─────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, SKU o categoría…"
            className="w-full h-10 pl-10 pr-9 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full flex items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {availableCategories.length > 0 && (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-10 px-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-extrabold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors capitalize"
            aria-label="Filtrar por categoría"
          >
            <option value="todos">Todas las categorías</option>
            {availableCategories.map((c) => (
              <option key={c} value={c} className="capitalize">{c}</option>
            ))}
          </select>
        )}
        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-[var(--accent)] text-white text-sm font-extrabold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} aria-hidden />
          {syncing ? "Sincronizando…" : "Sincronizar inventario"}
        </button>
      </div>

      {/* ── Bulk action bar — aparece cuando hay selección ─────────── */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap p-3 rounded-xl border-2 border-[var(--accent)]/40 bg-[var(--accent-soft)]">
          <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--accent)]">
            <Check className="h-4 w-4" strokeWidth={3} />
            {selectedCount} seleccionado{selectedCount !== 1 ? "s" : ""}
          </span>
          <span className="text-xs text-[var(--text-secondary)] hidden sm:inline">
            Aplicá la acción a todos a la vez:
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleBulk(true)}
              disabled={bulkBusy}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[var(--data-success-500)]/15 text-[var(--data-success-500)] hover:bg-[var(--data-success-500)]/25 text-xs font-extrabold disabled:opacity-50"
            >
              <Eye className="h-3.5 w-3.5" />
              Publicar {selectedCount}
            </button>
            <button
              type="button"
              onClick={() => handleBulk(false)}
              disabled={bulkBusy}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] text-xs font-extrabold disabled:opacity-50"
            >
              <EyeOff className="h-3.5 w-3.5" />
              Despublicar
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="inline-flex items-center h-9 px-2 rounded-lg text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {syncResult && (
        <div className="flex items-center gap-2 p-3 bg-[var(--data-success-500)]/10 border border-[var(--data-success-500)]/30 rounded-xl text-sm font-bold text-[var(--data-success-500)]">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {syncResult}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-[var(--data-error-500)]/10 border border-[var(--data-error-500)]/30 rounded-xl text-sm font-bold text-[var(--data-error-500)]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={load} className="ml-auto text-xs underline">Reintentar</button>
        </div>
      )}

      {products.length === 0 && !error ? (
        <div className="text-center py-16 text-[var(--text-tertiary)] rounded-xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold">Sin productos publicados</p>
          <p className="text-xs mt-1">Activa productos desde tu catálogo para mostrarlos en el marketplace.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-tertiary)] rounded-xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm font-semibold">Sin resultados con esos filtros</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setStatusFilter("todos");
              setStockFilter("todos");
            }}
            className="mt-2 text-xs font-bold text-[var(--accent)] hover:underline"
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl overflow-hidden">
          <div className="overflow-x-auto max-h-[calc(100vh-22rem)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-sunken)] sticky top-0 z-10 border-b border-[var(--rule-base)]">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = !allSelected && someSelected;
                      }}
                      onChange={toggleSelectAll}
                      aria-label="Seleccionar todos los productos visibles"
                      className="h-4 w-4 rounded border-2 border-[var(--rule-base)] accent-[var(--accent)] cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-3 py-3 text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                    <button
                      type="button"
                      onClick={() => clickHeader("name")}
                      className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors"
                    >
                      Producto <SortIcon k="name" currentKey={sortKey} currentDir={sortDir} />
                    </button>
                  </th>
                  <th className="text-right px-3 py-3 text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                    <button
                      type="button"
                      onClick={() => clickHeader("retailPrice")}
                      className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors ml-auto"
                    >
                      Precio retail <SortIcon k="retailPrice" currentKey={sortKey} currentDir={sortDir} />
                    </button>
                  </th>
                  <th className="text-right px-3 py-3 text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] hidden md:table-cell">
                    <button
                      type="button"
                      onClick={() => clickHeader("wholesalePrice")}
                      className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors ml-auto"
                    >
                      Mayorista <SortIcon k="wholesalePrice" currentKey={sortKey} currentDir={sortDir} />
                    </button>
                  </th>
                  <th className="text-right px-3 py-3 text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                    <button
                      type="button"
                      onClick={() => clickHeader("stock")}
                      className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors ml-auto"
                    >
                      Stock <SortIcon k="stock" currentKey={sortKey} currentDir={sortDir} />
                    </button>
                  </th>
                  <th className="text-center px-3 py-3 text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">Estado</th>
                  <th className="text-center px-3 py-3 text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] hidden lg:table-cell">Destacar</th>
                  <th className="px-3 py-3 w-12" aria-label="Acciones" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
                {filtered.map((p) => {
                  const stockTone = p.stock <= 0
                    ? "danger"
                    : p.stock <= 5
                      ? "warning"
                      : "success";
                  const isSel = selectedIds.has(p.id);
                  return (
                    <tr key={p.id} className={cn(
                      "transition-colors",
                      isSel ? "bg-[var(--accent-soft)]/50" : "hover:bg-[var(--surface-sunken)]/50",
                    )}>
                      <td className="w-10 px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggleSelect(p.id)}
                          aria-label={`Seleccionar ${p.name}`}
                          className="h-4 w-4 rounded border-2 border-[var(--rule-base)] accent-[var(--accent)] cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative h-10 w-10 shrink-0 rounded-lg overflow-hidden bg-[var(--surface-sunken)]">
                            {p.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={p.image}
                                alt={p.name}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center text-[var(--text-tertiary)]">
                                <ImageOff className="h-4 w-4 opacity-50" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-[var(--text-primary)] truncate">{p.name}</p>
                            <p className="text-[10px] text-[var(--text-tertiary)] font-mono truncate">
                              {p.sku || "—"}
                              {p.category && <span className="ml-2 text-[var(--text-secondary)] font-sans capitalize">· {p.category}</span>}
                            </p>
                          </div>
                        </div>
                      </td>
                      {/* Retail price — editable inline + chip competencia */}
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <PriceCell
                            value={p.retailPrice}
                            isEditing={editingPrice?.id === p.id && editingPrice.field === "retailPrice"}
                            editValue={editingPrice?.id === p.id && editingPrice.field === "retailPrice" ? editingPrice.value : ""}
                            busy={pricingId === p.id}
                            onStartEdit={() => startEditPrice(p.id, "retailPrice", p.retailPrice)}
                            onChange={(v) => setEditingPrice((prev) => prev ? { ...prev, value: v } : prev)}
                            onCommit={commitEditPrice}
                            onCancel={() => setEditingPrice(null)}
                            alwaysBold
                          />
                          <CompetitionChip
                            myPrice={p.retailPrice}
                            avg={p.competitionAvgPrice ?? null}
                            count={p.competitionStoreCount ?? 0}
                          />
                        </div>
                      </td>
                      {/* Mayorista — editable inline */}
                      <td className="px-3 py-2.5 text-right hidden md:table-cell">
                        <PriceCell
                          value={p.wholesalePrice}
                          isEditing={editingPrice?.id === p.id && editingPrice.field === "wholesalePrice"}
                          editValue={editingPrice?.id === p.id && editingPrice.field === "wholesalePrice" ? editingPrice.value : ""}
                          busy={pricingId === p.id}
                          onStartEdit={() => startEditPrice(p.id, "wholesalePrice", p.wholesalePrice)}
                          onChange={(v) => setEditingPrice((prev) => prev ? { ...prev, value: v } : prev)}
                          onCommit={commitEditPrice}
                          onCancel={() => setEditingPrice(null)}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={cn(
                          "inline-flex items-center justify-center min-w-[42px] h-7 px-2 rounded-full text-xs font-extrabold tabular-nums",
                          stockTone === "success" && "bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]",
                          stockTone === "warning" && "bg-[var(--data-warning-500)]/10 text-[var(--data-warning-500)]",
                          stockTone === "danger" && "bg-[var(--data-error-500)]/10 text-[var(--data-error-500)]",
                        )}>
                          {p.stock}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="inline-flex flex-col items-center gap-1">
                          <button
                            onClick={() => toggleActive(p)}
                            disabled={toggling === p.id}
                            aria-pressed={p.isActive}
                            title={p.isActive ? "Despublicar del marketplace" : "Publicar en marketplace"}
                            className={cn(
                              "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-extrabold transition-colors min-w-[110px] justify-center",
                              p.isActive
                                ? "bg-[var(--data-success-500)]/10 text-[var(--data-success-500)] hover:bg-[var(--data-success-500)]/20"
                                : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--rule-base)]",
                            )}
                          >
                            {toggling === p.id ? (
                              <div className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : p.isActive ? (
                              <><Eye className="h-3.5 w-3.5" /> Publicado</>
                            ) : (
                              <><EyeOff className="h-3.5 w-3.5" /> Inactivo</>
                            )}
                          </button>
                          {p.stock <= 0 && p.isActive && (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-[var(--data-error-500)]"
                              title="Sin stock — los clientes no pueden comprar"
                            >
                              <PackageX className="h-3 w-3" />
                              Sin stock
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Columna destacar (sponsored boost) */}
                      <td className="px-3 py-2.5 text-center hidden lg:table-cell">
                        {p.boost ? (
                          <button
                            type="button"
                            onClick={() => setBoostingProduct(p)}
                            title={`Boost activo · S/${p.boost.bidAmount}/día · Gastado S/${p.boost.totalSpentPen.toFixed(2)} / S/${p.boost.maxBudgetPen.toFixed(0)}`}
                            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-[var(--brand-secondary)]/15 text-[var(--brand-secondary)] text-xs font-extrabold hover:bg-[var(--brand-secondary)]/25 transition-colors"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            Destacado
                          </button>
                        ) : p.isActive && p.productId ? (
                          <button
                            type="button"
                            onClick={() => setBoostingProduct(p)}
                            title="Destacar este producto en el marketplace"
                            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border-2 border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)] text-xs font-bold hover:border-[var(--brand-secondary)] hover:text-[var(--brand-secondary)] transition-colors"
                          >
                            <Megaphone className="h-3.5 w-3.5" />
                            Destacar
                          </button>
                        ) : (
                          <span className="text-[var(--text-tertiary)] text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {p.isActive && storeSlug ? (
                          <a
                            href={`/marketplace/${storeSlug}#producto-${p.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Ver en marketplace público"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] transition-colors"
                          >
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                          </a>
                        ) : (
                          <span className="inline-block h-8 w-8" aria-hidden />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length < products.length && (
            <div className="border-t border-[var(--rule-base)] px-4 py-2 bg-[var(--surface-sunken)] text-xs font-bold text-[var(--text-secondary)] flex items-center justify-between">
              <span>
                Mostrando <strong className="tabular-nums">{filtered.length}</strong> de{" "}
                <strong className="tabular-nums">{products.length}</strong> productos
              </span>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setStatusFilter("todos");
                  setStockFilter("todos");
                }}
                className="text-[var(--accent)] hover:underline"
              >
                Limpiar filtros
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal "Destacar producto" — sponsored boost */}
      {boostingProduct && (
        <BoostModal
          product={boostingProduct}
          storeId={storeId}
          onClose={() => setBoostingProduct(null)}
          onCreate={async (payload) => {
            if (!boostingProduct.productId) return { ok: false };
            const r = await createBoost(boostingProduct.productId, storeId, payload);
            if (r.ok) setBoostingProduct(null);
            return r;
          }}
          onStop={async () => {
            if (!boostingProduct.boost) return { ok: false };
            const r = await stopBoost(boostingProduct.boost.id);
            if (r.ok) setBoostingProduct(null);
            return r;
          }}
        />
      )}
    </div>
  );
}

// ── Chip de comparación contra el promedio del marketplace ──────────────
function CompetitionChip({
  myPrice,
  avg,
  count,
}: {
  myPrice: number;
  avg: number | null;
  count: number;
}) {
  if (!avg || count === 0) return null;
  const diff = ((myPrice - avg) / avg) * 100;
  if (Math.abs(diff) < 3) {
    return (
      <span
        title={`En precio (promedio S/${avg.toFixed(2)} en ${count} tienda${count === 1 ? "" : "s"})`}
        className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--text-tertiary)] tabular-nums"
      >
        <Minus className="h-3 w-3" />
        En precio
      </span>
    );
  }
  if (diff > 0) {
    return (
      <span
        title={`Caro · ${diff.toFixed(0)}% sobre el promedio S/${avg.toFixed(2)} (${count} tienda${count === 1 ? "" : "s"})`}
        className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--data-warning-500)] tabular-nums"
      >
        <TrendingUp className="h-3 w-3" />
        {diff.toFixed(0)}% caro
      </span>
    );
  }
  return (
    <span
      title={`Barato · ${Math.abs(diff).toFixed(0)}% bajo el promedio S/${avg.toFixed(2)} (${count} tienda${count === 1 ? "" : "s"})`}
      className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--data-success-500)] tabular-nums"
    >
      <TrendingDown className="h-3 w-3" />
      {Math.abs(diff).toFixed(0)}% barato
    </span>
  );
}

// ── Modal: destacar producto (SponsoredBoost) ───────────────────────────
function BoostModal({
  product,
  storeId,
  onClose,
  onCreate,
  onStop,
}: {
  product: MarketplaceProduct;
  storeId: string;
  onClose: () => void;
  onCreate: (payload: { bidAmount: number; days: number; maxBudgetPen: number }) => Promise<{ ok: boolean }>;
  onStop: () => Promise<{ ok: boolean }>;
}) {
  const existing = product.boost;
  const [bidAmount, setBidAmount] = useState<string>(existing ? String(existing.bidAmount) : "3");
  const [days, setDays] = useState<string>("7");
  const [maxBudget, setMaxBudget] = useState<string>(existing ? String(existing.maxBudgetPen) : "21");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const bidNum = Number(bidAmount);
  const daysNum = Number(days);
  const budgetNum = Number(maxBudget);
  const estimated = Number.isFinite(bidNum) && Number.isFinite(daysNum) ? bidNum * daysNum : 0;
  const canSubmit =
    !!storeId &&
    !!product.productId &&
    bidNum > 0 &&
    daysNum > 0 &&
    daysNum <= 90 &&
    budgetNum >= bidNum;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    await onCreate({ bidAmount: bidNum, days: daysNum, maxBudgetPen: budgetNum });
    setSubmitting(false);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 backdrop-blur-[2px] p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-3xl bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] shadow-2xl overflow-hidden"
      >
        <header className="flex items-start gap-3 px-6 py-5 border-b-2 border-[var(--rule-soft)]">
          <span aria-hidden className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-secondary)]/15 text-[var(--brand-secondary)] shrink-0">
            <Sparkles className="h-6 w-6" strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">
              Marketplace · Boost
            </p>
            <h2 className="text-xl font-extrabold text-[var(--text-primary)] leading-tight">
              {existing ? "Boost activo" : "Destacar producto"}
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)] leading-relaxed truncate">
              {product.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="h-10 w-10 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {existing ? (
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <KpiTile label="Puja diaria" value={`S/ ${existing.bidAmount.toFixed(2)}`} />
              <KpiTile label="Gastado" value={`S/ ${existing.totalSpentPen.toFixed(2)}`} sub={`de S/ ${existing.maxBudgetPen.toFixed(0)}`} />
              <KpiTile label="Impresiones" value={existing.impressionsCount.toLocaleString("es-PE")} />
              <KpiTile label="Clicks" value={existing.clicksCount.toLocaleString("es-PE")} />
            </div>
            <div className="rounded-xl bg-[var(--surface-sunken)] border border-[var(--rule-soft)] p-3 text-xs text-[var(--text-secondary)]">
              Termina el{" "}
              <strong className="text-[var(--text-primary)]">
                {new Date(existing.endDate).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" })}
              </strong>
            </div>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              Destacar tu producto en el marketplace. Aparece arriba en los listados de su categoría y muestra el badge <strong className="text-[var(--brand-secondary)]">Destacado</strong>.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <NumberField label="Puja diaria" prefix="S/" value={bidAmount} onChange={setBidAmount} hint="Mínimo S/ 1" />
              <NumberField label="Duración" suffix="días" value={days} onChange={setDays} hint="Máx 90" />
              <NumberField label="Tope total" prefix="S/" value={maxBudget} onChange={setMaxBudget} hint="Corta al llegar" />
            </div>
            <div className="rounded-xl bg-[var(--accent-soft)] border-2 border-[var(--accent)]/30 p-3 flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                Gasto estimado
              </span>
              <span className="text-xl font-extrabold tabular-nums text-[var(--accent)]">
                S/ {estimated.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        <footer className="px-6 py-4 bg-[var(--surface-sunken)] border-t-2 border-[var(--rule-soft)] flex items-center justify-end gap-2">
          {existing ? (
            <button
              type="button"
              onClick={async () => {
                setSubmitting(true);
                await onStop();
                setSubmitting(false);
              }}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 h-11 px-4 rounded-xl bg-[var(--data-error-500)]/10 text-[var(--data-error-500)] font-extrabold text-sm hover:bg-[var(--data-error-500)]/20 transition-colors disabled:opacity-50"
            >
              <X className="h-4 w-4" />
              Detener boost
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="h-11 px-4 rounded-xl text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                className="inline-flex items-center gap-1.5 h-11 px-5 rounded-xl bg-[var(--brand-secondary)] text-white font-extrabold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {submitting ? "Creando…" : "Destacar"}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">{label}</p>
      <p className="text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{value}</p>
      {sub && <p className="text-[10px] text-[var(--text-tertiary)] tabular-nums mt-0.5">{sub}</p>}
    </div>
  );
}

function NumberField({
  label,
  prefix,
  suffix,
  value,
  onChange,
  hint,
}: {
  label: string;
  prefix?: string;
  suffix?: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <label className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5 block">{label}</label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text-tertiary)] pointer-events-none">
            {prefix}
          </span>
        )}
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "w-full h-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-base font-extrabold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]",
            prefix ? "pl-8 pr-3" : "px-3",
            suffix ? "pr-12" : "",
            "text-right tabular-nums",
          )}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text-tertiary)] pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">{hint}</p>}
    </div>
  );
}

// ── Celda de precio editable inline ──────────────────────────────────────
function PriceCell({
  value,
  isEditing,
  editValue,
  busy,
  onStartEdit,
  onChange,
  onCommit,
  onCancel,
  alwaysBold = false,
}: {
  value: number;
  isEditing: boolean;
  editValue: string;
  busy: boolean;
  onStartEdit: () => void;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  alwaysBold?: boolean;
}) {
  if (isEditing) {
    return (
      <div className="inline-flex items-center gap-1 justify-end">
        <span className="text-xs font-bold text-[var(--text-tertiary)]">S/</span>
        <input
          type="number"
          autoFocus
          min={0}
          step={0.5}
          value={editValue}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onCommit();
            }
            if (e.key === "Escape") onCancel();
          }}
          onBlur={onCommit}
          disabled={busy}
          className="w-20 h-7 px-2 rounded-md border-2 border-[var(--accent)] bg-[var(--surface-raised)] text-sm font-extrabold text-right tabular-nums outline-none"
        />
      </div>
    );
  }
  if (value <= 0 && !alwaysBold) {
    return (
      <button
        type="button"
        onClick={onStartEdit}
        title="Agregar precio mayorista"
        className="inline-flex items-center gap-1 text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors"
      >
        <Pencil className="h-3 w-3 opacity-60" aria-hidden /> —
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onStartEdit}
      title="Click para editar"
      className={cn(
        "group inline-flex items-center gap-1.5 tabular-nums hover:text-[var(--accent)] transition-colors",
        alwaysBold
          ? "font-extrabold text-[var(--text-primary)]"
          : "text-[var(--text-secondary)]",
      )}
    >
      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" aria-hidden />
      S/ {value.toFixed(2)}
    </button>
  );
}

// ── Counter chip clickeable para el KPI strip ────────────────────────────
function CounterChip({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: "success" | "warning" | "danger" | "neutral";
  active: boolean;
  onClick: () => void;
}) {
  const toneClasses = {
    success: { bg: "bg-[var(--data-success-500)]/10", text: "text-[var(--data-success-500)]", border: "border-[var(--data-success-500)]" },
    warning: { bg: "bg-[var(--data-warning-500)]/10", text: "text-[var(--data-warning-500)]", border: "border-[var(--data-warning-500)]" },
    danger: { bg: "bg-[var(--data-error-500)]/10", text: "text-[var(--data-error-500)]", border: "border-[var(--data-error-500)]" },
    neutral: { bg: "bg-[var(--surface-sunken)]", text: "text-[var(--text-secondary)]", border: "border-[var(--text-tertiary)]" },
  } as const;
  const t = toneClasses[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "text-left rounded-xl border-2 px-3.5 py-2.5 transition-colors",
        active
          ? cn(t.border, t.bg)
          : cn("border-[var(--rule-base)] bg-[var(--surface-raised)] hover:" + t.border.replace("border-", "border-"), "hover:" + t.bg.replace("bg-", "bg-")),
      )}
    >
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">
        {label}
      </p>
      <p className={cn("text-2xl font-extrabold tabular-nums leading-none", active ? t.text : "text-[var(--text-primary)]")}>
        {value}
      </p>
    </button>
  );
}

// ─────────────────────────────────────────────
// Sub-tab: Órdenes
// ─────────────────────────────────────────────
type OrdersSortKey = "createdAt" | "total" | "status";
type OrdersStatusFilter = "todos" | "pendiente" | "confirmado" | "preparando" | "en_camino" | "entregado" | "cancelado";
type OrdersDateFilter = "hoy" | "7d" | "30d" | "todo";

function MarketplaceOrdenesTab() {
  const {
    orders, loading, error, load,
    updatingId, bulkBusy,
    updateStatus, bulkUpdateStatus, fetchDetail,
  } = useMarketplaceOrders();

  // Brandon mayo 2026 v7 — Órdenes Nivel A + B:
  // (1) KPI strip por estado clickeable.
  // (2) Búsqueda por #orden / nombre cliente / últimos 4 del tel.
  // (3) Filtro estado + filtro fecha (Hoy / 7d / 30d / Todo).
  // (4) Mostrar teléfono masked + dirección (PII safe).
  // (5) Sort por columna (fecha default desc, total).
  // (6) Sticky header + dark mode tokens.
  // (B-1) Dropdown inline para cambiar estado por orden.
  // (B-2) Botón WhatsApp con template auto.
  // (B-3) Modal de detalle (productos, subtotales, descuentos).
  // (B-4) Bulk actions: seleccionar N órdenes + cambiar estado en lote.
  // (B-5) Export CSV — para SUNAT / contabilidad.
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrdersStatusFilter>("todos");
  const [dateFilter, setDateFilter] = useState<OrdersDateFilter>("30d");
  const [sortKey, setSortKey] = useState<OrdersSortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Nivel B state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailOrder, setDetailOrder] = useState<MarketplaceOrderDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [openStatusMenuFor, setOpenStatusMenuFor] = useState<string | null>(null);
  const [openBulkMenu, setOpenBulkMenu] = useState(false);

  if (loading) return <TableSkeleton />;

  // ── Counters por estado (sobre TODO el set, no sobre filtrados) ──
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const counters = {
    pendientes: orders.filter((o) => o.status === "pendiente").length,
    confirmadas: orders.filter((o) => o.status === "confirmado").length,
    preparando: orders.filter((o) => o.status === "preparando").length,
    enCamino: orders.filter((o) => o.status === "en_camino").length,
    entregadasHoy: orders.filter((o) => o.status === "entregado" && new Date(o.createdAt).getTime() >= startOfToday).length,
  };

  // ── Filtros ─────────────────────────────────────────────────────
  function withinDateFilter(o: { createdAt: string }): boolean {
    if (dateFilter === "todo") return true;
    const t = new Date(o.createdAt).getTime();
    if (dateFilter === "hoy") return t >= startOfToday;
    const days = dateFilter === "7d" ? 7 : 30;
    return t >= now.getTime() - days * 24 * 60 * 60 * 1000;
  }

  const filteredUnsorted = orders.filter((o) => {
    if (statusFilter !== "todos" && o.status !== statusFilter) return false;
    if (!withinDateFilter(o)) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      const idShort = o.id.slice(-8).toLowerCase();
      const phone = (o.customerPhone ?? "").toLowerCase();
      const hit =
        o.customerName.toLowerCase().includes(q) ||
        idShort.includes(q) ||
        phone.includes(q) ||
        (o.customerLocation ?? "").toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });

  const filtered = [...filteredUnsorted].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortKey === "createdAt") {
      return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
    }
    if (sortKey === "total") {
      return (a.total - b.total) * dir;
    }
    return a.status.localeCompare(b.status) * dir;
  });

  function clickHeader(key: OrdersSortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "createdAt" ? "desc" : "desc");
    }
  }

  function clearFilters() {
    setQuery("");
    setStatusFilter("todos");
    setDateFilter("todo");
  }

  // ── Nivel B helpers ─────────────────────────────────────────────

  // Mismas transiciones que el backend (espejo). Si el backend rechaza,
  // mostramos el error real igual — pero esto evita ofrecer opciones
  // imposibles en el menú.
  const NEXT_STATUSES: Record<string, OrderTargetStatus[]> = {
    pendiente:  ["confirmado", "cancelado"],
    confirmado: ["preparando", "en_camino", "cancelado"],
    preparando: ["en_camino", "cancelado"],
    en_camino:  ["entregado", "cancelado"],
  };

  const STATUS_ACTION_LABEL: Record<OrderTargetStatus, string> = {
    confirmado: "Confirmar",
    preparando: "Marcar preparando",
    en_camino:  "Marcar en camino",
    entregado:  "Marcar entregado",
    cancelado:  "Cancelar",
  };

  async function openDetail(orderId: string) {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailOrder(null);
    const d = await fetchDetail(orderId);
    setDetailOrder(d);
    setDetailLoading(false);
  }

  function buildWhatsAppLink(o: { customerPhone?: string | null; customerName: string; id: string; status: string; total: number }) {
    // El teléfono que recibe el listado viene enmascarado (`***1234`). Para
    // el wa.me real necesitamos pedir el detalle. Acá hacemos un fallback:
    // si el phone enmascarado no tiene dígitos completos, abrimos el modal
    // y dejamos que el admin copie. En la mayoría de filas el phone está
    // truncado (Ley 29733), por lo que el wa.me solo construye el texto y
    // copia al portapapeles, NO abre el chat directo.
    const idShort = o.id.slice(-8).toUpperCase();
    const statusLabel = ORDER_STATUS_CONFIG[o.status]?.label ?? o.status;
    const message =
      `Hola ${o.customerName}, te escribo de la tienda. ` +
      `Tu pedido #${idShort} está actualmente *${statusLabel}*. ` +
      `Total: S/ ${o.total.toFixed(2)}. ¿Te confirmamos los detalles?`;
    return { message, encoded: encodeURIComponent(message) };
  }

  async function handleWhatsApp(o: { id: string; customerPhone?: string | null; customerName: string; status: string; total: number }) {
    // Para enviar a un número real, traemos el detalle (que sí tiene el
    // phone sin máscara cuando el admin tiene permiso).
    const detail = await fetchDetail(o.id);
    const phone = detail?.customerPhone ?? "";
    const digits = phone.replace(/\D/g, "");
    const { encoded } = buildWhatsAppLink(o);
    if (digits.length >= 8) {
      // wa.me requiere E.164 sin "+". Si no tiene país, asumimos Perú (+51).
      const intl = digits.length === 9 ? `51${digits}` : digits;
      window.open(`https://wa.me/${intl}?text=${encoded}`, "_blank", "noopener,noreferrer");
    } else {
      // Phone no disponible — abrir modal para que el admin lo copie/llame.
      openDetail(o.id);
    }
  }

  function exportCsv() {
    const rows = filtered.map((o) => {
      const d = new Date(o.createdAt);
      return [
        `#${o.id.slice(-8).toUpperCase()}`,
        d.toLocaleDateString("es-PE"),
        d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false }),
        o.customerName,
        o.customerPhone ?? "",
        o.customerLocation ?? "",
        String(o.itemsCount),
        o.total.toFixed(2),
        ORDER_STATUS_CONFIG[o.status]?.label ?? o.status,
      ];
    });
    const header = ["Orden", "Fecha", "Hora", "Cliente", "Tel", "Direccion", "Items", "Total (S/)", "Estado"];
    const csvLines = [header, ...rows].map((r) =>
      r.map((cell) => {
        const s = String(cell ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(","),
    );
    const csv = "﻿" + csvLines.join("\r\n"); // BOM para Excel
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `marketplace-ordenes-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleStatusChange(orderId: string, status: OrderTargetStatus) {
    setOpenStatusMenuFor(null);
    if (status === "cancelado") {
      const reason = window.prompt("Motivo de cancelación (opcional):") ?? undefined;
      const res = await updateStatus(orderId, status, reason);
      if (!res.ok && res.error) window.alert(res.error);
      return;
    }
    const res = await updateStatus(orderId, status);
    if (!res.ok && res.error) window.alert(res.error);
  }

  async function handleBulkStatus(status: OrderTargetStatus) {
    setOpenBulkMenu(false);
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    let reason: string | undefined;
    if (status === "cancelado") {
      const r = window.prompt(`Cancelar ${ids.length} órdenes. Motivo (opcional):`);
      if (r === null) return;
      reason = r || undefined;
    } else {
      const ok = window.confirm(`¿Marcar ${ids.length} órdenes como "${STATUS_ACTION_LABEL[status]}"?`);
      if (!ok) return;
    }
    const res = await bulkUpdateStatus(ids, status, reason);
    if (res.ok) {
      setSelectedIds(new Set());
      if (res.skipped && res.skipped.length > 0) {
        window.alert(`Actualizadas: ${res.updatedCount}. Omitidas: ${res.skipped.length} (transiciones no válidas).`);
      }
    }
  }

  function toggleSelect(orderId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((o) => o.id)));
  }

  // Para el bulk menu: estados a los que SE PUEDE ir desde TODAS las
  // órdenes seleccionadas (intersección de NEXT_STATUSES). Si solo hay
  // pendientes seleccionadas, ofrece [confirmado, cancelado]; si hay
  // mix de pendientes y confirmadas, solo [cancelado] (intersección).
  const bulkAvailableStatuses: OrderTargetStatus[] = (() => {
    if (selectedIds.size === 0) return [];
    const sets = Array.from(selectedIds)
      .map((id) => orders.find((o) => o.id === id))
      .filter((o): o is NonNullable<typeof o> => !!o)
      .map((o) => new Set(NEXT_STATUSES[o.status] ?? []));
    if (sets.length === 0) return [];
    return Array.from(sets[0]).filter((s) => sets.every((set) => set.has(s)));
  })();

  return (
    <div className="space-y-4">
      {detailOpen && (
        <OrderDetailModal
          order={detailOrder}
          loading={detailLoading}
          onClose={() => {
            setDetailOpen(false);
            setDetailOrder(null);
          }}
          onWhatsApp={(o) => {
            // Reusamos handleWhatsApp del listado — el detalle ya tiene phone real.
            const phoneDigits = (o.customerPhone ?? "").replace(/\D/g, "");
            if (phoneDigits.length < 8) {
              window.alert("Esta orden no tiene teléfono válido.");
              return;
            }
            const intl = phoneDigits.length === 9 ? `51${phoneDigits}` : phoneDigits;
            const statusLabel = ORDER_STATUS_CONFIG[o.status]?.label ?? o.status;
            const idShort = o.id.slice(-8).toUpperCase();
            const message =
              `Hola ${o.customerName}, te escribo de la tienda. ` +
              `Tu pedido #${idShort} está actualmente *${statusLabel}*. ` +
              `Total: S/ ${o.total.toFixed(2)}. ¿Te confirmamos los detalles?`;
            window.open(
              `https://wa.me/${intl}?text=${encodeURIComponent(message)}`,
              "_blank",
              "noopener,noreferrer",
            );
          }}
          onChangeStatus={(o) => {
            // Cierra modal y abre el dropdown inline en la fila correspondiente.
            setDetailOpen(false);
            setDetailOrder(null);
            setOpenStatusMenuFor(o.id);
          }}
        />
      )}

      {/* ── KPI strip ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <CounterChip
          label="Pendientes"
          value={counters.pendientes}
          tone="warning"
          active={statusFilter === "pendiente"}
          onClick={() => setStatusFilter(statusFilter === "pendiente" ? "todos" : "pendiente")}
        />
        <CounterChip
          label="Confirmadas"
          value={counters.confirmadas}
          tone="success"
          active={statusFilter === "confirmado"}
          onClick={() => setStatusFilter(statusFilter === "confirmado" ? "todos" : "confirmado")}
        />
        <CounterChip
          label="Preparando"
          value={counters.preparando}
          tone="neutral"
          active={statusFilter === "preparando"}
          onClick={() => setStatusFilter(statusFilter === "preparando" ? "todos" : "preparando")}
        />
        <CounterChip
          label="En camino"
          value={counters.enCamino}
          tone="warning"
          active={statusFilter === "en_camino"}
          onClick={() => setStatusFilter(statusFilter === "en_camino" ? "todos" : "en_camino")}
        />
        <CounterChip
          label="Entregadas hoy"
          value={counters.entregadasHoy}
          tone="success"
          active={statusFilter === "entregado" && dateFilter === "hoy"}
          onClick={() => {
            if (statusFilter === "entregado" && dateFilter === "hoy") {
              setStatusFilter("todos");
              setDateFilter("todo");
            } else {
              setStatusFilter("entregado");
              setDateFilter("hoy");
            }
          }}
        />
      </div>

      {/* ── Toolbar: search + filtro fecha ─────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por cliente, #orden, teléfono o dirección…"
            className="w-full h-10 pl-10 pr-9 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full flex items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="inline-flex rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-0.5 gap-0.5">
          {(["hoy", "7d", "30d", "todo"] as OrdersDateFilter[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDateFilter(d)}
              aria-pressed={dateFilter === d}
              className={cn(
                "h-9 px-3 rounded-lg text-xs font-extrabold transition-colors capitalize",
                dateFilter === d
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
              )}
            >
              {d === "hoy" ? "Hoy" : d === "todo" ? "Todo" : d}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] text-[var(--text-primary)] text-sm font-extrabold hover:bg-[var(--surface-sunken)] transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Actualizar
        </button>
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] text-[var(--text-primary)] text-sm font-extrabold hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Descargar CSV de las órdenes filtradas (para Excel/SUNAT)"
        >
          <Download className="h-4 w-4" />
          CSV
        </button>
      </div>

      {/* ── Bulk actions bar (visible cuando hay selección) ───────── */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-[var(--accent-soft)] border-2 border-[var(--accent)]/40">
          <p className="text-sm font-extrabold text-[var(--accent)]">
            {selectedIds.size} {selectedIds.size === 1 ? "orden seleccionada" : "órdenes seleccionadas"}
          </p>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenBulkMenu((v) => !v)}
                disabled={bulkBusy || bulkAvailableStatuses.length === 0}
                className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-[var(--accent)] text-white text-xs font-extrabold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {bulkBusy ? "Procesando…" : "Cambiar estado"}
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {openBulkMenu && bulkAvailableStatuses.length > 0 && (
                <div className="absolute right-0 mt-1 w-56 z-30 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-xl overflow-hidden">
                  {bulkAvailableStatuses.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleBulkStatus(s)}
                      className="block w-full text-left px-3 py-2 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
                    >
                      {STATUS_ACTION_LABEL[s]}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] text-[var(--text-secondary)] text-xs font-extrabold hover:bg-[var(--surface-sunken)]"
            >
              <X className="h-3.5 w-3.5" />
              Limpiar
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-[var(--data-error-500)]/10 border border-[var(--data-error-500)]/30 rounded-xl text-sm font-bold text-[var(--data-error-500)]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={load} className="ml-auto text-xs underline">Reintentar</button>
        </div>
      )}

      {orders.length === 0 && !error ? (
        <div className="text-center py-16 text-[var(--text-tertiary)] rounded-xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold">Sin órdenes del marketplace aún</p>
          <p className="text-xs mt-1">Las órdenes recibidas desde el marketplace aparecerán aquí.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-tertiary)] rounded-xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm font-semibold">Sin resultados con esos filtros</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-2 text-xs font-bold text-[var(--accent)] hover:underline"
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl overflow-hidden">
          <div className="overflow-x-auto max-h-[calc(100vh-24rem)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-sunken)] sticky top-0 z-10 border-b border-[var(--rule-base)]">
                <tr>
                  <th className="text-left px-3 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size > 0 && selectedIds.size === filtered.length}
                      ref={(el) => {
                        if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filtered.length;
                      }}
                      onChange={toggleSelectAll}
                      aria-label="Seleccionar todas"
                      className="h-4 w-4 rounded border-2 border-[var(--rule-base)] accent-[var(--accent)] cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">Orden</th>
                  <th className="text-left px-3 py-3 text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">Cliente</th>
                  <th className="text-left px-3 py-3 text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] hidden md:table-cell">Dirección</th>
                  <th className="text-right px-3 py-3 text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                    <button
                      type="button"
                      onClick={() => clickHeader("total")}
                      className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors ml-auto"
                    >
                      Total <SortIcon k="total" currentKey={sortKey} currentDir={sortDir} />
                    </button>
                  </th>
                  <th className="text-center px-3 py-3 text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                    <button
                      type="button"
                      onClick={() => clickHeader("status")}
                      className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors mx-auto"
                    >
                      Estado <SortIcon k="status" currentKey={sortKey} currentDir={sortDir} />
                    </button>
                  </th>
                  <th className="text-right px-3 py-3 text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                    <button
                      type="button"
                      onClick={() => clickHeader("createdAt")}
                      className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors ml-auto"
                    >
                      Fecha <SortIcon k="createdAt" currentKey={sortKey} currentDir={sortDir} />
                    </button>
                  </th>
                  <th className="text-right px-3 py-3 w-32 text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
                {filtered.map((o) => {
                  const statusConfig = ORDER_STATUS_CONFIG[o.status] ?? {
                    label: o.status,
                    className: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
                  };
                  const created = new Date(o.createdAt);
                  const isSelected = selectedIds.has(o.id);
                  const nextOptions = NEXT_STATUSES[o.status] ?? [];
                  const isUpdating = updatingId === o.id;
                  return (
                    <tr
                      key={o.id}
                      className={cn(
                        "transition-colors cursor-pointer",
                        isSelected
                          ? "bg-[var(--accent-soft)]/40"
                          : "hover:bg-[var(--surface-sunken)]/50",
                      )}
                      onClick={(e) => {
                        // Solo abre detalle si el click NO fue sobre un botón/input/menu.
                        const target = e.target as HTMLElement;
                        if (target.closest("button, input, a, [data-no-row-click]")) return;
                        openDetail(o.id);
                      }}
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(o.id)}
                          aria-label={`Seleccionar orden ${o.id.slice(-8)}`}
                          className="h-4 w-4 rounded border-2 border-[var(--rule-base)] accent-[var(--accent)] cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-mono text-xs font-extrabold text-[var(--text-primary)]">
                          #{o.id.slice(-8).toUpperCase()}
                        </p>
                        <p className="text-[10px] text-[var(--text-tertiary)]">
                          {o.itemsCount} producto{o.itemsCount !== 1 ? "s" : ""}
                        </p>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-semibold text-[var(--text-primary)] truncate max-w-[160px]" title={o.customerName}>
                          {o.customerName}
                        </p>
                        {o.customerPhone && (
                          <p className="text-[10px] text-[var(--text-tertiary)] font-mono">{o.customerPhone}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        <p
                          className="text-xs text-[var(--text-secondary)] truncate max-w-[240px]"
                          title={o.customerLocation ?? "—"}
                        >
                          {o.customerLocation || <span className="text-[var(--text-tertiary)] italic">Sin dirección</span>}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-right font-extrabold text-[var(--text-primary)] tabular-nums">
                        S/ {o.total.toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={cn("inline-flex px-2.5 py-1 rounded-full text-xs font-extrabold", statusConfig.className)}>
                          {statusConfig.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs">
                        <p className="font-semibold text-[var(--text-primary)] tabular-nums">
                          {created.toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}
                        </p>
                        <p className="text-[10px] text-[var(--text-tertiary)] tabular-nums">
                          {created.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false })}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-right" data-no-row-click>
                        <div className="inline-flex items-center gap-1 justify-end">
                          {/* WhatsApp */}
                          {o.customerPhone && (
                            <button
                              type="button"
                              onClick={() => handleWhatsApp(o)}
                              className="h-8 w-8 rounded-lg flex items-center justify-center text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/15 transition-colors"
                              title="Escribir por WhatsApp"
                              aria-label="WhatsApp"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </button>
                          )}
                          {/* Ver detalle */}
                          <button
                            type="button"
                            onClick={() => openDetail(o.id)}
                            className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
                            title="Ver detalle del pedido"
                            aria-label="Detalle"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {/* Status dropdown */}
                          {nextOptions.length > 0 && (
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setOpenStatusMenuFor((id) => (id === o.id ? null : o.id))}
                                disabled={isUpdating}
                                className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-40"
                                title="Cambiar estado"
                                aria-label="Cambiar estado"
                              >
                                {isUpdating ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                  <MoreHorizontal className="h-4 w-4" />
                                )}
                              </button>
                              {openStatusMenuFor === o.id && (
                                <div className="absolute right-0 mt-1 w-52 z-30 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-xl overflow-hidden">
                                  {nextOptions.map((s) => (
                                    <button
                                      key={s}
                                      type="button"
                                      onClick={() => handleStatusChange(o.id, s)}
                                      className={cn(
                                        "block w-full text-left px-3 py-2 text-xs font-bold hover:bg-[var(--surface-sunken)] transition-colors",
                                        s === "cancelado"
                                          ? "text-[var(--data-error-500)]"
                                          : "text-[var(--text-primary)]",
                                      )}
                                    >
                                      {STATUS_ACTION_LABEL[s]}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length < orders.length && (
            <div className="border-t border-[var(--rule-base)] px-4 py-2 bg-[var(--surface-sunken)] text-xs font-bold text-[var(--text-secondary)] flex items-center justify-between">
              <span>
                Mostrando <strong className="tabular-nums">{filtered.length}</strong> de{" "}
                <strong className="tabular-nums">{orders.length}</strong> órdenes
              </span>
              <button
                type="button"
                onClick={clearFilters}
                className="text-[var(--accent)] hover:underline"
              >
                Limpiar filtros
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-tab: Comisiones
// ─────────────────────────────────────────────
function MarketplaceComisionesTab() {
  const {
    filtered, summary, loading, error,
    filterStatus, setFilterStatus,
    markingPaid, load,
    handleMarkPaid, handleBulkPay,
  } = useMarketplaceCommissions();

  if (loading) return <TableSkeleton />;

  // Total absoluto y % en cada estado para barras de proporción visual.
  const total = (summary.pendiente || 0) + (summary.liquidado || 0) + (summary.pagado || 0);
  const pct = (n: number) => (total > 0 ? Math.max(2, (n / total) * 100) : 0);

  // Counts por estado para los chips (para mostrar cuántos hay en cada filtro).
  const counts = {
    all: filtered.length || 0,
    pendiente: 0,
    liquidado: 0,
    pagado: 0,
  };
  // Dado que `filtered` ya respeta el filtro activo, contamos sobre ello cuando es "all"
  // y sobre `summary` (montos totales) como heurística; el dato exacto requeriría el hook
  // exponer `entries`. Los chips muestran montos (S/) más útiles que counts en este flow.

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-[var(--data-error-50)] border border-[var(--data-error)] rounded-xl text-sm text-[var(--data-error)]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={load} className="ml-auto text-xs underline">Reintentar</button>
        </div>
      )}

      {/* ── Hero card: total + barra de distribución ── */}
      <div className="relative overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-linear-to-br from-primary/5 via-white to-[var(--surface-sunken)] p-5 sm:p-6">
        <div className="absolute -top-20 -right-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-4">
          <div>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Comisiones marketplace</p>
            <h3 className="mt-1 text-3xl sm:text-4xl font-extrabold text-[var(--text-primary)] tracking-tight tabular-nums">
              S/ {total.toFixed(2)}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1">Suma de todos los estados · {filtered.length} {filtered.length === 1 ? "comisión" : "comisiones"} listadas</p>
          </div>
          {summary.liquidado > 0 && (
            <button
              onClick={handleBulkPay}
              disabled={markingPaid === "bulk"}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50 shadow-sm"
            >
              <DollarSign className="h-4 w-4" />
              {markingPaid === "bulk" ? "Procesando..." : `Pagar liquidado · S/${summary.liquidado.toFixed(2)}`}
            </button>
          )}
        </div>

        {/* Barra de proporción visual (Pendiente / Liquidado / Pagado) */}
        <div className="relative">
          <div className="flex h-2 rounded-full overflow-hidden bg-[var(--rule-soft)]">
            {total > 0 ? (
              <>
                <span className="bg-[var(--data-warning)]" style={{ width: `${pct(summary.pendiente)}%` }} />
                <span className="bg-primary" style={{ width: `${pct(summary.liquidado)}%` }} />
                <span className="bg-[var(--data-success)]" style={{ width: `${pct(summary.pagado)}%` }} />
              </>
            ) : null}
          </div>
        </div>

        {/* Detalle por estado */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          {[
            { key: "pendiente", label: "Por pagar", value: summary.pendiente, dot: "bg-[var(--data-warning)]", icon: Clock },
            { key: "liquidado", label: "Liquidado", value: summary.liquidado, dot: "bg-primary", icon: CheckCircle },
            { key: "pagado", label: "Pagado", value: summary.pagado, dot: "bg-[var(--data-success)]", icon: CheckCircle },
          ].map(({ key, label, value, dot, icon: Icon }) => (
            <div key={key} className="flex items-start gap-2.5">
              <span className={cn("mt-1.5 h-2 w-2 rounded-full shrink-0", dot)} />
              <div className="min-w-0">
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] truncate">{label}</p>
                <p className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] tabular-nums">S/ {(value || 0).toFixed(2)}</p>
              </div>
              <Icon className="h-3.5 w-3.5 text-[var(--text-tertiary)] ml-auto mt-1 shrink-0" />
            </div>
          ))}
        </div>
      </div>

      {/* ── Filtros como chips grandes con monto ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { value: "all", label: "Todas", amount: total },
          { value: "pendiente", label: "Por pagar", amount: summary.pendiente },
          { value: "liquidado", label: "Liquidado", amount: summary.liquidado },
          { value: "pagado", label: "Pagado", amount: summary.pagado },
        ].map((f) => {
          const active = filterStatus === f.value;
          return (
            <button
              key={f.value}
              onClick={() => setFilterStatus(f.value)}
              className={cn(
                "inline-flex items-center gap-2 h-10 px-4 rounded-xl border-2 text-sm font-bold transition-all tabular-nums",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-[var(--rule-base)] bg-white text-[var(--text-secondary)] hover:border-[var(--text-tertiary)]"
              )}
            >
              {f.label}
              <span className={cn("text-xs font-semibold tabular-nums", active ? "text-primary/80" : "text-[var(--text-tertiary)]")}>
                S/{(f.amount || 0).toFixed(0)}
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && !error ? (
        <div className="text-center py-20 px-6 rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-white">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 text-primary mb-4">
            <DollarSign className="h-6 w-6" />
          </div>
          <p className="text-base font-extrabold text-[var(--text-primary)]">
            {filterStatus !== "all" ? `Sin comisiones en "${filterStatus}"` : "Sin comisiones registradas aún"}
          </p>
          <p className="text-sm text-[var(--text-secondary)] mt-1.5 max-w-sm mx-auto">
            {filterStatus !== "all"
              ? "Probá con otro filtro o vé al estado anterior del flujo."
              : "Cuando recibas pedidos por marketplace, las comisiones aparecerán acá."}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-[var(--rule-base)] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-sunken)] border-b border-[var(--rule-base)]">
                <tr>
                  <th className="text-left px-5 py-3 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Orden</th>
                  <th className="text-right px-5 py-3 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Total</th>
                  <th className="text-right px-5 py-3 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Comisión</th>
                  <th className="text-center px-5 py-3 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Estado</th>
                  <th className="text-right px-5 py-3 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Fecha</th>
                  <th className="text-center px-5 py-3 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
                {filtered.map((e) => {
                  const sc = COMMISSION_STATUS_CONFIG[e.status] ?? COMMISSION_STATUS_CONFIG.pendiente;
                  const StatusIcon = sc.icon;
                  return (
                    <tr key={e.id} className="hover:bg-[var(--surface-sunken)] transition-colors">
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-2 font-mono text-xs font-bold text-[var(--text-primary)] bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-md px-2 py-1">
                          #{e.orderId.slice(-8).toUpperCase()}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-sm text-[var(--text-secondary)] tabular-nums">S/{e.orderTotal.toFixed(2)}</td>
                      <td className="px-5 py-3 text-right text-sm font-extrabold text-[var(--text-primary)] tabular-nums">S/{e.amount.toFixed(2)}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider", sc.className)}>
                          <StatusIcon className="h-3 w-3" />
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-xs text-[var(--text-secondary)] tabular-nums">
                        {new Date(e.createdAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit" })}
                      </td>
                      <td className="px-5 py-3 text-center">
                        {e.status !== "pagado" ? (
                          <button
                            onClick={() => handleMarkPaid(e.id)}
                            disabled={markingPaid === e.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-bold hover:bg-primary hover:text-white transition-colors disabled:opacity-50"
                          >
                            {markingPaid === e.id ? (
                              <div className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <CheckCircle className="h-3.5 w-3.5" />
                            )}
                            {markingPaid === e.id ? "..." : "Marcar pagado"}
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                            <CheckCircle className="h-3 w-3" /> Pagado
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-tab: Cupones
// ─────────────────────────────────────────────
function MarketplaceCuponesTab() {
  const {
    coupons, loading, showForm, setShowForm,
    saving, form, setForm,
    handleCreate, toggleActive, deleteCoupon,
  } = useMarketplaceCoupons();
  // PERF (audit React Compiler 2026-05-12): `now` capturado con useState lazy.
  // Refresh cada hora para que "expira en <7d" se mantenga actualizado en
  // sesiones largas del admin.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  if (loading) return <TableSkeleton />;

  // Stats agregadas
  const activeCount = coupons.filter((c) => c.active).length;
  const totalUses = coupons.reduce((s, c) => s + (c.usedCount || 0), 0);
  const expiringSoon = coupons.filter((c) => {
    if (!c.expiresAt) return false;
    const days = (new Date(c.expiresAt).getTime() - now) / (1000 * 60 * 60 * 24);
    return days > 0 && days < 7;
  }).length;

  return (
    <div className="space-y-6">
      {/* ── Header con stats + CTA ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-5">
          <div>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Cupones marketplace</p>
            <p className="text-2xl font-extrabold text-[var(--text-primary)] tabular-nums leading-tight">{coupons.length}</p>
          </div>
          <div className="h-10 w-px bg-[var(--rule-base)]" />
          <div className="flex items-center gap-5">
            <div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Activos</p>
              <p className="text-base font-bold text-[var(--data-success)] tabular-nums">{activeCount}</p>
            </div>
            <div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Usos</p>
              <p className="text-base font-bold text-[var(--text-primary)] tabular-nums">{totalUses}</p>
            </div>
            {expiringSoon > 0 && (
              <div>
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--data-warning)]">Vencen pronto</p>
                <p className="text-base font-bold text-[var(--data-warning)] tabular-nums">{expiringSoon}</p>
              </div>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors shadow-sm"
        >
          <Ticket className="h-4 w-4" />
          Nuevo cupón
        </button>
      </div>

      {/* ── Modal "Nuevo cupón" ── */}
      {showForm && (
        <NewCouponModal
          form={form}
          setForm={setForm}
          saving={saving}
          onClose={() => setShowForm(false)}
          onCreate={handleCreate}
        />
      )}

      {coupons.length === 0 ? (
        <div className="text-center py-20 px-6 rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-white">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 text-primary mb-4">
            <Ticket className="h-6 w-6" />
          </div>
          <p className="text-base font-extrabold text-[var(--text-primary)]">Sin cupones todavía</p>
          <p className="text-sm text-[var(--text-secondary)] mt-1.5 max-w-sm mx-auto">
            Crea un cupón para atraer clientes al marketplace y aumentar tu conversión.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors"
          >
            <Ticket className="h-4 w-4" />
            Crear primer cupón
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {coupons.map((c) => {
            const expired = c.expiresAt ? new Date(c.expiresAt).getTime() < now : false;
            const usagePct = c.maxUses ? Math.min(100, (c.usedCount / c.maxUses) * 100) : 0;
            return (
              <div
                key={c.id}
                className={cn(
                  "group relative overflow-hidden rounded-2xl border-2 p-4 transition-all",
                  c.active && !expired
                    ? "bg-white border-[var(--rule-base)] hover:border-primary/40 hover:shadow-md"
                    : "bg-[var(--surface-sunken)] border-[var(--rule-base)] opacity-75"
                )}
              >
                {/* Banda lateral con tipo */}
                <div className={cn(
                  "absolute left-0 top-0 bottom-0 w-1.5",
                  c.active && !expired ? "bg-primary" : "bg-[var(--rule-base)]"
                )} />

                <div className="pl-2 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Código + estado */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-extrabold text-base text-[var(--text-primary)] tracking-tight truncate">
                        {c.code}
                      </span>
                      <span className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider",
                        expired
                          ? "bg-[var(--data-error-50)] text-[var(--data-error)]"
                          : c.active
                          ? "bg-[var(--data-success-50)] text-[var(--data-success)]"
                          : "bg-[var(--rule-soft)] text-[var(--text-secondary)]"
                      )}>
                        {expired ? "Vencido" : c.active ? "Activo" : "Pausado"}
                      </span>
                    </div>

                    {/* Descuento principal grande */}
                    <p className="mt-2 text-2xl font-extrabold text-primary tabular-nums leading-none">
                      {c.discountType === "percent" ? `${c.discountValue}%` : `S/${c.discountValue.toFixed(2)}`}
                      <span className="text-xs font-semibold text-[var(--text-tertiary)] ml-1.5">de descuento</span>
                    </p>

                    {/* Descripción */}
                    {c.description && (
                      <p className="mt-1.5 text-xs text-[var(--text-secondary)] line-clamp-1">{c.description}</p>
                    )}

                    {/* Meta info */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                      {c.minPurchase ? (
                        <span className="inline-flex items-center gap-1">
                          <DollarSign className="h-3 w-3" /> Mín S/{c.minPurchase.toFixed(2)}
                        </span>
                      ) : null}
                      {c.expiresAt ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {new Date(c.expiresAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Sin vencimiento
                        </span>
                      )}
                    </div>

                    {/* Barra de uso si hay maxUses */}
                    {c.maxUses ? (
                      <div className="mt-2.5">
                        <div className="flex items-center justify-between text-[length:var(--ts-2xs)] mb-1">
                          <span className="font-bold text-[var(--text-tertiary)]">Usos</span>
                          <span className="tabular-nums font-bold text-[var(--text-secondary)]">{c.usedCount} / {c.maxUses}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[var(--rule-soft)] overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", usagePct >= 80 ? "bg-[var(--data-warning)]" : "bg-primary")}
                            style={{ width: `${usagePct}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] tabular-nums">{c.usedCount} usos · ilimitado</p>
                    )}
                  </div>

                  {/* Acciones */}
                  <div className="flex flex-col gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => navigator.clipboard?.writeText(c.code).catch(() => { /* clipboard best-effort */ })}
                      title="Copiar código"
                      className="p-2 rounded-lg hover:bg-primary/10 hover:text-primary transition-colors text-[var(--text-tertiary)]"
                    >
                      <Star className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => toggleActive(c.id, c.active)}
                      title={c.active ? "Desactivar" : "Activar"}
                      className="p-2 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors text-[var(--text-tertiary)]"
                    >
                      {c.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4 text-[var(--data-success)]" />}
                    </button>
                    <button
                      onClick={() => deleteCoupon(c.id)}
                      title="Eliminar"
                      className="p-2 rounded-lg hover:bg-[var(--data-error-50)] hover:text-[var(--data-error)] transition-colors text-[var(--text-tertiary)]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Modal "Nuevo cupón" — diseño dedicado con preview
// ─────────────────────────────────────────────
function NewCouponModal({
  form,
  setForm,
  saving,
  onClose,
  onCreate,
}: {
  form: ReturnType<typeof useMarketplaceCoupons>["form"];
  setForm: ReturnType<typeof useMarketplaceCoupons>["setForm"];
  saving: boolean;
  onClose: () => void;
  onCreate: () => void;
}) {
  const isPercent = form.discountType === "percent";
  const previewValue = form.discountValue
    ? isPercent
      ? `${form.discountValue}%`
      : `S/${parseFloat(form.discountValue).toFixed(2)}`
    : isPercent
    ? "10%"
    : "S/10";

  // Cerrar con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-3xl shadow-[var(--shadow-xl)] border border-[var(--rule-base)]"
        role="dialog"
        aria-modal="true"
        aria-label="Crear nuevo cupón"
      >
        {/* Header con preview del cupón */}
        <div className="relative overflow-hidden rounded-t-3xl bg-linear-to-br from-primary/15 via-primary/5 to-transparent p-6 border-b border-[var(--rule-base)]">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 h-8 w-8 inline-flex items-center justify-center rounded-full bg-white border border-[var(--rule-base)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--text-tertiary)] transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-primary mb-1">
            <Ticket className="h-3.5 w-3.5" />
            Nuevo cupón marketplace
          </div>
          <h3 className="text-xl font-extrabold text-[var(--text-primary)] tracking-tight">Configurá tu descuento</h3>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Aparecerá en el carrito de los clientes que entren al marketplace.</p>

          {/* Preview ticket */}
          <div className="mt-5 relative">
            <div className="relative inline-flex items-stretch rounded-xl bg-white border-2 border-dashed border-primary/40 overflow-hidden shadow-sm">
              <div className="flex items-center justify-center px-4 py-3 bg-primary text-white">
                <Ticket className="h-5 w-5" />
              </div>
              <div className="px-4 py-3 min-w-[180px]">
                <p className="font-mono text-xs font-bold text-[var(--text-tertiary)] tracking-wider truncate max-w-[200px]">
                  {form.code || "MICUPON10"}
                </p>
                <p className="text-2xl font-extrabold text-primary tabular-nums leading-none mt-0.5">{previewValue}</p>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-1">
                  {form.minPurchase ? `Mín S/${form.minPurchase}` : "Sin compra mínima"}
                  {form.expiresAt ? ` · Vence ${new Date(form.expiresAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}` : ""}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Form body */}
        <div className="p-6 space-y-6">
          {/* Sección 1: Identificación */}
          <section className="space-y-4">
            <header className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-extrabold">1</span>
              <h4 className="text-sm font-extrabold text-[var(--text-primary)]">Identificación</h4>
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-secondary)]">Código del cupón</label>
                <input
                  type="text"
                  placeholder="BIENVENIDO10"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/\s+/g, "") })}
                  className="w-full px-4 py-3 rounded-xl border-2 border-[var(--rule-base)] bg-white text-sm font-mono font-bold text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all uppercase tracking-wider"
                  maxLength={20}
                />
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Mayúsculas, sin espacios. Ej: BIENVENIDO10</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-secondary)]">Descripción interna</label>
                <input
                  type="text"
                  placeholder="Descuento de bienvenida"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border-2 border-[var(--rule-base)] bg-white text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
              </div>
            </div>
          </section>

          {/* Sección 2: Tipo y valor */}
          <section className="space-y-4">
            <header className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-extrabold">2</span>
              <h4 className="text-sm font-extrabold text-[var(--text-primary)]">Tipo de descuento</h4>
            </header>

            {/* Toggle tipo: percent vs fixed */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: "percent", label: "Porcentaje", hint: "Descuenta un % del total", icon: "%" },
                { value: "fixed",   label: "Monto fijo", hint: "Resta soles directos",    icon: "S/" },
              ].map((opt) => {
                const active = form.discountType === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setForm({ ...form, discountType: opt.value as "percent" | "fixed" })}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all",
                      active
                        ? "border-primary bg-primary/5"
                        : "border-[var(--rule-base)] bg-white hover:border-[var(--text-tertiary)]"
                    )}
                  >
                    <span className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg font-extrabold text-base",
                      active ? "bg-primary text-white" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                    )}>
                      {opt.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm font-bold", active ? "text-primary" : "text-[var(--text-primary)]")}>{opt.label}</p>
                      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{opt.hint}</p>
                    </div>
                    {active && <CheckCircle className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                  Valor {isPercent ? "(%)" : "(S/)"}
                </label>
                <div className="flex items-stretch rounded-xl border-2 border-[var(--rule-base)] bg-white focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary transition-all overflow-hidden">
                  <input
                    type="number"
                    placeholder={isPercent ? "10" : "5.00"}
                    value={form.discountValue}
                    onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                    min={0}
                    max={isPercent ? 100 : undefined}
                    step={isPercent ? 1 : 0.5}
                    className="flex-1 min-w-0 px-4 py-3 bg-transparent text-base font-extrabold text-[var(--text-primary)] outline-none tabular-nums"
                  />
                  <span className="inline-flex items-center px-4 text-sm font-bold text-[var(--text-tertiary)] bg-[var(--surface-sunken)] border-l-2 border-[var(--rule-base)]">
                    {isPercent ? "%" : "S/"}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-secondary)]">Compra mínima (S/)</label>
                <input
                  type="number"
                  placeholder="Sin mínimo"
                  value={form.minPurchase}
                  onChange={(e) => setForm({ ...form, minPurchase: e.target.value })}
                  min={0}
                  step={0.5}
                  className="w-full px-4 py-3 rounded-xl border-2 border-[var(--rule-base)] bg-white text-sm font-semibold text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all tabular-nums"
                />
              </div>
            </div>
          </section>

          {/* Sección 3: Límites */}
          <section className="space-y-4">
            <header className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-extrabold">3</span>
              <h4 className="text-sm font-extrabold text-[var(--text-primary)]">Límites</h4>
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-secondary)]">Usos máximos</label>
                <input
                  type="number"
                  placeholder="Ilimitado"
                  value={form.maxUses}
                  onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                  min={1}
                  className="w-full px-4 py-3 rounded-xl border-2 border-[var(--rule-base)] bg-white text-sm font-semibold text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all tabular-nums"
                />
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Vacío = sin tope de canjes</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-secondary)]">Vence el</label>
                <input
                  type="datetime-local"
                  value={form.expiresAt ? form.expiresAt.slice(0, 16) : ""}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value ? new Date(e.target.value).toISOString() : "" })}
                  className="w-full px-4 py-3 rounded-xl border-2 border-[var(--rule-base)] bg-white text-sm font-semibold text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Vacío = sin vencimiento</p>
              </div>
            </div>
          </section>
        </div>

        {/* Footer sticky */}
        <div className="sticky bottom-0 flex items-center justify-between gap-3 px-6 py-4 border-t border-[var(--rule-base)] bg-white/95 backdrop-blur rounded-b-3xl">
          <p className="text-xs text-[var(--text-tertiary)] hidden sm:block">
            Podés activar/desactivar el cupón después.
          </p>
          <div className="flex items-center gap-3 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm font-bold text-[var(--text-secondary)] border-2 border-[var(--rule-base)] hover:bg-[var(--surface-sunken)] transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={onCreate}
              disabled={saving || !form.code || !form.discountValue}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50 shadow-sm"
            >
              {saving ? (
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Ticket className="h-4 w-4" />
              )}
              {saving ? "Creando…" : "Crear cupón"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-tab: Reseñas
// ─────────────────────────────────────────────
function MarketplaceResenasTab() {
  const {
    reviews, filtered, loading, filter, setFilter,
    replyingTo, setReplyingTo, replyText, setReplyText,
    saving, pendingCount,
    handleStatusChange, handleReply,
  } = useMarketplaceReviews();

  if (loading) return <TableSkeleton />;

  // Métricas agregadas
  const total = reviews.length;
  const avg = total > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / total : 0;
  const approvedCount = reviews.filter((r) => r.status === "approved").length;
  const rejectedCount = reviews.filter((r) => r.status === "rejected").length;
  const responseRate = approvedCount > 0
    ? Math.round((reviews.filter((r) => r.status === "approved" && r.adminReply).length / approvedCount) * 100)
    : 0;

  // Distribución por estrellas (5,4,3,2,1)
  const distribution = [5, 4, 3, 2, 1].map((s) => {
    const count = reviews.filter((r) => r.rating === s).length;
    const pct = total > 0 ? (count / total) * 100 : 0;
    return { stars: s, count, pct };
  });

  // Iniciales avatar
  const initials = (name: string | null | undefined) => {
    const n = (name ?? "").trim();
    if (!n) return "?";
    return n.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
  };

  const filterMeta = {
    all: { label: "Todas", count: total },
    pending: { label: "Por moderar", count: pendingCount },
    approved: { label: "Aprobadas", count: approvedCount },
    rejected: { label: "Rechazadas", count: rejectedCount },
  } as const;

  return (
    <div className="space-y-6">
      {/* ── Hero: rating promedio + distribución ── */}
      <div className="relative overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-linear-to-br from-[var(--data-warning)]/5 via-white to-[var(--surface-sunken)] p-5 sm:p-6">
        <div className="absolute -top-20 -right-20 h-56 w-56 rounded-full bg-[var(--data-warning)]/10 blur-3xl pointer-events-none" />
        <div className="relative grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-6 items-center">
          {/* Promedio grande */}
          <div className="text-center sm:text-left sm:border-r sm:border-[var(--rule-base)] sm:pr-6">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Calificación promedio</p>
            <p className="mt-1 flex items-center gap-2 justify-center sm:justify-start">
              <span className="text-5xl font-extrabold text-[var(--text-primary)] tabular-nums leading-none">
                {avg > 0 ? avg.toFixed(1) : "—"}
              </span>
              <span className="text-base font-bold text-[var(--text-tertiary)] tabular-nums">/ 5.0</span>
            </p>
            <div className="mt-2 flex items-center gap-0.5 justify-center sm:justify-start">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={cn(
                    "h-5 w-5",
                    s <= Math.round(avg)
                      ? "fill-[var(--data-warning)] text-[var(--data-warning)]"
                      : "text-[var(--rule-base)]"
                  )}
                />
              ))}
            </div>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              <span className="font-bold text-[var(--text-primary)] tabular-nums">{total}</span> {total === 1 ? "reseña" : "reseñas"}
            </p>
          </div>

          {/* Distribución por estrellas */}
          <div className="space-y-1.5">
            {distribution.map(({ stars, count, pct }) => (
              <div key={stars} className="flex items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 w-8 font-bold text-[var(--text-secondary)] tabular-nums shrink-0">
                  {stars}
                  <Star className="h-3 w-3 fill-[var(--data-warning)] text-[var(--data-warning)]" />
                </span>
                <div className="flex-1 h-2 rounded-full bg-[var(--rule-soft)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--data-warning)] rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-8 text-right font-bold text-[var(--text-tertiary)] tabular-nums shrink-0">{count}</span>
              </div>
            ))}
          </div>

          {/* Mini stats secundarias */}
          <div className="grid grid-cols-3 sm:grid-cols-1 gap-3 sm:gap-2 sm:border-l sm:border-[var(--rule-base)] sm:pl-6 sm:min-w-[140px]">
            <div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--data-warning)]">Por moderar</p>
              <p className="text-xl font-extrabold text-[var(--text-primary)] tabular-nums">{pendingCount}</p>
            </div>
            <div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--data-success)]">Aprobadas</p>
              <p className="text-xl font-extrabold text-[var(--text-primary)] tabular-nums">{approvedCount}</p>
            </div>
            <div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-primary">Respondidas</p>
              <p className="text-xl font-extrabold text-[var(--text-primary)] tabular-nums">{responseRate}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Filtros como chips grandes ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {(["all", "pending", "approved", "rejected"] as const).map((f) => {
          const active = filter === f;
          const meta = filterMeta[f];
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "inline-flex items-center gap-2 h-10 px-4 rounded-xl border-2 text-sm font-bold transition-all",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-[var(--rule-base)] bg-white text-[var(--text-secondary)] hover:border-[var(--text-tertiary)]"
              )}
            >
              {meta.label}
              <span className={cn(
                "tabular-nums text-xs font-bold px-1.5 py-0.5 rounded-md",
                active ? "bg-primary text-white" : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
              )}>
                {meta.count}
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 px-6 rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-white">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-[var(--data-warning)]/10 text-[var(--data-warning)] mb-4">
            <Star className="h-6 w-6" />
          </div>
          <p className="text-base font-extrabold text-[var(--text-primary)]">
            {filter === "all" ? "Sin reseñas todavía" : `Sin reseñas ${filterMeta[filter].label.toLowerCase()}`}
          </p>
          <p className="text-sm text-[var(--text-secondary)] mt-1.5 max-w-sm mx-auto">
            {filter === "all"
              ? "Cuando los clientes valoren tus productos, las reseñas aparecerán acá."
              : "Probá con otro filtro para ver más resultados."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((review) => {
            const cfg = REVIEW_STATUS_CONFIG[review.status] ?? REVIEW_STATUS_CONFIG.pending;
            const isReplying = replyingTo === review.id;
            const hasReply = !!review.adminReply;
            return (
              <div
                key={review.id}
                className={cn(
                  "relative overflow-hidden rounded-2xl border-2 bg-white transition-all",
                  review.status === "pending"
                    ? "border-[var(--data-warning)]/40 hover:border-[var(--data-warning)]"
                    : review.status === "rejected"
                    ? "border-[var(--rule-base)] opacity-75"
                    : "border-[var(--rule-base)] hover:border-primary/30"
                )}
              >
                {/* Banda lateral según estado */}
                <div className={cn(
                  "absolute left-0 top-0 bottom-0 w-1.5",
                  review.status === "pending"
                    ? "bg-[var(--data-warning)]"
                    : review.status === "approved"
                    ? "bg-[var(--data-success)]"
                    : "bg-[var(--rule-base)]"
                )} />

                <div className="pl-3 p-5 space-y-4">
                  {/* Header: avatar + nombre + estrellas + estado + acciones */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {/* Avatar con iniciales */}
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-linear-to-br from-primary/20 to-primary/5 border border-primary/20 text-primary font-extrabold text-sm shrink-0">
                        {initials(review.name)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-sm text-[var(--text-primary)] truncate">
                            {review.name || "Anónimo"}
                          </span>
                          <span className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider",
                            cfg.className
                          )}>
                            {cfg.label}
                          </span>
                          {hasReply && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold text-primary bg-primary/10">
                              <MessageSquare className="h-2.5 w-2.5" /> Respondida
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={cn(
                                  "h-4 w-4",
                                  s <= review.rating
                                    ? "fill-[var(--data-warning)] text-[var(--data-warning)]"
                                    : "text-[var(--rule-base)]"
                                )}
                              />
                            ))}
                          </div>
                          <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">·</span>
                          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] tabular-nums">
                            {new Date(review.date).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {review.status !== "approved" && (
                        <button
                          onClick={() => handleStatusChange(review.id, "approved")}
                          disabled={saving === review.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--data-success)]/10 text-[var(--data-success)] text-xs font-bold hover:bg-[var(--data-success)] hover:text-white transition-colors disabled:opacity-50"
                          title="Aprobar"
                        >
                          <CheckCircle className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Aprobar</span>
                        </button>
                      )}
                      {review.status !== "rejected" && (
                        <button
                          onClick={() => handleStatusChange(review.id, "rejected")}
                          disabled={saving === review.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--data-error-50)] text-[var(--data-error)] text-xs font-bold hover:bg-[var(--data-error)] hover:text-white transition-colors disabled:opacity-50"
                          title="Rechazar"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Rechazar</span>
                        </button>
                      )}
                      <button
                        onClick={() => { setReplyingTo(isReplying ? null : review.id); setReplyText(review.adminReply ?? ""); }}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                          isReplying
                            ? "bg-primary text-white"
                            : "bg-primary/10 text-primary hover:bg-primary hover:text-white"
                        )}
                        title="Responder"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">{hasReply ? "Editar" : "Responder"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Texto de la reseña — destacado tipo cita */}
                  <blockquote className="text-sm text-[var(--text-primary)] leading-relaxed italic font-display border-l-4 border-[var(--rule-base)] pl-4">
                    “{review.text}”
                  </blockquote>

                  {/* Respuesta admin existente */}
                  {hasReply && !isReplying && (
                    <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                          <MessageSquare className="h-2.5 w-2.5" />
                        </span>
                        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-primary">Tu respuesta</p>
                      </div>
                      <p className="text-sm text-[var(--text-primary)] leading-relaxed">{review.adminReply}</p>
                    </div>
                  )}

                  {/* Reply form */}
                  {isReplying && (
                    <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                            <MessageSquare className="h-2.5 w-2.5" />
                          </span>
                          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-primary">
                            {hasReply ? "Editar respuesta" : "Nueva respuesta"}
                          </p>
                        </div>
                        <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] tabular-nums">
                          {replyText.length}/500
                        </span>
                      </div>
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Gracias por tu reseña…"
                        rows={3}
                        maxLength={500}
                        className="w-full rounded-lg border-2 border-[var(--rule-base)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none transition-all"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => { setReplyingTo(null); setReplyText(""); }}
                          className="px-3 py-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-white text-[var(--text-secondary)] text-xs font-bold hover:bg-[var(--surface-sunken)] transition-colors"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => handleReply(review.id)}
                          disabled={saving === review.id || !replyText.trim()}
                          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-colors disabled:opacity-50"
                        >
                          {saving === review.id ? (
                            <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <MessageSquare className="h-3 w-3" />
                          )}
                          {saving === review.id ? "Guardando…" : "Enviar respuesta"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────
// Orquestador principal
// ─────────────────────────────────────────────
export default function MarketplaceModule() {
  const [tab, setTab] = useState<TabId>(TABS[0].id);
  const { kpis, loading: kpisLoading, refresh: refreshKpis } = useMarketplaceKpis();

  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Marketplace"
        description="Gestiona tu tienda en la plataforma de ventas"
        icon={Store}
      >
        <button
          onClick={refreshKpis}
          className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-primary hover:bg-primary/10 transition-colors"
          title="Actualizar"
        >
          <RefreshCw className={cn("h-4 w-4", kpisLoading && "animate-spin")} />
        </button>
      </AdminModuleHeader>

      {/* KPI strip removido — Brandon decisión 2026-05-09. Los KPIs detallados
          están dentro del sub-tab "Resumen" (MarketplaceDashboardTab). */}

      <AdminTabBar
        tabs={TABS}
        activeTab={tab}
        onTabChange={(id) => setTab(id)}
        moduleId={MODULE_ID}
      >
        {tab === "resumen"     && (
          <Suspense fallback={<Spinner />}>
            <MarketplaceDashboardTab kpis={kpis} loading={kpisLoading} />
          </Suspense>
        )}
        {tab === "tienda"      && <MarketplaceTiendaTab />}
        {tab === "productos"   && <MarketplaceProductosTab />}
        {tab === "ordenes"     && <MarketplaceOrdenesTab />}
        {tab === "comisiones"  && <MarketplaceComisionesTab />}
        {tab === "precios"     && (
          <Suspense fallback={<Spinner />}>
            <CompetitivePricingTab />
          </Suspense>
        )}
        {tab === "cupones"     && <MarketplaceCuponesTab />}
        {tab === "resenas"     && <MarketplaceResenasTab />}
        {tab === "fidelidad"   && <MarketplaceFidelidadTab />}
      </AdminTabBar>
    </div>
  );
}
