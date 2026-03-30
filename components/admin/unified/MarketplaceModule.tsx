"use client";

import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import {
  Store,
  Package,
  ShoppingCart,
  DollarSign,
  GripVertical,
  RefreshCw,
  Edit2,
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
} from "lucide-react";
import { cn } from "@/lib/utils";

// Dynamic import del dashboard multi-tienda (sólo para planes Business/Enterprise)
const MultiStoreDashboard = lazy(() => import("@/components/admin/MultiStoreDashboard"));
// Dynamic import del tab de precios competitivos
const CompetitivePricingTab = lazy(() => import("@/components/admin/CompetitivePricingTab"));

// ── Spinner compacto ──
const Spinner = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-[#0f766e] border-t-transparent rounded-full animate-spin" />
  </div>
);

// ── Loading skeleton ──
const TableSkeleton = () => (
  <div className="space-y-3 animate-pulse">
    {[1, 2, 3, 4].map((i) => (
      <div key={i} className="flex items-center gap-4">
        <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
        </div>
        <div className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded-lg" />
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
  pendiente:   { label: "Pendiente",  className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  confirmado:  { label: "Confirmado", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  en_camino:   { label: "En camino",  className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  entregado:   { label: "Entregado",  className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  cancelado:   { label: "Cancelado",  className: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
};

const COMMISSION_STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  pendiente:  { label: "Pendiente",  className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",     icon: Clock },
  liquidado:  { label: "Liquidado",  className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",         icon: CheckCircle },
  pagado:     { label: "Pagado",     className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle },
};

const TABS = [
  { id: "tienda",       label: "Mi Tienda",    icon: Store },
  { id: "productos",    label: "Productos",    icon: Package },
  { id: "ordenes",      label: "Órdenes",      icon: ShoppingCart },
  { id: "comisiones",   label: "Comisiones",   icon: DollarSign },
  { id: "precios",      label: "Precios",      icon: TrendingUp },
  { id: "multitienda",  label: "Multi-tienda", icon: LayoutGrid },
] as const;

type TabId = (typeof TABS)[number]["id"];

const CATEGORIAS = [
  "Abarrotes", "Bebidas", "Lácteos", "Carnes", "Frutas y verduras",
  "Panadería", "Limpieza", "Higiene personal", "Electrónica", "Otros",
];

const ZONAS = [
  "Yarinacocha", "Callería", "Coronel Portillo", "Manantay",
  "Centro", "Ica Yanayacu", "Pueblo Libre", "Todos",
];

// ─────────────────────────────────────────────
// Sub-tab: Mi Tienda
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
    fetch("/api/marketplace/stores")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && (d.slug || d.name)) setStore(d as StoreData);
      })
      .catch(() => setError("Error al cargar datos de la tienda."))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/marketplace/stores", {
        method: store.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(store),
      });
      if (!res.ok) throw new Error("Error al guardar");
      const data = await res.json();
      setStore(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Error al guardar la tienda. Intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-5 shadow-sm space-y-5">
        <h3 className="font-bold text-gray-900 dark:text-foreground text-sm">Configuración de la tienda</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Slug */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-600 dark:text-muted">
              URL de la tienda (slug)
            </label>
            <input
              type="text"
              value={store.slug}
              onChange={(e) => setStore((p) => ({ ...p, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") }))}
              placeholder="mi-bodega"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm text-gray-900 dark:text-foreground outline-none focus:ring-2 focus:ring-[#0f766e]/30 focus:border-[#0f766e] transition-all"
            />
            {store.slug && (
              <p className="text-[10px] text-gray-400">marketplace.com/tienda/{store.slug}</p>
            )}
          </div>

          {/* Nombre */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-600 dark:text-muted">Nombre de la tienda</label>
            <input
              type="text"
              value={store.name}
              onChange={(e) => setStore((p) => ({ ...p, name: e.target.value }))}
              placeholder="Bodega San Martín"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm text-gray-900 dark:text-foreground outline-none focus:ring-2 focus:ring-[#0f766e]/30 focus:border-[#0f766e] transition-all"
            />
          </div>

          {/* Categoría */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-600 dark:text-muted">Categoría principal</label>
            <div className="relative">
              <select
                value={store.category}
                onChange={(e) => setStore((p) => ({ ...p, category: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm text-gray-900 dark:text-foreground outline-none focus:ring-2 focus:ring-[#0f766e]/30 focus:border-[#0f766e] appearance-none transition-all"
              >
                {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Zona */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-600 dark:text-muted">Zona de cobertura</label>
            <div className="relative">
              <select
                value={store.zone}
                onChange={(e) => setStore((p) => ({ ...p, zone: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm text-gray-900 dark:text-foreground outline-none focus:ring-2 focus:ring-[#0f766e]/30 focus:border-[#0f766e] appearance-none transition-all"
              >
                {ZONAS.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Comisión */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-600 dark:text-muted">Comisión acordada (%)</label>
            <input
              type="number"
              min={0}
              max={30}
              step={0.5}
              value={store.commissionRate}
              onChange={(e) => setStore((p) => ({ ...p, commissionRate: parseFloat(e.target.value) || 0 }))}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm text-gray-900 dark:text-foreground outline-none focus:ring-2 focus:ring-[#0f766e]/30 focus:border-[#0f766e] transition-all"
            />
          </div>

          {/* Logo URL */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-600 dark:text-muted">URL del logo</label>
            <input
              type="url"
              value={store.logoUrl}
              onChange={(e) => setStore((p) => ({ ...p, logoUrl: e.target.value }))}
              placeholder="https://..."
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm text-gray-900 dark:text-foreground outline-none focus:ring-2 focus:ring-[#0f766e]/30 focus:border-[#0f766e] transition-all"
            />
          </div>
        </div>

        {/* Descripción */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-600 dark:text-muted">Descripción de la tienda</label>
          <textarea
            rows={3}
            value={store.description}
            onChange={(e) => setStore((p) => ({ ...p, description: e.target.value }))}
            placeholder="Describe tu bodega, horarios, especialidades..."
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm text-gray-900 dark:text-foreground outline-none focus:ring-2 focus:ring-[#0f766e]/30 focus:border-[#0f766e] resize-none transition-all"
          />
        </div>

        {/* Estado activo */}
        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-surface rounded-xl border border-gray-200 dark:border-card-border">
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-foreground">Tienda activa en marketplace</p>
            <p className="text-xs text-gray-500 dark:text-muted">Los clientes podrán encontrar y comprar en tu tienda</p>
          </div>
          <button
            onClick={() => setStore((p) => ({ ...p, isActive: !p.isActive }))}
            className={cn(
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
              store.isActive ? "bg-[#0f766e]" : "bg-gray-300 dark:bg-gray-600"
            )}
          >
            <span className={cn(
              "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform",
              store.isActive ? "translate-x-6" : "translate-x-1"
            )} />
          </button>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          {saved && (
            <span className="text-sm text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
              <CheckCircle className="h-4 w-4" /> Guardado
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0f766e] text-white text-sm font-bold hover:bg-[#0d5f58] transition-colors disabled:opacity-50"
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
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={load} className="ml-auto text-xs underline">Reintentar</button>
        </div>
      )}

      {products.length === 0 && !error ? (
        <div className="text-center py-16 text-gray-400 dark:text-muted">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold">Sin productos publicados</p>
          <p className="text-xs mt-1">Activa productos desde tu catálogo para mostrarlos en el marketplace.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-surface border-b border-gray-200 dark:border-card-border">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Producto</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Precio retail</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Mayorista</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Stock</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Publicado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-card-border">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900 dark:text-foreground">{p.name}</p>
                      <p className="text-xs text-gray-400 dark:text-muted font-mono">{p.sku}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-foreground">
                      S/{p.retailPrice.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-muted">
                      S/{p.wholesalePrice.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold",
                        p.stock > 10 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : p.stock > 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
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
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors min-w-[100px] justify-center",
                          p.isActive
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50"
                            : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
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
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={load} className="ml-auto text-xs underline">Reintentar</button>
        </div>
      )}

      {orders.length === 0 && !error ? (
        <div className="text-center py-16 text-gray-400 dark:text-muted">
          <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold">Sin órdenes del marketplace aún</p>
          <p className="text-xs mt-1">Las órdenes recibidas desde el marketplace aparecerán aquí.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-surface border-b border-gray-200 dark:border-card-border">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Orden</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Cliente</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Total</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Estado</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-card-border">
                {orders.map((o) => {
                  const statusConfig = ORDER_STATUS_CONFIG[o.status] ?? {
                    label: o.status,
                    className: "bg-gray-100 text-gray-600",
                  };
                  return (
                    <tr key={o.id} className="hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-bold text-gray-900 dark:text-foreground">
                          #{o.id.slice(-8).toUpperCase()}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-muted">{o.itemsCount} producto{o.itemsCount !== 1 ? "s" : ""}</p>
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900 dark:text-foreground">{o.customerName}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-foreground">S/{o.total.toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("inline-flex px-2.5 py-1 rounded-full text-xs font-bold", statusConfig.className)}>
                          {statusConfig.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-500 dark:text-muted">
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

  if (loading) return <TableSkeleton />;

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={load} className="ml-auto text-xs underline">Reintentar</button>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { key: "pendiente", label: "Por pagar", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/20" },
          { key: "liquidado", label: "Liquidado",  color: "text-blue-600 dark:text-blue-400",  bg: "bg-blue-50 dark:bg-blue-900/20" },
          { key: "pagado",    label: "Pagado",     color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
        ].map(({ key, label, color, bg }) => (
          <div key={key} className={cn("rounded-2xl p-4 border border-gray-200 dark:border-card-border shadow-sm", bg)}>
            <p className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">{label}</p>
            <p className={cn("text-2xl font-extrabold mt-1", color)}>
              S/{(summary[key as keyof CommissionSummary] || 0).toFixed(2)}
            </p>
          </div>
        ))}
      </div>

      {entries.length === 0 && !error ? (
        <div className="text-center py-16 text-gray-400 dark:text-muted">
          <DollarSign className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold">Sin comisiones registradas aún</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-surface border-b border-gray-200 dark:border-card-border">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Orden</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Total orden</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Comisión</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Estado</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-card-border">
                {entries.map((e) => {
                  const sc = COMMISSION_STATUS_CONFIG[e.status] ?? COMMISSION_STATUS_CONFIG.pendiente;
                  const StatusIcon = sc.icon;
                  return (
                    <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-bold text-gray-900 dark:text-foreground">
                          #{e.orderId.slice(-8).toUpperCase()}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 dark:text-muted">S/{e.orderTotal.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-foreground">S/{e.amount.toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold", sc.className)}>
                          <StatusIcon className="h-3 w-3" />
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-500 dark:text-muted">
                        {new Date(e.createdAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}
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
interface MarketplaceKPIs {
  publishedProducts: number;
  monthOrders: number;
  pendingCommissions: number;
}

export default function MarketplaceModule() {
  const [tab, setTab] = useState<TabId>("tienda");
  const [kpis, setKpis] = useState<MarketplaceKPIs>({
    publishedProducts: 0,
    monthOrders: 0,
    pendingCommissions: 0,
  });
  const [kpisLoading, setKpisLoading] = useState(true);
  // Plan del tenant (para mostrar/ocultar tab Multi-tienda)
  const [tenantPlan, setTenantPlan] = useState<string>("free");

  // Drag-and-drop tab reorder
  const [tabOrder, setTabOrder] = useState<string[]>(() =>
    TABS.map((t) => t.id)
  );
  const [draggedTab, setDraggedTab]   = useState<string | null>(null);
  const [dragOverTab, setDragOverTab] = useState<string | null>(null);

  useEffect(() => {
    setKpisLoading(true);
    fetch("/api/marketplace/kpis")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setKpis(d as MarketplaceKPIs); })
      .catch(() => {})
      .finally(() => setKpisLoading(false));
    // Leer plan del tenant desde settings
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.planName) setTenantPlan(d.planName as string); })
      .catch(() => {});
  }, []);

  const isMultiStoreEnabled = tenantPlan === "business" || tenantPlan === "enterprise";

  const orderedTabs = tabOrder
    .map((id) => TABS.find((t) => t.id === id))
    // Ocultar Multi-tienda si el plan no lo permite
    .filter((t) => t && (t.id !== "multitienda" || isMultiStoreEnabled))
    .filter(Boolean) as typeof TABS[number][];

  function handleDropTab(targetId: string) {
    if (!draggedTab || draggedTab === targetId) return;
    const n = [...tabOrder];
    const f = n.indexOf(draggedTab);
    const t = n.indexOf(targetId);
    n.splice(f, 1);
    n.splice(t, 0, draggedTab);
    setTabOrder(n);
    setDraggedTab(null);
    setDragOverTab(null);
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl bg-[#0f766e] text-white flex items-center justify-center shadow-sm">
          <Store className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Marketplace</h1>
          <p className="text-xs text-gray-500 dark:text-muted">Gestiona tu tienda en la plataforma de ventas</p>
        </div>
        <button
          onClick={() => {
            setKpisLoading(true);
            fetch("/api/marketplace/kpis")
              .then((r) => (r.ok ? r.json() : null))
              .then((d) => { if (d) setKpis(d as MarketplaceKPIs); })
              .catch(() => {})
              .finally(() => setKpisLoading(false));
          }}
          className="ml-auto p-2 rounded-lg text-gray-400 hover:text-[#0f766e] hover:bg-[#0f766e]/10 transition-colors"
          title="Actualizar"
        >
          <RefreshCw className={cn("h-4 w-4", kpisLoading && "animate-spin")} />
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Productos publicados", value: kpis.publishedProducts, color: "text-[#0f766e]" },
          { label: "Órdenes del mes",      value: kpis.monthOrders,       color: "text-blue-600 dark:text-blue-400" },
          { label: "Comisiones pendientes",value: `S/${kpis.pendingCommissions.toFixed(2)}`, color: "text-amber-600 dark:text-amber-400" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-3 sm:p-4 shadow-sm text-center"
          >
            {kpisLoading ? (
              <div className="h-7 w-16 mx-auto bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            ) : (
              <p className={cn("text-2xl font-extrabold", color)}>{value}</p>
            )}
            <p className="text-[10px] sm:text-xs text-gray-500 dark:text-muted mt-0.5 leading-tight">{label}</p>
          </div>
        ))}
      </div>

      {/* Tab bar — pill style */}
      <div className="relative">
        <div className="flex gap-1 bg-gray-100 dark:bg-surface rounded-xl p-1 overflow-x-auto scrollbar-none">
          {orderedTabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                draggable
                onDragStart={() => setDraggedTab(t.id)}
                onDragOver={(e) => { e.preventDefault(); setDragOverTab(t.id); }}
                onDragLeave={() => setDragOverTab(null)}
                onDrop={() => handleDropTab(t.id)}
                onDragEnd={() => { setDraggedTab(null); setDragOverTab(null); }}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors cursor-grab active:cursor-grabbing",
                  tab === t.id
                    ? "bg-[#0f766e] text-white shadow-sm"
                    : "text-gray-600 dark:text-muted hover:bg-gray-200 dark:hover:bg-gray-700",
                  draggedTab === t.id && "opacity-40 scale-95",
                  dragOverTab === t.id && draggedTab !== t.id && "ring-2 ring-[#0f766e] ring-offset-1",
                )}
                aria-current={tab === t.id ? "page" : undefined}
              >
                <GripVertical className="h-3 w-3 shrink-0 opacity-30" />
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      {tab === "tienda"      && <TiendaTab />}
      {tab === "productos"   && <ProductosTab />}
      {tab === "ordenes"     && <OrdenesTab />}
      {tab === "comisiones"  && <ComisionesTab />}
      {tab === "precios"     && (
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-12">
              <div className="h-7 w-7 animate-spin rounded-full border-4 border-[#2d6a4f] border-t-transparent" />
            </div>
          }
        >
          <CompetitivePricingTab />
        </Suspense>
      )}
      {tab === "multitienda" && isMultiStoreEnabled && (
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-12">
              <div className="h-7 w-7 animate-spin rounded-full border-4 border-[#0f766e] border-t-transparent" />
            </div>
          }
        >
          <MultiStoreDashboard />
        </Suspense>
      )}
    </div>
  );
}
