"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ShoppingBag, Star, RefreshCw, Package, DollarSign,
  TrendingUp, Users, Search, Eye, ToggleLeft, ToggleRight,
  BarChart3, Ticket, ArrowUpRight, ArrowDownRight,
  Palette, EyeOff, Check, X, Percent, GripVertical,
  Crown, Globe, Image as ImageIcon,
} from "lucide-react";
import { SADataTable } from "@/components/superadmin/_shared/SADataTable";
import { TableSkeleton } from "@/components/superadmin/_shared/SASkeleton";
import { PlanBadge } from "@/components/superadmin/_shared/SABadge";
import type { SAColumn } from "@/components/superadmin/_shared/SADataTable";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StoreRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logo: string | null;
  banner: string | null;
  isPublished: boolean;
  rating: number;
  reviewCount: number;
  category: string;
  zone: string;
  commission: number;
  createdAt: string;
  tenant: {
    id: string;
    slug: string;
    name: string;
    plan: string;
    active: boolean;
  };
  _count: { products: number };
}

interface MarketplaceOrder {
  id: string;
  storeName: string;
  storeSlug: string;
  customerName: string;
  customerPhone: string;
  total: number;
  status: string;
  itemCount: number;
  createdAt: string;
}

interface MarketplaceCoupon {
  id: string;
  code: string;
  storeName: string;
  discountType: string;
  discountValue: number;
  maxUses: number;
  usedCount: number;
  active: boolean;
  expiresAt: string | null;
}

type Tab = "stores" | "orders" | "coupons" | "analytics" | "personalizar";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });

function StatCard({ icon, label, value, sub, trend }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/20 text-primary">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</p>
        <p className="text-lg font-extrabold text-gray-900 dark:text-white leading-tight mt-0.5">{value}</p>
        {sub && (
          <p className={`text-[10px] font-semibold mt-0.5 flex items-center gap-0.5 ${
            trend === "up" ? "text-green-600 dark:text-green-400" :
            trend === "down" ? "text-red-500 dark:text-red-400" :
            "text-gray-400"
          }`}>
            {trend === "up" && <ArrowUpRight className="w-3 h-3" />}
            {trend === "down" && <ArrowDownRight className="w-3 h-3" />}
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Tab components ───────────────────────────────────────────────────────────

// ── Stores Tab ──

const STORE_COLUMNS: SAColumn<StoreRow>[] = [
  {
    key: "tenant",
    label: "Tienda (Tenant)",
    render: (row) => (
      <div>
        <div className="font-medium text-gray-900 dark:text-white text-sm">{row.tenant.name}</div>
        <div className="text-xs text-gray-400 font-mono mt-0.5">{row.tenant.slug}</div>
      </div>
    ),
  },
  {
    key: "name",
    label: "Store",
    render: (row) => (
      <div>
        <div className="text-sm text-gray-800 dark:text-gray-200">{row.name}</div>
        <div className="text-xs text-gray-400 font-mono mt-0.5">{row.slug}</div>
      </div>
    ),
  },
  {
    key: "plan",
    label: "Plan",
    render: (row) => <PlanBadge plan={row.tenant.plan as "free" | "pro" | "business" | "enterprise"} />,
  },
  {
    key: "isPublished",
    label: "Estado",
    render: (row) => (
      <span
        className={[
          "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold",
          row.isPublished
            ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
            : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
        ].join(" ")}
      >
        <span className={["w-1.5 h-1.5 rounded-full", row.isPublished ? "bg-green-500" : "bg-gray-400"].join(" ")} />
        {row.isPublished ? "Publicado" : "Borrador"}
      </span>
    ),
  },
  {
    key: "category",
    label: "Categoría",
    render: (row) => (
      <span className="text-xs text-gray-600 dark:text-gray-400 capitalize">{row.category}</span>
    ),
  },
  {
    key: "rating",
    label: "Rating",
    sortable: true,
    render: (row) => (
      <span className="inline-flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400 font-semibold">
        <Star className="w-3.5 h-3.5 fill-current" />
        {row.rating.toFixed(1)}
        <span className="text-gray-400 font-normal text-xs">({row.reviewCount})</span>
      </span>
    ),
  },
  {
    key: "commission",
    label: "Comisión",
    sortable: true,
    render: (row) => (
      <span className="text-sm font-bold text-primary tabular-nums">{row.commission}%</span>
    ),
  },
  {
    key: "products",
    label: "Productos",
    sortable: true,
    render: (row) => (
      <span className="text-sm text-gray-700 dark:text-gray-300 tabular-nums">
        {row._count.products}
      </span>
    ),
  },
  {
    key: "createdAt",
    label: "Creado",
    render: (row) => (
      <span className="text-xs text-gray-400 tabular-nums">{fmtDate(row.createdAt)}</span>
    ),
  },
];

function StoresTab({ stores, loading, error, onRefresh, refreshing }: {
  stores: StoreRow[] | undefined;
  loading: boolean;
  error: string;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");

  const filtered = useMemo(() => {
    if (!stores) return [];
    let list = stores;
    if (filter === "published") list = list.filter((s) => s.isPublished);
    if (filter === "draft") list = list.filter((s) => !s.isPublished);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q) || s.tenant.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q));
    }
    return list;
  }, [stores, filter, search]);

  const published = stores?.filter((s) => s.isPublished).length ?? 0;
  const total = stores?.length ?? 0;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<ShoppingBag className="w-5 h-5" />} label="Total tiendas" value={total} sub={`${published} publicadas`} trend="up" />
        <StatCard icon={<Package className="w-5 h-5" />} label="Productos totales" value={stores?.reduce((s, r) => s + r._count.products, 0) ?? 0} />
        <StatCard icon={<Star className="w-5 h-5" />} label="Rating promedio" value={(stores && stores.length ? (stores.reduce((s, r) => s + r.rating, 0) / stores.length).toFixed(1) : "0")} />
        <StatCard icon={<DollarSign className="w-5 h-5" />} label="Comisión promedio" value={`${(stores && stores.length ? (stores.reduce((s, r) => s + r.commission, 0) / stores.length).toFixed(1) : "0")}%`} />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tienda..."
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 pl-9 pr-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/30"
          />
        </div>
        <div className="flex gap-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-1">
          {(["all", "published", "draft"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                filter === f ? "bg-primary text-white" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {f === "all" ? "Todas" : f === "published" ? "Publicadas" : "Borradores"}
            </button>
          ))}
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing || loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}
      {loading && <TableSkeleton count={6} />}
      {!loading && filtered.length === 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl py-16 text-center">
          <ShoppingBag className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p className="text-gray-400 text-sm">No hay tiendas</p>
        </div>
      )}
      {!loading && filtered.length > 0 && (
        <SADataTable columns={STORE_COLUMNS} data={filtered} rowKey={(row) => row.id} emptyMessage="Sin resultados" />
      )}
    </div>
  );
}

// ── Orders Tab ──

const ORDER_STATUS_COLORS: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  procesando: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  completado: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  cancelado: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  enviado: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

const ORDER_COLUMNS: SAColumn<MarketplaceOrder>[] = [
  {
    key: "id",
    label: "ID",
    render: (row) => <span className="text-xs font-mono text-gray-400">{row.id.slice(0, 8)}…</span>,
  },
  {
    key: "storeName",
    label: "Tienda",
    render: (row) => (
      <div>
        <div className="text-sm font-medium text-gray-900 dark:text-white">{row.storeName}</div>
        <div className="text-xs text-gray-400">{row.storeSlug}</div>
      </div>
    ),
  },
  {
    key: "customerName",
    label: "Cliente",
    render: (row) => (
      <div>
        <div className="text-sm text-gray-800 dark:text-gray-200">{row.customerName}</div>
        <div className="text-xs text-gray-400">{row.customerPhone}</div>
      </div>
    ),
  },
  {
    key: "total",
    label: "Total",
    sortable: true,
    render: (row) => <span className="text-sm font-bold text-primary tabular-nums">{fmt(row.total)}</span>,
  },
  {
    key: "itemCount",
    label: "Items",
    render: (row) => <span className="text-sm text-gray-600 dark:text-gray-400 tabular-nums">{row.itemCount}</span>,
  },
  {
    key: "status",
    label: "Estado",
    render: (row) => (
      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${ORDER_STATUS_COLORS[row.status] ?? "bg-gray-100 text-gray-500"}`}>
        {row.status}
      </span>
    ),
  },
  {
    key: "createdAt",
    label: "Fecha",
    sortable: true,
    render: (row) => <span className="text-xs text-gray-400 tabular-nums">{fmtDate(row.createdAt)}</span>,
  },
];

function OrdersTab() {
  const [orders, setOrders] = useState<MarketplaceOrder[] | undefined>(undefined);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/superadmin/marketplace/orders", { credentials: "include" });
      if (!res.ok) throw new Error("Error al cargar pedidos");
      const data = await res.json();
      setOrders(data.orders ?? []);
    } catch {
      setError("Error al cargar pedidos del marketplace");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (!orders) return [];
    if (!search.trim()) return orders;
    const q = search.toLowerCase();
    return orders.filter((o) =>
      o.customerName.toLowerCase().includes(q) ||
      o.storeName.toLowerCase().includes(q) ||
      o.id.toLowerCase().includes(q)
    );
  }, [orders, search]);

  const totalRevenue = orders?.reduce((s, o) => s + (o.status !== "cancelado" ? o.total : 0), 0) ?? 0;
  const completedCount = orders?.filter((o) => o.status === "completado").length ?? 0;
  const pendingCount = orders?.filter((o) => o.status === "pendiente").length ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<Package className="w-5 h-5" />} label="Total pedidos" value={orders?.length ?? 0} />
        <StatCard icon={<DollarSign className="w-5 h-5" />} label="Ingresos totales" value={fmt(totalRevenue)} trend="up" sub="Marketplace" />
        <StatCard icon={<TrendingUp className="w-5 h-5" />} label="Completados" value={completedCount} sub={`${orders?.length ? Math.round((completedCount / orders.length) * 100) : 0}% del total`} trend="up" />
        <StatCard icon={<Users className="w-5 h-5" />} label="Pendientes" value={pendingCount} sub="Requieren atención" trend={pendingCount > 5 ? "down" : "neutral"} />
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar pedido, cliente o tienda..."
          className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 pl-9 pr-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/30"
        />
      </div>

      {error && <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-600 rounded-xl px-4 py-3 text-sm">{error}</div>}
      {orders === undefined && !error && <TableSkeleton count={6} />}
      {orders !== undefined && (
        <SADataTable columns={ORDER_COLUMNS} data={filtered} rowKey={(row) => row.id} emptyMessage="Sin pedidos" />
      )}
    </div>
  );
}

// ── Coupons Tab ──

const COUPON_COLUMNS: SAColumn<MarketplaceCoupon>[] = [
  {
    key: "code",
    label: "Código",
    render: (row) => <span className="text-sm font-mono font-bold text-primary">{row.code}</span>,
  },
  {
    key: "storeName",
    label: "Tienda",
    render: (row) => <span className="text-sm text-gray-700 dark:text-gray-300">{row.storeName}</span>,
  },
  {
    key: "discount",
    label: "Descuento",
    render: (row) => (
      <span className="text-sm font-bold text-green-600 dark:text-green-400">
        {row.discountType === "percent" ? `${row.discountValue}%` : fmt(row.discountValue)}
      </span>
    ),
  },
  {
    key: "usage",
    label: "Uso",
    render: (row) => (
      <span className="text-sm text-gray-600 dark:text-gray-400 tabular-nums">
        {row.usedCount} / {row.maxUses}
      </span>
    ),
  },
  {
    key: "active",
    label: "Estado",
    render: (row) => (
      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${row.active ? "text-green-600" : "text-gray-400"}`}>
        {row.active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
        {row.active ? "Activo" : "Inactivo"}
      </span>
    ),
  },
  {
    key: "expiresAt",
    label: "Expira",
    render: (row) => (
      <span className="text-xs text-gray-400 tabular-nums">
        {row.expiresAt ? fmtDate(row.expiresAt) : "Sin fecha"}
      </span>
    ),
  },
];

function CouponsTab() {
  const [coupons, setCoupons] = useState<MarketplaceCoupon[] | undefined>(undefined);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/superadmin/marketplace/coupons", { credentials: "include" });
      if (!res.ok) throw new Error("Error al cargar cupones");
      const data = await res.json();
      setCoupons(data.coupons ?? []);
    } catch {
      setError("Error al cargar cupones del marketplace");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activeCount = coupons?.filter((c) => c.active).length ?? 0;
  const totalUsed = coupons?.reduce((s, c) => s + c.usedCount, 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard icon={<Ticket className="w-5 h-5" />} label="Total cupones" value={coupons?.length ?? 0} sub={`${activeCount} activos`} trend="up" />
        <StatCard icon={<TrendingUp className="w-5 h-5" />} label="Veces usados" value={totalUsed} sub="Total redenciones" />
        <StatCard icon={<DollarSign className="w-5 h-5" />} label="Cupones bienvenida" value={coupons?.filter((c) => c.code.startsWith("BIENVENIDO")).length ?? 0} sub="Generados automáticamente" />
      </div>

      {error && <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-600 rounded-xl px-4 py-3 text-sm">{error}</div>}
      {coupons === undefined && !error && <TableSkeleton count={6} />}
      {coupons !== undefined && (
        <SADataTable columns={COUPON_COLUMNS} data={coupons} rowKey={(row) => row.id} emptyMessage="Sin cupones" />
      )}
    </div>
  );
}

// ── Analytics Tab ──

const SEVEN_DAYS_AGO = Date.now() - 7 * 24 * 60 * 60 * 1000;

function AnalyticsTab({ stores }: { stores: StoreRow[] | undefined }) {
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);

  useEffect(() => {
    fetch("/api/superadmin/marketplace/orders", { credentials: "include" })
      .then((r) => r.ok ? r.json() : { orders: [] })
      .then((d) => setOrders(d.orders ?? []))
      .catch(() => {});
  }, []);

  // Revenue by store
  const revenueByStore = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; orders: number }>();
    for (const o of orders) {
      if (o.status === "cancelado") continue;
      const existing = map.get(o.storeSlug) ?? { name: o.storeName, revenue: 0, orders: 0 };
      map.set(o.storeSlug, { name: o.storeName, revenue: existing.revenue + o.total, orders: existing.orders + 1 });
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [orders]);

  // Category distribution
  const categoryDist = useMemo(() => {
    if (!stores) return [];
    const map = new Map<string, number>();
    for (const s of stores) {
      map.set(s.category, (map.get(s.category) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).map(([cat, count]) => ({ category: cat, count }));
  }, [stores]);

  // Recent orders (last 7 days)
  const recentOrders = orders.filter((o) => new Date(o.createdAt).getTime() > SEVEN_DAYS_AGO);
  const recentRevenue = recentOrders.filter((o) => o.status !== "cancelado").reduce((s, o) => s + o.total, 0);

  return (
    <div className="space-y-6">
      {/* Overview KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<BarChart3 className="w-5 h-5" />} label="Ventas últimos 7 días" value={fmt(recentRevenue)} trend="up" sub={`${recentOrders.length} pedidos`} />
        <StatCard icon={<ShoppingBag className="w-5 h-5" />} label="Tiendas activas" value={stores?.filter((s) => s.isPublished).length ?? 0} sub={`de ${stores?.length ?? 0} totales`} />
        <StatCard icon={<Users className="w-5 h-5" />} label="Ticket promedio" value={fmt(recentOrders.length ? recentRevenue / recentOrders.length : 0)} />
        <StatCard icon={<TrendingUp className="w-5 h-5" />} label="Tasa completados" value={`${orders.length ? Math.round((orders.filter((o) => o.status === "completado").length / orders.length) * 100) : 0}%`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top stores by revenue */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Top tiendas por ingresos
          </h3>
          {revenueByStore.length === 0 ? (
            <p className="text-sm text-gray-400">Sin datos</p>
          ) : (
            <div className="space-y-3">
              {revenueByStore.map((s, i) => {
                const maxRevenue = revenueByStore[0]?.revenue || 1;
                const pct = (s.revenue / maxRevenue) * 100;
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{s.name}</span>
                      <span className="text-sm font-bold text-primary tabular-nums">{fmt(s.revenue)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">{s.orders} pedidos</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Category distribution */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-primary" />
            Distribución por categoría
          </h3>
          {categoryDist.length === 0 ? (
            <p className="text-sm text-gray-400">Sin datos</p>
          ) : (
            <div className="space-y-3">
              {categoryDist.map((c, i) => {
                const maxCount = categoryDist[0]?.count || 1;
                const pct = (c.count / maxCount) * 100;
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">{c.category}</span>
                      <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{c.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-secondary to-secondary/60" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Personalizar Tab ──

function PersonalizarTab({ stores, onRefresh }: { stores: StoreRow[] | undefined; onRefresh: () => void }) {
  const [saving, setSaving] = useState<string | null>(null);
  const [editCommission, setEditCommission] = useState<{ id: string; value: string } | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const togglePublished = async (store: StoreRow) => {
    setSaving(store.id);
    try {
      const res = await fetch("/api/superadmin/stores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ storeId: store.id, isPublished: !store.isPublished }),
      });
      if (!res.ok) throw new Error();
      showToast(`${store.name} ${!store.isPublished ? "publicada" : "ocultada"}`, true);
      onRefresh();
    } catch {
      showToast("Error al actualizar", false);
    } finally {
      setSaving(null);
    }
  };

  const saveCommission = async (storeId: string) => {
    if (!editCommission) return;
    const val = parseFloat(editCommission.value);
    if (isNaN(val) || val < 0 || val > 100) {
      showToast("Comisión debe ser entre 0 y 100%", false);
      return;
    }
    setSaving(storeId);
    try {
      const res = await fetch("/api/superadmin/stores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ storeId, commission: val }),
      });
      if (!res.ok) throw new Error();
      showToast("Comisión actualizada", true);
      setEditCommission(null);
      onRefresh();
    } catch {
      showToast("Error al guardar comisión", false);
    } finally {
      setSaving(null);
    }
  };

  const published = stores?.filter((s) => s.isPublished) ?? [];
  const hidden = stores?.filter((s) => !s.isPublished) ?? [];
  const avgCommission = stores?.length
    ? (stores.reduce((s, r) => s + r.commission, 0) / stores.length).toFixed(1)
    : "0";

  if (!stores) return <TableSkeleton count={4} />;

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg transition-all ${
          toast.ok
            ? "bg-green-50 text-green-700 border border-green-200 dark:bg-green-950/80 dark:text-green-300 dark:border-green-800"
            : "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/80 dark:text-red-300 dark:border-red-800"
        }`}>
          {toast.ok ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<Eye className="w-5 h-5" />} label="Tiendas visibles" value={published.length} sub={`de ${stores.length} totales`} trend="up" />
        <StatCard icon={<EyeOff className="w-5 h-5" />} label="Tiendas ocultas" value={hidden.length} sub="No aparecen en marketplace" />
        <StatCard icon={<Percent className="w-5 h-5" />} label="Comisión promedio" value={`${avgCommission}%`} sub="Sobre cada venta" />
        <StatCard icon={<Globe className="w-5 h-5" />} label="Categorías" value={new Set(stores.map((s) => s.category)).size} sub="Tipos de tienda" />
      </div>

      {/* Published Stores — Tiendas visibles */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Eye className="w-4 h-4 text-green-500" />
          Tiendas visibles en el Marketplace
          <span className="ml-auto text-xs font-normal text-gray-400">{published.length} tiendas</span>
        </h3>

        {published.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No hay tiendas publicadas</p>
        ) : (
          <div className="space-y-3">
            {published.map((store, i) => (
              <div
                key={store.id}
                className="flex items-center gap-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 p-4 transition-all hover:border-primary/30"
              >
                {/* Position */}
                <div className="flex items-center gap-1 text-gray-400">
                  <GripVertical className="w-4 h-4" />
                  <span className="text-xs font-bold tabular-nums w-5 text-center">{i + 1}</span>
                </div>

                {/* Logo */}
                <div className="w-10 h-10 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                  {store.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={store.logo} alt={store.name} className="w-full h-full object-cover" />
                  ) : (
                    <ShoppingBag className="w-5 h-5 text-primary" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{store.name}</span>
                    {i === 0 && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                    <PlanBadge plan={store.tenant.plan as "free" | "pro" | "business" | "enterprise"} />
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-gray-400 capitalize">{store.category}</span>
                    <span className="text-xs text-amber-500 flex items-center gap-0.5">
                      <Star className="w-3 h-3 fill-current" /> {store.rating.toFixed(1)}
                    </span>
                    <span className="text-xs text-gray-400">{store._count.products} productos</span>
                  </div>
                </div>

                {/* Commission */}
                <div className="shrink-0">
                  {editCommission?.id === store.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={editCommission.value}
                        onChange={(e) => setEditCommission({ id: store.id, value: e.target.value })}
                        className="w-16 rounded-lg border border-primary/30 bg-white dark:bg-gray-900 px-2 py-1 text-xs text-center font-bold focus:border-primary focus:ring-1 focus:ring-primary/30"
                        onKeyDown={(e) => { if (e.key === "Enter") void saveCommission(store.id); if (e.key === "Escape") setEditCommission(null); }}
                        autoFocus
                      />
                      <span className="text-xs text-gray-400">%</span>
                      <button
                        onClick={() => void saveCommission(store.id)}
                        disabled={saving === store.id}
                        className="p-1 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setEditCommission(null)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditCommission({ id: store.id, value: String(store.commission) })}
                      className="flex items-center gap-1 text-xs font-bold text-primary hover:bg-primary/10 px-2 py-1 rounded-lg transition-colors"
                      title="Editar comisión"
                    >
                      <Percent className="w-3 h-3" />
                      {store.commission}%
                    </button>
                  )}
                </div>

                {/* Toggle visibility */}
                <button
                  onClick={() => void togglePublished(store)}
                  disabled={saving === store.id}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30 transition-colors disabled:opacity-40"
                  title="Ocultar del marketplace"
                >
                  {saving === store.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <EyeOff className="w-3 h-3" />}
                  Ocultar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hidden Stores */}
      {hidden.length > 0 && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <EyeOff className="w-4 h-4 text-gray-400" />
            Tiendas ocultas
            <span className="ml-auto text-xs font-normal text-gray-400">{hidden.length} tiendas</span>
          </h3>

          <div className="space-y-3">
            {hidden.map((store) => (
              <div
                key={store.id}
                className="flex items-center gap-4 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-800/20 p-4 opacity-70 hover:opacity-100 transition-all"
              >
                {/* Logo */}
                <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden shrink-0">
                  {store.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={store.logo} alt={store.name} className="w-full h-full object-cover grayscale" />
                  ) : (
                    <ShoppingBag className="w-5 h-5 text-gray-400" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-gray-500 dark:text-gray-400 truncate block">{store.name}</span>
                  <span className="text-xs text-gray-400 capitalize">{store.category} · {store._count.products} productos</span>
                </div>

                {/* Commission */}
                <span className="text-xs font-semibold text-gray-400 tabular-nums">{store.commission}%</span>

                {/* Toggle */}
                <button
                  onClick={() => void togglePublished(store)}
                  disabled={saving === store.id}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30 transition-colors disabled:opacity-40"
                  title="Publicar en marketplace"
                >
                  {saving === store.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                  Publicar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Marketplace Appearance Settings */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Palette className="w-4 h-4 text-purple-500" />
          Apariencia del Marketplace
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-gray-100 dark:border-gray-800 p-4 bg-gray-50/50 dark:bg-gray-800/30">
            <div className="flex items-center gap-2 mb-2">
              <ImageIcon className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Hero Banner</span>
            </div>
            <p className="text-xs text-gray-400">El banner grande que se muestra arriba del marketplace</p>
            <p className="text-[10px] text-primary mt-2 font-medium">Se configura desde cada tienda individual → pestaña Mi Tienda</p>
          </div>
          <div className="rounded-xl border border-gray-100 dark:border-gray-800 p-4 bg-gray-50/50 dark:bg-gray-800/30">
            <div className="flex items-center gap-2 mb-2">
              <Crown className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Tiendas Destacadas</span>
            </div>
            <p className="text-xs text-gray-400">Las tiendas en posición 1-3 arriba aparecen primero en el marketplace</p>
            <p className="text-[10px] text-green-600 mt-2 font-medium">Reordena la lista de arriba para priorizar tiendas</p>
          </div>
          <div className="rounded-xl border border-gray-100 dark:border-gray-800 p-4 bg-gray-50/50 dark:bg-gray-800/30">
            <div className="flex items-center gap-2 mb-2">
              <Percent className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Comisiones</span>
            </div>
            <p className="text-xs text-gray-400">Haz clic en el porcentaje de cada tienda para editar su comisión por venta</p>
            <p className="text-[10px] text-amber-600 mt-2 font-medium">Promedio actual: {avgCommission}%</p>
          </div>
          <div className="rounded-xl border border-gray-100 dark:border-gray-800 p-4 bg-gray-50/50 dark:bg-gray-800/30">
            <div className="flex items-center gap-2 mb-2">
              <ToggleRight className="w-4 h-4 text-green-500" />
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Visibilidad</span>
            </div>
            <p className="text-xs text-gray-400">Controla qué tiendas aparecen en el marketplace con los botones Publicar/Ocultar</p>
            <p className="text-[10px] text-primary mt-2 font-medium">{published.length} visibles · {hidden.length} ocultas</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TABS CONFIG ──────────────────────────────────────────────────────────────

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "stores", label: "Tiendas", icon: <ShoppingBag className="w-4 h-4" /> },
  { key: "orders", label: "Pedidos", icon: <Package className="w-4 h-4" /> },
  { key: "coupons", label: "Cupones", icon: <Ticket className="w-4 h-4" /> },
  { key: "analytics", label: "Analítica", icon: <BarChart3 className="w-4 h-4" /> },
  { key: "personalizar", label: "Personalizar", icon: <Palette className="w-4 h-4" /> },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StoresPage() {
  const [stores, setStores] = useState<StoreRow[] | undefined>(undefined);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>("stores");

  const load = useCallback(async (silent = false) => {
    if (!silent) setStores(undefined);
    else setRefreshing(true);
    setError("");
    try {
      const res = await fetch("/api/superadmin/stores", { credentials: "include" });
      if (!res.ok) { setError("Error al cargar tiendas"); return; }
      const data = await res.json() as { stores: StoreRow[] };
      setStores(data.stores);
    } catch {
      setError("Error de red");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-primary" />
            Administrar Marketplace
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Gestión completa de tiendas, pedidos, cupones y métricas del marketplace
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-1.5 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all whitespace-nowrap ${
              tab === t.key
                ? "bg-primary text-white shadow-md shadow-primary/25"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-800"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "stores" && (
        <StoresTab
          stores={stores}
          loading={stores === undefined && !error}
          error={error}
          onRefresh={() => void load(true)}
          refreshing={refreshing}
        />
      )}
      {tab === "orders" && <OrdersTab />}
      {tab === "coupons" && <CouponsTab />}
      {tab === "analytics" && <AnalyticsTab stores={stores} />}
      {tab === "personalizar" && <PersonalizarTab stores={stores} onRefresh={() => void load(true)} />}
    </div>
  );
}
