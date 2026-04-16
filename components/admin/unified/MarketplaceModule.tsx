"use client";

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
  LayoutGrid,
  TrendingUp,
  Star,
  MessageSquare,
  BarChart3,
  Ticket,
  Gift,
  ExternalLink,
  Zap,
  ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import ImageUpload from "@/components/admin/ImageUpload";

// Dynamic import del dashboard multi-tienda (sólo para planes Business/Enterprise)
const MultiStoreDashboard = lazy(() => import("@/components/admin/MultiStoreDashboard"));
// Dynamic import del tab de precios competitivos
const CompetitivePricingTab = lazy(() => import("@/components/admin/CompetitivePricingTab"));

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

// ── Types ──
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

interface MarketplaceProduct {
  id: string;
  name: string;
  isActive: boolean;
  retailPrice: number;
  wholesalePrice: number;
  stock: number;
  sku: string;
}

interface MarketplaceOrder {
  id: string;
  customerName: string;
  total: number;
  status: string;
  createdAt: string;
  itemsCount: number;
}

interface CommissionEntry {
  id: string;
  orderId: string;
  amount: number;
  status: "pendiente" | "liquidado" | "pagado";
  createdAt: string;
  orderTotal: number;
}

interface CommissionSummary {
  pendiente: number;
  liquidado: number;
  pagado: number;
}

// ── Status badge helpers ──
const ORDER_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pendiente:   { label: "Pendiente",  className: "bg-amber-100 text-amber-700" },
  confirmado:  { label: "Confirmado", className: "bg-emerald-100 text-emerald-700" },
  en_camino:   { label: "En camino",  className: "bg-purple-100 text-purple-700" },
  entregado:   { label: "Entregado",  className: "bg-emerald-100 text-emerald-700" },
  cancelado:   { label: "Cancelado",  className: "bg-red-100 text-red-600" },
};

const COMMISSION_STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  pendiente:  { label: "Pendiente",  className: "bg-amber-100 text-amber-700",     icon: Clock },
  liquidado:  { label: "Liquidado",  className: "bg-emerald-100 text-emerald-700",         icon: CheckCircle },
  pagado:     { label: "Pagado",     className: "bg-emerald-100 text-emerald-700", icon: CheckCircle },
};

const MODULE_ID = "marketplace";

const TABS = [
  { id: "tienda",       label: "Mi Tienda Personal",    icon: Store },
  { id: "productos",    label: "Productos",    icon: Package },
  { id: "ordenes",      label: "Órdenes",      icon: ShoppingCart },
  { id: "comisiones",   label: "Comisiones",   icon: DollarSign },
  { id: "precios",      label: "Precios",      icon: TrendingUp },
  { id: "cupones",      label: "Cupones",      icon: Ticket },
  { id: "resenas",      label: "Reseñas",      icon: Star },
  { id: "fidelidad",    label: "Fidelidad",    icon: Gift },
  { id: "multitienda",  label: "Multi-tienda", icon: LayoutGrid },
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
// Sub-tab: Dashboard
// ─────────────────────────────────────────────

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
      .catch(() => {});
  }, []);

  if (!data) return null;

  const fmtS = (n: number) => `S/${n.toFixed(2)}`;

  return (
    <div className="space-y-4 mb-6">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h3 className="text-sm font-bold text-gray-900">Resumen del Marketplace</h3>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">Admin</span>
      </div>

      {/* KPIs globales */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Tiendas activas", value: `${data.stores.active}/${data.stores.total}`, sub: data.stores.pending > 0 ? `${data.stores.pending} por aprobar` : "Todas aprobadas", color: "text-primary" },
          { label: "Pedidos hoy", value: String(data.today.orders), sub: fmtS(data.today.revenue), color: "text-emerald-600" },
          { label: "Ventas del mes", value: fmtS(data.month.revenue), sub: data.month.revenueGrowth !== 0 ? `${data.month.revenueGrowth > 0 ? "+" : ""}${data.month.revenueGrowth}% vs anterior` : "—", color: "text-purple-600" },
          { label: "Comisiones del mes", value: fmtS(data.commissions.month), sub: `${data.month.orders} órdenes`, color: "text-amber-600" },
          { label: "Pedidos pendientes", value: String(data.pendingOrders), sub: data.pendingOrders > 0 ? "¡Requieren atención!" : "Todo al día", color: data.pendingOrders > 0 ? "text-red-600" : "text-emerald-600" },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-xl p-3 ">
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">{label}</p>
            <p className="text-[9px] text-gray-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Top tiendas + Últimos pedidos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 ">
          <h4 className="text-xs font-bold text-gray-700 mb-3">Top tiendas este mes</h4>
          {data.topStores.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-3">Sin datos</p>
          ) : (
            <div className="space-y-2.5">
              {data.topStores.map((s, i) => (
                <div key={s.slug || i} className="flex items-center gap-3">
                  <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-extrabold shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{s.name}</p>
                    <p className="text-[10px] text-gray-400">{s.orders} pedido(s)</p>
                  </div>
                  <span className="text-xs font-bold text-emerald-600 shrink-0">{fmtS(s.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 ">
          <h4 className="text-xs font-bold text-gray-700 mb-3">Últimos pedidos marketplace</h4>
          {data.recentOrders.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-3">Sin pedidos</p>
          ) : (
            <div className="space-y-2.5">
              {data.recentOrders.slice(0, 5).map((o) => {
                const cfg = ORDER_STATUS_CONFIG[o.status] ?? ORDER_STATUS_CONFIG.pendiente;
                return (
                  <div key={o.id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{o.customerName}</p>
                      <p className="text-[10px] text-gray-400">{o.storeName}</p>
                    </div>
                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold", cfg.className)}>
                      {cfg.label}
                    </span>
                    <span className="text-xs font-bold text-gray-700 shrink-0">{fmtS(o.total)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="border-b border-gray-200" />
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-tab: Dashboard (Vendor)
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

function DashboardTab() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);


void DashboardTab;
  useEffect(() => {
    setLoading(true);
    fetch("/api/marketplace/analytics")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d as AnalyticsData); })
      .catch(() => {})
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
    <div className="text-center py-12 text-gray-400">
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
          { label: "Este mes", value: fmtS(data.month.revenue), sub: `${data.month.orders} pedido(s)`, color: "text-emerald-600" },
          { label: "Ticket promedio", value: fmtS(data.month.avgTicket), sub: data.month.revenueGrowth !== 0 ? `${data.month.revenueGrowth > 0 ? "+" : ""}${data.month.revenueGrowth}% vs mes anterior` : "Sin comparación", color: "text-purple-600" },
          { label: "Reseñas", value: `★ ${data.store.rating.toFixed(1)}`, sub: `${data.store.reviewCount} opiniones`, color: "text-amber-500" },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4 ">
            <p className={cn("text-xl sm:text-2xl font-extrabold", color)}>{value}</p>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 leading-tight">{label}</p>
            <p className="text-[9px] text-gray-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Resumen todos los canales (Marketplace + Directa + POS) ── */}
      {data.allChannels && (data.allChannels.today.orders > data.today.orders || data.allChannels.month.orders > data.month.orders) && (
        <div className="bg-linear-to-r from-primary/5 to-emerald-50 border border-primary/20 rounded-xl p-4 ">
          <h3 className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5">
            <Store className="h-3.5 w-3.5 text-primary" />
            Resumen total (todos los canales)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <p className="text-lg font-extrabold text-primary">{fmtS(data.allChannels.today.revenue)}</p>
              <p className="text-[10px] text-gray-500">Hoy (total)</p>
            </div>
            <div>
              <p className="text-lg font-extrabold text-emerald-600">{data.allChannels.today.orders}</p>
              <p className="text-[10px] text-gray-500">Pedidos hoy (total)</p>
            </div>
            <div>
              <p className="text-lg font-extrabold text-purple-600">{fmtS(data.allChannels.month.revenue)}</p>
              <p className="text-[10px] text-gray-500">Este mes (total)</p>
            </div>
            <div>
              <p className="text-lg font-extrabold text-amber-600">{data.allChannels.month.orders}</p>
              <p className="text-[10px] text-gray-500">Pedidos mes (total)</p>
            </div>
          </div>
          <p className="text-[9px] text-gray-400 mt-2">Incluye ventas directas, POS y marketplace.</p>
        </div>
      )}

      {/* ── Alertas rápidas ── */}
      {(data.products.lowStock > 0 || data.pendingReviews > 0) && (
        <div className="flex flex-wrap gap-2">
          {data.products.lowStock > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-semibold">
              <AlertCircle className="h-3.5 w-3.5" />
              {data.products.lowStock} producto(s) con stock bajo
            </div>
          )}
          {data.pendingReviews > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold">
              <MessageSquare className="h-3.5 w-3.5" />
              {data.pendingReviews} reseña(s) por moderar
            </div>
          )}
        </div>
      )}

      {/* ── Acciones rápidas del vendedor ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 ">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-gray-800">Qué hacer ahora</h3>
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
                ? "border-amber-200 bg-amber-50 hover:bg-amber-100"
                : "border-gray-200 bg-gray-50 hover:bg-gray-100"
            )}
          >
            <div className={cn(
              "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
              (data.pendingOrders ?? 0) > 0 ? "bg-amber-200 text-amber-700" : "bg-gray-200 text-gray-500"
            )}>
              <ShoppingCart className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900">
                {(data.pendingOrders ?? 0) > 0
                  ? `${data.pendingOrders} pedido(s) por confirmar`
                  : "Sin pedidos pendientes"}
              </p>
              <p className="text-[10px] text-gray-500 flex items-center gap-1">
                Ir a órdenes <ArrowRight className="h-3 w-3" />
              </p>
            </div>
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
                ? "border-red-200 bg-red-50 hover:bg-red-100"
                : "border-gray-200 bg-gray-50 hover:bg-gray-100"
            )}
          >
            <div className={cn(
              "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
              data.products.lowStock > 0 ? "bg-red-200 text-red-700" : "bg-gray-200 text-gray-500"
            )}>
              <Package className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900">
                {data.products.lowStock > 0
                  ? `${data.products.lowStock} producto(s) stock bajo`
                  : "Stock OK"}
              </p>
              <p className="text-[10px] text-gray-500 flex items-center gap-1">
                Ver productos <ArrowRight className="h-3 w-3" />
              </p>
            </div>
          </button>

          {/* Ver mi tienda */}
          <a
            href={data.store.slug ? `/marketplace/${data.store.slug}` : "/marketplace"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5 text-left transition-all hover:shadow-sm hover:bg-primary/10"
          >
            <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-primary/20 text-primary">
              <ExternalLink className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900">Ver mi tienda</p>
              <p className="text-[10px] text-gray-500 flex items-center gap-1">
                Abrir en marketplace <ArrowRight className="h-3 w-3" />
              </p>
            </div>
          </a>

          {/* Ir al Marketplace */}
          <a
            href="/marketplace"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-lg border border-purple-200 bg-purple-50 text-left transition-all hover:shadow-sm hover:bg-purple-100"
          >
            <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-purple-200 text-purple-600">
              <Store className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900">Ir al Marketplace</p>
              <p className="text-[10px] text-gray-500 flex items-center gap-1">
                Ver todas las tiendas <ArrowRight className="h-3 w-3" />
              </p>
            </div>
          </a>
        </div>
      </div>

      {/* ── Gráfico de ventas 7 días (barras simples CSS) ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 ">
        <h3 className="text-sm font-bold text-gray-800 mb-3">Ventas últimos 7 días</h3>
        <div className="flex items-end gap-1.5 h-32">
          {data.dailySales.map((day) => {
            const pct = maxRevenue > 0 ? (day.revenue / maxRevenue) * 100 : 0;
            const dayLabel = new Date(day.date + "T12:00:00").toLocaleDateString("es-PE", { weekday: "short" });
            return (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full relative" style={{ height: "96px" }}>
                  <div
                    className="absolute bottom-0 w-full rounded-t-lg bg-primary transition-all duration-500"
                    style={{ height: `${Math.max(pct, 4)}%` }}
                    title={`${fmtS(day.revenue)} — ${day.orders} pedido(s)`}
                  />
                </div>
                <span className="text-[9px] text-gray-400 capitalize">{dayLabel}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* ── Top productos ── */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 ">
          <h3 className="text-sm font-bold text-gray-800 mb-3">Top 5 productos del mes</h3>
          {data.topProducts.length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">Sin ventas este mes</p>
          ) : (
            <div className="space-y-2.5">
              {data.topProducts.map((p, i) => (
                <div key={p.name} className="flex items-center gap-3">
                  <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-extrabold shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{p.name}</p>
                    <p className="text-[10px] text-gray-400">{p.qty} vendido(s)</p>
                  </div>
                  <span className="text-xs font-bold text-emerald-600 shrink-0">{fmtS(p.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Últimos pedidos ── */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 ">
          <h3 className="text-sm font-bold text-gray-800 mb-3">Últimos pedidos</h3>
          {data.recentOrders.length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">Sin pedidos aún</p>
          ) : (
            <div className="space-y-2.5">
              {data.recentOrders.map((o) => {
                const cfg = ORDER_STATUS_CONFIG[o.status] ?? ORDER_STATUS_CONFIG.pendiente;
                return (
                  <div key={o.id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{o.customerName}</p>
                      <p className="text-[10px] text-gray-400">
                        {o.itemsCount} producto(s) · {new Date(o.createdAt).toLocaleDateString("es-PE", { day: "numeric", month: "short" })}
                      </p>
                    </div>
                    {o.status === "pendiente" ? (
                      <button
                        onClick={() => handleQuickConfirm(o.id)}
                        disabled={confirmingId === o.id}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary text-white text-[10px] font-bold hover:bg-[#009B8D] transition-colors disabled:opacity-50 shrink-0"
                      >
                        <CheckCircle className="h-3 w-3" />
                        {confirmingId === o.id ? "..." : "Confirmar"}
                      </button>
                    ) : (
                      <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold", cfg.className)}>
                        {cfg.label}
                      </span>
                    )}
                    <span className="text-xs font-bold text-gray-700 shrink-0">{fmtS(o.total)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Inventario rápido ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-3 text-center ">
          <p className="text-xl font-extrabold text-primary">{data.products.published}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">Publicados</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3 text-center ">
          <p className="text-xl font-extrabold text-gray-600">{data.products.total}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">Total productos</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3 text-center ">
          <p className={cn("text-xl font-extrabold", data.products.lowStock > 0 ? "text-amber-600" : "text-emerald-600")}>
            {data.products.lowStock}
          </p>
          <p className="text-[10px] text-gray-500 mt-0.5">Stock bajo</p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-tab: Mi Tienda Personal
// ─────────────────────────────────────────────
function TiendaTab() {
  const [store, setStore] = useState<StoreData>({
    slug: "", name: "", description: "", logoUrl: "",
    category: "Abarrotes", zone: "Centro", commissionRate: 5, isActive: false,
  });
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [saved, setSaved]       = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch("/api/marketplace/stores?my=true")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && (d.slug || d.name)) setStore(d as StoreData);
      })
      .catch(() => setError("Error al cargar datos de la tienda."))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!store.name?.trim()) {
      setError("El nombre de la tienda es obligatorio.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/marketplace/stores", {
        method: store.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(store),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Error al guardar");
      }
      const data = await res.json();
      setStore(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar la tienda. Intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-5  space-y-5">
        <h3 className="font-bold text-gray-900 text-sm">Configuración de la tienda</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Slug */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-600">
              URL de la tienda (slug)
            </label>
            <input
              type="text"
              value={store.slug}
              onChange={(e) => setStore((p) => ({ ...p, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") }))}
              placeholder="mi-bodega"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
            {store.slug && (
              <p className="text-[10px] text-gray-400">marketplace.com/{store.slug}</p>
            )}
          </div>

          {/* Nombre */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-600">Nombre de la tienda</label>
            <input
              type="text"
              value={store.name}
              onChange={(e) => setStore((p) => ({ ...p, name: e.target.value }))}
              placeholder="Mi Bodega"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
          </div>

          {/* Categoría */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-600">Categoría principal</label>
            <div className="relative">
              <select
                value={store.category}
                onChange={(e) => setStore((p) => ({ ...p, category: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary appearance-none transition-all"
              >
                {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Zona */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-600">Zona de cobertura</label>
            <div className="relative">
              <select
                value={store.zone}
                onChange={(e) => setStore((p) => ({ ...p, zone: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary appearance-none transition-all"
              >
                {ZONAS.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Comisión */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-600">Comisión acordada (%)</label>
            <input
              type="number"
              min={0}
              max={30}
              step={0.5}
              value={store.commissionRate}
              onChange={(e) => setStore((p) => ({ ...p, commissionRate: parseFloat(e.target.value) || 0 }))}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
          </div>

          {/* Logo URL */}
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-bold text-gray-600">Logo de la tienda</label>
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
                <p className="text-xs text-gray-500">
                  Sube tu logo o pega una URL. Se mostrará en la tarjeta de tu tienda en el marketplace.
                </p>
                <input
                  type="url"
                  value={store.logoUrl}
                  onChange={(e) => setStore((p) => ({ ...p, logoUrl: e.target.value }))}
                  placeholder="https://... o sube una imagen"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
                {store.logoUrl && (
                  <div className="flex items-center gap-2 text-xs text-green-600">
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
          <label className="text-xs font-bold text-gray-600">Descripción de la tienda</label>
          <textarea
            rows={3}
            value={store.description}
            onChange={(e) => setStore((p) => ({ ...p, description: e.target.value }))}
            placeholder="Describe tu bodega, horarios, especialidades..."
            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none transition-all"
          />
        </div>

        {/* Estado activo */}
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
          <div>
            <p className="text-sm font-bold text-gray-900">Tienda activa en marketplace</p>
            <p className="text-xs text-gray-500">Los clientes podrán encontrar y comprar en tu tienda</p>
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
        <div className="space-y-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-gray-900">🏖️ Modo vacaciones</p>
              <p className="text-xs text-gray-500">Pausa pedidos temporalmente sin despublicar tu tienda</p>
            </div>
            <button
              onClick={() => setStore((p) => ({ ...p, vacationMode: !p.vacationMode }))}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                store.vacationMode ? "bg-amber-500" : "bg-gray-300"
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
              <label className="text-xs font-bold text-gray-600">Mensaje para tus clientes (opcional)</label>
              <input
                type="text"
                value={store.vacationMessage ?? ""}
                onChange={(e) => setStore((p) => ({ ...p, vacationMessage: e.target.value }))}
                placeholder="Ej: Volvemos el lunes 15. ¡Gracias por tu paciencia!"
                className="w-full px-3 py-2 rounded-lg border border-amber-200 bg-white text-sm text-gray-900 outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all"
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          {saved && (
            <span className="text-sm text-emerald-600 font-semibold flex items-center gap-1">
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
function ProductosTab() {
  const [products, setProducts]   = useState<MarketplaceProduct[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [toggling, setToggling]   = useState<string | null>(null);
  const [syncing, setSyncing]     = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/marketplace/stores/my/products")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setProducts(Array.isArray(d) ? d : []))
      .catch(() => setError("No se pudieron cargar los productos del marketplace."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    setError(null);
    try {
      const res = await fetch("/api/marketplace/stores/my/sync", { method: "POST" });
      if (!res.ok) throw new Error("Error al sincronizar");
      const data = await res.json();
      const d = data.data;
      setSyncResult(`✅ ${d.created} nuevos · ${d.updated} reactivados · ${d.deactivated} desactivados`);
      load(); // recargar lista de productos
      setTimeout(() => setSyncResult(null), 5000);
    } catch {
      setError("Error al sincronizar inventario. Intenta nuevamente.");
    } finally {
      setSyncing(false);
    }
  };

  const toggleActive = async (product: MarketplaceProduct) => {
    setToggling(product.id);
    try {
      const res = await fetch(`/api/marketplace/stores/my/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !product.isActive }),
      });
      if (!res.ok) throw new Error();
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, isActive: !p.isActive } : p))
      );
    } catch {
      setError("Error al actualizar el producto.");
    } finally {
      setToggling(null);
    }
  };

  if (loading) return <TableSkeleton />;

  return (
    <div className="space-y-6">
      {/* Barra de acciones: Sincronizar inventario */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500">
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
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {syncResult}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={load} className="ml-auto text-xs underline">Reintentar</button>
        </div>
      )}

      {products.length === 0 && !error ? (
        <div className="text-center py-16 text-gray-400">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold">Sin productos publicados</p>
          <p className="text-xs mt-1">Activa productos desde tu catálogo para mostrarlos en el marketplace.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl  overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500">Producto</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500">Precio retail</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500">Mayorista</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500">Stock</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-gray-500">Publicado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{p.name}</p>
                      <p className="text-xs text-gray-400 font-mono">{p.sku}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      S/{p.retailPrice.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      S/{p.wholesalePrice.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold",
                        p.stock > 10 ? "bg-emerald-100 text-emerald-700"
                          : p.stock > 0 ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
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
                            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
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
function OrdenesTab() {
  const [orders, setOrders]   = useState<MarketplaceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/marketplace/orders")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setOrders(Array.isArray(d) ? d : []))
      .catch(() => setError("No se pudieron cargar las órdenes del marketplace."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <TableSkeleton />;

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={load} className="ml-auto text-xs underline">Reintentar</button>
        </div>
      )}

      {orders.length === 0 && !error ? (
        <div className="text-center py-16 text-gray-400">
          <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold">Sin órdenes del marketplace aún</p>
          <p className="text-xs mt-1">Las órdenes recibidas desde el marketplace aparecerán aquí.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl  overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500">Orden</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500">Cliente</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500">Total</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-gray-500">Estado</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((o) => {
                  const statusConfig = ORDER_STATUS_CONFIG[o.status] ?? {
                    label: o.status,
                    className: "bg-gray-100 text-gray-600",
                  };
                  return (
                    <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-bold text-gray-900">
                          #{o.id.slice(-8).toUpperCase()}
                        </p>
                        <p className="text-xs text-gray-400">{o.itemsCount} producto{o.itemsCount !== 1 ? "s" : ""}</p>
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{o.customerName}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">S/{o.total.toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("inline-flex px-2.5 py-1 rounded-full text-xs font-bold", statusConfig.className)}>
                          {statusConfig.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-500">
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
function ComisionesTab() {
  const [entries, setEntries]   = useState<CommissionEntry[]>([]);
  const [summary, setSummary]   = useState<CommissionSummary>({ pendiente: 0, liquidado: 0, pagado: 0 });
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/commissions/ledger")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        const list: CommissionEntry[] = Array.isArray(d?.entries) ? d.entries : [];
        setEntries(list);
        const s: CommissionSummary = { pendiente: 0, liquidado: 0, pagado: 0 };
        list.forEach((e) => { s[e.status] = (s[e.status] || 0) + e.amount; });
        setSummary(s);
      })
      .catch(() => setError("No se pudieron cargar las comisiones."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleMarkPaid = async (entryId: string) => {
    setMarkingPaid(entryId);
    try {
      const res = await fetch("/api/commissions/ledger", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [entryId], status: "pagado" }),
      });
      if (!res.ok) throw new Error();
      setEntries((prev) => prev.map((e) => e.id === entryId ? { ...e, status: "pagado" } : e));
      setSummary((prev) => {
        const entry = entries.find((e) => e.id === entryId);
        if (!entry) return prev;
        return {
          ...prev,
          [entry.status]: prev[entry.status as keyof CommissionSummary] - entry.amount,
          pagado: prev.pagado + entry.amount,
        };
      });
    } catch {
      setError("Error al marcar como pagado.");
    } finally {
      setMarkingPaid(null);
    }
  };

  const handleBulkPay = async () => {
    const settledIds = entries.filter((e) => e.status === "liquidado").map((e) => e.id);
    if (settledIds.length === 0) return;
    setMarkingPaid("bulk");
    try {
      const res = await fetch("/api/commissions/ledger", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: settledIds, status: "pagado" }),
      });
      if (!res.ok) throw new Error();
      load();
    } catch {
      setError("Error al marcar comisiones como pagadas.");
    } finally {
      setMarkingPaid(null);
    }
  };

  const filtered = filterStatus === "all" ? entries : entries.filter((e) => e.status === filterStatus);

  if (loading) return <TableSkeleton />;

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={load} className="ml-auto text-xs underline">Reintentar</button>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { key: "pendiente", label: "Por pagar", color: "text-amber-600", bg: "bg-amber-50" },
          { key: "liquidado", label: "Liquidado",  color: "text-emerald-600",  bg: "bg-emerald-50" },
          { key: "pagado",    label: "Pagado",     color: "text-emerald-600", bg: "bg-emerald-50" },
        ].map(({ key, label, color, bg }) => (
          <div key={key} className={cn("rounded-xl p-4 border border-gray-200 ", bg)}>
            <p className="text-xs font-bold text-gray-500">{label}</p>
            <p className={cn("text-2xl font-extrabold mt-1", color)}>
              S/{(summary[key as keyof CommissionSummary] || 0).toFixed(2)}
            </p>
          </div>
        ))}
      </div>

      {/* Filters + Bulk actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Filtrar:</span>
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
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            <DollarSign className="h-3.5 w-3.5" />
            {markingPaid === "bulk" ? "Procesando..." : `Pagar todo liquidado (S/${summary.liquidado.toFixed(2)})`}
          </button>
        )}
      </div>

      {filtered.length === 0 && !error ? (
        <div className="text-center py-16 text-gray-400">
          <DollarSign className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold">Sin comisiones {filterStatus !== "all" ? `en estado "${filterStatus}"` : "registradas aún"}</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl  overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500">Orden</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500">Total orden</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500">Comisión</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-gray-500">Estado</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500">Fecha</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-gray-500">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((e) => {
                  const sc = COMMISSION_STATUS_CONFIG[e.status] ?? COMMISSION_STATUS_CONFIG.pendiente;
                  const StatusIcon = sc.icon;
                  return (
                    <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-bold text-gray-900">
                          #{e.orderId.slice(-8).toUpperCase()}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">S/{e.orderTotal.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">S/{e.amount.toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold", sc.className)}>
                          <StatusIcon className="h-3 w-3" />
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-500">
                        {new Date(e.createdAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {e.status === "liquidado" && (
                          <button
                            onClick={() => handleMarkPaid(e.id)}
                            disabled={markingPaid === e.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold hover:bg-emerald-200 transition-colors disabled:opacity-50"
                            title="Marcar como pagado"
                          >
                            <CheckCircle className="h-3 w-3" />
                            {markingPaid === e.id ? "..." : "Pagar"}
                          </button>
                        )}
                        {e.status === "pagado" && (
                          <span className="text-[10px] text-gray-400">✓ Pagado</span>
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
// Componente principal
// ─────────────────────────────────────────────
// Sub-tab: Reseñas (moderación)
// ─────────────────────────────────────────────
interface ReviewItem {
  id: string;
  name: string;
  text: string;
  rating: number;
  status: string;
  date: string;
  phone?: string | null;
  storeId?: string | null;
  adminReply?: string | null;
  adminReplyDate?: string | null;
}

// ─────────────────────────────────────────────
// Sub-tab: Cupones
// ─────────────────────────────────────────────
interface CouponItem {
  id: string;
  code: string;
  description: string;
  discountType: string;
  discountValue: number;
  minPurchase: number | null;
  maxUses: number | null;
  usedCount: number;
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
}

function CuponesTab() {
  const [coupons, setCoupons] = useState<CouponItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: "",
    description: "",
    discountType: "percent" as "percent" | "fixed",
    discountValue: "",
    minPurchase: "",
    maxUses: "",
    expiresAt: "",
  });

  const fetchCoupons = useCallback(() => {
    setLoading(true);
    fetch("/api/marketplace/coupons")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.data) setCoupons(d.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchCoupons(); }, [fetchCoupons]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/marketplace/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          description: form.description,
          discountType: form.discountType,
          discountValue: Number(form.discountValue),
          minPurchase: form.minPurchase ? Number(form.minPurchase) : null,
          maxUses: form.maxUses ? Number(form.maxUses) : null,
          expiresAt: form.expiresAt || null,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setForm({ code: "", description: "", discountType: "percent", discountValue: "", minPurchase: "", maxUses: "", expiresAt: "" });
        fetchCoupons();
      }
    } catch {}
    setSaving(false);
  };

  const toggleActive = async (id: string, active: boolean) => {
    await fetch(`/api/marketplace/coupons/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    fetchCoupons();
  };

  const deleteCoupon = async (id: string) => {
    if (!confirm("¿Eliminar este cupón?")) return;
    await fetch(`/api/marketplace/coupons/${id}`, { method: "DELETE" });
    fetchCoupons();
  };

  if (loading) return <TableSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{coupons.length} cupón(es)</p>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:opacity-90 transition"
        >
          + Nuevo Cupón
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Código</label>
              <input
                type="text"
                placeholder="BIENVENIDO10"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Tipo</label>
              <select
                value={form.discountType}
                onChange={(e) => setForm({ ...form, discountType: e.target.value as "percent" | "fixed" })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="percent">Porcentaje (%)</option>
                <option value="fixed">Monto fijo (S/)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">
                Valor {form.discountType === "percent" ? "(%)" : "(S/)"}
              </label>
              <input
                type="number"
                placeholder="10"
                value={form.discountValue}
                onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Compra mínima (S/)</label>
              <input
                type="number"
                placeholder="Opcional"
                value={form.minPurchase}
                onChange={(e) => setForm({ ...form, minPurchase: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Usos máximos</label>
              <input
                type="number"
                placeholder="Ilimitado"
                value={form.maxUses}
                onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Descripción</label>
              <input
                type="text"
                placeholder="Descuento de bienvenida"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Vence el</label>
              <input
                type="datetime-local"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value ? new Date(e.target.value).toISOString() : "" })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg text-sm text-gray-600 border border-gray-300 hover:bg-gray-100 transition"
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
        <div className="text-center py-12 text-gray-400">
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
                    "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                    c.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-500"
                  )}>
                    {c.active ? "Activo" : "Inactivo"}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {c.discountType === "percent" ? `${c.discountValue}%` : `S/${c.discountValue.toFixed(2)}`} de descuento
                  {c.minPurchase ? ` · Mín S/${c.minPurchase.toFixed(2)}` : ""}
                  {c.maxUses ? ` · ${c.usedCount}/${c.maxUses} usos` : ` · ${c.usedCount} usos`}
                  {c.expiresAt ? ` · Vence ${new Date(c.expiresAt).toLocaleDateString("es-PE")}` : ""}
                </p>
                {c.description && <p className="text-xs text-gray-400 mt-0.5">{c.description}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                <button
                  onClick={() => toggleActive(c.id, c.active)}
                  title={c.active ? "Desactivar" : "Activar"}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition"
                >
                  {c.active ? <EyeOff className="h-4 w-4 text-gray-400" /> : <Eye className="h-4 w-4 text-emerald-500" />}
                </button>
                <button
                  onClick={() => deleteCoupon(c.id)}
                  title="Eliminar"
                  className="p-1.5 rounded-lg hover:bg-red-50 transition"
                >
                  <X className="h-4 w-4 text-red-400" />
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
// Sub-tab: Fidelidad (Programa de puntos)
// ─────────────────────────────────────────────
interface LoyaltyData {
  phone: string;
  name: string;
  points: number;
  tier: string;
  totalSpent: number;
  transactions: { id: string; type: string; points: number; description: string; createdAt: string }[];
}

const TIER_CONFIG: Record<string, { label: string; className: string; minPoints: string }> = {
  bronce: { label: "Bronce", className: "bg-amber-100 text-amber-700", minPoints: "0 - 499" },
  plata:  { label: "Plata",  className: "bg-gray-100 text-gray-600",   minPoints: "500 - 999" },
  oro:    { label: "Oro",    className: "bg-yellow-100 text-yellow-700", minPoints: "1000+" },
};

function FidelidadTab() {
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
            <p className="text-[10px] font-normal mt-0.5">{cfg.minPoints} pts</p>
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
          className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
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
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
          {/* Customer info */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">{data.name}</p>
              <p className="text-xs text-gray-500">{data.phone}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-extrabold text-primary">{data.points}</p>
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", TIER_CONFIG[data.tier]?.className ?? "bg-gray-100 text-gray-600")}>
                {TIER_CONFIG[data.tier]?.label ?? data.tier}
              </span>
            </div>
          </div>

          <p className="text-xs text-gray-400">Gasto total: S/{data.totalSpent.toFixed(2)}</p>

          {/* Manual earn */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-600 block mb-1">Asignar puntos</label>
              <input
                type="number"
                placeholder="100"
                value={earnPoints}
                onChange={(e) => setEarnPoints(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <button
              onClick={handleEarn}
              disabled={saving || !earnPoints}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-500 text-white hover:opacity-90 transition disabled:opacity-50"
            >
              {saving ? "…" : "+ Dar puntos"}
            </button>
          </div>

          {/* Transaction history */}
          {data.transactions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2">Historial reciente</p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {data.transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between text-xs py-1 border-b border-gray-100 last:border-0">
                    <div>
                      <span className={tx.type === "earn" ? "text-emerald-600 font-semibold" : "text-red-500 font-semibold"}>
                        {tx.points > 0 ? "+" : ""}{tx.points} pts
                      </span>
                      <span className="text-gray-400 ml-2">{tx.description}</span>
                    </div>
                    <span className="text-gray-400 text-[10px]">
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
        <div className="text-center py-12 text-gray-400">
          <Gift className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Programa de Fidelidad</p>
          <p className="text-xs mt-1">Busca un cliente por teléfono para ver y gestionar sus puntos.</p>
          <div className="mt-4 bg-gray-50 rounded-xl p-3 text-left max-w-xs mx-auto">
            <p className="text-xs font-semibold text-gray-600 mb-1">Reglas de puntos:</p>
            <p className="text-[10px] text-gray-500">• 1 punto por cada S/1 de compra</p>
            <p className="text-[10px] text-gray-500">• 500 pts = Nivel Plata (5% descuento)</p>
            <p className="text-[10px] text-gray-500">• 1000 pts = Nivel Oro (10% descuento)</p>
            <p className="text-[10px] text-gray-500">• 100 pts = S/1 de descuento al canjear</p>
          </div>
        </div>
      )}
    </div>
  );
}

const REVIEW_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:  { label: "Pendiente", className: "bg-amber-100 text-amber-700" },
  approved: { label: "Aprobada",  className: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rechazada", className: "bg-red-100 text-red-600" },
};

function ResenasTab() {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const loadReviews = useCallback(() => {
    setLoading(true);
    fetch("/api/reviews?all=1")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ReviewItem[]) => {
        // Filter to only store reviews (storeId present)
        const storeReviews = data.filter((r) => r.storeId);
        setReviews(storeReviews);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadReviews(); }, [loadReviews]);

  const handleStatusChange = async (id: string, status: string) => {
    setSaving(id);
    try {
      const res = await fetch(`/api/reviews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
      }
    } catch { /* silencioso */ }
    setSaving(null);
  };

  const handleReply = async (id: string) => {
    if (!replyText.trim()) return;
    setSaving(id);
    try {
      const res = await fetch(`/api/reviews/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminReply: replyText.trim() }),
      });
      if (res.ok) {
        setReviews((prev) =>
          prev.map((r) =>
            r.id === id ? { ...r, adminReply: replyText.trim(), adminReplyDate: new Date().toISOString() } : r
          )
        );
        setReplyingTo(null);
        setReplyText("");
      }
    } catch { /* silencioso */ }
    setSaving(null);
  };

  const filtered = filter === "all" ? reviews : reviews.filter((r) => r.status === filter);
  const pendingCount = reviews.filter((r) => r.status === "pending").length;

  if (loading) return <TableSkeleton />;

  return (
    <div className="space-y-6">
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-extrabold text-primary">{reviews.length}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">Total reseñas</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-extrabold text-amber-600">{pendingCount}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">Por moderar</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-extrabold text-emerald-600">
            {reviews.length > 0
              ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
              : "—"}
          </p>
          <p className="text-[10px] text-gray-500 mt-0.5">Promedio ★</p>
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
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
        <div className="text-center py-8 text-gray-400">
          <Star className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No hay reseñas {filter !== "all" ? "con este filtro" : "todavía"}</p>
        </div>
      )}

      {/* Review list */}
      <div className="space-y-3">
        {filtered.map((review) => {
          const cfg = REVIEW_STATUS_CONFIG[review.status] ?? REVIEW_STATUS_CONFIG.pending;
          return (
            <div key={review.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
              {/* Header: name, stars, status badge */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-gray-900 truncate">{review.name || "Anónimo"}</span>
                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold", cfg.className)}>
                      {cfg.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={cn("h-3.5 w-3.5", s <= review.rating ? "fill-amber-400 text-amber-400" : "text-gray-200")}
                      />
                    ))}
                    <span className="text-[10px] text-gray-400 ml-1">
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
                      className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                      title="Aprobar"
                    >
                      <CheckCircle className="h-4 w-4" />
                    </button>
                  )}
                  {review.status !== "rejected" && (
                    <button
                      onClick={() => handleStatusChange(review.id, "rejected")}
                      disabled={saving === review.id}
                      className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                      title="Rechazar"
                    >
                      <XCircle className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => { setReplyingTo(replyingTo === review.id ? null : review.id); setReplyText(review.adminReply ?? ""); }}
                    className={cn(
                      "p-1.5 rounded-lg transition-colors",
                      replyingTo === review.id ? "bg-primary/20 text-primary" : "bg-gray-50 text-gray-400 hover:bg-gray-100"
                    )}
                    title="Responder"
                  >
                    <MessageSquare className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Review text */}
              <p className="text-sm text-gray-700 leading-relaxed">{review.text}</p>

              {/* Existing admin reply */}
              {review.adminReply && replyingTo !== review.id && (
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-primary mb-1">Tu respuesta:</p>
                  <p className="text-xs text-gray-700">{review.adminReply}</p>
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
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
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
                      className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-bold hover:bg-gray-200 transition-colors"
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
interface MarketplaceKPIs {
  publishedProducts: number;
  monthOrders: number;
  pendingCommissions: number;
}

export default function MarketplaceModule() {
  const [tab, setTab] = useState<TabId>(TABS[0].id);
  const [kpis, setKpis] = useState<MarketplaceKPIs>({
    publishedProducts: 0,
    monthOrders: 0,
    pendingCommissions: 0,
  });
  const [kpisLoading, setKpisLoading] = useState(true);
  const [tenantPlan, setTenantPlan] = useState<string>("free");

  const refreshKpis = useCallback(() => {
    setKpisLoading(true);
    fetch("/api/marketplace/kpis")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setKpis(d as MarketplaceKPIs); })
      .catch(() => {})
      .finally(() => setKpisLoading(false));
  }, []);

  useEffect(() => {
    refreshKpis();
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.planName) setTenantPlan(d.planName as string); })
      .catch(() => {});
  }, [refreshKpis]);

  const isMultiStoreEnabled = tenantPlan === "business" || tenantPlan === "enterprise";

  const visibleTabs = TABS.filter((t) => t.id !== "multitienda" || isMultiStoreEnabled);

  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Marketplace"
        description="Gestiona tu tienda en la plataforma de ventas"
        icon={Store}
      >
        <button
          onClick={refreshKpis}
          className="p-2 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors"
          title="Actualizar"
        >
          <RefreshCw className={cn("h-4 w-4", kpisLoading && "animate-spin")} />
        </button>
      </AdminModuleHeader>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Productos publicados", value: kpis.publishedProducts, color: "text-primary" },
          { label: "Órdenes del mes",      value: kpis.monthOrders,       color: "text-emerald-600" },
          { label: "Comisiones pendientes",value: `S/${kpis.pendingCommissions.toFixed(2)}`, color: "text-amber-600" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4  text-center"
          >
            {kpisLoading ? (
              <div className="h-7 w-16 mx-auto bg-gray-200 rounded animate-pulse" />
            ) : (
              <p className={cn("text-2xl font-extrabold", color)}>{value}</p>
            )}
            <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 leading-tight">{label}</p>
          </div>
        ))}
      </div>

      <AdminTabBar
        tabs={visibleTabs}
        activeTab={tab}
        onTabChange={(id) => setTab(id)}
        moduleId={MODULE_ID}
      >
        {tab === "tienda"      && <TiendaTab />}
        {tab === "productos"   && <ProductosTab />}
        {tab === "ordenes"     && <OrdenesTab />}
        {tab === "comisiones"  && <ComisionesTab />}
        {tab === "precios"     && (
          <Suspense fallback={<Spinner />}>
            <CompetitivePricingTab />
          </Suspense>
        )}
        {tab === "cupones"     && <CuponesTab />}
        {tab === "resenas"     && <ResenasTab />}
        {tab === "fidelidad"   && <FidelidadTab />}
        {tab === "multitienda" && isMultiStoreEnabled && (
          <Suspense fallback={<Spinner />}>
            <MultiStoreDashboard />
          </Suspense>
        )}
      </AdminTabBar>
    </div>
  );
}
