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
  ChevronDown,
  TrendingUp,
  Star,
  MessageSquare,
  BarChart3,
  Ticket,
  Gift,
  ExternalLink,
  Zap,
  ArrowRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import ImageUpload from "@/components/admin/ImageUpload";

// ── Hooks de datos ──
import { useMarketplaceKpis } from "@/components/admin/marketplace/hooks/use-marketplace-kpis";
import { useMarketplaceProducts } from "@/components/admin/marketplace/hooks/use-marketplace-products";
import { useMarketplaceOrders } from "@/components/admin/marketplace/hooks/use-marketplace-orders";
import { useMarketplaceCommissions } from "@/components/admin/marketplace/hooks/use-marketplace-commissions";
import { useMarketplaceCoupons } from "@/components/admin/marketplace/hooks/use-marketplace-coupons";
import { useMarketplaceReviews } from "@/components/admin/marketplace/hooks/use-marketplace-reviews";
import { useMarketplaceTienda } from "@/components/admin/marketplace/hooks/use-marketplace-tienda";

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
  pendiente:   { label: "Pendiente",  className: "bg-[var(--data-warning-100)] text-[var(--data-warning)]" },
  confirmado:  { label: "Confirmado", className: "bg-[var(--accent-soft)] text-[var(--data-success)]" },
  en_camino:   { label: "En camino",  className: "bg-[var(--surface-sunken)] text-[var(--text-primary)]" },
  entregado:   { label: "Entregado",  className: "bg-[var(--accent-soft)] text-[var(--data-success)]" },
  cancelado:   { label: "Cancelado",  className: "bg-[var(--data-error-100)] text-[var(--data-error)]" },
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

const CATEGORIAS = [
  "Abarrotes", "Bebidas", "Lácteos", "Carnes", "Frutas y verduras",
  "Panadería", "Limpieza", "Higiene personal", "Electrónica", "Otros",
];

const ZONAS = [
  "Yarinacocha", "Callería", "Coronel Portillo", "Manantay",
  "Centro", "Ica Yanayacu", "Pueblo Libre", "Todos",
];

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

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-[var(--data-error-50)] border border-[var(--data-error)] rounded-xl text-sm text-[var(--data-error)]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="bg-white border border-[var(--rule-base)] rounded-xl p-5  space-y-5">
        <CardTitle className="font-bold text-[var(--text-primary)] text-sm">Configuración de la tienda</CardTitle>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Slug */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--text-secondary)]">
              URL de la tienda (slug)
            </label>
            <input
              type="text"
              value={store.slug}
              onChange={(e) => setStore((p) => ({ ...p, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") }))}
              placeholder="mi-bodega"
              className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
            {store.slug && (
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">marketplace.com/{store.slug}</p>
            )}
          </div>

          {/* Nombre */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--text-secondary)]">Nombre de la tienda</label>
            <input
              type="text"
              value={store.name}
              onChange={(e) => setStore((p) => ({ ...p, name: e.target.value }))}
              placeholder="Mi Bodega"
              className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
          </div>

          {/* Categoría */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--text-secondary)]">Categoría principal</label>
            <div className="relative">
              <select
                value={store.category}
                onChange={(e) => setStore((p) => ({ ...p, category: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary appearance-none transition-all"
              >
                {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
            </div>
          </div>

          {/* Zona */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--text-secondary)]">Zona de cobertura</label>
            <div className="relative">
              <select
                value={store.zone}
                onChange={(e) => setStore((p) => ({ ...p, zone: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary appearance-none transition-all"
              >
                {ZONAS.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
            </div>
          </div>

          {/* Comisión */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--text-secondary)]">Comisión acordada (%)</label>
            <input
              type="number"
              min={0}
              max={30}
              step={0.5}
              value={store.commissionRate}
              onChange={(e) => setStore((p) => ({ ...p, commissionRate: parseFloat(e.target.value) || 0 }))}
              className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
          </div>

          {/* Logo URL */}
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-bold text-[var(--text-secondary)]">Logo de la tienda</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ImageUpload
                value={store.logoUrl}
                onChange={(url) => setStore((p) => ({ ...p, logoUrl: url }))}
                onClear={() => setStore((p) => ({ ...p, logoUrl: "" }))}
                folder="marketplace-logos"
                label=""
                hint="Logo cuadrado recomendado (200×200)"
                aspectRatio="square"
              />
              <div className="flex flex-col gap-2">
                <p className="text-xs text-[var(--text-secondary)]">
                  Sube tu logo o pega una URL. Se mostrará en la tarjeta de tu tienda en el marketplace.
                </p>
                <input
                  type="url"
                  value={store.logoUrl}
                  onChange={(e) => setStore((p) => ({ ...p, logoUrl: e.target.value }))}
                  placeholder="https://... o sube una imagen"
                  className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
                {store.logoUrl && (
                  <div className="flex items-center gap-2 text-xs text-[var(--data-success)]">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Logo configurado
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Descripción */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-[var(--text-secondary)]">Descripción de la tienda</label>
          <textarea
            rows={3}
            value={store.description}
            onChange={(e) => setStore((p) => ({ ...p, description: e.target.value }))}
            placeholder="Describe tu bodega, horarios, especialidades..."
            className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none transition-all"
          />
        </div>

        {/* Estado activo */}
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-[var(--rule-base)]">
          <div>
            <p className="text-sm font-bold text-[var(--text-primary)]">Tienda activa en marketplace</p>
            <p className="text-xs text-[var(--text-secondary)]">Los clientes podrán encontrar y comprar en tu tienda</p>
          </div>
          <button
            onClick={() => setStore((p) => ({ ...p, isActive: !p.isActive }))}
            className={cn(
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
              store.isActive ? "bg-primary" : "bg-gray-300"
            )}
          >
            <span className={cn(
              "inline-block h-4 w-4 transform rounded-full bg-white  transition-transform",
              store.isActive ? "translate-x-6" : "translate-x-1"
            )} />
          </button>
        </div>

        {/* Modo vacaciones */}
        <div className="space-y-3 p-3 bg-[var(--data-warning-50)] border border-[var(--data-warning)] rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">Modo vacaciones</p>
              <p className="text-xs text-[var(--text-secondary)]">Pausa pedidos temporalmente sin despublicar tu tienda</p>
            </div>
            <button
              onClick={() => setStore((p) => ({ ...p, vacationMode: !p.vacationMode }))}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                store.vacationMode ? "bg-[var(--data-warning)]" : "bg-gray-300"
              )}
            >
              <span className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-white  transition-transform",
                store.vacationMode ? "translate-x-6" : "translate-x-1"
              )} />
            </button>
          </div>
          {store.vacationMode && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--text-secondary)]">Mensaje para tus clientes (opcional)</label>
              <input
                type="text"
                value={store.vacationMessage ?? ""}
                onChange={(e) => setStore((p) => ({ ...p, vacationMessage: e.target.value }))}
                placeholder="Ej: Volvemos el lunes 15. ¡Gracias por tu paciencia!"
                className="w-full px-3 py-2 rounded-lg border border-[var(--data-warning)] bg-white text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--data-warning)] focus:border-[var(--data-warning)] transition-all"
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          {saved && (
            <span className="text-sm text-[var(--data-success)] font-semibold flex items-center gap-1">
              <CheckCircle className="h-4 w-4" /> Guardado
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {saving ? (
              <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-tab: Productos
// ─────────────────────────────────────────────
function MarketplaceProductosTab() {
  const { products, loading, error, toggling, syncing, syncResult, load, handleSync, toggleActive } = useMarketplaceProducts();

  if (loading) return <TableSkeleton />;

  return (
    <div className="space-y-6">
      {/* Barra de acciones: Sincronizar inventario */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-[var(--text-secondary)]">
          {products.length} producto{products.length !== 1 ? "s" : ""} en marketplace
        </p>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
          {syncing ? "Sincronizando..." : "Sincronizar inventario"}
        </button>
      </div>

      {syncResult && (
        <div className="flex items-center gap-2 p-3 bg-[var(--accent-soft)] border border-[var(--data-success)]/30 rounded-xl text-sm text-[var(--data-success)]">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {syncResult}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-[var(--data-error-50)] border border-[var(--data-error)] rounded-xl text-sm text-[var(--data-error)]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={load} className="ml-auto text-xs underline">Reintentar</button>
        </div>
      )}

      {products.length === 0 && !error ? (
        <div className="text-center py-16 text-[var(--text-tertiary)]">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold">Sin productos publicados</p>
          <p className="text-xs mt-1">Activa productos desde tu catálogo para mostrarlos en el marketplace.</p>
        </div>
      ) : (
        <div className="bg-white border border-[var(--rule-base)] rounded-xl  overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-[var(--rule-base)]">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Producto</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Precio retail</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Mayorista</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Stock</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Publicado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[var(--text-primary)]">{p.name}</p>
                      <p className="text-xs text-[var(--text-tertiary)] font-mono">{p.sku}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-[var(--text-primary)]">
                      S/{p.retailPrice.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--text-secondary)]">
                      S/{p.wholesalePrice.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold",
                        p.stock > 10 ? "bg-[var(--accent-soft)] text-[var(--data-success)]"
                          : p.stock > 0 ? "bg-[var(--data-warning-100)] text-[var(--data-warning)]"
                          : "bg-[var(--data-error-100)] text-[var(--data-error)]"
                      )}>
                        {p.stock}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleActive(p)}
                        disabled={toggling === p.id}
                        title={p.isActive ? "Despublicar del marketplace" : "Publicar en marketplace"}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors min-w-25 justify-center",
                          p.isActive
                            ? "bg-[var(--accent-soft)] text-[var(--data-success)] hover:bg-[var(--accent-soft)]"
                            : "bg-gray-100 text-[var(--text-secondary)] hover:bg-gray-200"
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-tab: Órdenes
// ─────────────────────────────────────────────
function MarketplaceOrdenesTab() {
  const { orders, loading, error, load } = useMarketplaceOrders();

  if (loading) return <TableSkeleton />;

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-[var(--data-error-50)] border border-[var(--data-error)] rounded-xl text-sm text-[var(--data-error)]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={load} className="ml-auto text-xs underline">Reintentar</button>
        </div>
      )}

      {orders.length === 0 && !error ? (
        <div className="text-center py-16 text-[var(--text-tertiary)]">
          <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold">Sin órdenes del marketplace aún</p>
          <p className="text-xs mt-1">Las órdenes recibidas desde el marketplace aparecerán aquí.</p>
        </div>
      ) : (
        <div className="bg-white border border-[var(--rule-base)] rounded-xl  overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-[var(--rule-base)]">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Orden</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Cliente</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Total</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Estado</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((o) => {
                  const statusConfig = ORDER_STATUS_CONFIG[o.status] ?? {
                    label: o.status,
                    className: "bg-gray-100 text-[var(--text-secondary)]",
                  };
                  return (
                    <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-bold text-[var(--text-primary)]">
                          #{o.id.slice(-8).toUpperCase()}
                        </p>
                        <p className="text-xs text-[var(--text-tertiary)]">{o.itemsCount} producto{o.itemsCount !== 1 ? "s" : ""}</p>
                      </td>
                      <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">{o.customerName}</td>
                      <td className="px-4 py-3 text-right font-bold text-[var(--text-primary)]">S/{o.total.toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("inline-flex px-2.5 py-1 rounded-full text-xs font-bold", statusConfig.className)}>
                          {statusConfig.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-[var(--text-secondary)]">
                        {new Date(o.createdAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}
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

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-[var(--data-error-50)] border border-[var(--data-error)] rounded-xl text-sm text-[var(--data-error)]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={load} className="ml-auto text-xs underline">Reintentar</button>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { key: "pendiente", label: "Por pagar", color: "text-[var(--data-warning)]", bg: "bg-[var(--data-warning-50)]" },
          { key: "liquidado", label: "Liquidado",  color: "text-[var(--data-success)]",  bg: "bg-[var(--accent-soft)]" },
          { key: "pagado",    label: "Pagado",     color: "text-[var(--data-success)]", bg: "bg-[var(--accent-soft)]" },
        ].map(({ key, label, color, bg }) => (
          <div key={key} className={cn("rounded-xl p-4 border border-[var(--rule-base)] ", bg)}>
            <p className="text-xs font-bold text-[var(--text-secondary)]">{label}</p>
            <p className={cn("text-2xl font-extrabold mt-1", color)}>
              S/{(summary[key as keyof typeof summary] || 0).toFixed(2)}
            </p>
          </div>
        ))}
      </div>

      {/* Filters + Bulk actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-secondary)]">Filtrar:</span>
          {[
            { value: "all", label: "Todos" },
            { value: "pendiente", label: "Pendiente" },
            { value: "liquidado", label: "Liquidado" },
            { value: "pagado", label: "Pagado" },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => setFilterStatus(f.value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                filterStatus === f.value
                  ? "bg-primary text-white"
                  : "bg-gray-100 text-[var(--text-secondary)] hover:bg-gray-200"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {summary.liquidado > 0 && (
          <button
            onClick={handleBulkPay}
            disabled={markingPaid === "bulk"}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-soft)] text-white text-xs font-bold hover:bg-[var(--accent-soft)] transition-colors disabled:opacity-50"
          >
            <DollarSign className="h-3.5 w-3.5" />
            {markingPaid === "bulk" ? "Procesando..." : `Pagar todo liquidado (S/${summary.liquidado.toFixed(2)})`}
          </button>
        )}
      </div>

      {filtered.length === 0 && !error ? (
        <div className="text-center py-16 text-[var(--text-tertiary)]">
          <DollarSign className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold">Sin comisiones {filterStatus !== "all" ? `en estado "${filterStatus}"` : "registradas aún"}</p>
        </div>
      ) : (
        <div className="bg-white border border-[var(--rule-base)] rounded-xl  overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-[var(--rule-base)]">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Orden</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Total orden</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Comisión</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Estado</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Fecha</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((e) => {
                  const sc = COMMISSION_STATUS_CONFIG[e.status] ?? COMMISSION_STATUS_CONFIG.pendiente;
                  const StatusIcon = sc.icon;
                  return (
                    <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-bold text-[var(--text-primary)]">
                          #{e.orderId.slice(-8).toUpperCase()}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--text-secondary)]">S/{e.orderTotal.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-bold text-[var(--text-primary)]">S/{e.amount.toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold", sc.className)}>
                          <StatusIcon className="h-3 w-3" />
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-[var(--text-secondary)]">
                        {new Date(e.createdAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {e.status !== "pagado" && (
                          <button
                            onClick={() => handleMarkPaid(e.id)}
                            disabled={markingPaid === e.id}
                            className="px-2.5 py-1 rounded-lg bg-[var(--accent-soft)] text-[var(--data-success)] text-xs font-bold hover:bg-[var(--accent-soft)] transition-colors disabled:opacity-50"
                          >
                            {markingPaid === e.id ? "..." : "Marcar pagado"}
                          </button>
                        )}
                        {e.status === "pagado" && (
                          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Pagado</span>
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

  if (loading) return <TableSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--text-secondary)]">{coupons.length} cupón(es)</p>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:opacity-90 transition"
        >
          + Nuevo Cupón
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-50 border border-[var(--rule-base)] rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Código</label>
              <input
                type="text"
                placeholder="BIENVENIDO10"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Tipo</label>
              <select
                value={form.discountType}
                onChange={(e) => setForm({ ...form, discountType: e.target.value as "percent" | "fixed" })}
                className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="percent">Porcentaje (%)</option>
                <option value="fixed">Monto fijo (S/)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">
                Valor {form.discountType === "percent" ? "(%)" : "(S/)"}
              </label>
              <input
                type="number"
                placeholder="10"
                value={form.discountValue}
                onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Compra mínima (S/)</label>
              <input
                type="number"
                placeholder="Opcional"
                value={form.minPurchase}
                onChange={(e) => setForm({ ...form, minPurchase: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Usos máximos</label>
              <input
                type="number"
                placeholder="Ilimitado"
                value={form.maxUses}
                onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Descripción</label>
              <input
                type="text"
                placeholder="Descuento de bienvenida"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Vence el</label>
              <input
                type="datetime-local"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value ? new Date(e.target.value).toISOString() : "" })}
                className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] border border-[var(--rule-base)] hover:bg-gray-100 transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreate}
              disabled={saving || !form.code || !form.discountValue}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:opacity-90 transition disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Crear Cupón"}
            </button>
          </div>
        </div>
      )}

      {coupons.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-tertiary)]">
          <Ticket className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No hay cupones todavía</p>
          <p className="text-xs mt-1">Crea un cupón para atraer más clientes al marketplace.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {coupons.map((c) => (
            <div
              key={c.id}
              className={cn(
                "flex items-center justify-between bg-white border rounded-xl p-3 ",
                !c.active && "opacity-60"
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-sm text-primary">{c.code}</span>
                  <span className={cn(
                    "text-[length:var(--ts-2xs)] font-semibold px-2 py-0.5 rounded-full",
                    c.active ? "bg-[var(--accent-soft)] text-[var(--data-success)]" : "bg-gray-200 text-[var(--text-secondary)]"
                  )}>
                    {c.active ? "Activo" : "Inactivo"}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {c.discountType === "percent" ? `${c.discountValue}%` : `S/${c.discountValue.toFixed(2)}`} de descuento
                  {c.minPurchase ? ` · Mín S/${c.minPurchase.toFixed(2)}` : ""}
                  {c.maxUses ? ` · ${c.usedCount}/${c.maxUses} usos` : ` · ${c.usedCount} usos`}
                  {c.expiresAt ? ` · Vence ${new Date(c.expiresAt).toLocaleDateString("es-PE")}` : ""}
                </p>
                {c.description && <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{c.description}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                <button
                  onClick={() => toggleActive(c.id, c.active)}
                  title={c.active ? "Desactivar" : "Activar"}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition"
                >
                  {c.active ? <EyeOff className="h-4 w-4 text-[var(--text-tertiary)]" /> : <Eye className="h-4 w-4 text-[var(--data-success)]" />}
                </button>
                <button
                  onClick={() => deleteCoupon(c.id)}
                  title="Eliminar"
                  className="p-1.5 rounded-lg hover:bg-[var(--data-error-50)] transition"
                >
                  <X className="h-4 w-4 text-[var(--data-error)]" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
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

  return (
    <div className="space-y-6">
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-[var(--rule-base)] rounded-xl p-3 text-center">
          <p className="text-2xl font-extrabold text-primary">{reviews.length}</p>
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)] mt-0.5">Total reseñas</p>
        </div>
        <div className="bg-white border border-[var(--rule-base)] rounded-xl p-3 text-center">
          <p className="text-2xl font-extrabold text-[var(--data-warning)]">{pendingCount}</p>
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)] mt-0.5">Por moderar</p>
        </div>
        <div className="bg-white border border-[var(--rule-base)] rounded-xl p-3 text-center">
          <p className="text-2xl font-extrabold text-[var(--data-success)]">
            {reviews.length > 0
              ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
              : "—"}
          </p>
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)] mt-0.5">Promedio ★</p>
        </div>
      </div>

      {/* Filter buttons */}
      <div className="flex flex-wrap gap-2">
        {(["all", "pending", "approved", "rejected"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
              filter === f
                ? "bg-primary text-white"
                : "bg-gray-100 text-[var(--text-secondary)] hover:bg-gray-200"
            )}
          >
            {f === "all" ? `Todas (${reviews.length})` :
             f === "pending" ? `Pendientes (${pendingCount})` :
             f === "approved" ? `Aprobadas (${reviews.filter((r) => r.status === "approved").length})` :
             `Rechazadas (${reviews.filter((r) => r.status === "rejected").length})`}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-8 text-[var(--text-tertiary)]">
          <Star className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No hay reseñas {filter !== "all" ? "con este filtro" : "todavía"}</p>
        </div>
      )}

      {/* Review list */}
      <div className="space-y-3">
        {filtered.map((review) => {
          const cfg = REVIEW_STATUS_CONFIG[review.status] ?? REVIEW_STATUS_CONFIG.pending;
          return (
            <div key={review.id} className="bg-white border border-[var(--rule-base)] rounded-xl p-4 space-y-3">
              {/* Header: name, stars, status badge */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-[var(--text-primary)] truncate">{review.name || "Anónimo"}</span>
                    <span className={cn("px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold", cfg.className)}>
                      {cfg.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={cn("h-3.5 w-3.5", s <= review.rating ? "fill-[var(--data-warning)] text-[var(--data-warning)]" : "text-gray-200")}
                      />
                    ))}
                    <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] ml-1">
                      {new Date(review.date).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </div>
                </div>
                {/* Action buttons */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {review.status !== "approved" && (
                    <button
                      onClick={() => handleStatusChange(review.id, "approved")}
                      disabled={saving === review.id}
                      className="p-1.5 rounded-lg bg-[var(--accent-soft)] text-[var(--data-success)] hover:bg-[var(--accent-soft)] transition-colors"
                      title="Aprobar"
                    >
                      <CheckCircle className="h-4 w-4" />
                    </button>
                  )}
                  {review.status !== "rejected" && (
                    <button
                      onClick={() => handleStatusChange(review.id, "rejected")}
                      disabled={saving === review.id}
                      className="p-1.5 rounded-lg bg-[var(--data-error-50)] text-[var(--data-error)] hover:bg-[var(--data-error-100)] transition-colors"
                      title="Rechazar"
                    >
                      <XCircle className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => { setReplyingTo(replyingTo === review.id ? null : review.id); setReplyText(review.adminReply ?? ""); }}
                    className={cn(
                      "p-1.5 rounded-lg transition-colors",
                      replyingTo === review.id ? "bg-primary/20 text-primary" : "bg-gray-50 text-[var(--text-tertiary)] hover:bg-gray-100"
                    )}
                    title="Responder"
                  >
                    <MessageSquare className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Review text */}
              <p className="text-sm text-[var(--text-primary)] leading-relaxed">{review.text}</p>

              {/* Existing admin reply */}
              {review.adminReply && replyingTo !== review.id && (
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
                  <p className="text-[length:var(--ts-2xs)] font-bold text-primary mb-1">Tu respuesta:</p>
                  <p className="text-xs text-[var(--text-primary)]">{review.adminReply}</p>
                </div>
              )}

              {/* Reply form */}
              {replyingTo === review.id && (
                <div className="space-y-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Escribe tu respuesta al cliente..."
                    rows={2}
                    className="w-full rounded-lg border border-[var(--rule-base)] px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleReply(review.id)}
                      disabled={saving === review.id || !replyText.trim()}
                      className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-colors disabled:opacity-50"
                    >
                      {saving === review.id ? "Guardando..." : "Enviar respuesta"}
                    </button>
                    <button
                      onClick={() => { setReplyingTo(null); setReplyText(""); }}
                      className="px-3 py-1.5 rounded-lg bg-gray-100 text-[var(--text-secondary)] text-xs font-bold hover:bg-gray-200 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-tab: Fidelidad
// ─────────────────────────────────────────────
interface LoyaltyTransaction {
  id: string;
  type: string;
  points: number;
  description: string;
  createdAt: string;
}

interface LoyaltyData {
  name: string;
  phone: string;
  points: number;
  tier: string;
  totalSpent: number;
  transactions: LoyaltyTransaction[];
}

function MarketplaceFidelidadTab() {
  const [phone, setPhone] = useState("");
  const [data, setData] = useState<LoyaltyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [earnPoints, setEarnPoints] = useState("");
  const [saving, setSaving] = useState(false);

  const searchCustomer = async () => {
    if (!phone.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/marketplace/loyalty?phone=${encodeURIComponent(phone.trim())}`);
      if (res.ok) {
        const d = await res.json();
        setData(d.data);
      } else {
        setData(null);
      }
    } catch {}
    setLoading(false);
  };

  const handleEarn = async () => {
    if (!data || !earnPoints) return;
    setSaving(true);
    try {
      const res = await fetch("/api/marketplace/loyalty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "earn",
          phone: data.phone,
          points: Number(earnPoints),
          description: "Puntos asignados manualmente",
        }),
      });
      if (res.ok) {
        setEarnPoints("");
        searchCustomer();
      }
    } catch {}
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      {/* Info cards */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {Object.entries(TIER_CONFIG).map(([key, cfg]) => (
          <div key={key} className={cn("rounded-xl p-2 text-xs font-semibold", cfg.className)}>
            <p className="text-sm">{cfg.label}</p>
            <p className="text-[length:var(--ts-2xs)] font-normal mt-0.5">{cfg.minPoints} pts</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Teléfono del cliente (ej: 961234567)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && searchCustomer()}
          className="flex-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
        />
        <button
          onClick={searchCustomer}
          disabled={loading}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:opacity-90 transition disabled:opacity-50"
        >
          {loading ? "Buscando…" : "Buscar"}
        </button>
      </div>

      {data && (
        <div className="bg-white border border-[var(--rule-base)] rounded-xl p-4 space-y-4">
          {/* Customer info */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">{data.name}</p>
              <p className="text-xs text-[var(--text-secondary)]">{data.phone}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-extrabold text-primary">{data.points}</p>
              <span className={cn("text-[length:var(--ts-2xs)] font-semibold px-2 py-0.5 rounded-full", TIER_CONFIG[data.tier]?.className ?? "bg-gray-100 text-[var(--text-secondary)]")}>
                {TIER_CONFIG[data.tier]?.label ?? data.tier}
              </span>
            </div>
          </div>

          <p className="text-xs text-[var(--text-tertiary)]">Gasto total: S/{data.totalSpent.toFixed(2)}</p>

          {/* Manual earn */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Asignar puntos</label>
              <input
                type="number"
                placeholder="100"
                value={earnPoints}
                onChange={(e) => setEarnPoints(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <button
              onClick={handleEarn}
              disabled={saving || !earnPoints}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-[var(--accent-soft)] text-white hover:opacity-90 transition disabled:opacity-50"
            >
              {saving ? "…" : "+ Dar puntos"}
            </button>
          </div>

          {/* Transaction history */}
          {data.transactions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Historial reciente</p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {data.transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between text-xs py-1 border-b border-[var(--rule-soft)] last:border-0">
                    <div>
                      <span className={tx.type === "earn" ? "text-[var(--data-success)] font-semibold" : "text-[var(--data-error)] font-semibold"}>
                        {tx.points > 0 ? "+" : ""}{tx.points} pts
                      </span>
                      <span className="text-[var(--text-tertiary)] ml-2">{tx.description}</span>
                    </div>
                    <span className="text-[var(--text-tertiary)] text-[length:var(--ts-2xs)]">
                      {new Date(tx.createdAt).toLocaleDateString("es-PE")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!data && !loading && (
        <div className="text-center py-12 text-[var(--text-tertiary)]">
          <Gift className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Programa de Fidelidad</p>
          <p className="text-xs mt-1">Busca un cliente por teléfono para ver y gestionar sus puntos.</p>
          <div className="mt-4 bg-gray-50 rounded-xl p-3 text-left max-w-xs mx-auto">
            <p className="text-xs font-semibold text-[var(--text-secondary)] mb-1">Reglas de puntos:</p>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">• 1 punto por cada S/1 de compra</p>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">• 500 pts = Nivel Plata (5% descuento)</p>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">• 1000 pts = Nivel Oro (10% descuento)</p>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">• 100 pts = S/1 de descuento al canjear</p>
          </div>
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

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Productos publicados", value: kpis.publishedProducts, color: "text-primary" },
          { label: "Órdenes del mes",      value: kpis.monthOrders,       color: "text-[var(--data-success)]" },
          { label: "Comisiones pendientes",value: `S/${kpis.pendingCommissions.toFixed(2)}`, color: "text-[var(--data-warning)]" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="bg-white border border-[var(--rule-base)] rounded-xl p-3 sm:p-4  text-center"
          >
            {kpisLoading ? (
              <div className="h-7 w-16 mx-auto bg-gray-200 rounded animate-pulse" />
            ) : (
              <p className={cn("text-2xl font-extrabold", color)}>{value}</p>
            )}
            <p className="text-[length:var(--ts-2xs)] sm:text-xs text-[var(--text-secondary)] mt-0.5 leading-tight">{label}</p>
          </div>
        ))}
      </div>

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
