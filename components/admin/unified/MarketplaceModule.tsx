"use client";

import { CardTitle, SectionTitle } from "@buleje/design-system";
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
  ChevronLeft,
  ChevronRight,
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
  Tag,
  Percent,
  Image as ImageIcon,
  Copy,
  Pause,
  Power,
  Info,
  Target,
  Calendar,
  GripVertical,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  ArrowUpDown,
  Truck,
  Receipt,
  PackageCheck,
  Trophy,
  Search,
  TrendingDown } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import ImageUpload from "@/components/admin/ImageUpload";
import CategoryImageUploader from "@/components/admin/marketplace/CategoryImageUploader";
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

// ── Types ──
type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

interface StoreHours {
  open: string;   // "08:00"
  close: string;  // "20:00"
  closed: boolean;
}

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
  hours?: Record<DayKey, StoreHours>;
}

interface MarketplaceProduct {
  id: string;
  name: string;
  isActive: boolean;
  retailPrice: number;
  wholesalePrice: number;
  stock: number;
  sku: string;
  image: string | null;
  description: string | null;
  category: string | null;
}

interface MarketplaceOrder {
  id: string;
  customerName: string;
  customerPhone: string | null;
  customerLocation: string;
  customerReference: string;
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
  pendiente:   { label: "Pendiente",  className: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]" },
  confirmado:  { label: "Confirmado", className: "bg-[var(--accent-soft)] text-[var(--data-success-500)]" },
  en_camino:   { label: "En camino",  className: "bg-[var(--surface-sunken)] text-[var(--text-primary)]" },
  entregado:   { label: "Entregado",  className: "bg-[var(--accent-soft)] text-[var(--data-success-500)]" },
  cancelado:   { label: "Cancelado",  className: "bg-[var(--data-error-100)] text-[var(--data-error-500)]" },
};

const COMMISSION_STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  pendiente:  { label: "Pendiente",  className: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]",     icon: Clock },
  liquidado:  { label: "Liquidado",  className: "bg-[var(--accent-soft)] text-[var(--data-success-500)]",         icon: CheckCircle },
  pagado:     { label: "Pagado",     className: "bg-[var(--accent-soft)] text-[var(--data-success-500)]", icon: CheckCircle },
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
  { id: "orden",        label: "Orden",        icon: ArrowUpDown },
];

type TabId = string;

const CATEGORIAS = [
  "Abarrotes", "Bebidas", "Lácteos", "Carnes", "Frutas y verduras",
  "Panadería", "Limpieza", "Higiene personal", "Electrónica", "Otros",
];

// Lista de zonas servida por el catálogo canónico — agregamos cualquier opción
// adicional que históricamente apareció en este selector pero no estaba en el
// catálogo, para no romper datos existentes (Coronel Portillo, Ica Yanayacu).
import { MARKETPLACE_ZONES } from "@/lib/marketplace-zones";
// TiendaTab fue extraído del inline (~810 LOC) al archivo dedicado.
import TiendaTab from "./marketplace/tabs/TiendaTab";
// Real OrdenesTab importado desde /tabs (no usar el shadow interno).
// El shadow en este archivo (function OrdenesTab) quedó desplazado por
// `function OrdenesTabShadow_DEPRECATED` para no romper compilación, pero
// NO se renderiza — el render usa `OrdenesTabReal`.
import OrdenesTabReal from "./marketplace/tabs/OrdenesTab";

const ZONAS: string[] = (() => {
  const fromCatalog = MARKETPLACE_ZONES.map((z) => z.label);
  const extras = ["Coronel Portillo", "Ica Yanayacu", "Todos"];
  // Dedupe preservando orden (catálogo primero).
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of [...fromCatalog, ...extras]) {
    if (!seen.has(v)) { seen.add(v); out.push(v); }
  }
  return out;
})();

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
          { label: "Pedidos hoy", value: String(data.today.orders), sub: fmtS(data.today.revenue), color: "text-[var(--data-success-500)]" },
          { label: "Ventas del mes", value: fmtS(data.month.revenue), sub: data.month.revenueGrowth !== 0 ? `${data.month.revenueGrowth > 0 ? "+" : ""}${data.month.revenueGrowth}% vs anterior` : "—", color: "text-[var(--text-secondary)]" },
          { label: "Comisiones del mes", value: fmtS(data.commissions.month), sub: `${data.month.orders} órdenes`, color: "text-[var(--data-warning-500)]" },
          { label: "Pedidos pendientes", value: String(data.pendingOrders), sub: data.pendingOrders > 0 ? "¡Requieren atención!" : "Todo al día", color: data.pendingOrders > 0 ? "text-[var(--data-error-500)]" : "text-[var(--data-success-500)]" },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-3 ">
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">{label}</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Top tiendas + Últimos pedidos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 ">
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
                  <span className="text-xs font-bold text-[var(--data-success-500)] shrink-0">{fmtS(s.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 ">
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
      .catch((err) => { console.warn("[MarketplaceModule] fetch failed", err); })
      .finally(() => setLoading(false));
  }, []);

  const handleQuickConfirm = useCallback(async (orderId: string) => {
    setConfirmingId(orderId);
    try {
      const res = await fetch(`/api/marketplace/orders/${orderId}`, {
        method: "PATCH",
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
          { label: "Este mes", value: fmtS(data.month.revenue), sub: `${data.month.orders} pedido(s)`, color: "text-[var(--data-success-500)]" },
          { label: "Ticket promedio", value: fmtS(data.month.avgTicket), sub: data.month.revenueGrowth !== 0 ? `${data.month.revenueGrowth > 0 ? "+" : ""}${data.month.revenueGrowth}% vs mes anterior` : "Sin comparación", color: "text-[var(--text-secondary)]" },
          { label: "Reseñas", value: `★ ${Number(data.store.rating).toFixed(1)}`, sub: `${data.store.reviewCount} opiniones`, color: "text-[var(--data-warning-500)]" },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-3 sm:p-4 ">
            <p className={cn("text-xl sm:text-2xl font-extrabold", color)}>{value}</p>
            <p className="text-xs sm:text-xs text-[var(--text-secondary)] mt-0.5 leading-tight">{label}</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{sub}</p>
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
              <p className="text-xs text-[var(--text-secondary)]">Hoy (total)</p>
            </div>
            <div>
              <p className="text-lg font-extrabold text-[var(--data-success-500)]">{data.allChannels.today.orders}</p>
              <p className="text-xs text-[var(--text-secondary)]">Pedidos hoy (total)</p>
            </div>
            <div>
              <p className="text-lg font-extrabold text-[var(--text-secondary)]">{fmtS(data.allChannels.month.revenue)}</p>
              <p className="text-xs text-[var(--text-secondary)]">Este mes (total)</p>
            </div>
            <div>
              <p className="text-lg font-extrabold text-[var(--data-warning-500)]">{data.allChannels.month.orders}</p>
              <p className="text-xs text-[var(--text-secondary)]">Pedidos mes (total)</p>
            </div>
          </div>
          <p className="text-xs text-[var(--text-tertiary)] mt-2">Incluye ventas directas, POS y marketplace.</p>
        </div>
      )}

      {/* ── Alertas rápidas ── */}
      {(data.products.lowStock > 0 || data.pendingReviews > 0) && (
        <div className="flex flex-wrap gap-2">
          {data.products.lowStock > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--data-warning-50)] text-[var(--data-warning-500)] text-xs font-semibold">
              <AlertCircle className="h-3.5 w-3.5" />
              {data.products.lowStock} producto(s) con stock bajo
            </div>
          )}
          {data.pendingReviews > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent-soft)] text-[var(--data-success-500)] text-xs font-semibold">
              <MessageSquare className="h-3.5 w-3.5" />
              {data.pendingReviews} reseña(s) por moderar
            </div>
          )}
        </div>
      )}

      {/* ── Acciones rápidas del vendedor ── */}
      <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 ">
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
                ? "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] hover:bg-[var(--data-warning-100)]"
                : "border-[var(--rule-base)] bg-gray-50 hover:bg-gray-100"
            )}
          >
            <div className={cn(
              "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
              (data.pendingOrders ?? 0) > 0 ? "bg-[var(--data-warning-500)] text-[var(--data-warning-500)]" : "bg-gray-200 text-[var(--text-secondary)]"
            )}>
              <ShoppingCart className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--text-primary)]">
                {(data.pendingOrders ?? 0) > 0
                  ? `${data.pendingOrders} pedido(s) por confirmar`
                  : "Sin pedidos pendientes"}
              </p>
              <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1">
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
                ? "border-[var(--data-error-500)] bg-[var(--data-error-50)] hover:bg-[var(--data-error-100)]"
                : "border-[var(--rule-base)] bg-gray-50 hover:bg-gray-100"
            )}
          >
            <div className={cn(
              "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
              data.products.lowStock > 0 ? "bg-[var(--data-error-500)] text-[var(--data-error-500)]" : "bg-gray-200 text-[var(--text-secondary)]"
            )}>
              <Package className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--text-primary)]">
                {data.products.lowStock > 0
                  ? `${data.products.lowStock} producto(s) stock bajo`
                  : "Stock OK"}
              </p>
              <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1">
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
              <p className="text-sm font-bold text-[var(--text-primary)]">Ver mi tienda</p>
              <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1">
                Abrir en marketplace <ArrowRight className="h-3 w-3" />
              </p>
            </div>
          </a>

          {/* Ir al Marketplace */}
          <a
            href="/marketplace"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] text-left transition-all hover:shadow-sm hover:bg-[var(--surface-sunken)]"
          >
            <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-[var(--surface-sunken)] text-[var(--text-primary)]">
              <Store className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--text-primary)]">Ir al Marketplace</p>
              <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1">
                Ver todas las tiendas <ArrowRight className="h-3 w-3" />
              </p>
            </div>
          </a>
        </div>
      </div>

      {/* ── Gráfico de ventas 7 días (barras simples CSS) ── */}
      <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 ">
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
        {/* ── Top productos ── */}
        <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 ">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-3">Top 5 productos del mes</CardTitle>
          {data.topProducts.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)] py-4 text-center">Sin ventas este mes</p>
          ) : (
            <div className="space-y-2.5">
              {data.topProducts.map((p, i) => (
                <div key={p.name} className="flex items-center gap-3">
                  <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-extrabold shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{p.name}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">{p.qty} vendido(s)</p>
                  </div>
                  <span className="text-xs font-bold text-[var(--data-success-500)] shrink-0">{fmtS(p.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Últimos pedidos ── */}
        <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 ">
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
                      <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", cfg.className)}>
                        {cfg.label}
                      </span>
                    )}
                    <span className="text-xs font-bold text-[var(--text-primary)] shrink-0">{fmtS(o.total)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Inventario rápido ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-3 text-center ">
          <p className="text-xl font-extrabold text-primary">{data.products.published}</p>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">Publicados</p>
        </div>
        <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-3 text-center ">
          <p className="text-xl font-extrabold text-[var(--text-secondary)]">{data.products.total}</p>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">Total productos</p>
        </div>
        <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-3 text-center ">
          <p className={cn("text-xl font-extrabold", data.products.lowStock > 0 ? "text-[var(--data-warning-500)]" : "text-[var(--data-success-500)]")}>
            {data.products.lowStock}
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">Stock bajo</p>
        </div>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────
// Sub-tab: Productos
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// Resumen — Próximas acciones + Health Score
// (Sprint 2 · R2 + R5)
// ─────────────────────────────────────────────

type QuickAction = {
  id: string;
  label: string;
  count: number;
  tone: "warning" | "danger" | "info" | "success";
  icon: React.ElementType;
  cta: string;
  goTo: string; // sub-tab id
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
  /** Pipeline de pedidos — cuenta por estado del flujo de venta */
  flowPendiente: number;
  flowConfirmado: number;
  flowEnCamino: number;
  flowEntregadoHoy: number;
  flowRevenueHoy: number;
  flowRevenuePipeline: number;
}

function HealthGauge({ score }: { score: number }) {
  const c = Math.max(0, Math.min(100, Math.round(score)));
  const tone =
    c >= 80 ? "text-[var(--data-success-500)]"
    : c >= 50 ? "text-[var(--data-warning-500)]"
    : "text-[var(--data-error-500)]";
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
    pct >= 80 ? "bg-[var(--data-success-500)]"
    : pct >= 50 ? "bg-[var(--data-warning-500)]"
    : pct > 0 ? "bg-[var(--data-error-500)]"
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

function MarketplaceQuickActions({
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
    flowPendiente: 0,
    flowConfirmado: 0,
    flowEnCamino: 0,
    flowEntregadoHoy: 0,
    flowRevenueHoy: 0,
    flowRevenuePipeline: 0,
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

      // Pipeline de venta — la venta solo se concreta al ENTREGAR.
      // Pendiente/Confirmado/EnCamino son ingresos potenciales.
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      let flowPendiente = 0, flowConfirmado = 0, flowEnCamino = 0;
      let flowEntregadoHoy = 0, flowRevenueHoy = 0, flowRevenuePipeline = 0;
      for (const o of orders as Array<{ status: string; total?: number; createdAt: string }>) {
        const total = Number(o.total ?? 0);
        if (o.status === "pendiente") { flowPendiente++; flowRevenuePipeline += total; }
        else if (o.status === "confirmado") { flowConfirmado++; flowRevenuePipeline += total; }
        else if (o.status === "en_camino") { flowEnCamino++; flowRevenuePipeline += total; }
        else if (o.status === "entregado") {
          if (new Date(o.createdAt) >= startOfDay) {
            flowEntregadoHoy++;
            flowRevenueHoy += total;
          }
        }
      }

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
        flowPendiente,
        flowConfirmado,
        flowEnCamino,
        flowEntregadoHoy,
        flowRevenueHoy,
        flowRevenuePipeline,
      });
    })().catch(() => {
      if (!cancel) setState((s) => ({ ...s, loading: false }));
    });
    return () => { cancel = true; };
  }, []);

  // R5: Health score ponderado
  // — Tienda publicada: 15
  // — Productos con foto: 25 (pct)
  // — Productos con descripción: 15 (pct)
  // — Productos con stock: 20 (pct)
  // — Reseñas respondidas: 15 (pct)
  // — Sin pedidos pendientes >24h: 10 (binario)
  const healthScore = (() => {
    if (state.loading) return 0;
    let score = 0;
    if (state.storePublished) score += 15;
    if (state.productsTotal > 0) {
      score += Math.round((state.productsWithImage / state.productsTotal) * 25);
      score += Math.round((state.productsWithDesc / state.productsTotal) * 15);
      score += Math.round((state.productsWithStock / state.productsTotal) * 20);
    } else {
      score += 0;
    }
    if (state.reviewsTotal > 0) {
      score += Math.round((state.reviewsReplied / state.reviewsTotal) * 15);
    } else {
      score += 15; // sin reseñas no penaliza
    }
    if (state.pendingOrders === 0) score += 10;
    return Math.min(100, score);
  })();

  // R2: Próximas acciones
  const actions: QuickAction[] = [];
  if (state.pendingOrders > 0) {
    actions.push({
      id: "orders",
      label: state.pendingOrders === 1 ? "1 pedido por atender" : `${state.pendingOrders} pedidos por atender`,
      count: state.pendingOrders,
      tone: "danger",
      icon: ShoppingCart,
      cta: "Ver pipeline",
      goTo: "ordenes",
    });
  }
  if (state.commissionsToCollect > 0) {
    actions.push({
      id: "commissions",
      label: `S/ ${Number(state.commissionsToCollect).toFixed(2)} liquidado por cobrar`,
      count: 1,
      tone: "warning",
      icon: DollarSign,
      cta: "Ver comisiones",
      goTo: "comisiones",
    });
  }
  if (state.productsIncomplete > 0) {
    actions.push({
      id: "products",
      label: `${state.productsIncomplete} producto${state.productsIncomplete !== 1 ? "s" : ""} sin completar`,
      count: state.productsIncomplete,
      tone: "warning",
      icon: Package,
      cta: "Completar fichas",
      goTo: "productos",
    });
  }
  if (state.reviewsUnreplied > 0) {
    actions.push({
      id: "reviews",
      label: `${state.reviewsUnreplied} reseña${state.reviewsUnreplied !== 1 ? "s" : ""} sin responder`,
      count: state.reviewsUnreplied,
      tone: "info",
      icon: Star,
      cta: "Responder",
      goTo: "resenas",
    });
  }
  if (state.storePublished === false) {
    actions.push({
      id: "publish",
      label: "Tu tienda está en borrador",
      count: 1,
      tone: "danger",
      icon: EyeOff,
      cta: "Publicar",
      goTo: "tienda",
    });
  }

  /* Tonos unificados: bg surface-raised + border rule-soft (neutros).
     El color del tono va SOLO en:
     - barra lateral (3px) — señal direccional
     - icono dentro del chip (con bg suave del tono)
     Esto evita la saturación cromática de tener fondos rosa/amarillo grandes. */
  const toneStyles: Record<QuickAction["tone"], { bar: string; bg: string; iconBg: string; iconFg: string }> = {
    danger: {
      bar: "before:bg-[var(--data-error-500)]",
      bg: "bg-[var(--surface-raised)] border-[var(--rule-soft)] hover:bg-[var(--surface-sunken)]",
      iconBg: "bg-[var(--data-error-500)]/10",
      iconFg: "text-[var(--data-error-500)]",
    },
    warning: {
      bar: "before:bg-[var(--data-warning-500)]",
      bg: "bg-[var(--surface-raised)] border-[var(--rule-soft)] hover:bg-[var(--surface-sunken)]",
      iconBg: "bg-[var(--data-warning-500)]/10",
      iconFg: "text-[var(--data-warning-500)]",
    },
    info: {
      bar: "before:bg-primary",
      bg: "bg-[var(--surface-raised)] border-[var(--rule-soft)] hover:bg-[var(--surface-sunken)]",
      iconBg: "bg-primary/10",
      iconFg: "text-primary",
    },
    success: {
      bar: "before:bg-[var(--data-success-500)]",
      bg: "bg-[var(--surface-raised)] border-[var(--rule-soft)] hover:bg-[var(--surface-sunken)]",
      iconBg: "bg-[var(--data-success-500)]/10",
      iconFg: "text-[var(--data-success-500)]",
    },
  };

  // Orden de prioridad: danger > warning > info > success
  const tonePriority: Record<QuickAction["tone"], number> = { danger: 0, warning: 1, info: 2, success: 3 };
  const sortedActions = [...actions].sort((a, b) => tonePriority[a.tone] - tonePriority[b.tone]);

  const pctImg   = state.productsTotal > 0 ? Math.round((state.productsWithImage / state.productsTotal) * 100) : 0;
  const pctDesc  = state.productsTotal > 0 ? Math.round((state.productsWithDesc / state.productsTotal) * 100) : 0;
  const pctStock = state.productsTotal > 0 ? Math.round((state.productsWithStock / state.productsTotal) * 100) : 0;
  const pctRev   = state.reviewsTotal > 0 ? Math.round((state.reviewsReplied / state.reviewsTotal) * 100) : 0;

  // Pipeline de venta — cards grandes, claros, alineados con tokens del DS.
  const pipelineSteps = [
    { key: "pendiente",  label: "Pendiente",  hint: "Recién recibido",       count: state.flowPendiente,    Icon: Clock,        fg: "text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-500)]/10", emphasis: false },
    { key: "confirmado", label: "Preparando", hint: "Confirmaste el pedido", count: state.flowConfirmado,   Icon: CheckCircle,  fg: "text-[var(--accent)]",            bg: "bg-[var(--accent-soft)]",          emphasis: false },
    { key: "en_camino",  label: "En camino",  hint: "Motorizado salió",      count: state.flowEnCamino,     Icon: Truck,        fg: "text-primary",                    bg: "bg-primary/10",                    emphasis: false },
    { key: "entregado",  label: "Entregado",  hint: "Venta concretada",      count: state.flowEntregadoHoy, Icon: PackageCheck, fg: "text-[var(--text-primary)]",      bg: "bg-[var(--surface-sunken)]",       emphasis: true  },
  ] as const;
  const fmtSoles = (n: number) => `S/ ${n.toFixed(2)}`;
  const totalActivos = state.flowPendiente + state.flowConfirmado + state.flowEnCamino;

  return (
    <div className="space-y-6 mb-6">
      {/* ── 1. Pipeline del flujo de venta ────────────────────────────── */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-6 sm:p-8 shadow-sm">
        {/* Header con título grande + 2 KPIs prominentes */}
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <Receipt className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="font-display text-xl leading-tight">
                Pipeline de venta
              </CardTitle>
              <p className="text-sm text-[var(--text-secondary)] mt-1 leading-snug">
                {state.loading
                  ? "Cargando estado de tus pedidos..."
                  : totalActivos > 0
                    ? `Tienes ${totalActivos} ${totalActivos === 1 ? "pedido" : "pedidos"} en proceso. La venta solo cuenta cuando se entrega.`
                    : "Sin pedidos activos. La venta solo cuenta cuando se entrega."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate("ordenes")}
            className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors shrink-0"
          >
            Ver todos los pedidos
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {/* KPIs grandes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Pipeline (aún por concretar)
            </p>
            <p className="text-3xl font-extrabold tabular-nums text-[var(--text-primary)] leading-tight mt-2">
              {state.loading ? "—" : fmtSoles(state.flowRevenuePipeline)}
            </p>
            <p className="text-sm text-[var(--text-tertiary)] mt-1">
              Suma de pendientes + preparando + en camino
            </p>
          </div>
          <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Concretado hoy
            </p>
            <p className="text-3xl font-extrabold tabular-nums text-[var(--text-primary)] leading-tight mt-2">
              {state.loading ? "—" : fmtSoles(state.flowRevenueHoy)}
            </p>
            <p className="text-sm text-[var(--text-tertiary)] mt-1">
              {state.flowEntregadoHoy} {state.flowEntregadoHoy === 1 ? "entrega cerrada" : "entregas cerradas"}
            </p>
          </div>
        </div>

        {/* 4 cards de estado — grandes y claros */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {pipelineSteps.map((step) => {
            const Icon = step.Icon;
            return (
              <button
                key={step.key}
                type="button"
                onClick={() => onNavigate("ordenes")}
                className={cn(
                  "text-left rounded-xl p-5 transition-colors border",
                  step.emphasis
                    ? "bg-[var(--surface-sunken)] border-[var(--rule-base)] hover:bg-[var(--surface-base)]"
                    : "bg-[var(--surface-raised)] border-[var(--rule-soft)] hover:bg-[var(--surface-sunken)]",
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className={cn("inline-flex h-11 w-11 items-center justify-center rounded-xl", step.bg)}>
                    <Icon className={cn("h-5 w-5", step.fg)} />
                  </div>
                  {step.emphasis && (
                    <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      Hoy
                    </span>
                  )}
                </div>
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  {step.label}
                </p>
                <p className={cn("text-3xl font-extrabold tabular-nums leading-tight mt-1", step.fg)}>
                  {state.loading ? "—" : step.count}
                </p>
                <p className="text-sm text-[var(--text-secondary)] mt-1.5">
                  {step.hint}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 2. Salud + Acciones (grid 1+2) ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Salud de la tienda ──────────────────────────────────── */}
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="flex items-start justify-between gap-3 mb-5">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                <Target className="h-5 w-5" />
              </span>
              <div>
                <CardTitle className="font-display text-xl leading-tight">
                  Salud de mi tienda
                </CardTitle>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                  Puesto en el marketplace
                </p>
              </div>
            </div>
            {!state.loading && (
              <span
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-bold uppercase tracking-wider shrink-0",
                  healthScore >= 80
                    ? "bg-[var(--accent-soft)] text-[var(--data-success-500)]"
                    : healthScore >= 50
                      ? "bg-[var(--data-warning-50)] text-[var(--data-warning-500)]"
                      : "bg-[var(--data-error-50)] text-[var(--data-error-500)]",
                )}
              >
                {healthScore >= 80 ? "Excelente" : healthScore >= 50 ? "Mejorable" : "Urgente"}
              </span>
            )}
          </div>

          <div className="flex flex-col items-center gap-4">
            {state.loading ? (
              <div className="h-[160px] w-[160px] bg-[var(--surface-sunken)] rounded-full animate-pulse" />
            ) : (
              <HealthGauge score={healthScore} />
            )}
            <p className="text-base text-center text-[var(--text-secondary)] max-w-[280px] leading-relaxed">
              {healthScore >= 80
                ? "Tu puesto está en gran forma. Mantenlo así actualizando productos y respondiendo reseñas."
                : healthScore >= 50
                  ? "Hay margen para mejorar. Cierra los huecos del desglose para subir tu visibilidad."
                  : "Hay tareas urgentes. Cumple los criterios mínimos para no perder ranking."}
            </p>
          </div>

          <div className="space-y-3 mt-6 pt-5 border-t border-[var(--rule-base)]">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
              Desglose por factor
            </p>
            <HealthBreakdownBar label="Productos con foto"        pct={pctImg}   count={state.productsWithImage}  total={state.productsTotal} />
            <HealthBreakdownBar label="Productos con descripción" pct={pctDesc}  count={state.productsWithDesc}   total={state.productsTotal} />
            <HealthBreakdownBar label="Productos con stock"       pct={pctStock} count={state.productsWithStock}  total={state.productsTotal} />
            <HealthBreakdownBar label="Reseñas respondidas"       pct={pctRev}   count={state.reviewsReplied}     total={state.reviewsTotal} />
          </div>
        </div>

        {/* ── Qué hacer ahora ────────────────────────────────────── */}
        <div className="lg:col-span-2 bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="flex items-start justify-between gap-3 mb-5">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                <Zap className="h-5 w-5" />
              </span>
              <div>
                <CardTitle className="font-display text-xl leading-tight">
                  Qué hacer ahora
                </CardTitle>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                  Acciones priorizadas para tu puesto
                </p>
              </div>
            </div>
            <span className="px-3 py-1.5 rounded-lg text-sm font-bold uppercase tracking-wider bg-[var(--surface-sunken)] text-[var(--text-tertiary)] tabular-nums shrink-0">
              {state.loading ? "Cargando…" : `${actions.length} ${actions.length === 1 ? "pendiente" : "pendientes"}`}
            </span>
          </div>

          {state.loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-[var(--surface-sunken)] rounded-xl animate-pulse" />
              ))}
            </div>
          ) : actions.length === 0 ? (
            <div className="text-center py-12">
              <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-soft)] mb-4">
                <CheckCircle className="h-8 w-8 text-[var(--data-success-500)]" />
              </span>
              <p className="font-display text-xl font-extrabold text-[var(--text-primary)]">Todo en orden</p>
              <p className="text-base text-[var(--text-secondary)] mt-2 max-w-md mx-auto leading-relaxed">
                Tu puesto en el marketplace no tiene tareas urgentes. Mantén la cadencia actualizando productos y atendiendo pedidos.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {sortedActions.map((a) => {
                const Icon = a.icon;
                const t = toneStyles[a.tone];
                return (
                  <li
                    key={a.id}
                    className={cn(
                      "relative flex items-center gap-4 pl-5 pr-4 py-4 rounded-xl border transition-all",
                      "before:absolute before:left-0 before:top-3 before:bottom-3 before:w-1 before:rounded-full",
                      t.bar,
                      t.bg,
                    )}
                  >
                    <span className={cn("h-12 w-12 rounded-xl flex items-center justify-center shrink-0", t.iconBg, t.iconFg)}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
                        {a.label}
                      </p>
                      <p className="text-sm text-[var(--text-tertiary)] mt-1 font-bold uppercase tracking-wide">
                        {a.tone === "danger" ? "Urgente" : a.tone === "warning" ? "Importante" : a.tone === "info" ? "Por revisar" : "Listo"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate(a.goTo)}
                      className={cn(
                        "px-4 h-11 rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-base)] text-sm font-bold transition-all shrink-0",
                        "hover:bg-primary hover:text-white hover:border-primary hover:shadow-sm",
                        "inline-flex items-center gap-2 text-[var(--text-primary)]",
                      )}
                    >
                      {a.cta}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helpers de Productos ─────────────────────────────────────────────────────

type ProductFilter = "all" | "active" | "inactive" | "no-image" | "no-desc" | "no-stock" | "low-stock";

const FILTER_DEFS: Array<{ id: ProductFilter; label: string; predicate: (p: MarketplaceProduct) => boolean }> = [
  { id: "all",       label: "Todos",            predicate: () => true },
  { id: "active",    label: "Publicados",       predicate: (p) => p.isActive },
  { id: "inactive",  label: "Borradores",       predicate: (p) => !p.isActive },
  { id: "no-image",  label: "Sin foto",         predicate: (p) => !p.image },
  { id: "no-desc",   label: "Sin descripción",  predicate: (p) => !p.description || p.description.trim().length < 10 },
  { id: "low-stock", label: "Stock bajo",       predicate: (p) => p.stock > 0 && p.stock <= 5 },
  { id: "no-stock",  label: "Sin stock",        predicate: (p) => p.stock <= 0 },
];

/** % de campos completados (0-100). Pesa: foto 30, desc 25, stock 25, precio retail 20. */
function completenessScore(p: MarketplaceProduct): number {
  let s = 0;
  if (p.image) s += 30;
  if (p.description && p.description.trim().length >= 10) s += 25;
  if (p.stock > 0) s += 25;
  if (p.retailPrice > 0) s += 20;
  return s;
}

function CompletenessBadge({ product }: { product: MarketplaceProduct }) {
  const score = completenessScore(product);
  const issues: string[] = [];
  if (!product.image) issues.push("Sin foto");
  if (!product.description || product.description.trim().length < 10) issues.push("Sin descripción");
  if (product.stock <= 0) issues.push("Sin stock");
  if (product.retailPrice <= 0) issues.push("Sin precio");

  const tone = score >= 90
    ? { ring: "bg-[var(--accent-soft)] text-[var(--data-success-500)]", icon: CheckCircle }
    : score >= 60
    ? { ring: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]", icon: AlertCircle }
    : { ring: "bg-[var(--data-error-100)] text-[var(--data-error-500)]", icon: AlertCircle };
  const Icon = tone.icon;

  return (
    <span
      title={issues.length ? `${score}% — ${issues.join(", ")}` : `${score}% completo`}
      className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold", tone.ring)}
    >
      <Icon className="h-3 w-3" />
      {score}%
    </span>
  );
}

/** Input numérico para edición inline; Enter guarda, Esc cancela. */
function InlineNumberCell({
  value,
  onCommit,
  prefix,
  ariaLabel,
}: {
  value: number;
  onCommit: (next: number) => Promise<void> | void;
  prefix?: string;
  ariaLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(String(value));
  const [busy, setBusy]       = useState(false);

  useEffect(() => { if (!editing) setDraft(String(value)); }, [value, editing]);

  const commit = async () => {
    const n = parseFloat(draft);
    if (Number.isNaN(n) || n < 0) {
      setDraft(String(value));
      setEditing(false);
      return;
    }
    if (n === value) { setEditing(false); return; }
    setBusy(true);
    try {
      await onCommit(n);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-[var(--surface-sunken)] transition-colors font-semibold text-[var(--text-primary)] cursor-text"
        aria-label={`Editar ${ariaLabel}`}
      >
        {prefix}
        {value.toFixed(2)}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      {prefix && <span className="text-xs text-[var(--text-tertiary)]">{prefix}</span>}
      <input
        autoFocus
        type="number"
        min={0}
        step={0.1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setDraft(String(value)); setEditing(false); }
        }}
        disabled={busy}
        aria-label={ariaLabel}
        className="w-20 px-2 py-1 rounded-md border border-primary/40 bg-white text-sm text-right outline-none focus:ring-2 focus:ring-primary/30"
      />
      {busy && <div className="h-3 w-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
    </span>
  );
}

function ProductosTab() {
  const [products, setProducts]   = useState<MarketplaceProduct[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [toggling, setToggling]   = useState<string | null>(null);
  const [syncing, setSyncing]     = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // P1: filtros + búsqueda
  const [filter, setFilter]       = useState<ProductFilter>("all");
  const [search, setSearch]       = useState("");

  // P2: bulk selection
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [bulking, setBulking]     = useState(false);

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
      const res = await fetch("/api/marketplace/stores/my/sync", {
        method: "POST",
        headers: csrfHeaders(),
      });
      if (!res.ok) throw new Error("Error al sincronizar");
      const data = await res.json();
      const d = data.data;
      setSyncResult(`${d.created} nuevos · ${d.updated} reactivados · ${d.deactivated} desactivados`);
      load();
      setTimeout(() => setSyncResult(null), 5000);
    } catch {
      setError("Error al sincronizar inventario. Intenta nuevamente.");
    } finally {
      setSyncing(false);
    }
  };

  const patchProduct = useCallback(
    async (productId: string, patch: { isActive?: boolean; retailPrice?: number; wholesalePrice?: number }) => {
      const res = await fetch(`/api/marketplace/stores/my/products/${productId}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("patch failed");
      return res.json();
    },
    [],
  );

  const toggleActive = async (product: MarketplaceProduct) => {
    setToggling(product.id);
    try {
      await patchProduct(product.id, { isActive: !product.isActive });
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, isActive: !p.isActive } : p)),
      );
    } catch {
      setError("Error al actualizar el producto.");
    } finally {
      setToggling(null);
    }
  };

  // P3: editar precios inline
  const updatePrice = async (productId: string, field: "retailPrice" | "wholesalePrice", value: number) => {
    try {
      await patchProduct(productId, { [field]: value });
      setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, [field]: value } : p)));
    } catch {
      setError("No se pudo actualizar el precio. Intenta nuevamente.");
    }
  };

  // P2: bulk activate/deactivate
  const bulkSetActive = async (active: boolean) => {
    if (selected.size === 0) return;
    setBulking(true);
    setError(null);
    const ids = Array.from(selected);
    try {
      const results = await Promise.allSettled(
        ids.map((id) => patchProduct(id, { isActive: active })),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      setProducts((prev) => prev.map((p) => (selected.has(p.id) ? { ...p, isActive: active } : p)));
      setSelected(new Set());
      if (failed > 0) setError(`${failed} productos no se pudieron actualizar.`);
    } finally {
      setBulking(false);
    }
  };

  // Productos filtrados según chip + búsqueda
  const filtered = products.filter((p) => {
    const filterDef = FILTER_DEFS.find((f) => f.id === filter);
    if (filterDef && !filterDef.predicate(p)) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (
        !p.name.toLowerCase().includes(q) &&
        !p.sku.toLowerCase().includes(q) &&
        !(p.category ?? "").toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  // Conteos por chip — usados como badge
  const counts = FILTER_DEFS.reduce<Record<ProductFilter, number>>((acc, f) => {
    acc[f.id] = products.filter(f.predicate).length;
    return acc;
  }, { all: 0, active: 0, inactive: 0, "no-image": 0, "no-desc": 0, "no-stock": 0, "low-stock": 0 });

  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      const next = new Set(selected);
      filtered.forEach((p) => next.delete(p.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      filtered.forEach((p) => next.add(p.id));
      setSelected(next);
    }
  };
  const toggleSelectOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  if (loading) return <TableSkeleton />;

  // KPIs derivados
  const kpiPublished = counts.active;
  const kpiIssues = (counts["no-image"] ?? 0) + (counts["no-desc"] ?? 0);
  const kpiLowStock = (counts["low-stock"] ?? 0) + (counts["no-stock"] ?? 0);

  return (
    <div className="space-y-6">
      {/* ── 1. Hero card con KPIs + sync ──────────────────────────── */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <Package className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="font-display text-xl leading-tight">
                Mis productos en el marketplace
              </CardTitle>
              <p className="text-sm text-[var(--text-secondary)] mt-1 leading-snug">
                {products.length === 0
                  ? "Aún no tenés productos publicados. Activá los del catálogo para mostrarlos."
                  : `${products.length} ${products.length === 1 ? "producto" : "productos"} sincronizados desde tu catálogo. Editá precio y publicación inline.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
            {syncing ? "Sincronizando..." : "Sincronizar inventario"}
          </button>
        </div>

        {/* KPIs grandes */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Total
            </p>
            <p className="text-3xl font-extrabold tabular-nums text-[var(--text-primary)] leading-tight mt-2">
              {products.length}
            </p>
            <p className="text-sm text-[var(--text-tertiary)] mt-1">
              En tu catálogo
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFilter("active")}
            className="text-left rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5 transition-colors hover:bg-[var(--surface-base)]"
          >
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Publicados
            </p>
            <p className="text-3xl font-extrabold tabular-nums text-primary leading-tight mt-2">
              {kpiPublished}
            </p>
            <p className="text-sm text-[var(--text-tertiary)] mt-1">
              Visibles para clientes
            </p>
          </button>
          <button
            type="button"
            onClick={() => setFilter("no-image")}
            disabled={kpiIssues === 0}
            className={cn(
              "text-left rounded-xl border p-5 transition-colors",
              kpiIssues > 0
                ? "border-[var(--data-warning-500)]/30 bg-[var(--data-warning-50)] hover:bg-[var(--data-warning-100)]"
                : "border-[var(--rule-soft)] bg-[var(--surface-sunken)] cursor-default",
            )}
          >
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Sin completar
            </p>
            <p className={cn(
              "text-3xl font-extrabold tabular-nums leading-tight mt-2",
              kpiIssues > 0 ? "text-[var(--data-warning-500)]" : "text-[var(--text-primary)]",
            )}>
              {kpiIssues}
            </p>
            <p className="text-sm text-[var(--text-tertiary)] mt-1">
              Sin foto o descripción
            </p>
          </button>
          <button
            type="button"
            onClick={() => setFilter("no-stock")}
            disabled={kpiLowStock === 0}
            className={cn(
              "text-left rounded-xl border p-5 transition-colors",
              kpiLowStock > 0
                ? "border-[var(--data-error-500)]/30 bg-[var(--data-error-50)] hover:brightness-95"
                : "border-[var(--rule-soft)] bg-[var(--surface-sunken)] cursor-default",
            )}
          >
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Stock crítico
            </p>
            <p className={cn(
              "text-3xl font-extrabold tabular-nums leading-tight mt-2",
              kpiLowStock > 0 ? "text-[var(--data-error-500)]" : "text-[var(--text-primary)]",
            )}>
              {kpiLowStock}
            </p>
            <p className="text-sm text-[var(--text-tertiary)] mt-1">
              Bajo o agotado
            </p>
          </button>
        </div>
      </div>

      {/* ── 2. Banners de feedback ────────────────────────────────── */}
      {syncResult && (
        <div className="flex items-center gap-3 px-5 py-4 bg-[var(--accent-soft)] border border-[var(--data-success-500)]/30 rounded-xl">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--data-success-500)]/15 shrink-0">
            <CheckCircle className="h-4 w-4 text-[var(--data-success-500)]" />
          </span>
          <p className="text-sm font-bold text-[var(--data-success-500)] flex-1">{syncResult}</p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 px-5 py-4 bg-[var(--data-error-50)] border border-[var(--data-error-500)]/30 rounded-xl">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--data-error-500)]/15 shrink-0">
            <AlertCircle className="h-4 w-4 text-[var(--data-error-500)]" />
          </span>
          <p className="text-sm font-bold text-[var(--data-error-500)] flex-1">{error}</p>
          <button
            type="button"
            onClick={load}
            className="text-sm font-bold text-[var(--data-error-500)] underline hover:no-underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* ── 3. Filtros + búsqueda ─────────────────────────────────── */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
            {FILTER_DEFS.map((f) => {
              const isActive = filter === f.id;
              const count = counts[f.id];
              const hasIssues = ["no-image", "no-desc", "no-stock", "low-stock"].includes(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "inline-flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-bold transition-colors border",
                    isActive
                      ? "bg-primary text-white border-primary"
                      : hasIssues && count > 0
                        ? "bg-[var(--data-warning-50)] text-[var(--data-warning-500)] border-[var(--data-warning-500)]/30 hover:brightness-95"
                        : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-soft)] hover:bg-[var(--surface-sunken)]",
                  )}
                >
                  {f.label}
                  <span
                    className={cn(
                      "inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-xs font-extrabold tabular-nums",
                      isActive ? "bg-white/25" : "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="relative lg:ml-auto lg:w-80 shrink-0">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, SKU o categoría…"
              className="w-full pl-11 pr-4 h-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-medium outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            <Eye className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
          </div>
        </div>
      </div>

      {/* ── 4. Bulk actions bar ───────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-4 px-5 py-4 rounded-xl bg-primary/10 border border-primary/30 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <CheckCircle className="h-5 w-5" />
            </span>
            <div>
              <p className="text-base font-extrabold text-primary leading-tight">
                {selected.size} {selected.size === 1 ? "producto seleccionado" : "productos seleccionados"}
              </p>
              <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                Aplicá una acción en bloque
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => bulkSetActive(true)}
              disabled={bulking}
              className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-[var(--data-success-500)] text-white text-sm font-bold hover:brightness-95 transition disabled:opacity-50"
            >
              <Eye className="h-4 w-4" /> Publicar
            </button>
            <button
              type="button"
              onClick={() => bulkSetActive(false)}
              disabled={bulking}
              className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-[var(--text-secondary)] text-white text-sm font-bold hover:brightness-95 transition disabled:opacity-50"
            >
              <EyeOff className="h-4 w-4" /> Despublicar
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="inline-flex items-center gap-2 px-4 h-11 rounded-xl text-[var(--text-secondary)] text-sm font-bold hover:bg-[var(--surface-raised)] border border-[var(--rule-base)]"
            >
              <X className="h-4 w-4" /> Limpiar
            </button>
          </div>
        </div>
      )}

      {/* ── 5. Lista / Empty state ────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-12 text-center shadow-sm">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-sunken)] mb-4">
            <Package className="h-8 w-8 text-[var(--text-tertiary)]" />
          </span>
          <p className="font-display text-xl font-extrabold text-[var(--text-primary)]">
            {products.length === 0 ? "Sin productos publicados" : "Sin resultados con este filtro"}
          </p>
          <p className="text-base text-[var(--text-secondary)] mt-2 max-w-md mx-auto leading-relaxed">
            {products.length === 0
              ? "Activá productos desde tu catálogo principal para mostrarlos en el marketplace."
              : "Probá cambiando el filtro o limpiando la búsqueda."}
          </p>
        </div>
      ) : (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[var(--surface-sunken)] border-b border-[var(--rule-base)]">
                <tr>
                  <th className="w-12 px-4 py-4">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAll}
                      aria-label="Seleccionar todo"
                      className="h-5 w-5 rounded accent-primary cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-4 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Producto</th>
                  <th className="text-center px-4 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Salud</th>
                  <th className="text-right px-4 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Precio retail</th>
                  <th className="text-right px-4 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Mayorista</th>
                  <th className="text-right px-4 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Stock</th>
                  <th className="text-center px-4 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Publicado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
                {filtered.map((p) => {
                  const isSelected = selected.has(p.id);
                  return (
                    <tr
                      key={p.id}
                      className={cn(
                        "transition-colors",
                        isSelected ? "bg-primary/5" : "hover:bg-[var(--surface-sunken)]",
                      )}
                    >
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(p.id)}
                          aria-label={`Seleccionar ${p.name}`}
                          className="h-5 w-5 rounded accent-primary cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12 rounded-xl bg-[var(--surface-sunken)] overflow-hidden flex items-center justify-center shrink-0">
                            {p.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={p.image}
                                alt={p.name}
                                className="h-full w-full object-cover"
                                onError={(e) => { e.currentTarget.style.display = "none"; }}
                              />
                            ) : (
                              <Package className="h-5 w-5 text-[var(--text-tertiary)]" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-extrabold text-[var(--text-primary)] truncate leading-tight">{p.name}</p>
                            <p className="text-xs text-[var(--text-tertiary)] font-mono truncate mt-0.5">
                              {p.sku || "sin SKU"}
                              {p.category && <span> · {p.category}</span>}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <CompletenessBadge product={p} />
                      </td>
                      <td className="px-4 py-4 text-right">
                        <InlineNumberCell
                          value={p.retailPrice}
                          onCommit={(n) => updatePrice(p.id, "retailPrice", n)}
                          prefix="S/"
                          ariaLabel={`Precio retail de ${p.name}`}
                        />
                      </td>
                      <td className="px-4 py-4 text-right">
                        <InlineNumberCell
                          value={p.wholesalePrice}
                          onCommit={(n) => updatePrice(p.id, "wholesalePrice", n)}
                          prefix="S/"
                          ariaLabel={`Precio mayorista de ${p.name}`}
                        />
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className={cn(
                          "inline-flex items-center justify-center min-w-10 px-3 py-1 rounded-full text-sm font-extrabold tabular-nums",
                          p.stock > 10 ? "bg-[var(--accent-soft)] text-[var(--data-success-500)]"
                            : p.stock > 0 ? "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]"
                            : "bg-[var(--data-error-100)] text-[var(--data-error-500)]"
                        )}>
                          {p.stock}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <button
                          type="button"
                          onClick={() => toggleActive(p)}
                          disabled={toggling === p.id}
                          title={p.isActive ? "Despublicar del marketplace" : "Publicar en marketplace"}
                          className={cn(
                            "inline-flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-bold transition-colors min-w-32 justify-center border",
                            p.isActive
                              ? "bg-[var(--accent-soft)] text-[var(--data-success-500)] border-[var(--data-success-500)]/30 hover:brightness-95"
                              : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] border-[var(--rule-base)] hover:bg-[var(--surface-base)]",
                          )}
                        >
                          {toggling === p.id ? (
                            <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : p.isActive ? (
                            <><Eye className="h-4 w-4" /> Publicado</>
                          ) : (
                            <><EyeOff className="h-4 w-4" /> Inactivo</>
                          )}
                        </button>
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
// Sub-tab: Órdenes
// ─────────────────────────────────────────────
// ── Helpers de Órdenes ───────────────────────────────────────────────────────

const ORDER_STAGES: Array<{ id: string; label: string; tone: string; next: string | null }> = [
  { id: "pendiente",  label: "Pendiente",  tone: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]", next: "confirmado" },
  { id: "confirmado", label: "Confirmado", tone: "bg-blue-100 text-blue-700",                                next: "preparando" },
  { id: "preparando", label: "Preparando", tone: "bg-[var(--data-info-100)] text-[var(--data-info-500)]",        next: "en_camino" },
  { id: "en_camino",  label: "En camino",  tone: "bg-amber-100 text-[var(--data-warning-700)]",                              next: "entregado" },
  { id: "entregado",  label: "Entregado",  tone: "bg-[var(--accent-soft)] text-[var(--data-success-500)]",      next: null },
];

const WHATSAPP_TEMPLATES: Array<{ id: string; label: string; build: (o: MarketplaceOrder) => string }> = [
  {
    id: "confirm",
    label: "Confirmar pedido",
    build: (o) =>
      `Hola ${o.customerName}, recibimos tu pedido #${o.id.slice(-8).toUpperCase()} por S/${Number(o.total).toFixed(2)}. Lo estamos preparando. ¡Gracias por tu compra!`,
  },
  {
    id: "ready",
    label: "Pedido listo",
    build: (o) =>
      `Hola ${o.customerName}, tu pedido #${o.id.slice(-8).toUpperCase()} ya está listo y saliendo en camino.`,
  },
  {
    id: "delivered",
    label: "Entregado",
    build: (o) =>
      `Hola ${o.customerName}, tu pedido #${o.id.slice(-8).toUpperCase()} fue entregado. ¡Gracias por tu preferencia! Si tienes 1 minuto, ¿nos dejarías una reseña?`,
  },
  {
    id: "no-stock",
    label: "Sin stock",
    build: (o) =>
      `Hola ${o.customerName}, lamentamos avisarte que tu pedido #${o.id.slice(-8).toUpperCase()} tiene un producto sin stock. ¿Quieres que te llamemos para acordar reemplazo?`,
  },
  {
    id: "review",
    label: "Pedir reseña ⭐",
    build: (o) => {
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const link = `${base}/pedido/${o.id}#reseña`;
      return `Hola ${o.customerName} 🙌. ¿Nos cuentas cómo te fue con tu pedido #${o.id.slice(-8).toUpperCase()}? Tu reseña ayuda a que más vecinos confíen en nosotros: ${link}`;
    },
  },
];

function buildWhatsAppUrl(phone: string, message: string): string {
  // Limpia teléfono: solo dígitos. Asume PE (+51) si no tiene país.
  const digits = phone.replace(/\D/g, "");
  const intl = digits.startsWith("51") || digits.length > 10 ? digits : `51${digits}`;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const d = Math.floor(hr / 24);
  return `hace ${d} d`;
}

/** Toast simple in-component (sin libs) */
function NewOrderToast({ count, onView, onDismiss }: { count: number; onView: () => void; onDismiss: () => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 bg-white dark:bg-[var(--color-card)] border border-primary/40 rounded-xl shadow-2xl p-4 flex items-center gap-3 max-w-sm anim-fadeup">
      <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <ShoppingCart className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-[var(--text-primary)]">
          {count} pedido{count !== 1 ? "s" : ""} nuevo{count !== 1 ? "s" : ""}
        </p>
        <p className="text-xs text-[var(--text-secondary)]">Revisa la columna Pendiente</p>
      </div>
      <button
        onClick={onView}
        className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dark"
      >
        Ver
      </button>
      <button
        onClick={onDismiss}
        aria-label="Cerrar"
        className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Tarjeta de orden dentro de una columna Kanban. */
function OrderCard({
  order,
  onAdvance,
  onWhatsApp,
  onRequestReview,
  advancing,
}: {
  order: MarketplaceOrder;
  onAdvance: () => void;
  onWhatsApp: () => void;
  onRequestReview: () => void;
  advancing: boolean;
}) {
  const stage = ORDER_STAGES.find((s) => s.id === order.status);
  const nextStage = stage?.next ? ORDER_STAGES.find((s) => s.id === stage.next) : null;
  const isDelivered = order.status === "entregado";
  return (
    <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-3 space-y-2 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-xs font-bold text-[var(--text-secondary)]">
            #{order.id.slice(-8).toUpperCase()}
          </p>
          <p className="text-sm font-bold text-[var(--text-primary)] truncate">{order.customerName}</p>
        </div>
        <span className="text-sm font-bold text-primary whitespace-nowrap">
          S/{Number(order.total).toFixed(2)}
        </span>
      </div>
      <p className="text-xs text-[var(--text-secondary)]">
        {order.itemsCount} producto{order.itemsCount !== 1 ? "s" : ""} · {relativeTime(order.createdAt)}
      </p>
      {order.customerLocation && (
        <p className="text-xs text-[var(--text-tertiary)] flex items-start gap-1">
          <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
          <span className="truncate">{order.customerLocation}</span>
        </p>
      )}
      <div className="flex items-center gap-1.5 pt-1">
        {nextStage && (
          <button
            onClick={onAdvance}
            disabled={advancing}
            title={`Pasar a ${nextStage.label}`}
            className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dark transition disabled:opacity-50"
          >
            {advancing ? (
              <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <ArrowRight className="h-3 w-3" /> {nextStage.label}
              </>
            )}
          </button>
        )}
        {/* RE4: pedir reseña en pedidos entregados */}
        {isDelivered && order.customerPhone && (
          <button
            onClick={onRequestReview}
            title="Pedir reseña al cliente"
            className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-[var(--data-warning-500)] text-white text-xs font-bold hover:brightness-110 transition"
          >
            <Star className="h-3 w-3 fill-white" /> Pedir reseña
          </button>
        )}
        {order.customerPhone && (
          <button
            onClick={onWhatsApp}
            title="Mensaje por WhatsApp"
            className="inline-flex items-center justify-center px-2 py-1.5 rounded-lg bg-[#25D366] text-white text-xs font-bold hover:brightness-110 transition"
          >
            <MessageSquare className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

/** Modal pequeño con plantillas de WhatsApp. */
function WhatsAppPicker({
  order,
  onClose,
}: {
  order: MarketplaceOrder;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-[var(--rule-base)] w-full max-w-md p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">
              WhatsApp a {order.customerName}
            </CardTitle>
            <p className="text-xs text-[var(--text-secondary)]">{order.customerPhone}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2">
          {WHATSAPP_TEMPLATES.map((t) => {
            const msg = t.build(order);
            return (
              <a
                key={t.id}
                href={buildWhatsAppUrl(order.customerPhone ?? "", msg)}
                target="_blank"
                rel="noreferrer"
                onClick={onClose}
                className="block px-3 py-2 rounded-lg border border-[var(--rule-base)] hover:border-[#25D366] hover:bg-[#25D366]/5 transition"
              >
                <p className="text-sm font-bold text-[var(--text-primary)]">{t.label}</p>
                <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">{msg}</p>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// DEPRECATED — Quedó como shadow durante el split del módulo. NO se usa
// en el render (ver OrdenesTabReal arriba). Se mantiene para evitar errores
// de compilación con helpers (OrderCard, WhatsAppPicker) que aún viven en
// este archivo. Se eliminará cuando se migren esos helpers también.
function OrdenesTabShadow_DEPRECATED() {
  const [orders, setOrders]       = useState<MarketplaceOrder[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [waOrder, setWaOrder]     = useState<MarketplaceOrder | null>(null);

  // O2: notificación de nuevas órdenes
  const [knownIds, setKnownIds]   = useState<Set<string> | null>(null); // null = primera carga, no notificar
  const [newCount, setNewCount]   = useState(0);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/marketplace/orders");
      if (!r.ok) throw new Error("fail");
      const d = (await r.json()) as MarketplaceOrder[];
      setOrders(Array.isArray(d) ? d : []);

      if (knownIds === null) {
        setKnownIds(new Set(d.map((o) => o.id)));
      } else {
        const fresh = d.filter((o) => !knownIds.has(o.id));
        if (fresh.length > 0) {
          setNewCount((c) => c + fresh.length);
          // ping sonoro discreto (oscillator). Falla silenciosa si bloqueado.
          try {
            const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
            if (Ctx) {
              const ctx = new Ctx();
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.frequency.value = 880;
              gain.gain.value = 0.05;
              osc.start();
              osc.stop(ctx.currentTime + 0.18);
            }
          } catch { /* noop */ }
        }
        setKnownIds(new Set(d.map((o) => o.id)));
      }
    } catch {
      if (!opts?.silent) setError("No se pudieron cargar las órdenes del marketplace.");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [knownIds]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling cada 30s en background
  useEffect(() => {
    const t = setInterval(() => { load({ silent: true }); }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const advance = async (order: MarketplaceOrder) => {
    const stage = ORDER_STAGES.find((s) => s.id === order.status);
    if (!stage?.next) return;
    setAdvancingId(order.id);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status: stage.next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "fail");
      }
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: stage.next! } : o)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo avanzar el pedido.");
    } finally {
      setAdvancingId(null);
    }
  };

  if (loading) return <TableSkeleton />;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <CardTitle className="text-sm">Pipeline de pedidos</CardTitle>
          <p className="text-xs text-[var(--text-secondary)]">
            {orders.length} pedido{orders.length !== 1 ? "s" : ""} · auto-refresh 30s
          </p>
        </div>
        <button
          onClick={() => load()}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--rule-base)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refrescar
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-[var(--data-error-50)] border border-[var(--data-error-500)] rounded-xl text-sm text-[var(--data-error-500)]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={() => load()} className="ml-auto text-xs underline">Reintentar</button>
        </div>
      )}

      {orders.length === 0 && !error ? (
        <div className="text-center py-16 text-[var(--text-tertiary)]">
          <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold">Sin órdenes del marketplace aún</p>
          <p className="text-xs mt-1">Las órdenes recibidas desde el marketplace aparecerán aquí.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {ORDER_STAGES.map((stage) => {
            const stageOrders = orders.filter((o) => o.status === stage.id);
            return (
              <div
                key={stage.id}
                className="bg-[var(--surface-sunken)] rounded-xl p-3 min-h-[200px]"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold", stage.tone)}>
                      {stage.label}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-[var(--text-secondary)]">
                    {stageOrders.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {stageOrders.length === 0 ? (
                    <p className="text-xs text-[var(--text-tertiary)] text-center py-6">
                      Sin pedidos
                    </p>
                  ) : (
                    stageOrders.map((o) => (
                      <OrderCard
                        key={o.id}
                        order={o}
                        onAdvance={() => advance(o)}
                        onWhatsApp={() => setWaOrder(o)}
                        onRequestReview={() => {
                          if (!o.customerPhone) return;
                          const tpl = WHATSAPP_TEMPLATES.find((t) => t.id === "review");
                          if (!tpl) return;
                          window.open(buildWhatsAppUrl(o.customerPhone, tpl.build(o)), "_blank", "noopener");
                        }}
                        advancing={advancingId === o.id}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {newCount > 0 && (
        <NewOrderToast
          count={newCount}
          onView={() => {
            setNewCount(0);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          onDismiss={() => setNewCount(0)}
        />
      )}

      {waOrder && (
        <WhatsAppPicker order={waOrder} onClose={() => setWaOrder(null)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-tab: Comisiones
// ─────────────────────────────────────────────
// ── Helpers Comisiones ──────────────────────────────────────────────────────

const COMMISSIONS_LAST_PAID_KEY = "marketplace:commissions:last-paid-snapshot";

/** Suma comisiones de status determinado del mes solicitado (offset 0=actual, -1=anterior). */
function sumCommissionsInMonth(
  entries: CommissionEntry[],
  status: string,
  offsetMonths: number,
): number {
  const ref = new Date();
  ref.setDate(1);
  ref.setMonth(ref.getMonth() + offsetMonths);
  const y = ref.getFullYear(), m = ref.getMonth();
  return entries
    .filter((e) => e.status === status)
    .filter((e) => {
      const d = new Date(e.createdAt);
      return d.getFullYear() === y && d.getMonth() === m;
    })
    .reduce((sum, e) => sum + Number(e.amount ?? 0), 0);
}

/** Estima fecha de pago: 7 días después de la liquidación (regla de plataforma). */
function estimatePayoutDate(createdAt: string): Date {
  const d = new Date(createdAt);
  d.setDate(d.getDate() + 7);
  return d;
}

function fmtMoney(n: number): string {
  return `S/ ${n.toFixed(2)}`;
}

function fmtDelta(curr: number, prev: number): { label: string; tone: "up" | "down" | "flat" } {
  if (prev === 0 && curr === 0) return { label: "—", tone: "flat" };
  if (prev === 0) return { label: "+nuevo", tone: "up" };
  const pct = ((curr - prev) / prev) * 100;
  if (Math.abs(pct) < 0.5) return { label: "0%", tone: "flat" };
  return {
    label: `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`,
    tone: pct > 0 ? "up" : "down",
  };
}

function CommissionKpiCard({
  label,
  total,
  monthCurr,
  monthPrev,
  tone,
  icon: Icon,
}: {
  label: string;
  total: number;
  monthCurr: number;
  monthPrev: number;
  tone: "warning" | "success" | "info";
  icon: React.ElementType;
}) {
  const delta = fmtDelta(monthCurr, monthPrev);
  const palette: Record<typeof tone, { ring: string; text: string }> = {
    warning: { ring: "bg-[var(--data-warning-50)]",  text: "text-[var(--data-warning-500)]" },
    success: { ring: "bg-[var(--accent-soft)]",      text: "text-[var(--data-success-500)]" },
    info:    { ring: "bg-blue-50",                   text: "text-blue-700" },
  };
  const p = palette[tone];
  return (
    <div className={cn("rounded-xl p-5 border border-[var(--rule-base)]", p.ring)}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className="h-11 w-11 rounded-xl bg-white/60 flex items-center justify-center shrink-0">
          <Icon className={cn("h-5 w-5", p.text)} />
        </span>
        <span
          className={cn(
            "px-2 py-1 rounded-lg font-extrabold text-xs whitespace-nowrap",
            delta.tone === "up"
              ? "bg-[var(--accent-soft)] text-[var(--data-success-500)]"
              : delta.tone === "down"
              ? "bg-[var(--data-error-100)] text-[var(--data-error-500)]"
              : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--rule-soft)]",
          )}
          title={`vs mes anterior (${fmtMoney(monthPrev)})`}
        >
          {delta.label}
        </span>
      </div>
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </p>
      <p className={cn("text-3xl font-extrabold tabular-nums leading-tight mt-2", p.text)}>
        {fmtMoney(total)}
      </p>
      <p className="text-sm text-[var(--text-tertiary)] mt-1">
        Mes actual: <strong className="text-[var(--text-primary)] tabular-nums">{fmtMoney(monthCurr)}</strong>
      </p>
    </div>
  );
}

function ComisionesTab() {
  const [entries, setEntries]   = useState<CommissionEntry[]>([]);
  const [summary, setSummary]   = useState<CommissionSummary>({ pendiente: 0, liquidado: 0, pagado: 0 });
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);

  // C6: detección de lotes recién pagados (vs último snapshot guardado)
  const [newlyPaid, setNewlyPaid] = useState<CommissionEntry[]>([]);

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

        // C6: comparar IDs pagados ahora vs snapshot anterior
        try {
          const raw = window.localStorage.getItem(COMMISSIONS_LAST_PAID_KEY);
          const prev: string[] = raw ? JSON.parse(raw) : [];
          const prevSet = new Set(prev);
          const currentlyPaid = list.filter((e) => e.status === "pagado");
          const fresh = currentlyPaid.filter((e) => !prevSet.has(e.id));
          if (prev.length > 0 && fresh.length > 0) setNewlyPaid(fresh);
          window.localStorage.setItem(
            COMMISSIONS_LAST_PAID_KEY,
            JSON.stringify(currentlyPaid.map((e) => e.id)),
          );
        } catch { /* localStorage bloqueado, ignorar */ }
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
        headers: csrfHeaders({ "Content-Type": "application/json" }),
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
        headers: csrfHeaders({ "Content-Type": "application/json" }),
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

  const liquidadoCount = entries.filter((e) => e.status === "liquidado").length;

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-3 px-5 py-4 bg-[var(--data-error-50)] border border-[var(--data-error-500)]/30 rounded-xl">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--data-error-500)]/15 shrink-0">
            <AlertCircle className="h-4 w-4 text-[var(--data-error-500)]" />
          </span>
          <p className="text-sm font-bold text-[var(--data-error-500)] flex-1">{error}</p>
          <button
            type="button"
            onClick={load}
            className="text-sm font-bold text-[var(--data-error-500)] underline hover:no-underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* ── 1. Hero card con KPIs ───────────────────────────────────── */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <DollarSign className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="font-display text-xl leading-tight">
                Comisiones del marketplace
              </CardTitle>
              <p className="text-sm text-[var(--text-secondary)] mt-1 leading-snug">
                {entries.length === 0
                  ? "Aún no hay comisiones registradas. Aparecerán cuando se generen ventas."
                  : "Tres estados: Pendiente (calculadas) → Liquidado (listas para cobrar) → Pagado (recibido)."}
              </p>
            </div>
          </div>
          {summary.liquidado > 0 && (
            <button
              type="button"
              onClick={handleBulkPay}
              disabled={markingPaid === "bulk"}
              className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50 shrink-0"
            >
              <DollarSign className="h-4 w-4" />
              {markingPaid === "bulk"
                ? "Procesando..."
                : `Pagar liquidado (${fmtMoney(summary.liquidado)})`}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <CommissionKpiCard
            label="Por pagar (pendiente)"
            total={summary.pendiente}
            monthCurr={sumCommissionsInMonth(entries, "pendiente", 0)}
            monthPrev={sumCommissionsInMonth(entries, "pendiente", -1)}
            tone="warning"
            icon={Clock}
          />
          <CommissionKpiCard
            label="Liquidado (por cobrar)"
            total={summary.liquidado}
            monthCurr={sumCommissionsInMonth(entries, "liquidado", 0)}
            monthPrev={sumCommissionsInMonth(entries, "liquidado", -1)}
            tone="info"
            icon={DollarSign}
          />
          <CommissionKpiCard
            label="Pagado (cobrado)"
            total={summary.pagado}
            monthCurr={sumCommissionsInMonth(entries, "pagado", 0)}
            monthPrev={sumCommissionsInMonth(entries, "pagado", -1)}
            tone="success"
            icon={CheckCircle}
          />
        </div>
      </div>

      {/* ── 2. Próximos pagos ──────────────────────────────────────── */}
      {liquidadoCount > 0 && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="flex items-start gap-3 mb-5">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <Calendar className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="font-display text-xl leading-tight">
                Próximos pagos
              </CardTitle>
              <p className="text-sm text-[var(--text-secondary)] mt-1 leading-snug">
                Estimado +7 días tras liquidación. Lotes ordenados por fecha de cobro.
              </p>
            </div>
          </div>
          <ul className="divide-y divide-[var(--rule-soft)]">
            {entries
              .filter((e) => e.status === "liquidado")
              .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
              .slice(0, 5)
              .map((e) => {
                const payDate = estimatePayoutDate(e.createdAt);
                const daysLeft = Math.ceil(
                  (payDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
                );
                return (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                        <Calendar className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
                          {payDate.toLocaleDateString("es-PE", { day: "2-digit", month: "long" })}
                        </p>
                        <p className="text-sm text-[var(--text-secondary)] mt-1">
                          {daysLeft <= 0
                            ? "Ya disponible para cobrar"
                            : daysLeft === 1
                              ? "En 1 día"
                              : `En ${daysLeft} días`}
                          {" · "}
                          <span className="font-mono">#{e.orderId.slice(-8).toUpperCase()}</span>
                        </p>
                      </div>
                    </div>
                    <span className="text-xl font-extrabold tabular-nums text-[var(--data-success-500)] whitespace-nowrap">
                      {fmtMoney(Number(e.amount))}
                    </span>
                  </li>
                );
              })}
          </ul>
          {liquidadoCount > 5 && (
            <p className="text-sm text-[var(--text-tertiary)] mt-4 text-center font-bold">
              +{liquidadoCount - 5} lote{liquidadoCount - 5 === 1 ? "" : "s"} más adelante
            </p>
          )}
        </div>
      )}

      {/* ── 3. Toast de nuevos pagos ───────────────────────────────── */}
      {newlyPaid.length > 0 && (
        <div className="flex items-start gap-4 px-5 py-4 rounded-xl border border-[var(--data-success-500)]/30 bg-[var(--accent-soft)]">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--data-success-500)]/15 shrink-0">
            <CheckCircle className="h-5 w-5 text-[var(--data-success-500)]" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
              {newlyPaid.length === 1
                ? "1 lote pagado nuevo"
                : `${newlyPaid.length} lotes pagados nuevos`}
            </p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Recibiste{" "}
              <strong className="text-[var(--text-primary)] tabular-nums">
                {fmtMoney(newlyPaid.reduce((s, e) => s + Number(e.amount), 0))}
              </strong>{" "}
              desde tu última visita.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setNewlyPaid([])}
            aria-label="Ocultar aviso"
            className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[var(--surface-raised)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── 4. Filtros ─────────────────────────────────────────────── */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mr-2">
            Filtrar
          </span>
          {[
            { value: "all", label: "Todos" },
            { value: "pendiente", label: "Pendiente" },
            { value: "liquidado", label: "Liquidado" },
            { value: "pagado", label: "Pagado" },
          ].map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilterStatus(f.value)}
              className={cn(
                "inline-flex items-center px-4 h-10 rounded-xl text-sm font-bold transition-colors border",
                filterStatus === f.value
                  ? "bg-primary text-white border-primary"
                  : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-soft)] hover:bg-[var(--surface-sunken)]",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 5. Tabla / Empty state ─────────────────────────────────── */}
      {filtered.length === 0 && !error ? (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-12 text-center shadow-sm">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-sunken)] mb-4">
            <DollarSign className="h-8 w-8 text-[var(--text-tertiary)]" />
          </span>
          <p className="font-display text-xl font-extrabold text-[var(--text-primary)]">
            Sin comisiones {filterStatus !== "all" ? `en estado "${filterStatus}"` : "registradas aún"}
          </p>
          <p className="text-base text-[var(--text-secondary)] mt-2 max-w-md mx-auto leading-relaxed">
            Las comisiones aparecen cuando se generan ventas en el marketplace.
          </p>
        </div>
      ) : (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[var(--surface-sunken)] border-b border-[var(--rule-base)]">
                <tr>
                  <th className="text-left px-4 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Orden</th>
                  <th className="text-right px-4 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Total orden</th>
                  <th className="text-right px-4 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Comisión</th>
                  <th className="text-center px-4 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Estado</th>
                  <th className="text-right px-4 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Fecha</th>
                  <th className="text-center px-4 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
                {filtered.map((e) => {
                  const sc = COMMISSION_STATUS_CONFIG[e.status] ?? COMMISSION_STATUS_CONFIG.pendiente;
                  const StatusIcon = sc.icon;
                  return (
                    <tr key={e.id} className="hover:bg-[var(--surface-sunken)] transition-colors">
                      <td className="px-4 py-4">
                        <p className="font-mono text-sm font-extrabold text-[var(--text-primary)]">
                          #{e.orderId.slice(-8).toUpperCase()}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-right text-sm text-[var(--text-secondary)] tabular-nums">
                        S/{Number(e.orderTotal).toFixed(2)}
                      </td>
                      <td className="px-4 py-4 text-right text-base font-extrabold text-[var(--text-primary)] tabular-nums">
                        S/{Number(e.amount).toFixed(2)}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold", sc.className)}>
                          <StatusIcon className="h-3.5 w-3.5" />
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right text-sm text-[var(--text-secondary)]">
                        {new Date(e.createdAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}
                      </td>
                      <td className="px-4 py-4 text-center">
                        {e.status === "liquidado" && (
                          <button
                            type="button"
                            onClick={() => handleMarkPaid(e.id)}
                            disabled={markingPaid === e.id}
                            className="inline-flex items-center gap-2 px-4 h-10 rounded-xl bg-[var(--accent-soft)] text-[var(--data-success-500)] text-sm font-bold border border-[var(--data-success-500)]/30 hover:brightness-95 transition-colors disabled:opacity-50 min-w-28 justify-center"
                            title="Marcar como pagado"
                          >
                            <CheckCircle className="h-4 w-4" />
                            {markingPaid === e.id ? "..." : "Pagar"}
                          </button>
                        )}
                        {e.status === "pagado" && (
                          <span className="text-sm text-[var(--text-tertiary)] font-bold">Pagado</span>
                        )}
                        {e.status === "pendiente" && (
                          <span className="text-sm text-[var(--text-tertiary)] font-bold">—</span>
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

// ── Helpers Cupones ──────────────────────────────────────────────────────────

type CouponFormState = {
  code: string;
  description: string;
  discountType: "percent" | "fixed";
  discountValue: string;
  minPurchase: string;
  maxUses: string;
  expiresAt: string;
};

const COUPON_TEMPLATES: Array<{
  id: string;
  label: string;
  emoji: string;
  hint: string;
  build: () => CouponFormState;
}> = [
  {
    id: "welcome",
    label: "Bienvenida 10%",
    emoji: "👋",
    hint: "Primera compra · 10% off",
    build: () => ({
      code: "BIENVENIDO10",
      description: "10% en tu primera compra",
      discountType: "percent",
      discountValue: "10",
      minPurchase: "",
      maxUses: "",
      expiresAt: "",
    }),
  },
  {
    id: "repurchase",
    label: "Recompra S/ 5",
    emoji: "🔁",
    hint: "Vuelve · descuento fijo",
    build: () => ({
      code: "VUELVE5",
      description: "S/ 5 de descuento por volver",
      discountType: "fixed",
      discountValue: "5",
      minPurchase: "30",
      maxUses: "",
      expiresAt: "",
    }),
  },
  {
    id: "birthday",
    label: "Cumpleaños 15%",
    emoji: "🎂",
    hint: "Mes de cumpleaños",
    build: () => ({
      code: "CUMPLE15",
      description: "15% en tu mes de cumpleaños",
      discountType: "percent",
      discountValue: "15",
      minPurchase: "",
      maxUses: "1",
      expiresAt: "",
    }),
  },
  {
    id: "abandoned",
    label: "Recuperar carrito 12%",
    emoji: "🛒",
    hint: "Carrito abandonado · 48h",
    build: () => {
      const expires = new Date();
      expires.setDate(expires.getDate() + 2);
      return {
        code: "VUELVE12",
        description: "12% para terminar tu compra",
        discountType: "percent",
        discountValue: "12",
        minPurchase: "",
        maxUses: "1",
        expiresAt: expires.toISOString(),
      };
    },
  },
];

/** Estima el descuento total dado y el ROI aprox del cupón. */
function couponMetrics(c: CouponItem): {
  usagePct: number;
  discountedAmount: number;
  attributedRevenue: number;
  roiPct: number | null;
} {
  const avgTicket = c.minPurchase ? Math.max(c.minPurchase, 25) : 25;
  const discountedAmount =
    c.discountType === "percent"
      ? c.usedCount * avgTicket * (c.discountValue / 100)
      : c.usedCount * c.discountValue;
  const attributedRevenue = c.usedCount * avgTicket;
  const usagePct = c.maxUses ? Math.min(100, (c.usedCount / c.maxUses) * 100) : 0;
  const net = attributedRevenue - discountedAmount;
  const roiPct = discountedAmount > 0 ? (net / discountedAmount) * 100 : null;
  return { usagePct, discountedAmount, attributedRevenue, roiPct };
}

function CouponMiniBar({ pct, max }: { pct: number; max?: number | null }) {
  if (!max) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[var(--surface-sunken)] text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">
        ilimitado
      </span>
    );
  }
  const tone =
    pct >= 90 ? "bg-[var(--data-error-500)]"
    : pct >= 60 ? "bg-[var(--data-warning-500)]"
    : "bg-primary";
  return (
    <div className="w-full">
      <div className="h-1.5 w-full bg-[var(--surface-sunken)] rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", tone)}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
    </div>
  );
}

function CuponesTab() {
  const [coupons, setCoupons] = useState<CouponItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CouponFormState>({
    code: "",
    description: "",
    discountType: "percent",
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
      .catch((err) => { console.warn("[MarketplaceModule] fetch failed", err); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchCoupons(); }, [fetchCoupons]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/marketplace/coupons", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
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
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ active: !active }),
    });
    fetchCoupons();
  };

  const deleteCoupon = async (id: string) => {
    if (!confirm("¿Eliminar este cupón?")) return;
    await fetch(`/api/marketplace/coupons/${id}`, {
      method: "DELETE",
      headers: csrfHeaders(),
    });
    fetchCoupons();
  };

  // CP1: aplicar plantilla → llena el form y abre el panel.
  const applyTemplate = (templateId: string) => {
    const t = COUPON_TEMPLATES.find((x) => x.id === templateId);
    if (!t) return;
    setForm(t.build());
    setShowForm(true);
  };

  // Métricas globales agregadas (suma de todos los cupones)
  const aggregate = coupons.reduce(
    (acc, c) => {
      const m = couponMetrics(c);
      acc.uses += c.usedCount;
      acc.discounted += m.discountedAmount;
      acc.revenue += m.attributedRevenue;
      return acc;
    },
    { uses: 0, discounted: 0, revenue: 0 },
  );

  if (loading) return <TableSkeleton />;

  const inputClass =
    "w-full h-11 px-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-medium outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary";
  const labelClass =
    "text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-2";

  return (
    <div className="space-y-6">
      {/* ── 1. Hero card con KPIs ──────────────────────────────────── */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <Ticket className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="font-display text-xl leading-tight">
                Cupones del marketplace
              </CardTitle>
              <p className="text-sm text-[var(--text-secondary)] mt-1 leading-snug">
                {coupons.length === 0
                  ? "Aún no tenés cupones. Creá uno para atraer más clientes."
                  : `${coupons.length} ${coupons.length === 1 ? "cupón creado" : "cupones creados"} · ${coupons.filter((c) => c.active).length} ${coupons.filter((c) => c.active).length === 1 ? "activo" : "activos"}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors shrink-0"
          >
            {showForm ? <X className="h-4 w-4" /> : <Ticket className="h-4 w-4" />}
            {showForm ? "Cerrar" : "Nuevo cupón"}
          </button>
        </div>

        {coupons.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                  <Ticket className="h-5 w-5 text-primary" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Usos totales
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-primary leading-tight mt-2">
                {aggregate.uses}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">
                {coupons.filter((c) => c.active).length} {coupons.filter((c) => c.active).length === 1 ? "cupón activo" : "cupones activos"}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--data-warning-50)]">
                  <Percent className="h-5 w-5 text-[var(--data-warning-500)]" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Descontado total
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-[var(--data-warning-500)] leading-tight mt-2">
                S/ {Number(aggregate.discounted).toFixed(2)}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">
                Estimado por usos × valor
              </p>
            </div>
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
                  <DollarSign className="h-5 w-5 text-[var(--data-success-500)]" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Ventas atribuidas
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-[var(--data-success-500)] leading-tight mt-2">
                S/ {Number(aggregate.revenue).toFixed(2)}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">
                Aprox. ticket promedio
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── 2. Plantillas ──────────────────────────────────────────── */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-start gap-3 mb-5">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
            <Zap className="h-5 w-5" />
          </span>
          <div>
            <CardTitle className="font-display text-xl leading-tight">
              Empezá con una plantilla
            </CardTitle>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Pre-llena el formulario con un click — listo para personalizar
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {COUPON_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => applyTemplate(t.id)}
              className="text-left rounded-xl border-2 border-[var(--rule-soft)] hover:border-primary hover:bg-primary/5 transition p-5"
            >
              <div className="text-3xl mb-3">{t.emoji}</div>
              <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
                {t.label}
              </p>
              <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
                {t.hint}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* ── 3. Formulario (cuando showForm) ────────────────────────── */}
      {showForm && (
        <div className="bg-[var(--surface-raised)] border-2 border-primary/30 rounded-2xl p-6 sm:p-8 shadow-sm space-y-5">
          <div className="flex items-start gap-3 mb-2">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <Ticket className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="font-display text-xl leading-tight">
                {form.code ? `Editar cupón ${form.code}` : "Nuevo cupón"}
              </CardTitle>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Completá los campos requeridos para crear el cupón
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Código</label>
              <input
                type="text"
                placeholder="BIENVENIDO10"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className={cn(inputClass, "font-mono uppercase")}
              />
            </div>
            <div>
              <label className={labelClass}>Tipo de descuento</label>
              <select
                value={form.discountType}
                onChange={(e) => setForm({ ...form, discountType: e.target.value as "percent" | "fixed" })}
                className={inputClass}
              >
                <option value="percent">Porcentaje (%)</option>
                <option value="fixed">Monto fijo (S/)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>
                Valor {form.discountType === "percent" ? "(%)" : "(S/)"}
              </label>
              <input
                type="number"
                placeholder="10"
                value={form.discountValue}
                onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                className={cn(inputClass, "tabular-nums")}
              />
            </div>
            <div>
              <label className={labelClass}>Compra mínima (S/)</label>
              <input
                type="number"
                placeholder="Opcional"
                value={form.minPurchase}
                onChange={(e) => setForm({ ...form, minPurchase: e.target.value })}
                className={cn(inputClass, "tabular-nums")}
              />
            </div>
            <div>
              <label className={labelClass}>Usos máximos</label>
              <input
                type="number"
                placeholder="Ilimitado"
                value={form.maxUses}
                onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                className={cn(inputClass, "tabular-nums")}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Descripción</label>
              <input
                type="text"
                placeholder="Descuento de bienvenida"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Vence el</label>
              <input
                type="datetime-local"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value ? new Date(e.target.value).toISOString() : "" })}
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-2 border-t border-[var(--rule-base)]">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="inline-flex items-center px-5 h-11 rounded-xl text-sm font-bold text-[var(--text-secondary)] border-2 border-[var(--rule-base)] hover:bg-[var(--surface-sunken)] transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving || !form.code || !form.discountValue}
              className="inline-flex items-center gap-2 px-5 h-11 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary-dark transition disabled:opacity-50"
            >
              {saving ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Guardando…
                </>
              ) : (
                <>
                  <Ticket className="h-4 w-4" />
                  Crear cupón
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── 4. Lista de cupones ────────────────────────────────────── */}
      {coupons.length === 0 ? (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-12 text-center shadow-sm">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-sunken)] mb-4">
            <Ticket className="h-8 w-8 text-[var(--text-tertiary)]" />
          </span>
          <p className="font-display text-xl font-extrabold text-[var(--text-primary)]">
            No hay cupones todavía
          </p>
          <p className="text-base text-[var(--text-secondary)] mt-2 max-w-md mx-auto leading-relaxed">
            Creá un cupón para atraer más clientes al marketplace. Empezá con una plantilla o personalizá desde cero.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {coupons.map((c) => {
            const m = couponMetrics(c);
            // eslint-disable-next-line react-hooks/purity -- expiry comparison is allowed to drift across renders
            const expired = c.expiresAt && new Date(c.expiresAt).getTime() < Date.now();
            const isLive = c.active && !expired;
            return (
              <div
                key={c.id}
                className={cn(
                  "bg-[var(--surface-raised)] border rounded-2xl p-5 sm:p-6 shadow-sm transition-opacity",
                  isLive ? "border-[var(--rule-base)]" : "border-[var(--rule-soft)] opacity-70",
                )}
              >
                <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-extrabold text-base text-primary">{c.code}</span>
                      <span className="px-3 py-1 rounded-full text-sm font-extrabold bg-primary/10 text-primary tabular-nums">
                        {c.discountType === "percent" ? `${c.discountValue}%` : `S/ ${Number(c.discountValue).toFixed(2)}`}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold",
                          isLive
                            ? "bg-[var(--accent-soft)] text-[var(--data-success-500)]"
                            : expired
                              ? "bg-[var(--data-error-100)] text-[var(--data-error-500)]"
                              : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
                        )}
                      >
                        {expired ? "Expirado" : c.active ? "Activo" : "Inactivo"}
                      </span>
                      {c.minPurchase && (
                        <span className="px-3 py-1 rounded-full text-sm font-bold bg-[var(--surface-sunken)] text-[var(--text-secondary)] tabular-nums">
                          Mín S/ {Number(c.minPurchase).toFixed(2)}
                        </span>
                      )}
                    </div>
                    {c.description && (
                      <p className="text-sm text-[var(--text-secondary)] mt-2 leading-relaxed">{c.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleActive(c.id, c.active)}
                      title={c.active ? "Desactivar" : "Activar"}
                      className="inline-flex items-center gap-2 px-4 h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition"
                    >
                      {c.active ? (
                        <>
                          <EyeOff className="h-4 w-4" />
                          Desactivar
                        </>
                      ) : (
                        <>
                          <Eye className="h-4 w-4 text-[var(--data-success-500)]" />
                          Activar
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteCoupon(c.id)}
                      title="Eliminar"
                      className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-[var(--rule-base)] hover:bg-[var(--data-error-50)] hover:border-[var(--data-error-500)]/40 transition"
                    >
                      <X className="h-4 w-4 text-[var(--data-error-500)]" />
                    </button>
                  </div>
                </div>

                {/* Métricas por cupón */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-4">
                    <p className="text-[length:var(--ts-2xs)] uppercase tracking-wider text-[var(--text-tertiary)] font-bold">
                      Usos
                    </p>
                    <p className="text-xl font-extrabold tabular-nums text-[var(--text-primary)] mt-1">
                      {c.usedCount}
                      {c.maxUses && (
                        <span className="text-sm text-[var(--text-tertiary)] font-bold">/{c.maxUses}</span>
                      )}
                    </p>
                    <div className="mt-2">
                      <CouponMiniBar pct={m.usagePct} max={c.maxUses} />
                    </div>
                  </div>
                  <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-4">
                    <p className="text-[length:var(--ts-2xs)] uppercase tracking-wider text-[var(--text-tertiary)] font-bold">
                      Descontado
                    </p>
                    <p className="text-xl font-extrabold tabular-nums text-[var(--data-warning-500)] mt-1">
                      S/ {Number(m.discountedAmount).toFixed(2)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-4">
                    <p className="text-[length:var(--ts-2xs)] uppercase tracking-wider text-[var(--text-tertiary)] font-bold">
                      Ventas atribuidas
                    </p>
                    <p className="text-xl font-extrabold tabular-nums text-[var(--data-success-500)] mt-1">
                      S/ {Number(m.attributedRevenue).toFixed(2)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-4">
                    <p className="text-[length:var(--ts-2xs)] uppercase tracking-wider text-[var(--text-tertiary)] font-bold">
                      ROI estimado
                    </p>
                    {m.roiPct === null ? (
                      <p className="text-xl font-bold text-[var(--text-tertiary)] mt-1">—</p>
                    ) : (
                      <p
                        className={cn(
                          "text-xl font-extrabold tabular-nums mt-1",
                          m.roiPct >= 100 ? "text-[var(--data-success-500)]" : "text-[var(--data-warning-500)]",
                        )}
                      >
                        {m.roiPct >= 0 ? "+" : ""}
                        {Number(m.roiPct).toFixed(0)}%
                      </p>
                    )}
                  </div>
                </div>

                {(c.expiresAt || c.maxUses) && (
                  <div className="text-sm text-[var(--text-tertiary)] mt-4 pt-4 border-t border-[var(--rule-base)] flex flex-wrap items-center gap-x-4 gap-y-1">
                    {c.expiresAt && (
                      <span>
                        <span className="font-bold uppercase tracking-wider text-[length:var(--ts-2xs)]">Vence:</span>{" "}
                        <strong className="text-[var(--text-primary)]">
                          {new Date(c.expiresAt).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" })}
                        </strong>
                      </span>
                    )}
                    {c.maxUses && (
                      <span>
                        <span className="font-bold uppercase tracking-wider text-[length:var(--ts-2xs)]">Cap:</span>{" "}
                        <strong className="text-[var(--text-primary)] tabular-nums">{c.maxUses} usos</strong>
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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
  bronce: { label: "Bronce", className: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]", minPoints: "0 - 499" },
  plata:  { label: "Plata",  className: "bg-gray-100 text-[var(--text-secondary)]",   minPoints: "500 - 999" },
  oro:    { label: "Oro",    className: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]", minPoints: "1000+" },
};

// ── Helpers Fidelidad ───────────────────────────────────────────────────────

interface LoyaltyRules {
  pointsPerSol: number;
  minOrder: number;
  weekendMultiplier: number;
  freshCategoryMultiplier: number;
}

interface LoyaltyReward {
  id: string;
  label: string;
  costPoints: number;
  description: string;
  active: boolean;
}

interface TopCustomer {
  phone: string;
  name: string;
  points: number;
  tier: string;
  totalSpent: number;
}

const DEFAULT_LOYALTY_RULES: LoyaltyRules = {
  pointsPerSol: 1,
  minOrder: 5,
  weekendMultiplier: 1,
  freshCategoryMultiplier: 2,
};

const DEFAULT_REWARDS: LoyaltyReward[] = [
  { id: "r1", label: "S/ 5 de descuento",   costPoints: 500,  description: "Aplicable en tu próxima compra mín S/ 30", active: true },
  { id: "r2", label: "Producto gratis",     costPoints: 1000, description: "1 producto a elegir hasta S/ 12",            active: true },
  { id: "r3", label: "Envío gratis",        costPoints: 200,  description: "Delivery sin costo en tu pedido",            active: true },
];

const RULES_KEY = "marketplace:loyalty:rules";
const REWARDS_KEY = "marketplace:loyalty:rewards";

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal<T>(key: string, value: T) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
}

function FidelidadTab() {
  const [phone, setPhone] = useState("");
  const [data, setData] = useState<LoyaltyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [earnPoints, setEarnPoints] = useState("");
  const [saving, setSaving] = useState(false);

  // F1: reglas de puntos (UI-only, persiste en localStorage)
  const [rules, setRulesState] = useState<LoyaltyRules>(DEFAULT_LOYALTY_RULES);
  const [rulesSaved, setRulesSaved] = useState(false);

  // F3: top customers desde /api/loyalty/metrics
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([]);
  const [topLoading, setTopLoading] = useState(true);

  // F5: catálogo de recompensas
  const [rewards, setRewards] = useState<LoyaltyReward[]>(DEFAULT_REWARDS);
  const [newReward, setNewReward] = useState({ label: "", costPoints: "", description: "" });

  // Cargar persistencia local + métricas
  useEffect(() => {
    setRulesState(readLocal<LoyaltyRules>(RULES_KEY, DEFAULT_LOYALTY_RULES));
    setRewards(readLocal<LoyaltyReward[]>(REWARDS_KEY, DEFAULT_REWARDS));
    fetch("/api/loyalty/metrics")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d?.topCustomers)) setTopCustomers(d.topCustomers as TopCustomer[]);
      })
      .catch((err) => { console.warn("[MarketplaceModule] fetch failed", err); })
      .finally(() => setTopLoading(false));
  }, []);

  const persistRules = (next: LoyaltyRules) => {
    setRulesState(next);
    writeLocal(RULES_KEY, next);
    setRulesSaved(true);
    setTimeout(() => setRulesSaved(false), 2000);
  };

  const persistRewards = (next: LoyaltyReward[]) => {
    setRewards(next);
    writeLocal(REWARDS_KEY, next);
  };

  const addReward = () => {
    const cost = Number(newReward.costPoints);
    if (!newReward.label.trim() || !cost || cost <= 0) return;
    persistRewards([
      ...rewards,
      {
        id: `r-${Date.now()}`,
        label: newReward.label.trim(),
        costPoints: cost,
        description: newReward.description.trim(),
        active: true,
      },
    ]);
    setNewReward({ label: "", costPoints: "", description: "" });
  };

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
        headers: csrfHeaders({ "Content-Type": "application/json" }),
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

  const inputClass =
    "w-full h-11 px-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-medium tabular-nums outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary";
  const labelClass =
    "text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] block mb-2";
  const totalCustomers = topCustomers.length;
  const activeRewardsCount = rewards.filter((r) => r.active).length;

  return (
    <div className="space-y-6">
      {/* ── 1. Hero card con tiers ─────────────────────────────────── */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-start gap-3 mb-6">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
            <Star className="h-5 w-5" />
          </span>
          <div>
            <CardTitle className="font-display text-xl leading-tight">
              Programa de fidelidad
            </CardTitle>
            <p className="text-sm text-[var(--text-secondary)] mt-1 leading-snug">
              Asigna puntos por compra, definí recompensas canjeables y subí a tus clientes de nivel para fidelizarlos.
            </p>
          </div>
        </div>

        <p className={labelClass}>Niveles de fidelidad</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {Object.entries(TIER_CONFIG).map(([key, cfg]) => (
            <div
              key={key}
              className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5"
            >
              <span className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold", cfg.className)}>
                {cfg.label}
              </span>
              <p className="text-3xl font-extrabold tabular-nums text-[var(--text-primary)] leading-tight mt-3">
                {cfg.minPoints}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">
                Puntos mínimos para acceder
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── 2. Reglas de puntos ────────────────────────────────────── */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <Zap className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="font-display text-xl leading-tight">
                Reglas de puntos
              </CardTitle>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Cómo se otorgan puntos automáticamente en cada compra
              </p>
            </div>
          </div>
          {rulesSaved && (
            <span className="inline-flex items-center gap-2 px-4 h-10 rounded-xl bg-[var(--accent-soft)] text-[var(--data-success-500)] text-sm font-bold border border-[var(--data-success-500)]/30">
              <CheckCircle className="h-4 w-4" />
              Guardado
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className={labelClass}>Puntos por sol</label>
            <input
              type="number"
              min={0}
              step={0.5}
              value={rules.pointsPerSol}
              onChange={(e) => persistRules({ ...rules, pointsPerSol: parseFloat(e.target.value) || 0 })}
              className={inputClass}
            />
            <p className="text-sm text-[var(--text-tertiary)] mt-2">1 = 1pt por cada S/ 1</p>
          </div>
          <div>
            <label className={labelClass}>Mín orden (S/)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={rules.minOrder}
              onChange={(e) => persistRules({ ...rules, minOrder: parseFloat(e.target.value) || 0 })}
              className={inputClass}
            />
            <p className="text-sm text-[var(--text-tertiary)] mt-2">Para ganar puntos</p>
          </div>
          <div>
            <label className={labelClass}>Multiplicador finde</label>
            <input
              type="number"
              min={1}
              max={5}
              step={0.5}
              value={rules.weekendMultiplier}
              onChange={(e) => persistRules({ ...rules, weekendMultiplier: parseFloat(e.target.value) || 1 })}
              className={inputClass}
            />
            <p className="text-sm text-[var(--text-tertiary)] mt-2">Sáb / Dom × N</p>
          </div>
          <div>
            <label className={labelClass}>Multiplicador frescos</label>
            <input
              type="number"
              min={1}
              max={5}
              step={0.5}
              value={rules.freshCategoryMultiplier}
              onChange={(e) => persistRules({ ...rules, freshCategoryMultiplier: parseFloat(e.target.value) || 1 })}
              className={inputClass}
            />
            <p className="text-sm text-[var(--text-tertiary)] mt-2">Frutas / Verduras × N</p>
          </div>
        </div>
        <p className="text-sm text-[var(--text-tertiary)] mt-5 pt-5 border-t border-[var(--rule-base)]">
          Estas reglas controlan cuántos puntos asigna automáticamente cada compra de tu tienda.
        </p>
      </div>

      {/* ── 3. Top clientes frecuentes ─────────────────────────────── */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <Trophy className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="font-display text-xl leading-tight">
                Top 10 clientes frecuentes
              </CardTitle>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Los que más gastan en tu tienda — invitalos con un cupón VIP
              </p>
            </div>
          </div>
          {!topLoading && totalCustomers > 0 && (
            <span className="px-3 py-1.5 rounded-lg text-sm font-bold uppercase tracking-wider bg-[var(--surface-sunken)] text-[var(--text-tertiary)] tabular-nums shrink-0">
              {totalCustomers} {totalCustomers === 1 ? "cliente" : "clientes"}
            </span>
          )}
        </div>
        {topLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 bg-[var(--surface-sunken)] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : topCustomers.length === 0 ? (
          <div className="text-center py-10">
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-sunken)] mb-4">
              <Trophy className="h-8 w-8 text-[var(--text-tertiary)]" />
            </span>
            <p className="font-display text-xl font-extrabold text-[var(--text-primary)]">
              Aún sin clientes recurrentes
            </p>
            <p className="text-base text-[var(--text-secondary)] mt-2 max-w-md mx-auto leading-relaxed">
              Cuando empiecen a acumular puntos, los verás acá ordenados por gasto.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--rule-soft)]">
            {topCustomers.slice(0, 10).map((c, i) => {
              const initial = (c.name || "C").trim().charAt(0).toUpperCase();
              const tierCfg = TIER_CONFIG[c.tier] ?? null;
              return (
                <li key={`${c.phone}-${i}`} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary text-base font-extrabold shrink-0 tabular-nums">
                    {i + 1}
                  </span>
                  <span className="h-12 w-12 rounded-2xl bg-[var(--accent-soft)] text-primary flex items-center justify-center text-lg font-extrabold shrink-0">
                    {initial}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-extrabold text-[var(--text-primary)] truncate leading-tight">
                      {c.name || "Sin nombre"}
                    </p>
                    <p className="text-sm text-[var(--text-tertiary)] font-mono mt-0.5">{c.phone}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-extrabold tabular-nums text-[var(--data-success-500)]">
                      S/ {Number(c.totalSpent).toFixed(2)}
                    </p>
                    <p className="text-sm text-[var(--text-tertiary)] font-bold tabular-nums mt-0.5">
                      {c.points} pts
                    </p>
                  </div>
                  {tierCfg && (
                    <span className={cn("inline-flex items-center px-3 py-1 rounded-full text-sm font-bold shrink-0", tierCfg.className)}>
                      {tierCfg.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── 4. Recompensas canjeables ──────────────────────────────── */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <Gift className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="font-display text-xl leading-tight">
                Recompensas canjeables
              </CardTitle>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Lo que tus clientes pueden canjear con sus puntos
              </p>
            </div>
          </div>
          <span className="px-3 py-1.5 rounded-lg text-sm font-bold uppercase tracking-wider bg-[var(--surface-sunken)] text-[var(--text-tertiary)] tabular-nums shrink-0">
            {activeRewardsCount} {activeRewardsCount === 1 ? "activa" : "activas"}
          </span>
        </div>

        <div className="space-y-3 mb-6">
          {rewards.length === 0 ? (
            <div className="text-center py-8 rounded-xl bg-[var(--surface-sunken)] border border-[var(--rule-soft)]">
              <Gift className="h-8 w-8 mx-auto mb-2 text-[var(--text-tertiary)]" />
              <p className="text-base font-bold text-[var(--text-primary)]">
                Sin recompensas todavía
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">
                Creá una abajo para empezar
              </p>
            </div>
          ) : (
            rewards.map((r) => (
              <div
                key={r.id}
                className={cn(
                  "flex items-center gap-4 p-4 rounded-xl border transition-opacity",
                  r.active
                    ? "border-[var(--rule-base)] bg-[var(--surface-raised)]"
                    : "border-[var(--rule-soft)] bg-[var(--surface-sunken)] opacity-70",
                )}
              >
                <span className="h-12 w-12 rounded-2xl bg-[var(--data-warning-50)] text-[var(--data-warning-500)] flex items-center justify-center shrink-0">
                  <Gift className="h-5 w-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
                    {r.label}
                  </p>
                  {r.description && (
                    <p className="text-sm text-[var(--text-secondary)] mt-1">{r.description}</p>
                  )}
                </div>
                <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-extrabold whitespace-nowrap tabular-nums shrink-0">
                  {r.costPoints} pts
                </span>
                <button
                  type="button"
                  onClick={() =>
                    persistRewards(
                      rewards.map((x) => (x.id === r.id ? { ...x, active: !x.active } : x)),
                    )
                  }
                  title={r.active ? "Desactivar" : "Activar"}
                  className="inline-flex items-center gap-2 px-4 h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition shrink-0"
                >
                  {r.active ? (
                    <>
                      <EyeOff className="h-4 w-4" />
                      Desactivar
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4 text-[var(--data-success-500)]" />
                      Activar
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => persistRewards(rewards.filter((x) => x.id !== r.id))}
                  title="Eliminar"
                  className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-[var(--rule-base)] hover:bg-[var(--data-error-50)] hover:border-[var(--data-error-500)]/40 transition shrink-0"
                >
                  <X className="h-4 w-4 text-[var(--data-error-500)]" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Form para nueva recompensa */}
        <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-5 space-y-4">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-primary">
            Crear nueva recompensa
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-4">
            <div>
              <label className={labelClass}>Recompensa</label>
              <input
                type="text"
                placeholder="Ej: S/ 10 off"
                value={newReward.label}
                onChange={(e) => setNewReward({ ...newReward, label: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Costo (pts)</label>
              <input
                type="number"
                min={1}
                placeholder="500"
                value={newReward.costPoints}
                onChange={(e) => setNewReward({ ...newReward, costPoints: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Descripción (opcional)</label>
            <input
              type="text"
              placeholder="Ej: aplica con compra mín S/ 30"
              value={newReward.description}
              onChange={(e) => setNewReward({ ...newReward, description: e.target.value })}
              className={inputClass}
            />
          </div>
          <div className="flex justify-end pt-2 border-t border-[var(--rule-base)]">
            <button
              type="button"
              onClick={addReward}
              disabled={!newReward.label.trim() || !newReward.costPoints}
              className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition disabled:opacity-50"
            >
              <Gift className="h-4 w-4" />
              Añadir recompensa
            </button>
          </div>
        </div>
      </div>

      {/* ── 5. Buscador de cliente ─────────────────────────────────── */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-start gap-3 mb-5">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
            <Search className="h-5 w-5" />
          </span>
          <div>
            <CardTitle className="font-display text-xl leading-tight">
              Buscar cliente
            </CardTitle>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Consultá puntos, gasto total e historial — y asigná puntos manualmente
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Teléfono del cliente (ej: 961234567)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchCustomer()}
            className={cn(inputClass, "flex-1")}
          />
          <button
            type="button"
            onClick={searchCustomer}
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition disabled:opacity-50 shrink-0"
          >
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Buscando…
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Buscar
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── 6. Detalle del cliente ─────────────────────────────────── */}
      {data && (
        <div className="bg-[var(--surface-raised)] border-2 border-primary/30 rounded-2xl p-6 sm:p-8 shadow-sm space-y-5">
          {/* Cabecera con info + puntos */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-4 min-w-0 flex-1">
              <span className="h-14 w-14 rounded-2xl bg-[var(--accent-soft)] text-primary flex items-center justify-center text-xl font-extrabold shrink-0">
                {(data.name || "C").trim().charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="text-xl font-extrabold text-[var(--text-primary)] leading-tight">{data.name}</p>
                <p className="text-sm font-mono text-[var(--text-tertiary)] mt-1">{data.phone}</p>
                <span className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold mt-2", TIER_CONFIG[data.tier]?.className ?? "bg-[var(--surface-sunken)] text-[var(--text-secondary)]")}>
                  {TIER_CONFIG[data.tier]?.label ?? data.tier}
                </span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Puntos disponibles
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-primary leading-tight mt-1">
                {data.points}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1 tabular-nums">
                Gasto total: <strong className="text-[var(--text-primary)]">S/ {Number(data.totalSpent).toFixed(2)}</strong>
              </p>
            </div>
          </div>

          {/* Asignar puntos manualmente */}
          <div className="rounded-xl bg-[var(--surface-sunken)] border border-[var(--rule-soft)] p-5">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
              Asignar puntos manualmente
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="number"
                placeholder="100"
                value={earnPoints}
                onChange={(e) => setEarnPoints(e.target.value)}
                className={cn(inputClass, "flex-1")}
              />
              <button
                type="button"
                onClick={handleEarn}
                disabled={saving || !earnPoints}
                className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-[var(--data-success-500)] text-white text-sm font-bold hover:brightness-95 transition disabled:opacity-50 shrink-0"
              >
                {saving ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Guardando…
                  </>
                ) : (
                  <>
                    <Gift className="h-4 w-4" />
                    Dar puntos
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Historial de transacciones */}
          {data.transactions.length > 0 && (
            <div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
                Historial reciente
              </p>
              <ul className="divide-y divide-[var(--rule-soft)] max-h-64 overflow-y-auto">
                {data.transactions.map((tx) => (
                  <li
                    key={tx.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={cn(
                          "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                          tx.type === "earn"
                            ? "bg-[var(--accent-soft)] text-[var(--data-success-500)]"
                            : "bg-[var(--data-error-50)] text-[var(--data-error-500)]",
                        )}
                      >
                        {tx.type === "earn" ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                      </span>
                      <div className="min-w-0">
                        <p
                          className={cn(
                            "text-base font-extrabold tabular-nums leading-tight",
                            tx.type === "earn" ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]",
                          )}
                        >
                          {tx.points > 0 ? "+" : ""}
                          {tx.points} pts
                        </p>
                        <p className="text-sm text-[var(--text-secondary)] truncate mt-0.5">
                          {tx.description}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm text-[var(--text-tertiary)] font-bold tabular-nums shrink-0">
                      {new Date(tx.createdAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── 7. Empty state buscador ────────────────────────────────── */}
      {!data && !loading && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-12 text-center shadow-sm">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-sunken)] mb-4">
            <Gift className="h-8 w-8 text-[var(--text-tertiary)]" />
          </span>
          <p className="font-display text-xl font-extrabold text-[var(--text-primary)]">
            Programa de fidelidad
          </p>
          <p className="text-base text-[var(--text-secondary)] mt-2 max-w-md mx-auto leading-relaxed">
            Buscá un cliente por teléfono arriba para ver y gestionar sus puntos.
          </p>
          <div className="mt-6 max-w-md mx-auto rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5 text-left">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
              Reglas estándar
            </p>
            <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span>1 punto por cada S/ 1 de compra</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span>500 pts = Nivel Plata (5% descuento)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span>1000 pts = Nivel Oro (10% descuento)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span>100 pts = S/ 1 de descuento al canjear</span>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

const REVIEW_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:  { label: "Pendiente", className: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]" },
  approved: { label: "Aprobada",  className: "bg-[var(--accent-soft)] text-[var(--data-success-500)]" },
  rejected: { label: "Rechazada", className: "bg-[var(--data-error-100)] text-[var(--data-error-500)]" },
};

// ── Helpers Reseñas ──────────────────────────────────────────────────────────

type ReviewFilter =
  | "all"
  | "unreplied"
  | "pending"
  | "approved"
  | "rejected"
  | "5"
  | "4"
  | "3"
  | "2"
  | "1";

const REPLY_TEMPLATES: Array<{
  id: string;
  label: string;
  ratingScope: number[]; // estrellas para las que aplica
  build: (r: ReviewItem) => string;
}> = [
  {
    id: "thanks",
    label: "Agradecer",
    ratingScope: [5, 4],
    build: (r) =>
      `Hola ${r.name?.split(" ")[0] || ""}, gracias por tu reseña 🙌. Nos motiva mucho que tu experiencia haya sido buena. ¡Te esperamos pronto!`,
  },
  {
    id: "feedback",
    label: "Agradecer feedback",
    ratingScope: [3, 4],
    build: (r) =>
      `Hola ${r.name?.split(" ")[0] || ""}, gracias por tomarte el tiempo de comentar. Tomamos nota para mejorar y esperamos verte de nuevo pronto.`,
  },
  {
    id: "apologize",
    label: "Disculparse",
    ratingScope: [2, 1],
    build: (r) =>
      `Hola ${r.name?.split(" ")[0] || ""}, lamentamos mucho que tu experiencia no fuera la esperada. Nos gustaría compensarte — escríbenos por WhatsApp para resolverlo.`,
  },
  {
    id: "promise",
    label: "Mejorar",
    ratingScope: [3, 2, 1],
    build: () =>
      `Apreciamos tu sinceridad. Estamos ajustando lo que mencionas y volveremos a estar a la altura en tu próxima visita.`,
  },
];

function ResenasTab() {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const loadReviews = useCallback(() => {
    setLoading(true);
    fetch("/api/reviews?all=1")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ReviewItem[]) => {
        const storeReviews = data.filter((r) => r.storeId);
        setReviews(storeReviews);
      })
      .catch((err) => { console.warn("[MarketplaceModule] fetch failed", err); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadReviews(); }, [loadReviews]);

  const handleStatusChange = async (id: string, status: string) => {
    setSaving(id);
    try {
      const res = await fetch(`/api/reviews/${id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
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
        headers: csrfHeaders({ "Content-Type": "application/json" }),
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

  // RE1: derived counts y filtrado
  const pendingCount = reviews.filter((r) => r.status === "pending").length;
  const unrepliedCount = reviews.filter((r) => !r.adminReply || r.adminReply.trim() === "").length;
  const ratingCount = (n: number) => reviews.filter((r) => r.rating === n).length;
  const avgRating = reviews.length > 0
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : 0;

  const filtered = (() => {
    switch (filter) {
      case "all":       return reviews;
      case "unreplied": return reviews.filter((r) => !r.adminReply || r.adminReply.trim() === "");
      case "pending":
      case "approved":
      case "rejected":  return reviews.filter((r) => r.status === filter);
      default:          return reviews.filter((r) => r.rating === Number(filter));
    }
  })();

  if (loading) return <TableSkeleton />;

  const approvedCount = reviews.filter((r) => r.status === "approved").length;
  const rejectedCount = reviews.filter((r) => r.status === "rejected").length;

  return (
    <div className="space-y-6">
      {/* ── 1. Hero card con KPIs ──────────────────────────────────── */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-start gap-3 mb-6">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
            <Star className="h-5 w-5" />
          </span>
          <div>
            <CardTitle className="font-display text-xl leading-tight">
              Reseñas de tu tienda
            </CardTitle>
            <p className="text-sm text-[var(--text-secondary)] mt-1 leading-snug">
              {reviews.length === 0
                ? "Aún no hay reseñas. Aparecerán cuando los clientes opinen sobre tus productos."
                : `${reviews.length} ${reviews.length === 1 ? "reseña recibida" : "reseñas recibidas"}. Modera y respondé para mejorar tu rating.`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                <MessageSquare className="h-5 w-5 text-primary" />
              </span>
            </div>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Total
            </p>
            <p className="text-3xl font-extrabold tabular-nums text-primary leading-tight mt-2">
              {reviews.length}
            </p>
            <p className="text-sm text-[var(--text-tertiary)] mt-1">
              Reseñas recibidas
            </p>
          </div>
          <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--data-warning-50)]">
                <Star className="h-5 w-5 fill-[var(--data-warning-500)] text-[var(--data-warning-500)]" />
              </span>
            </div>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Rating promedio
            </p>
            <p className="text-3xl font-extrabold tabular-nums text-[var(--data-warning-500)] leading-tight mt-2">
              {avgRating > 0 ? avgRating.toFixed(1) : "—"}
            </p>
            <p className="text-sm text-[var(--text-tertiary)] mt-1">
              de 5 estrellas
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFilter("unreplied")}
            disabled={unrepliedCount === 0}
            className={cn(
              "text-left rounded-xl border p-5 transition-colors",
              unrepliedCount > 0
                ? "border-[var(--data-error-500)]/30 bg-[var(--data-error-50)] hover:brightness-95"
                : "border-[var(--rule-soft)] bg-[var(--surface-sunken)] cursor-default",
            )}
          >
            <div className="flex items-center justify-between gap-3 mb-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--data-error-100)]">
                <MessageSquare className="h-5 w-5 text-[var(--data-error-500)]" />
              </span>
            </div>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Sin responder
            </p>
            <p className={cn(
              "text-3xl font-extrabold tabular-nums leading-tight mt-2",
              unrepliedCount > 0 ? "text-[var(--data-error-500)]" : "text-[var(--text-primary)]",
            )}>
              {unrepliedCount}
            </p>
            <p className="text-sm text-[var(--text-tertiary)] mt-1">
              Necesitan tu respuesta
            </p>
          </button>
          <button
            type="button"
            onClick={() => setFilter("pending")}
            disabled={pendingCount === 0}
            className={cn(
              "text-left rounded-xl border p-5 transition-colors",
              pendingCount > 0
                ? "border-[var(--data-warning-500)]/30 bg-[var(--data-warning-50)] hover:brightness-95"
                : "border-[var(--rule-soft)] bg-[var(--surface-sunken)] cursor-default",
            )}
          >
            <div className="flex items-center justify-between gap-3 mb-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--data-warning-100)]">
                <AlertCircle className="h-5 w-5 text-[var(--data-warning-500)]" />
              </span>
            </div>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Por moderar
            </p>
            <p className={cn(
              "text-3xl font-extrabold tabular-nums leading-tight mt-2",
              pendingCount > 0 ? "text-[var(--data-warning-500)]" : "text-[var(--text-primary)]",
            )}>
              {pendingCount}
            </p>
            <p className="text-sm text-[var(--text-tertiary)] mt-1">
              Pendientes de revisar
            </p>
          </button>
        </div>
      </div>

      {/* ── 2. Distribución por rating ─────────────────────────────── */}
      {reviews.length > 0 && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="flex items-start gap-3 mb-5">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <BarChart3 className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="font-display text-xl leading-tight">
                Distribución por rating
              </CardTitle>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Cómo se distribuyen tus {reviews.length} reseñas por estrellas
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = ratingCount(star);
              const pct = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
              return (
                <div key={star} className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5 w-16 text-sm font-extrabold text-[var(--text-primary)]">
                    {star}
                    <Star className="h-4 w-4 fill-[var(--data-warning-500)] text-[var(--data-warning-500)]" />
                  </span>
                  <div className="flex-1 h-3 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        star >= 4 ? "bg-[var(--data-success-500)]"
                        : star === 3 ? "bg-[var(--data-warning-500)]"
                        : "bg-[var(--data-error-500)]",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-20 text-right text-sm font-extrabold tabular-nums text-[var(--text-primary)]">
                    {count}
                    <span className="text-[var(--text-tertiary)] font-bold">
                      {" "}
                      ({pct.toFixed(0)}%)
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 3. Filtros ─────────────────────────────────────────────── */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-5 sm:p-6 shadow-sm space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mr-2">
            Estado
          </span>
          {(["all", "unreplied", "pending", "approved", "rejected"] as const).map((f) => {
            const labels: Record<typeof f, string> = {
              all: "Todas",
              unreplied: "Sin responder",
              pending: "Pendientes",
              approved: "Aprobadas",
              rejected: "Rechazadas",
            };
            const counts: Record<typeof f, number> = {
              all: reviews.length,
              unreplied: unrepliedCount,
              pending: pendingCount,
              approved: approvedCount,
              rejected: rejectedCount,
            };
            const isWarning = f === "unreplied" && unrepliedCount > 0;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "inline-flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-bold transition-colors border",
                  filter === f
                    ? "bg-primary text-white border-primary"
                    : isWarning
                      ? "bg-[var(--data-error-50)] text-[var(--data-error-500)] border-[var(--data-error-500)]/30 hover:brightness-95"
                      : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-soft)] hover:bg-[var(--surface-sunken)]",
                )}
              >
                {labels[f]}
                <span
                  className={cn(
                    "inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-xs font-extrabold tabular-nums",
                    filter === f ? "bg-white/25" : "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
                  )}
                >
                  {counts[f]}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-[var(--rule-soft)]">
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mr-2">
            Por rating
          </span>
          {([5, 4, 3, 2, 1] as const).map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setFilter(String(star) as ReviewFilter)}
              className={cn(
                "inline-flex items-center gap-1.5 px-4 h-10 rounded-xl text-sm font-bold transition-colors border",
                filter === String(star)
                  ? "bg-primary text-white border-primary"
                  : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-soft)] hover:bg-[var(--surface-sunken)]",
              )}
            >
              {star}
              <Star className={cn(
                "h-4 w-4",
                filter === String(star)
                  ? "fill-white text-white"
                  : "fill-[var(--data-warning-500)] text-[var(--data-warning-500)]",
              )} />
              <span
                className={cn(
                  "inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-xs font-extrabold tabular-nums",
                  filter === String(star) ? "bg-white/25" : "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
                )}
              >
                {ratingCount(star)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── 4. Lista / Empty state ─────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-12 text-center shadow-sm">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-sunken)] mb-4">
            <Star className="h-8 w-8 text-[var(--text-tertiary)]" />
          </span>
          <p className="font-display text-xl font-extrabold text-[var(--text-primary)]">
            No hay reseñas {filter !== "all" ? "con este filtro" : "todavía"}
          </p>
          <p className="text-base text-[var(--text-secondary)] mt-2 max-w-md mx-auto leading-relaxed">
            {filter !== "all"
              ? "Probá cambiando el filtro para ver otras reseñas."
              : "Las reseñas aparecerán cuando los clientes opinen sobre tus productos."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((review) => {
            const cfg = REVIEW_STATUS_CONFIG[review.status] ?? REVIEW_STATUS_CONFIG.pending;
            const isReplying = replyingTo === review.id;
            return (
              <div
                key={review.id}
                className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-5 sm:p-6 shadow-sm space-y-4"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="font-extrabold text-base text-[var(--text-primary)] truncate">
                        {review.name || "Anónimo"}
                      </span>
                      <span className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold", cfg.className)}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={cn(
                              "h-4 w-4",
                              s <= review.rating
                                ? "fill-[var(--data-warning-500)] text-[var(--data-warning-500)]"
                                : "text-[var(--rule-base)]",
                            )}
                          />
                        ))}
                      </div>
                      <span className="text-sm text-[var(--text-tertiary)] font-bold">
                        ·{" "}
                        {new Date(review.date).toLocaleDateString("es-PE", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {review.status !== "approved" && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(review.id, "approved")}
                        disabled={saving === review.id}
                        className="inline-flex items-center gap-2 px-4 h-10 rounded-xl bg-[var(--accent-soft)] text-[var(--data-success-500)] text-sm font-bold border border-[var(--data-success-500)]/30 hover:brightness-95 transition disabled:opacity-50"
                      >
                        <CheckCircle className="h-4 w-4" />
                        Aprobar
                      </button>
                    )}
                    {review.status !== "rejected" && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(review.id, "rejected")}
                        disabled={saving === review.id}
                        className="inline-flex items-center gap-2 px-4 h-10 rounded-xl bg-[var(--data-error-50)] text-[var(--data-error-500)] text-sm font-bold border border-[var(--data-error-500)]/30 hover:bg-[var(--data-error-100)] transition disabled:opacity-50"
                      >
                        <XCircle className="h-4 w-4" />
                        Rechazar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setReplyingTo(isReplying ? null : review.id);
                        setReplyText(review.adminReply ?? "");
                      }}
                      className={cn(
                        "inline-flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-bold border transition",
                        isReplying
                          ? "bg-primary text-white border-primary"
                          : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-base)] hover:bg-[var(--surface-sunken)]",
                      )}
                    >
                      <MessageSquare className="h-4 w-4" />
                      {isReplying ? "Cerrar" : review.adminReply ? "Editar" : "Responder"}
                    </button>
                  </div>
                </div>

                {/* Texto reseña */}
                <p className="text-base text-[var(--text-primary)] leading-relaxed">
                  {review.text}
                </p>

                {/* Respuesta existente (solo lectura) */}
                {review.adminReply && !isReplying && (
                  <div
                    className="rounded-xl border border-primary/20 bg-primary/5 p-4"
                  >
                    <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-primary mb-2">
                      Tu respuesta
                    </p>
                    <p className="text-base text-[var(--text-primary)] leading-relaxed">
                      {review.adminReply}
                    </p>
                  </div>
                )}

                {/* Form de respuesta */}
                {isReplying && (
                  <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-5 space-y-4">
                    {(() => {
                      const applicable = REPLY_TEMPLATES.filter((t) =>
                        t.ratingScope.includes(review.rating),
                      );
                      if (applicable.length === 0) return null;
                      return (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-primary mr-1">
                            Plantilla
                          </span>
                          {applicable.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => setReplyText(t.build(review))}
                              className="inline-flex items-center px-3 h-9 rounded-xl text-sm font-bold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition"
                            >
                              {t.label}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setReplyText("")}
                            className="inline-flex items-center px-3 h-9 rounded-xl text-sm font-bold text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] transition"
                          >
                            Limpiar
                          </button>
                        </div>
                      );
                    })()}
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Escribí tu respuesta al cliente..."
                      rows={4}
                      className="w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3 text-base font-medium leading-relaxed focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none outline-none"
                    />
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-[var(--text-tertiary)] font-bold tabular-nums">
                        {replyText.length} caracteres
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setReplyingTo(null);
                            setReplyText("");
                          }}
                          className="inline-flex items-center px-5 h-11 rounded-xl text-sm font-bold text-[var(--text-secondary)] border-2 border-[var(--rule-base)] hover:bg-[var(--surface-sunken)] transition"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReply(review.id)}
                          disabled={saving === review.id || !replyText.trim()}
                          className="inline-flex items-center gap-2 px-5 h-11 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary-dark transition disabled:opacity-50"
                        >
                          {saving === review.id ? (
                            <>
                              <RefreshCw className="h-4 w-4 animate-spin" />
                              Guardando...
                            </>
                          ) : (
                            <>
                              <MessageSquare className="h-4 w-4" />
                              Enviar respuesta
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-tab: Orden — el dueño reordena las categorías Y los productos dentro de
// cada categoría que aparecen en su storefront /marketplace/[slug].
// Persistencia:
//   - Orden de categorías: lib/data/store-category-orders.json
//     PUT /api/admin/marketplace/category-order
//   - Orden de productos por categoría: lib/data/store-product-orders.json
//     PUT /api/admin/marketplace/product-order
// El render server-side aplica ambos en orden (cat → producto).
// ─────────────────────────────────────────────
interface OrdenCategoryRow {
  name: string;
  count: number;
}

interface OrdenProductRow {
  id: string;
  name: string;
  retailPrice: number;
  image: string | null;
  isActive: boolean;
}

function OrdenTab() {
  const [rows, setRows] = useState<OrdenCategoryRow[]>([]);
  const [initialCatOrder, setInitialCatOrder] = useState<string[]>([]);
  const [productsByCat, setProductsByCat] = useState<Record<string, OrdenProductRow[]>>({});
  const [initialProductOrder, setInitialProductOrder] = useState<Record<string, string[]>>({});
  const [storeSlug, setStoreSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  // Imágenes por categoría
  const [ownImages, setOwnImages] = useState<Record<string, string>>({});
  const [globalImages, setGlobalImages] = useState<Record<string, string>>({});
  const [initialOwnImages, setInitialOwnImages] = useState<Record<string, string>>({});

  // Drag state — usamos namespace "cat:N" o "prod:CAT:N" para evitar mezclar.
  const [dragCatIdx, setDragCatIdx] = useState<number | null>(null);
  const [dragOverCat, setDragOverCat] = useState<number | null>(null);
  const [dragProd, setDragProd] = useState<{ cat: string; idx: number } | null>(null);
  const [dragOverProd, setDragOverProd] = useState<{ cat: string; idx: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [productsRes, catOrderRes, prodOrderRes, imagesRes] = await Promise.all([
        fetch("/api/marketplace/stores/my/products"),
        fetch("/api/admin/marketplace/category-order"),
        fetch("/api/admin/marketplace/product-order"),
        fetch("/api/admin/marketplace/category-images"),
      ]);
      const products: MarketplaceProduct[] = productsRes.ok ? await productsRes.json() : [];
      const catOrderJson = catOrderRes.ok
        ? (await catOrderRes.json()) as { order: string[]; storeSlug: string | null }
        : { order: [], storeSlug: null };
      const prodOrderJson = prodOrderRes.ok
        ? (await prodOrderRes.json()) as { byCategory: Record<string, string[]>; storeSlug: string | null }
        : { byCategory: {}, storeSlug: null };
      // resolvedImages = own + global merged. Calculamos own y derivamos global.
      const imagesJson = imagesRes.ok
        ? ((await imagesRes.json()) as {
            ownImages: Record<string, string>;
            resolvedImages: Record<string, string>;
            storeSlug: string | null;
          })
        : { ownImages: {}, resolvedImages: {}, storeSlug: null };
      const own = imagesJson.ownImages ?? {};
      // Global = resolved - own (lo que viene del default que NO sobrescribió la tienda)
      const global: Record<string, string> = {};
      for (const [k, v] of Object.entries(imagesJson.resolvedImages ?? {})) {
        if (!own[k]) global[k] = v;
      }
      setOwnImages(own);
      setInitialOwnImages(own);
      setGlobalImages(global);

      // Agrupar productos por categoría
      const grouped = new Map<string, OrdenProductRow[]>();
      const counts = new Map<string, number>();
      for (const p of products) {
        const cat = (p.category ?? "").trim();
        if (!cat) continue;
        counts.set(cat, (counts.get(cat) ?? 0) + 1);
        if (!grouped.has(cat)) grouped.set(cat, []);
        grouped.get(cat)!.push({
          id: p.id,
          name: p.name,
          retailPrice: p.retailPrice,
          image: p.image,
          isActive: p.isActive,
        });
      }

      const base: OrdenCategoryRow[] = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count }));

      // Aplicar orden persistido de categorías
      const persisted = catOrderJson.order ?? [];
      const orderedCats: OrdenCategoryRow[] = persisted.length === 0
        ? base
        : (() => {
            const idxMap = new Map<string, number>();
            persisted.forEach((name, i) => idxMap.set(name, i));
            return [...base].sort((a, b) => {
              const ra = idxMap.has(a.name) ? idxMap.get(a.name)! : Number.MAX_SAFE_INTEGER;
              const rb = idxMap.has(b.name) ? idxMap.get(b.name)! : Number.MAX_SAFE_INTEGER;
              if (ra !== rb) return ra - rb;
              return b.count - a.count;
            });
          })();

      // Aplicar orden persistido de productos por categoría
      const productOrderMap = prodOrderJson.byCategory ?? {};
      const groupedOrdered: Record<string, OrdenProductRow[]> = {};
      for (const [cat, items] of grouped) {
        const persistedIds = productOrderMap[cat];
        if (!persistedIds || persistedIds.length === 0) {
          groupedOrdered[cat] = items;
        } else {
          const idxMap = new Map<string, number>();
          persistedIds.forEach((id, i) => idxMap.set(id, i));
          groupedOrdered[cat] = [...items].sort((a, b) => {
            const ra = idxMap.has(a.id) ? idxMap.get(a.id)! : Number.MAX_SAFE_INTEGER;
            const rb = idxMap.has(b.id) ? idxMap.get(b.id)! : Number.MAX_SAFE_INTEGER;
            return ra - rb;
          });
        }
      }

      // Snapshot inicial para detectar dirty
      const initProdSnap: Record<string, string[]> = {};
      for (const [cat, items] of Object.entries(groupedOrdered)) {
        initProdSnap[cat] = items.map((p) => p.id);
      }

      setRows(orderedCats);
      setInitialCatOrder(orderedCats.map((r) => r.name));
      setProductsByCat(groupedOrdered);
      setInitialProductOrder(initProdSnap);
      setStoreSlug(catOrderJson.storeSlug);
    } catch {
      setError("No se pudieron cargar las categorías de tu tienda.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const dirty = (() => {
    // Cambió orden de categorías?
    if (rows.length !== initialCatOrder.length) return true;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].name !== initialCatOrder[i]) return true;
    }
    // Cambió orden de productos en alguna categoría?
    for (const cat of Object.keys(productsByCat)) {
      const current = productsByCat[cat].map((p) => p.id).join(",");
      const initial = (initialProductOrder[cat] ?? []).join(",");
      if (current !== initial) return true;
    }
    // Cambió alguna imagen propia (subida/borrada)?
    const allKeys = new Set([
      ...Object.keys(ownImages),
      ...Object.keys(initialOwnImages),
    ]);
    for (const k of allKeys) {
      if (ownImages[k] !== initialOwnImages[k]) return true;
    }
    return false;
  })();

  // ── Movimiento de categorías ──
  const moveCat = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return;
    setRows((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };
  const moveCatUp   = (i: number) => moveCat(i, i - 1);
  const moveCatDown = (i: number) => moveCat(i, i + 1);
  const moveCatTop  = (i: number) => moveCat(i, 0);
  const moveCatEnd  = (i: number) => moveCat(i, rows.length - 1);

  // ── Movimiento de productos dentro de una categoría ──
  const moveProd = (cat: string, from: number, to: number) => {
    setProductsByCat((prev) => {
      const items = prev[cat];
      if (!items) return prev;
      if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return prev;
      const next = [...items];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return { ...prev, [cat]: next };
    });
  };
  const moveProdUp   = (cat: string, i: number) => moveProd(cat, i, i - 1);
  const moveProdDown = (cat: string, i: number) => moveProd(cat, i, i + 1);

  // ── Toggle expand ──
  const toggleExpand = (cat: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // ── Reset ──
  const reset = () => {
    setRows((prev) => [...prev].sort((a, b) => b.count - a.count));
    // Reset orden de productos al snapshot inicial
    setProductsByCat((prev) => {
      const next: Record<string, OrdenProductRow[]> = {};
      for (const [cat, items] of Object.entries(prev)) {
        const initIds = initialProductOrder[cat] ?? [];
        if (initIds.length === 0) {
          next[cat] = items;
        } else {
          const idxMap = new Map<string, number>();
          initIds.forEach((id, i) => idxMap.set(id, i));
          next[cat] = [...items].sort((a, b) => {
            const ra = idxMap.has(a.id) ? idxMap.get(a.id)! : Number.MAX_SAFE_INTEGER;
            const rb = idxMap.has(b.id) ? idxMap.get(b.id)! : Number.MAX_SAFE_INTEGER;
            return ra - rb;
          });
        }
      }
      return next;
    });
  };

  // ── Save: guarda categorías Y productos en paralelo ──
  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const byCategory: Record<string, string[]> = {};
      for (const [cat, items] of Object.entries(productsByCat)) {
        byCategory[cat] = items.map((p) => p.id);
      }

      // Diff de imágenes: incluye solo las que cambiaron (set o delete).
      const imagesDiff: Record<string, string | null> = {};
      const allImageKeys = new Set([
        ...Object.keys(ownImages),
        ...Object.keys(initialOwnImages),
      ]);
      for (const k of allImageKeys) {
        if (ownImages[k] !== initialOwnImages[k]) {
          imagesDiff[k] = ownImages[k] ?? null;
        }
      }

      const [catRes, prodRes, imgRes] = await Promise.all([
        fetch("/api/admin/marketplace/category-order", {
          method: "PUT",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ order: rows.map((r) => r.name) }),
        }),
        fetch("/api/admin/marketplace/product-order", {
          method: "PUT",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ byCategory }),
        }),
        Object.keys(imagesDiff).length > 0
          ? fetch("/api/admin/marketplace/category-images", {
              method: "PUT",
              headers: csrfHeaders({ "Content-Type": "application/json" }),
              body: JSON.stringify({ images: imagesDiff }),
            })
          : Promise.resolve(new Response(JSON.stringify({ ok: true }))),
      ]);

      if (!catRes.ok) {
        const j = await catRes.json().catch(() => ({}));
        throw new Error(j.error ?? "save_failed");
      }
      if (!prodRes.ok) {
        const j = await prodRes.json().catch(() => ({}));
        throw new Error(j.error ?? "save_failed");
      }
      if (!imgRes.ok) {
        const j = await imgRes.json().catch(() => ({}));
        throw new Error(j.error ?? "save_failed");
      }

      setInitialCatOrder(rows.map((r) => r.name));
      setInitialProductOrder(byCategory);
      setInitialOwnImages(ownImages);
      setSuccess("Orden e imágenes guardados · se aplicará al storefront en segundos");
      setTimeout(() => setSuccess(null), 4000);
    } catch (e) {
      setError(e instanceof Error && e.message === "no_store_for_tenant"
        ? "Tu cuenta aún no tiene una tienda en el marketplace."
        : "No se pudo guardar el orden. Intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <TableSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header explicativo */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center shrink-0">
            <ArrowUpDown className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <div className="flex-1">
            <CardTitle>
              Orden de categorías y productos en tu tienda
            </CardTitle>
            <p className="text-[var(--ts-sm)] text-[var(--text-secondary)] mt-1 leading-relaxed">
              Decide en qué orden aparecen las categorías cuando un cliente entra a
              {storeSlug ? <> tu storefront <code className="px-1 py-0.5 bg-[var(--surface-sunken)] rounded text-[var(--ts-xs)]">/marketplace/{storeSlug}</code>.</> : " tu storefront."}
              {" "}Arrastrá las filas o usá las flechas. <strong className="text-[var(--text-primary)]">Click en la flecha</strong> para expandir y reordenar los productos dentro de cada categoría.
            </p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2 text-[var(--ts-sm)] text-[var(--text-tertiary)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
            {rows.length} {rows.length === 1 ? "categoría" : "categorías"}
          </span>
          {dirty && (
            <span className="px-2 py-0.5 rounded-full bg-[var(--data-warning-100)] text-[var(--data-warning-500)] text-[var(--ts-xs)] font-bold">
              Cambios sin guardar
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={reset}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--ts-sm)] font-medium text-[var(--text-primary)] hover:border-[var(--rule-strong)] hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-50"
            title="Volver al orden por número de productos"
          >
            <RotateCcw className="h-4 w-4" />
            Restablecer
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving || rows.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent-600,var(--accent))] text-white text-[var(--ts-sm)] font-bold hover:bg-[var(--data-success-600)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="h-4 w-4" />
            {saving ? "Guardando..." : "Guardar orden"}
          </button>
        </div>
      </div>

      {/* Banner success */}
      {success && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--data-success-50)] border border-[var(--data-success-500)] text-[var(--data-success-500)]">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span className="text-[var(--ts-sm)] font-medium">{success}</span>
        </div>
      )}

      {/* Banner error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--data-error-50)] border border-[var(--data-error-500)] text-[var(--data-error-500)]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-[var(--ts-sm)] font-medium">{error}</span>
        </div>
      )}

      {/* Lista de categorías */}
      {rows.length === 0 ? (
        <div className="text-center py-12 rounded-xl border-2 border-dashed border-[var(--rule-base)]">
          <Tag className="h-10 w-10 mx-auto text-[var(--text-tertiary)] mb-3" />
          <p className="text-[var(--ts-base)] font-bold text-[var(--text-primary)]">
            Aún no tenés productos con categoría
          </p>
          <p className="text-[var(--ts-sm)] text-[var(--text-secondary)] mt-1">
            Cargá productos y asigná categorías para ordenarlas acá.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((row, i) => {
            const isFirst = i === 0;
            const isLast  = i === rows.length - 1;
            const isDragging = dragCatIdx === i;
            const isDropTarget = dragOverCat === i && dragCatIdx !== null && dragCatIdx !== i;
            const expanded = expandedCats.has(row.name);
            const products = productsByCat[row.name] ?? [];
            return (
              <li
                key={row.name}
                className={cn(
                  "rounded-xl border bg-[var(--surface-raised)] transition-all overflow-hidden",
                  "border-[var(--rule-base)]",
                  isDragging && "opacity-40",
                  isDropTarget && "border-[var(--accent)] ring-2 ring-[var(--accent-muted)]",
                )}
              >
                {/* Header fila — drag/drop solo en este header, no en la sublista */}
                <div
                  draggable
                  onDragStart={(e) => {
                    setDragCatIdx(i);
                    try { e.dataTransfer.effectAllowed = "move"; } catch {}
                    try { e.dataTransfer.setData("application/x-cat-idx", String(i)); } catch {}
                  }}
                  onDragEnd={() => { setDragCatIdx(null); setDragOverCat(null); }}
                  onDragOver={(e) => {
                    if (dragCatIdx === null) return;
                    e.preventDefault();
                    try { e.dataTransfer.dropEffect = "move"; } catch {}
                    if (dragOverCat !== i) setDragOverCat(i);
                  }}
                  onDragLeave={() => { if (dragOverCat === i) setDragOverCat(null); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const fromStr = e.dataTransfer.getData("application/x-cat-idx");
                    const from = Number.parseInt(fromStr, 10);
                    if (!Number.isNaN(from)) moveCat(from, i);
                    setDragCatIdx(null); setDragOverCat(null);
                  }}
                  className={cn(
                    "group flex items-center gap-3 p-3 hover:border-[var(--rule-strong)]",
                  )}
                >
                  {/* Drag handle de categoría */}
                  <span
                    className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-grab active:cursor-grabbing"
                    title="Arrastrá para reordenar la categoría"
                    aria-hidden
                  >
                    <GripVertical className="h-5 w-5" />
                  </span>

                  {/* Caret expand */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(row.name)}
                    className="p-1 rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors shrink-0"
                    title={expanded ? "Colapsar productos" : "Ver productos para reordenarlos"}
                    aria-expanded={expanded}
                    aria-label={expanded ? "Colapsar productos" : "Expandir productos"}
                  >
                    <ChevronDown
                      className={cn("h-4 w-4 transition-transform duration-200", expanded ? "rotate-0" : "-rotate-90")}
                    />
                  </button>

                  {/* Position badge */}
                  <span className={cn(
                    "h-7 w-7 rounded-full flex items-center justify-center text-[var(--ts-xs)] font-bold tabular-nums shrink-0",
                    isFirst
                      ? "bg-[var(--accent-600,var(--accent))] text-white shadow-[0_0_0_2px_var(--accent-soft)]"
                      : "bg-[var(--surface-sunken)] text-[var(--text-primary)] border border-[var(--rule-base)]",
                  )}>
                    {i + 1}
                  </span>

                  {/* Imagen de la categoría (subida por el dueño o default global) */}
                  <CategoryImageUploader
                    categoryName={row.name}
                    value={ownImages[row.name] ?? null}
                    defaultValue={globalImages[row.name] ?? null}
                    onChange={(url) =>
                      setOwnImages((prev) => {
                        const next = { ...prev };
                        if (url) next[row.name] = url;
                        else delete next[row.name];
                        return next;
                      })
                    }
                  />

                  {/* Nombre + count */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[var(--ts-sm)] font-bold text-[var(--text-primary)] truncate">
                        {row.name}
                      </span>
                      {isFirst && (
                        <span className="px-1.5 py-0.5 rounded text-[var(--ts-2xs)] font-bold uppercase tracking-wide bg-[var(--accent-soft)] text-[var(--accent)]">
                          Destacada
                        </span>
                      )}
                    </div>
                    <p className="text-[var(--ts-xs)] text-[var(--text-tertiary)] mt-0.5">
                      {row.count} {row.count === 1 ? "producto" : "productos"}
                    </p>
                  </div>

                  {/* Acciones de categoría */}
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => moveCatTop(i)}
                      disabled={isFirst || saving}
                      className="p-1.5 rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--text-tertiary)]"
                      title="Mover al inicio"
                      aria-label="Mover categoría al inicio"
                    >
                      <ArrowUp className="h-4 w-4" />
                      <ArrowUp className="h-4 w-4 -mt-2" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveCatUp(i)}
                      disabled={isFirst || saving}
                      className="p-1.5 rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--text-tertiary)]"
                      title="Subir categoría"
                      aria-label="Subir categoría un puesto"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveCatDown(i)}
                      disabled={isLast || saving}
                      className="p-1.5 rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--text-tertiary)]"
                      title="Bajar categoría"
                      aria-label="Bajar categoría un puesto"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveCatEnd(i)}
                      disabled={isLast || saving}
                      className="p-1.5 rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--text-tertiary)]"
                      title="Mover al final"
                      aria-label="Mover categoría al final"
                    >
                      <ArrowDown className="h-4 w-4" />
                      <ArrowDown className="h-4 w-4 -mt-2" />
                    </button>
                  </div>
                </div>

                {/* Sublista de productos — preview HORIZONTAL estilo storefront real.
                    Scroll lateral + cards visuales con imagen grande, precio, mock
                    botón carrito. Drag horizontal (izquierda/derecha = atrás/adelante). */}
                {expanded && (
                  <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-4 py-4">
                    {products.length === 0 ? (
                      <p className="text-center text-[var(--ts-base)] text-[var(--text-secondary)] py-6">
                        Esta categoría no tiene productos.
                      </p>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-3 gap-3">
                          <p className="text-[var(--ts-sm)] font-bold text-[var(--text-primary)]">
                            Orden de productos · vista previa de tu tienda
                          </p>
                          <p className="text-[var(--ts-xs)] text-[var(--text-tertiary)] hidden md:block">
                            Arrastrá lateralmente o usá <ChevronLeft className="inline h-3 w-3 -mt-0.5" /> <ChevronRight className="inline h-3 w-3 -mt-0.5" /> para reordenar
                          </p>
                        </div>

                        {/* Scroller horizontal con scroll-snap para feel de tienda */}
                        <div
                          className="relative overflow-x-auto pb-3 -mx-1 px-1"
                          style={{ scrollSnapType: "x proximity" }}
                          role="list"
                          aria-label={`Productos de ${row.name}`}
                        >
                          <ul className="flex gap-3" style={{ minWidth: "min-content" }}>
                            {products.map((prod, j) => {
                              const pIsDragging = dragProd?.cat === row.name && dragProd?.idx === j;
                              const pIsDropTarget = dragOverProd?.cat === row.name && dragOverProd?.idx === j && !(dragProd?.cat === row.name && dragProd?.idx === j);
                              const pIsFirst = j === 0;
                              const pIsLast  = j === products.length - 1;
                              return (
                                <li
                                  key={prod.id}
                                  draggable
                                  onDragStart={(e) => {
                                    setDragProd({ cat: row.name, idx: j });
                                    try { e.dataTransfer.effectAllowed = "move"; } catch {}
                                    try { e.dataTransfer.setData("application/x-prod-idx", `${row.name}|${j}`); } catch {}
                                    e.stopPropagation();
                                  }}
                                  onDragEnd={() => { setDragProd(null); setDragOverProd(null); }}
                                  onDragOver={(e) => {
                                    if (!dragProd || dragProd.cat !== row.name) return;
                                    e.preventDefault();
                                    e.stopPropagation();
                                    try { e.dataTransfer.dropEffect = "move"; } catch {}
                                    if (dragOverProd?.cat !== row.name || dragOverProd?.idx !== j) {
                                      setDragOverProd({ cat: row.name, idx: j });
                                    }
                                  }}
                                  onDragLeave={() => {
                                    if (dragOverProd?.cat === row.name && dragOverProd?.idx === j) setDragOverProd(null);
                                  }}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const data = e.dataTransfer.getData("application/x-prod-idx");
                                    if (data) {
                                      const [fromCat, fromIdxStr] = data.split("|");
                                      const fromIdx = Number.parseInt(fromIdxStr, 10);
                                      if (fromCat === row.name && !Number.isNaN(fromIdx)) {
                                        moveProd(row.name, fromIdx, j);
                                      }
                                    }
                                    setDragProd(null); setDragOverProd(null);
                                  }}
                                  style={{ scrollSnapAlign: "start" }}
                                  className={cn(
                                    "group relative flex flex-col w-[200px] sm:w-[220px] shrink-0 rounded-2xl border bg-[var(--surface-raised)] overflow-hidden transition-all cursor-grab active:cursor-grabbing",
                                    "border-[var(--rule-base)] hover:border-[var(--accent)] hover:shadow-lg hover:-translate-y-0.5",
                                    pIsDragging && "opacity-40 scale-95",
                                    pIsDropTarget && "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface-canvas)]",
                                    !prod.isActive && "opacity-70",
                                  )}
                                  title="Arrastrá hacia los lados para reordenar"
                                >
                                  {/* Position pill — esquina superior izq */}
                                  <span className={cn(
                                    "absolute top-2 left-2 z-10 h-7 w-7 rounded-full flex items-center justify-center text-[var(--ts-xs)] font-black tabular-nums shadow-md",
                                    pIsFirst
                                      ? "bg-[var(--accent-600,var(--accent))] text-white shadow-[0_0_0_2px_var(--accent-soft)]"
                                      : "bg-[var(--surface-canvas)] text-[var(--text-primary)] border border-[var(--rule-base)]",
                                  )}>
                                    {j + 1}
                                  </span>

                                  {/* Drag handle — esquina superior derecha */}
                                  <span
                                    className="absolute top-2 right-2 z-10 h-7 w-7 rounded-full flex items-center justify-center bg-[var(--surface-canvas)]/90 backdrop-blur border border-[var(--rule-base)] text-[var(--text-secondary)] shadow-sm group-hover:text-[var(--accent)]"
                                    aria-hidden
                                  >
                                    <GripVertical className="h-3.5 w-3.5" />
                                  </span>

                                  {/* Inactivo overlay badge */}
                                  {!prod.isActive && (
                                    <span className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-2 py-0.5 rounded-md text-[var(--ts-2xs)] font-black uppercase tracking-wider bg-[var(--data-warning-500)] text-[var(--surface-canvas)]">
                                      Inactivo
                                    </span>
                                  )}

                                  {/* Imagen — aspect 4:3 grande */}
                                  <div className="relative aspect-[4/3] bg-[var(--surface-sunken)] overflow-hidden border-b border-[var(--rule-soft)]">
                                    {prod.image ? (
                                      /* eslint-disable-next-line @next/next/no-img-element */
                                      <img
                                        src={prod.image}
                                        alt=""
                                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                        loading="lazy"
                                        draggable={false}
                                      />
                                    ) : (
                                      <div className="h-full w-full flex items-center justify-center">
                                        <ImageIcon className="h-12 w-12 text-[var(--text-tertiary)]" />
                                      </div>
                                    )}
                                  </div>

                                  {/* Contenido */}
                                  <div className="flex flex-1 flex-col p-3 gap-1.5">
                                    {/* Nombre — text-base, font-bold */}
                                    <h4 className={cn(
                                      "text-[var(--ts-sm)] font-bold leading-snug line-clamp-2 min-h-[2.5rem]",
                                      prod.isActive ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)] line-through",
                                    )}>
                                      {prod.name}
                                    </h4>

                                    {/* Precio + Carrito mock */}
                                    <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                                      <div className="min-w-0 flex-1">
                                        <span className="block text-[var(--ts-xl)] font-black tabular-nums tracking-tight text-[var(--text-primary)] leading-none">
                                          S/ {Number(prod.retailPrice).toFixed(2)}
                                        </span>
                                      </div>
                                      {/* Mock carrito — decorativo, replica el CTA del storefront */}
                                      <span
                                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-600,var(--accent))] text-white shadow-md group-hover:scale-110 transition-transform"
                                        aria-hidden
                                      >
                                        <ShoppingCart className="h-4 w-4" />
                                      </span>
                                    </div>

                                    {/* Reorder controles laterales */}
                                    <div className="flex items-center justify-between gap-1 mt-1 pt-2 border-t border-[var(--rule-soft)]">
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); moveProdUp(row.name, j); }}
                                        disabled={pIsFirst || saving}
                                        className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[var(--ts-xs)] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                        title="Mover hacia la izquierda"
                                        aria-label="Mover producto a la izquierda"
                                      >
                                        <ChevronLeft className="h-4 w-4" />
                                        <span className="sr-only md:not-sr-only">Atrás</span>
                                      </button>
                                      <span className="text-[var(--ts-2xs)] text-[var(--text-tertiary)] font-bold tabular-nums px-1">
                                        {j + 1}/{products.length}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); moveProdDown(row.name, j); }}
                                        disabled={pIsLast || saving}
                                        className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[var(--ts-xs)] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                        title="Mover hacia la derecha"
                                        aria-label="Mover producto a la derecha"
                                      >
                                        <span className="sr-only md:not-sr-only">Adelante</span>
                                        <ChevronRight className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </div>

                        <p className="text-[var(--ts-xs)] text-[var(--text-tertiary)] mt-2 md:hidden">
                          Tip: arrastrá las tarjetas hacia los lados o usá <ChevronLeft className="inline h-3 w-3 -mt-0.5" /> <ChevronRight className="inline h-3 w-3 -mt-0.5" /> para reordenar.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Footer hint */}
      {rows.length > 0 && (
        <p className="text-[var(--ts-xs)] text-[var(--text-tertiary)] text-center pt-2">
          Tip: usá teclado <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] border border-[var(--rule-base)] text-[var(--ts-2xs)]">Tab</kbd> para navegar y las flechas para reordenar.
        </p>
      )}
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

  const refreshKpis = useCallback(() => {
    setKpisLoading(true);
    fetch("/api/marketplace/kpis")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setKpis(d as MarketplaceKPIs); })
      .catch((err) => { console.warn("[MarketplaceModule] fetch failed", err); })
      .finally(() => setKpisLoading(false));
  }, []);

  useEffect(() => {
    refreshKpis();
  }, [refreshKpis]);

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

      <AdminTabBar
        tabs={TABS}
        activeTab={tab}
        onTabChange={(id) => setTab(id)}
        moduleId={MODULE_ID}
      >
        {tab === "resumen"     && (
          <>
            <MarketplaceQuickActions onNavigate={(id) => setTab(id)} />
            <Suspense fallback={<Spinner />}>
              <MarketplaceDashboardTab kpis={kpis} loading={kpisLoading} />
            </Suspense>
          </>
        )}
        {tab === "tienda"      && <TiendaTab />}
        {tab === "productos"   && <ProductosTab />}
        {tab === "ordenes"     && <OrdenesTabReal />}
        {tab === "comisiones"  && <ComisionesTab />}
        {tab === "precios"     && (
          <Suspense fallback={<Spinner />}>
            <CompetitivePricingTab />
          </Suspense>
        )}
        {tab === "cupones"     && <CuponesTab />}
        {tab === "resenas"     && <ResenasTab />}
        {tab === "fidelidad"   && <FidelidadTab />}
        {tab === "orden"       && <OrdenTab />}
      </AdminTabBar>
    </div>
  );
}
