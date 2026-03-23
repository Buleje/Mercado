"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  TrendingUp,
  ShoppingBag,
  Package,
  Users,
  AlertTriangle,
  Clock,
  DollarSign,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Sun,
  Moon,
  Sunset,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Product, Sale } from "@/types/erp";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrderItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
  unit: string;
  image?: string;
}

interface Order {
  id: string;
  customer: { name: string; phone?: string; location?: string; reference?: string };
  items: OrderItem[];
  total: number;
  status: "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado";
  paymentMethod?: string;
  createdAt: string;
  updatedAt?: string;
}

interface Payable {
  id: string;
  supplierId?: string;
  supplierName?: string;
  amount: number;
  paidAmount: number;
  status: string;
  dueDate?: string;
}

interface DashboardAlerts {
  lowStock: number;
  pendingOrders: number;
  overduePayables: number;
}

interface DashboardPayload {
  products: Product[];
  orders: Order[];
  sales: Sale[];
  payables: Payable[];
  alerts: DashboardAlerts;
}

interface TopProduct {
  id: number | string;
  name: string;
  qty: number;
  revenue: number;
}

interface TopCustomer {
  name: string;
  phone?: string;
  total: number;
  orderCount: number;
}

interface HourBucket {
  hour: number;
  label: string;
  amount: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return `S/${n.toFixed(2)}`;
}

function isToday(iso: string): boolean {
  try {
    return new Date(iso).toDateString() === new Date().toDateString();
  } catch {
    return false;
  }
}

function isThisMonth(iso: string): boolean {
  try {
    const d = new Date(iso);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  } catch {
    return false;
  }
}

function isLastMonth(iso: string): boolean {
  try {
    const d = new Date(iso);
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return d.getMonth() === prev.getMonth() && d.getFullYear() === prev.getFullYear();
  } catch {
    return false;
  }
}

function getGreeting(): { text: string; Icon: typeof Sun } {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return { text: "Buenos días", Icon: Sun };
  if (h >= 12 && h < 19) return { text: "Buenas tardes", Icon: Sunset };
  return { text: "Buenas noches", Icon: Moon };
}

function formatDateLong(): string {
  return new Date().toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-gray-100 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 animate-pulse",
        className
      )}
    >
      <div className="h-3 w-1/3 rounded bg-gray-200 dark:bg-zinc-700 mb-3" />
      <div className="h-7 w-1/2 rounded bg-gray-200 dark:bg-zinc-700 mb-2" />
      <div className="h-3 w-2/3 rounded bg-gray-200 dark:bg-zinc-700" />
    </div>
  );
}

function SkeletonBar({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="h-3 w-28 rounded bg-gray-200 dark:bg-zinc-700 shrink-0" />
          <div
            className="h-5 rounded bg-gray-200 dark:bg-zinc-700"
            style={{ width: `${30 + (i % 4) * 15}%` }}
          />
        </div>
      ))}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

type IconComponent = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  Icon: IconComponent;
  accent: string;
  badge?: string;
  badgeColor?: string;
}

function KpiCard({ label, value, sub, Icon, accent, badge, badgeColor }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-gray-100 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide">
          {label}
        </span>
        <span
          className="flex items-center justify-center w-8 h-8 rounded-lg"
          style={{ backgroundColor: `${accent}18` }}
        >
          <Icon className="w-4 h-4" style={{ color: accent }} />
        </span>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-zinc-100 leading-none">
        {value}
      </p>
      <div className="flex items-center justify-between">
        {sub && (
          <span className="text-xs text-gray-400 dark:text-zinc-500">{sub}</span>
        )}
        {badge && (
          <span
            className={cn(
              "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
              badgeColor
            )}
          >
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Alert Badge ───────────────────────────────────────────────────────────────

interface AlertBadgeProps {
  Icon: IconComponent;
  label: string;
  count: number;
  colorClass: string;
}

function AlertBadge({ Icon, label, count, colorClass }: AlertBadgeProps) {
  if (count === 0) return null;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
        colorClass
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span>{label}</span>
      <span className="ml-auto font-bold tabular-nums">{count}</span>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

interface SmartDashboardTabProps {
  adminName?: string;
}

export default function SmartDashboardTab({
  adminName = "Administrador",
}: SmartDashboardTabProps) {
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [alerts, setAlerts] = useState<DashboardAlerts>({
    lowStock: 0,
    pendingOrders: 0,
    overduePayables: 0,
  });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Data fetch ──────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setFetchError(null);
    try {
      const [dashRes, prodRes] = await Promise.all([
        fetch("/api/admin/dashboard"),
        fetch("/api/products?limit=200"),
      ]);

      if (dashRes.ok) {
        const data: DashboardPayload = await dashRes.json();
        setOrders(data.orders ?? []);
        setSales(data.sales ?? []);
        setPayables(data.payables ?? []);
        setAlerts(data.alerts ?? { lowStock: 0, pendingOrders: 0, overduePayables: 0 });
      } else {
        setFetchError("No se pudo conectar con el servidor.");
      }

      if (prodRes.ok) {
        const prods: Product[] = await prodRes.json();
        setProducts(prods);
      }

      setLastUpdated(new Date());
    } catch {
      setFetchError("Error de red al cargar el dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 60_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [load]);

  // ── Derived: ventas de hoy ──────────────────────────────────────────────────

  const salesToday = useMemo(
    () => sales.filter((s) => isToday(s.createdAt)),
    [sales]
  );

  const revenueToday = useMemo(
    () => salesToday.reduce((acc, s) => acc + (s.total ?? 0), 0),
    [salesToday]
  );

  // ── Derived: pedidos activos ────────────────────────────────────────────────

  const activeOrders = useMemo(
    () =>
      orders.filter(
        (o) => o.status === "pendiente" || o.status === "confirmado" || o.status === "en_camino"
      ).length,
    [orders]
  );

  // ── Derived: fiados pendientes (cuentas por cobrar) ────────────────────────

  const pendingFiados = useMemo(
    () => payables.filter((p) => p.status !== "pagado").length,
    [payables]
  );

  // ── Derived: stock bajo ─────────────────────────────────────────────────────

  const lowStockCount = useMemo(() => alerts.lowStock, [alerts]);

  // ── Derived: margen promedio del día ───────────────────────────────────────

  const marginToday = useMemo(() => {
    let revenue = 0;
    let cogs = 0;
    for (const sale of salesToday) {
      revenue += sale.total ?? 0;
      const items: Array<{ price?: number; costPrice?: number; quantity: number }> =
        sale.items ?? [];
      for (const item of items) {
        const cost = item.costPrice ?? (item.price ?? 0) * 0.7;
        cogs += cost * item.quantity;
      }
    }
    if (revenue === 0) return 0;
    return ((revenue - cogs) / revenue) * 100;
  }, [salesToday]);

  // ── Derived: mes actual vs anterior ────────────────────────────────────────

  const { revenueThisMonth, revenuePrevMonth, monthDelta } = useMemo(() => {
    const thisM = sales
      .filter((s) => isThisMonth(s.createdAt))
      .reduce((acc, s) => acc + (s.total ?? 0), 0);
    const prevM = sales
      .filter((s) => isLastMonth(s.createdAt))
      .reduce((acc, s) => acc + (s.total ?? 0), 0);
    const delta = prevM === 0 ? 0 : ((thisM - prevM) / prevM) * 100;
    return { revenueThisMonth: thisM, revenuePrevMonth: prevM, monthDelta: delta };
  }, [sales]);

  // ── Derived: top 10 productos más vendidos ─────────────────────────────────

  const topProducts = useMemo<TopProduct[]>(() => {
    const map = new Map<string, TopProduct>();
    for (const sale of sales) {
      const items: Array<{ productId?: number | string; name?: string; price?: number; quantity: number }> =
        sale.items ?? [];
      for (const item of items) {
        const key = String(item.productId ?? item.name ?? "?");
        const existing = map.get(key);
        if (existing) {
          existing.qty += item.quantity;
          existing.revenue += (item.price ?? 0) * item.quantity;
        } else {
          map.set(key, {
            id: item.productId ?? key,
            name: item.name ?? "Producto",
            qty: item.quantity,
            revenue: (item.price ?? 0) * item.quantity,
          });
        }
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);
  }, [sales]);

  const maxProductQty = useMemo(
    () => (topProducts.length > 0 ? topProducts[0].qty : 1),
    [topProducts]
  );

  // ── Derived: top 5 clientes del mes ────────────────────────────────────────

  const topCustomers = useMemo<TopCustomer[]>(() => {
    const map = new Map<string, TopCustomer>();
    const monthOrders = orders.filter(
      (o) => isThisMonth(o.createdAt) && o.status !== "cancelado"
    );
    for (const order of monthOrders) {
      const key = order.customer?.phone ?? order.customer?.name ?? "?";
      const existing = map.get(key);
      if (existing) {
        existing.total += order.total ?? 0;
        existing.orderCount += 1;
      } else {
        map.set(key, {
          name: order.customer?.name ?? "Cliente",
          phone: order.customer?.phone,
          total: order.total ?? 0,
          orderCount: 1,
        });
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [orders]);

  // ── Derived: horario pico (ventas por hora del día) ────────────────────────

  const hourBuckets = useMemo<HourBucket[]>(() => {
    const buckets: number[] = new Array(24).fill(0);
    for (const sale of salesToday) {
      try {
        const h = new Date(sale.createdAt).getHours();
        buckets[h] += sale.total ?? 0;
      } catch {
        // ignore malformed dates
      }
    }
    // Show hours 6–22 only (business hours)
    return Array.from({ length: 17 }, (_, i) => {
      const hour = i + 6;
      return {
        hour,
        label: `${String(hour).padStart(2, "0")}h`,
        amount: buckets[hour] ?? 0,
      };
    });
  }, [salesToday]);

  const maxHourAmount = useMemo(
    () => Math.max(1, ...hourBuckets.map((b) => b.amount)),
    [hourBuckets]
  );

  // ── Derived: lotes por vencer (productos con expiryDate próxima) ───────────

  const expiringBatchCount = useMemo(() => {
    const now = new Date();
    const threshold = new Date(now);
    threshold.setDate(threshold.getDate() + 7);
    return products.filter((p) => {
      if (!p.expiryDate) return false;
      try {
        const exp = new Date(p.expiryDate);
        return exp >= now && exp <= threshold;
      } catch {
        return false;
      }
    }).length;
  }, [products]);

  // ── Greeting ────────────────────────────────────────────────────────────────

  const { text: greetingText, Icon: GreetingIcon } = getGreeting();

  // ── Render ──────────────────────────────────────────────────────────────────

  const hasAnyAlert =
    alerts.lowStock > 0 || alerts.overduePayables > 0 || expiringBatchCount > 0;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 max-w-7xl mx-auto">
      {/* ── Header / Saludo ───────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20">
            <GreetingIcon className="w-5 h-5 text-amber-500" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-zinc-100 leading-tight">
              {greetingText}, {adminName}
            </h1>
            <p className="text-xs text-gray-400 dark:text-zinc-500 capitalize">
              {formatDateLong()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-[11px] text-gray-400 dark:text-zinc-500">
              Actualizado{" "}
              {lastUpdated.toLocaleTimeString("es-PE", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
          <button
            onClick={() => { setLoading(true); load(); }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-600 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Actualizar
          </button>
        </div>
      </div>

      {/* ── Error banner ──────────────────────────────────────────────────── */}
      {fetchError && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {fetchError}
        </div>
      )}

      {/* ── 4 KPI Cards ───────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            label="Ventas hoy"
            value={fmt(revenueToday)}
            sub={`${salesToday.length} transacciones`}
            Icon={DollarSign}
            accent="#2d6a4f"
            badge={revenueToday > 0 ? "Activo" : "Sin ventas"}
            badgeColor={
              revenueToday > 0
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : "bg-gray-100 text-gray-500 dark:bg-zinc-700 dark:text-zinc-400"
            }
          />
          <KpiCard
            label="Pedidos activos"
            value={String(activeOrders)}
            sub={`${alerts.pendingOrders} pendientes`}
            Icon={ShoppingBag}
            accent="#f4a261"
            badge={activeOrders > 0 ? "En curso" : "Al día"}
            badgeColor={
              activeOrders > 0
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                : "bg-gray-100 text-gray-500 dark:bg-zinc-700 dark:text-zinc-400"
            }
          />
          <KpiCard
            label="Stock bajo"
            value={String(lowStockCount)}
            sub="productos bajo mínimo"
            Icon={Package}
            accent={lowStockCount > 0 ? "#ef4444" : "#2d6a4f"}
            badge={lowStockCount > 0 ? "Revisar" : "OK"}
            badgeColor={
              lowStockCount > 0
                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
            }
          />
          <KpiCard
            label="Fiados pendientes"
            value={String(pendingFiados)}
            sub="cuentas por cobrar"
            Icon={Users}
            accent={pendingFiados > 0 ? "#f59e0b" : "#2d6a4f"}
            badge={pendingFiados > 0 ? "Pendiente" : "Sin fiados"}
            badgeColor={
              pendingFiados > 0
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                : "bg-gray-100 text-gray-500 dark:bg-zinc-700 dark:text-zinc-400"
            }
          />
        </div>
      )}

      {/* ── Row: Margen + Comparador de mes ───────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Margen de ganancia del día */}
          <div className="rounded-xl border border-gray-100 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4" style={{ color: "#2d6a4f" }} />
              <span className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">
                Margen de ganancia hoy
              </span>
            </div>
            {salesToday.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-zinc-500">
                Sin ventas registradas hoy
              </p>
            ) : (
              <>
                <p className="text-3xl font-bold text-gray-900 dark:text-zinc-100">
                  {marginToday.toFixed(1)}
                  <span className="text-lg font-medium text-gray-400 ml-1">%</span>
                </p>
                <div className="mt-2 h-2 rounded-full bg-gray-100 dark:bg-zinc-700 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, marginToday)}%`,
                      backgroundColor:
                        marginToday >= 25
                          ? "#2d6a4f"
                          : marginToday >= 15
                          ? "#f4a261"
                          : "#ef4444",
                    }}
                  />
                </div>
                <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
                  {marginToday >= 25
                    ? "Margen saludable"
                    : marginToday >= 15
                    ? "Margen aceptable"
                    : "Margen bajo — revisar precios"}
                </p>
              </>
            )}
          </div>

          {/* Comparador mes actual vs anterior */}
          <div className="rounded-xl border border-gray-100 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4" style={{ color: "#f4a261" }} />
              <span className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">
                Este mes vs anterior
              </span>
            </div>
            <div className="flex items-end gap-3">
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-zinc-100">
                  {fmt(revenueThisMonth)}
                </p>
                <p className="text-xs text-gray-400 dark:text-zinc-500">mes actual</p>
              </div>
              <div
                className={cn(
                  "flex items-center gap-1 text-sm font-semibold pb-1",
                  monthDelta >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-500 dark:text-red-400"
                )}
              >
                {monthDelta >= 0 ? (
                  <ArrowUp className="w-4 h-4" />
                ) : (
                  <ArrowDown className="w-4 h-4" />
                )}
                {Math.abs(monthDelta).toFixed(1)}%
              </div>
            </div>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
              Mes anterior:{" "}
              <span className="font-medium text-gray-600 dark:text-zinc-400">
                {fmt(revenuePrevMonth)}
              </span>
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                {
                  label: "Este mes",
                  value: revenueThisMonth,
                  color: "#2d6a4f",
                  max: Math.max(revenueThisMonth, revenuePrevMonth, 1),
                },
                {
                  label: "Anterior",
                  value: revenuePrevMonth,
                  color: "#94a3b8",
                  max: Math.max(revenueThisMonth, revenuePrevMonth, 1),
                },
              ].map((bar) => (
                <div key={bar.label}>
                  <div className="flex justify-between text-[10px] text-gray-400 dark:text-zinc-500 mb-1">
                    <span>{bar.label}</span>
                    <span>{fmt(bar.value)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 dark:bg-zinc-700">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (bar.value / bar.max) * 100)}%`,
                        backgroundColor: bar.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Ranking top 10 productos ───────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-100 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4" style={{ color: "#2d6a4f" }} />
          <span className="text-sm font-semibold text-gray-700 dark:text-zinc-300">
            Top 10 productos más vendidos
          </span>
        </div>
        {loading ? (
          <SkeletonBar rows={10} />
        ) : topProducts.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-zinc-500">
            No hay datos de ventas aún.
          </p>
        ) : (
          <div className="space-y-2">
            {topProducts.map((prod, idx) => {
              const pct = Math.max(4, (prod.qty / maxProductQty) * 100);
              return (
                <div key={String(prod.id)} className="flex items-center gap-2 text-sm">
                  <span className="w-5 text-right text-xs text-gray-400 dark:text-zinc-500 font-mono shrink-0">
                    {idx + 1}
                  </span>
                  <span
                    className="w-36 sm:w-44 truncate text-gray-700 dark:text-zinc-300 shrink-0 text-xs"
                    title={prod.name}
                  >
                    {prod.name}
                  </span>
                  <div className="flex-1 h-5 rounded bg-gray-100 dark:bg-zinc-700 relative overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 rounded transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: idx === 0 ? "#2d6a4f" : "#2d6a4f60",
                      }}
                    />
                    <span className="absolute inset-y-0 left-2 flex items-center text-[10px] font-semibold text-white z-10">
                      {prod.qty} uds
                    </span>
                  </div>
                  <span className="text-xs text-gray-400 dark:text-zinc-500 shrink-0 w-20 text-right tabular-nums">
                    {fmt(prod.revenue)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Horario pico ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-100 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4" style={{ color: "#f4a261" }} />
          <span className="text-sm font-semibold text-gray-700 dark:text-zinc-300">
            Ventas por hora (hoy)
          </span>
        </div>
        {loading ? (
          <SkeletonBar rows={4} />
        ) : salesToday.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-zinc-500">
            Sin ventas registradas hoy.
          </p>
        ) : (
          <div className="space-y-1">
            {hourBuckets.map((bucket) => {
              const pct = Math.max(0, (bucket.amount / maxHourAmount) * 100);
              const isActive = bucket.hour === new Date().getHours();
              return (
                <div key={bucket.hour} className="flex items-center gap-2 text-xs">
                  <span
                    className={cn(
                      "w-8 text-right shrink-0 font-mono",
                      isActive
                        ? "text-amber-500 font-bold"
                        : "text-gray-400 dark:text-zinc-500"
                    )}
                  >
                    {bucket.label}
                  </span>
                  <div className="flex-1 h-4 rounded bg-gray-100 dark:bg-zinc-700 relative overflow-hidden">
                    {pct > 0 && (
                      <div
                        className="absolute inset-y-0 left-0 rounded transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: isActive ? "#f4a261" : "#2d6a4f80",
                        }}
                      />
                    )}
                    {pct > 10 && (
                      <span className="absolute inset-y-0 left-2 flex items-center text-[10px] font-semibold text-white z-10">
                        {fmt(bucket.amount)}
                      </span>
                    )}
                  </div>
                  {pct === 0 && (
                    <span className="text-gray-300 dark:text-zinc-600 text-[10px]">—</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Row: Top clientes + Alertas ───────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Top 5 clientes del mes */}
        <div className="rounded-xl border border-gray-100 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4" style={{ color: "#2d6a4f" }} />
            <span className="text-sm font-semibold text-gray-700 dark:text-zinc-300">
              Top 5 clientes del mes
            </span>
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
            <p className="text-sm text-gray-400 dark:text-zinc-500">
              Sin pedidos este mes.
            </p>
          ) : (
            <ol className="space-y-2">
              {topCustomers.map((c, idx) => (
                <li
                  key={c.phone ?? c.name}
                  className="flex items-center gap-2 text-sm"
                >
                  <span
                    className="flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0 text-white"
                    style={{ backgroundColor: idx === 0 ? "#2d6a4f" : "#94a3b8" }}
                  >
                    {idx + 1}
                  </span>
                  <span className="flex-1 truncate text-gray-700 dark:text-zinc-300 text-xs" title={c.name}>
                    {c.name}
                  </span>
                  <span className="text-[10px] text-gray-400 dark:text-zinc-500 shrink-0">
                    {c.orderCount} ped.
                  </span>
                  <span
                    className="text-xs font-semibold tabular-nums shrink-0"
                    style={{ color: "#2d6a4f" }}
                  >
                    {fmt(c.total)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Alertas activas */}
        <div className="rounded-xl border border-gray-100 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-semibold text-gray-700 dark:text-zinc-300">
              Alertas activas
            </span>
          </div>
          {loading ? (
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-9 rounded-lg bg-gray-200 dark:bg-zinc-700" />
              ))}
            </div>
          ) : !hasAnyAlert ? (
            <div className="flex flex-col items-center justify-center gap-2 py-4 text-center">
              <span className="text-2xl">
                <TrendingUp className="w-8 h-8 text-emerald-400 mx-auto" />
              </span>
              <p className="text-sm font-medium text-gray-600 dark:text-zinc-400">
                Todo bajo control
              </p>
              <p className="text-xs text-gray-400 dark:text-zinc-500">
                No hay alertas pendientes
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <AlertBadge
                Icon={Package}
                label="Productos con stock bajo"
                count={alerts.lowStock}
                colorClass="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800"
              />
              <AlertBadge
                Icon={AlertTriangle}
                label="Lotes por vencer (7 días)"
                count={expiringBatchCount}
                colorClass="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
              />
              <AlertBadge
                Icon={DollarSign}
                label="Fiados vencidos"
                count={alerts.overduePayables}
                colorClass="bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
