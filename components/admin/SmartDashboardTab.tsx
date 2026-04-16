"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  memo,
} from "react";
import {
  TrendingUp,
  Package,
  Users,
  AlertTriangle,
  Clock,
  DollarSign,
  RefreshCw,
  Sun,
  Moon,
  Sunset,
  Check,
  X,
  LayoutDashboard,
  Settings,
  CreditCard,
} from "lucide-react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { StaggerContainer, StaggerItem } from "@/components/admin/shared/StaggerContainer";
import type { Product, Sale } from "@/types/erp";
import type {
  Order,
  OrderItem,
  Payable,
  DashboardAlerts,
  TopProduct,
  TopCustomer,
  HourBucket,
  DashTabId,
  Period,
  SectionId,
  RegionalConfig,
  ChartType,
} from "./smart-dashboard/types";
import { CHART_OPTIONS } from "./smart-dashboard/types";

// ── Lazy-loaded chart components ────────────────────────────────────────────────

const ChartSkeleton = ({ height = 200 }: { height?: number }) => (
  <div className="w-full bg-gray-100 dark:bg-zinc-700/40 animate-pulse rounded" style={{ height }} />
);

const MonthlySalesAreaChart = dynamic(
  () => import("@/components/admin/smart-dashboard/MonthlySalesAreaChart"),
  { ssr: false, loading: () => <ChartSkeleton height={280} /> }
);

// ── Lazy-loaded sub-tab components ──────────────────────────────────────────────

const SubTabSkeleton = () => (
  <div className="space-y-4 animate-pulse">
    <div className="h-32 rounded-xl bg-gray-100 dark:bg-zinc-700/40" />
    <div className="h-48 rounded-xl bg-gray-100 dark:bg-zinc-700/40" />
  </div>
);

const ResumenSubTab = dynamic(
  () => import("./smart-dashboard/ResumenSubTab").then(m => ({ default: m.ResumenSubTab })),
  { ssr: false, loading: () => <SubTabSkeleton /> }
);

const VentasSubTab = dynamic(
  () => import("./smart-dashboard/VentasSubTab").then(m => ({ default: m.VentasSubTab })),
  { ssr: false, loading: () => <SubTabSkeleton /> }
);

const FinanzasSubTab = dynamic(
  () => import("./smart-dashboard/FinanzasSubTab").then(m => ({ default: m.FinanzasSubTab })),
  { ssr: false, loading: () => <SubTabSkeleton /> }
);

const InventarioSubTab = dynamic(
  () => import("./smart-dashboard/InventarioSubTab").then(m => ({ default: m.InventarioSubTab })),
  { ssr: false, loading: () => <SubTabSkeleton /> }
);

const ClientesSubTab = dynamic(
  () => import("./smart-dashboard/ClientesSubTab").then(m => ({ default: m.ClientesSubTab })),
  { ssr: false, loading: () => <SubTabSkeleton /> }
);

// ── Dashboard Tab definitions ───────────────────────────────────────────────────

const DASHBOARD_TABS: { id: DashTabId; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "resumen", label: "Resumen", Icon: LayoutDashboard },
  { id: "ventas", label: "Ventas", Icon: TrendingUp },
  { id: "inventario", label: "Inventario", Icon: Package },
  { id: "clientes", label: "Clientes", Icon: Users },
  { id: "finanzas", label: "Finanzas", Icon: CreditCard },
];

// ── Helpers ──────────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return `S/${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtShort(n: number): string {
  if (n >= 1000) return `S/${(n / 1000).toFixed(1)}k`;
  return `S/${n.toFixed(0)}`;
}

function isToday(iso: string): boolean {
  try { return new Date(iso).toDateString() === new Date().toDateString(); } catch { return false; }
}

function isThisMonth(iso: string): boolean {
  try {
    const d = new Date(iso); const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  } catch { return false; }
}

function isLastMonth(iso: string): boolean {
  try {
    const d = new Date(iso); const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return d.getMonth() === prev.getMonth() && d.getFullYear() === prev.getFullYear();
  } catch { return false; }
}

function isThisWeek(iso: string): boolean {
  try {
    const d = new Date(iso); const now = new Date();
    const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0, 0, 0, 0);
    return d.getTime() >= startOfWeek.getTime();
  } catch { return false; }
}

function getGreeting(): { text: string; Icon: typeof Sun } {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return { text: "Buenos dias", Icon: Sun };
  if (h >= 12 && h < 19) return { text: "Buenas tardes", Icon: Sunset };
  return { text: "Buenas noches", Icon: Moon };
}

function formatDateLong(): string {
  return new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

const DEFAULT_REGIONAL: RegionalConfig = { currency: "PEN", dateFormat: "DD/MM/YYYY" };

function getRegionalConfig(): RegionalConfig {
  try {
    const raw = localStorage.getItem("regional-config");
    if (raw) return { ...DEFAULT_REGIONAL, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT_REGIONAL;
}

function formatCurrency(n: number, config: RegionalConfig): string {
  if (config.currency === "USD") return `$ ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCurrencyShort(n: number, config: RegionalConfig): string {
  const symbol = config.currency === "USD" ? "$" : "S/";
  if (n >= 1000) return `${symbol}${(n / 1000).toFixed(1)}k`;
  return `${symbol}${n.toFixed(0)}`;
}

// ── Skeleton ─────────────────────────────────────────────────────────────────────

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-5 animate-pulse", className)}>
      <div className="h-3 w-1/3 rounded bg-gray-200 dark:bg-zinc-700 mb-3" />
      <div className="h-7 w-1/2 rounded bg-gray-200 dark:bg-zinc-700 mb-2" />
      <div className="h-1 w-full rounded bg-gray-200 dark:bg-zinc-700 mt-3" />
    </div>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────────────────

interface KpiCardNewProps {
  label: string; value: string; subtext?: string; subtextColorClass?: string;
  colorClass: string; isEmpty?: boolean; emptyLabel?: string;
}

function KpiCardNew({ label, value, subtext, subtextColorClass, colorClass, isEmpty, emptyLabel }: KpiCardNewProps) {
  return (
    <div className={cn("bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 p-5 shadow-sm transition-all hover:shadow-md", isEmpty && "opacity-60")}>
      <p className="text-xs text-gray-500 dark:text-zinc-400 font-medium">{label}</p>
      {isEmpty && emptyLabel ? (
        <p className="text-lg font-mono font-bold text-gray-400 dark:text-zinc-500 mt-1">{emptyLabel}</p>
      ) : (
        <p className="text-2xl font-mono font-bold text-gray-900 dark:text-zinc-100 mt-1">{value}</p>
      )}
      {subtext && <p className={cn("text-[10px] mt-1", subtextColorClass ?? "text-gray-400 dark:text-zinc-500")}>{subtext}</p>}
      <div className={cn("h-1 rounded-full mt-2", colorClass)} />
    </div>
  );
}

// ── Dashboard payload type ───────────────────────────────────────────────────────

interface DashboardPayload {
  products: Product[];
  orders: Order[];
  sales: Sale[];
  payables: Payable[];
  alerts: DashboardAlerts;
}

// ── Widget order default ─────────────────────────────────────────────────────────

const DEFAULT_ORDER: SectionId[] = ["kpis", "margen-comparador", "top-productos", "horario-pico", "clientes-alertas"];

// ── Main Component ───────────────────────────────────────────────────────────────

interface SmartDashboardTabProps {
  adminName?: string;
}

function SmartDashboardTab({ adminName = "Administrador" }: SmartDashboardTabProps) {
  // ── Core state ─────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [period, setPeriod] = useState<Period>("hoy");

  // ── Sub-tab & regional config ──────────────────────────────────────────────
  const [dashTab, setDashTab] = useState<DashTabId>(() => {
    try {
      const stored = localStorage.getItem("dashboard-subtab") as DashTabId | null;
      if (stored && DASHBOARD_TABS.some(t => t.id === stored)) return stored;
    } catch { /* ignore */ }
    return "resumen";
  });
  const [regionalConfig, setRegionalConfig] = useState<RegionalConfig>(getRegionalConfig);
  const [showRegionalConfig, setShowRegionalConfig] = useState(false);

  const handleDashTabChange = (tab: DashTabId) => {
    setDashTab(tab);
    localStorage.setItem("dashboard-subtab", tab);
  };

  const updateRegionalConfig = (updates: Partial<RegionalConfig>) => {
    const next = { ...regionalConfig, ...updates };
    setRegionalConfig(next);
    localStorage.setItem("regional-config", JSON.stringify(next));
  };

  const fmtR = useCallback((n: number) => formatCurrency(n, regionalConfig), [regionalConfig]);
  const fmtShortR = useCallback((n: number) => formatCurrencyShort(n, regionalConfig), [regionalConfig]);

  // ── Data state ─────────────────────────────────────────────────────────────
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [abandonedCartCount, setAbandonedCartCount] = useState(0);
  const [abandonedCartValue, setAbandonedCartValue] = useState(0);
  const [alerts, setAlerts] = useState<DashboardAlerts>({ lowStock: 0, pendingOrders: 0, overduePayables: 0 });

  // ── Charts state ───────────────────────────────────────────────────────────
  const [activeCharts, setActiveCharts] = useState<ChartType[]>(() => {
    try {
      const stored = localStorage.getItem("dashboard-active-charts");
      if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    return [];
  });
  const [showChartPicker, setShowChartPicker] = useState(false);

  // ── Widget order ───────────────────────────────────────────────────────────
  const [sectionOrder, setSectionOrder] = useState<SectionId[]>(DEFAULT_ORDER);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("dashboard-widget-order");
      if (stored) {
        const parsed = JSON.parse(stored) as SectionId[];
        if (parsed.length === DEFAULT_ORDER.length && DEFAULT_ORDER.every(id => parsed.includes(id))) {
          setSectionOrder(parsed);
        }
      }
    } catch { /* use default */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Data fetch ─────────────────────────────────────────────────────────────
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
      try {
        const cartRes = await fetch("/api/abandoned-cart/stats");
        if (cartRes.ok) {
          const cartData = await cartRes.json();
          setAbandonedCartCount(cartData.count ?? 0);
          setAbandonedCartValue(cartData.estimatedValue ?? 0);
        }
      } catch { /* ignore */ }
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
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  // ── Derived data ───────────────────────────────────────────────────────────

  const filteredSales = useMemo(() => {
    if (period === "hoy") return sales.filter(s => isToday(s.createdAt));
    if (period === "semana") return sales.filter(s => isThisWeek(s.createdAt));
    return sales.filter(s => isThisMonth(s.createdAt));
  }, [sales, period]);

  const salesToday = useMemo(() => sales.filter(s => isToday(s.createdAt)), [sales]);
  const revenueFiltered = useMemo(() => filteredSales.reduce((acc, s) => acc + (s.total ?? 0), 0), [filteredSales]);
  const revenueToday = useMemo(() => salesToday.reduce((acc, s) => acc + (s.total ?? 0), 0), [salesToday]);

  const marginFiltered = useMemo(() => {
    let revenue = 0, cogs = 0;
    for (const sale of filteredSales) {
      revenue += sale.total ?? 0;
      const items: Array<{ price?: number; costPrice?: number; quantity: number }> = sale.items ?? [];
      for (const item of items) { cogs += (item.costPrice ?? (item.price ?? 0) * 0.7) * item.quantity; }
    }
    return revenue === 0 ? 0 : ((revenue - cogs) / revenue) * 100;
  }, [filteredSales]);

  const marginToday = useMemo(() => {
    let revenue = 0, cogs = 0;
    for (const sale of salesToday) {
      revenue += sale.total ?? 0;
      const items: Array<{ price?: number; costPrice?: number; quantity: number }> = sale.items ?? [];
      for (const item of items) { cogs += (item.costPrice ?? (item.price ?? 0) * 0.7) * item.quantity; }
    }
    return revenue === 0 ? 0 : ((revenue - cogs) / revenue) * 100;
  }, [salesToday]);

  const { revenueThisMonth, revenuePrevMonth, monthDelta } = useMemo(() => {
    const thisM = sales.filter(s => isThisMonth(s.createdAt)).reduce((acc, s) => acc + (s.total ?? 0), 0);
    const prevM = sales.filter(s => isLastMonth(s.createdAt)).reduce((acc, s) => acc + (s.total ?? 0), 0);
    return { revenueThisMonth: thisM, revenuePrevMonth: prevM, monthDelta: prevM === 0 ? 0 : ((thisM - prevM) / prevM) * 100 };
  }, [sales]);

  const { revenueYesterday, salesYesterdayCount, hoyVsAyerPct } = useMemo(() => {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toDateString();
    const salesYesterday = sales.filter(s => { try { return new Date(s.createdAt).toDateString() === yStr; } catch { return false; } });
    const revYesterday = salesYesterday.reduce((acc, s) => acc + (s.total ?? 0), 0);
    const pct = revYesterday === 0 ? (revenueToday > 0 ? 100 : 0) : ((revenueToday - revYesterday) / revYesterday) * 100;
    return { revenueYesterday: revYesterday, salesYesterdayCount: salesYesterday.length, hoyVsAyerPct: pct };
  }, [sales, revenueToday]);

  const clientesFiltered = useMemo(() => {
    const phones = new Set<string>();
    for (const s of filteredSales) { phones.add((s as unknown as { customerPhone?: string }).customerPhone || "anon"); }
    return phones.size;
  }, [filteredSales]);

  const clientesHoy = useMemo(() => {
    const phones = new Set<string>();
    for (const s of salesToday) { phones.add((s as unknown as { customerPhone?: string }).customerPhone || "anon"); }
    return phones.size;
  }, [salesToday]);

  const ticketPromedio = useMemo(() => filteredSales.length === 0 ? 0 : revenueFiltered / filteredSales.length, [revenueFiltered, filteredSales]);

  const rentabilidadHoy = useMemo(() => {
    const margen = marginToday > 0 ? marginToday / 100 : 0.25;
    return revenueToday * margen;
  }, [revenueToday, marginToday]);

  const topProducts = useMemo<TopProduct[]>(() => {
    const map = new Map<string, TopProduct>();
    for (const sale of sales) {
      const items: Array<{ productId?: number | string; name?: string; price?: number; quantity: number }> = sale.items ?? [];
      for (const item of items) {
        const key = String(item.productId ?? item.name ?? "?");
        const existing = map.get(key);
        if (existing) { existing.qty += item.quantity; existing.revenue += (item.price ?? 0) * item.quantity; }
        else { map.set(key, { id: item.productId ?? key, name: item.name ?? "Producto", qty: item.quantity, revenue: (item.price ?? 0) * item.quantity }); }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [sales]);

  const maxProductQty = useMemo(() => topProducts.length > 0 ? topProducts[0].qty : 1, [topProducts]);

  const topCustomers = useMemo<TopCustomer[]>(() => {
    const map = new Map<string, TopCustomer>();
    const monthOrders = orders.filter(o => isThisMonth(o.createdAt) && o.status !== "cancelado");
    for (const order of monthOrders) {
      const key = order.customer?.phone ?? order.customer?.name ?? "?";
      const existing = map.get(key);
      if (existing) { existing.total += order.total ?? 0; existing.orderCount += 1; }
      else { map.set(key, { name: order.customer?.name ?? "Cliente", phone: order.customer?.phone, total: order.total ?? 0, orderCount: 1 }); }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [orders]);

  const hourBuckets = useMemo<HourBucket[]>(() => {
    const buckets: number[] = new Array(24).fill(0);
    for (const sale of salesToday) { try { buckets[new Date(sale.createdAt).getHours()] += sale.total ?? 0; } catch { /* ignore */ } }
    return Array.from({ length: 17 }, (_, i) => { const hour = i + 6; return { hour, label: `${String(hour).padStart(2, "0")}h`, amount: buckets[hour] ?? 0 }; });
  }, [salesToday]);

  const maxHourAmount = useMemo(() => Math.max(1, ...hourBuckets.map(b => b.amount)), [hourBuckets]);

  const expiringBatchCount = useMemo(() => {
    const now = new Date(); const threshold = new Date(now); threshold.setDate(threshold.getDate() + 7);
    return products.filter(p => { if (!p.expiryDate) return false; try { const exp = new Date(p.expiryDate); return exp >= now && exp <= threshold; } catch { return false; } }).length;
  }, [products]);

  const monthlyDailyData = useMemo(() => {
    const now = new Date(); const currentDay = now.getDate();
    const monthNames = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    const monthLabel = monthNames[now.getMonth()];
    const dailyMap = new Map<number, number>();
    for (let d = 1; d <= currentDay; d++) dailyMap.set(d, 0);
    for (const s of sales) {
      if (!isThisMonth(s.createdAt)) continue;
      try { const d = new Date(s.createdAt).getDate(); dailyMap.set(d, (dailyMap.get(d) ?? 0) + (s.total ?? 0)); } catch { /* ignore */ }
    }
    return Array.from(dailyMap.entries()).sort(([a], [b]) => a - b).map(([day, total]) => ({ name: `${day} ${monthLabel}.`, ventas: total }));
  }, [sales]);

  const cuentasPorCobrar = useMemo(() => {
    const pending = payables.filter(p => p.status !== "pagado"); const now = new Date();
    let vigentes = 0, vencidas = 0, vigentesCount = 0, vencidasCount = 0;
    for (const p of pending) {
      const balance = p.amount - p.paidAmount;
      if (p.dueDate && new Date(p.dueDate) < now) { vencidas += balance; vencidasCount++; }
      else { vigentes += balance; vigentesCount++; }
    }
    return { total: vigentes + vencidas, vigentes, vencidas, count: pending.length, vigentesCount, vencidasCount };
  }, [payables]);

  const cuentasPorPagar = useMemo(() => {
    const pending = payables.filter(p => p.status !== "pagado" && p.supplierId); const now = new Date();
    let vigentes = 0, vencidas = 0;
    for (const p of pending) {
      const balance = p.amount - p.paidAmount;
      if (p.dueDate && new Date(p.dueDate) < now) vencidas += balance; else vigentes += balance;
    }
    return { total: vigentes + vencidas, vigentes, vencidas, count: pending.length };
  }, [payables]);

  const igvVentasMes = useMemo(() => revenueThisMonth * 18 / 118, [revenueThisMonth]);

  const devoluciones = useMemo(() => {
    return sales.filter(s => isThisMonth(s.createdAt) && (s.status === "devuelto" || s.status === "anulado")).reduce((acc, s) => acc + (s.total ?? 0), 0);
  }, [sales]);

  const monthProjection = useMemo(() => {
    const now = new Date(); const diasTranscurridos = now.getDate();
    const diasTotales = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (diasTranscurridos === 0 || revenueThisMonth === 0) return null;
    const proyeccion = (revenueThisMonth / diasTranscurridos) * diasTotales;
    return { ventasMes: revenueThisMonth, proyeccion, porcentaje: Math.round((revenueThisMonth / proyeccion) * 100), diasTranscurridos, diasTotales };
  }, [revenueThisMonth]);

  const upcomingPayables = useMemo(() => {
    const now = new Date(); const weekLater = new Date(now); weekLater.setDate(weekLater.getDate() + 7);
    const pending = payables.filter(p => p.status !== "pagado" && p.dueDate);
    const overdue = pending.filter(p => { try { return new Date(p.dueDate!).getTime() < now.getTime(); } catch { return false; } });
    const upcoming = pending
      .filter(p => { try { const d = new Date(p.dueDate!).getTime(); return d >= now.getTime() && d <= weekLater.getTime(); } catch { return false; } })
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()).slice(0, 3);
    return { overdue: overdue.length, upcoming };
  }, [payables]);

  const productsRunningOut = useMemo(() => {
    const salesByProduct = new Map<number | string, number>(); const now = Date.now(); let daysSpan = 0;
    for (const s of sales) {
      try {
        const d = new Date(s.createdAt).getTime();
        if (now - d < 14 * 86400000) {
          daysSpan = Math.max(daysSpan, (now - d) / 86400000);
          const items: Array<{ productId?: number | string; quantity: number }> = (s as unknown as { items?: Array<{ productId?: number | string; quantity: number }> }).items ?? [];
          for (const item of items) { salesByProduct.set(item.productId ?? "?", (salesByProduct.get(item.productId ?? "?") ?? 0) + item.quantity); }
        }
      } catch { /* ignore */ }
    }
    if (daysSpan < 1) daysSpan = 1;
    return products.filter(p => p.stock != null && p.stock > 0 && (p.stockMin ?? 0) > 0)
      .map(p => { const dailyAvg = (salesByProduct.get(p.id) ?? 0) / daysSpan; return { id: p.id, name: p.name, stock: p.stock!, daysLeft: Math.round(dailyAvg > 0 ? p.stock! / dailyAvg : 999) }; })
      .filter(p => p.daysLeft <= 7).sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 5);
  }, [products, sales]);

  const { clientesAyer, clientesPromedio } = useMemo(() => {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1); const yStr = yesterday.toDateString();
    const yesterdayPhones = new Set<string>(); const last7Days = new Map<string, Set<string>>();
    for (const s of sales) {
      try {
        const d = new Date(s.createdAt); const dStr = d.toDateString();
        const phone = (s as unknown as { customerPhone?: string }).customerPhone || "anon";
        if (dStr === yStr) yesterdayPhones.add(phone);
        if (Date.now() - d.getTime() < 7 * 86400000) { if (!last7Days.has(dStr)) last7Days.set(dStr, new Set()); last7Days.get(dStr)!.add(phone); }
      } catch { /* ignore */ }
    }
    const dailyCounts = Array.from(last7Days.values()).map(s => s.size);
    return { clientesAyer: yesterdayPhones.size, clientesPromedio: Math.round(dailyCounts.length > 0 ? dailyCounts.reduce((a, b) => a + b, 0) / dailyCounts.length : 0) };
  }, [sales]);

  const semanaAnterior = useMemo(() => {
    const hoy = new Date(); const hace7 = new Date(hoy); hace7.setDate(hace7.getDate() - 7);
    const diaLabel = hace7.toLocaleDateString("es-PE", { weekday: "long" });
    const ventasSemPasada = sales.filter(s => { try { return new Date(s.createdAt).toDateString() === hace7.toDateString(); } catch { return false; } }).reduce((acc, s) => acc + (s.total ?? 0), 0);
    if (ventasSemPasada === 0) return null;
    return { diaLabel, monto: ventasSemPasada, pct: ((revenueToday - ventasSemPasada) / ventasSemPasada) * 100 };
  }, [sales, revenueToday]);

  const hitoProximo = useMemo(() => {
    const hitosVentas = [{ meta: 500, label: "S/500 en ventas" }, { meta: 1000, label: "S/1,000 en ventas" }, { meta: 2000, label: "S/2,000 en ventas" }, { meta: 5000, label: "S/5,000 en ventas" }];
    const hitosCount = [{ meta: 20, label: "20 ventas" }, { meta: 50, label: "50 ventas" }];
    for (const h of hitosVentas) { const falta = h.meta - revenueToday; if (falta > 0 && falta < h.meta * 0.5) return { falta: `S/${falta.toFixed(0)}`, label: h.label }; }
    for (const h of hitosCount) { const falta = h.meta - salesToday.length; if (falta > 0 && falta < h.meta * 0.5) return { falta: String(falta), label: h.label }; }
    if (revenueToday >= 5000) return { falta: null, label: "Dia excepcional" };
    return null;
  }, [revenueToday, salesToday.length]);

  const bestHourToday = useMemo(() => {
    if (salesToday.length === 0) return null;
    const hourMap = new Map<number, { total: number; count: number }>();
    for (const s of salesToday) { try { const h = new Date(s.createdAt).getHours(); const ex = hourMap.get(h) || { total: 0, count: 0 }; ex.total += s.total ?? 0; ex.count++; hourMap.set(h, ex); } catch { /* ignore */ } }
    let best: { hour: number; total: number; count: number } | null = null;
    for (const [hour, data] of hourMap) { if (!best || data.total > best.total) best = { hour, ...data }; }
    return best;
  }, [salesToday]);

  const productosSinVenderHoy = useMemo(() => {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toDateString(); const todayStr = new Date().toDateString();
    const productIdsAyer = new Set<string>(); const productIdsHoy = new Set<string>();
    const productNamesAyer = new Map<string, { name: string; qty: number }>();
    for (const s of sales) {
      try {
        const dStr = new Date(s.createdAt).toDateString();
        const items: Array<{ productId?: number | string; name?: string; quantity: number }> = (s as unknown as { items?: Array<{ productId?: number | string; name?: string; quantity: number }> }).items ?? [];
        for (const item of items) {
          const key = String(item.productId ?? item.name ?? "?");
          if (dStr === yStr) { productIdsAyer.add(key); const ex = productNamesAyer.get(key); if (ex) ex.qty += item.quantity; else productNamesAyer.set(key, { name: item.name ?? "Producto", qty: item.quantity }); }
          if (dStr === todayStr) productIdsHoy.add(key);
        }
      } catch { /* ignore */ }
    }
    if (productIdsAyer.size === 0) return [];
    const missing: { name: string; qty: number }[] = [];
    for (const [key, val] of productNamesAyer) { if (!productIdsHoy.has(key)) missing.push(val); }
    return missing.sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [sales]);

  const decliningProduct = useMemo(() => {
    const now = Date.now(); const thisWeekMap: Record<string, number> = {}; const lastWeekMap: Record<string, number> = {}; const nameMap: Record<string, string> = {};
    for (const s of sales) {
      try {
        const d = new Date(s.createdAt).getTime();
        const items: Array<{ productId?: number | string; name?: string; quantity: number }> = (s as unknown as { items?: Array<{ productId?: number | string; name?: string; quantity: number }> }).items ?? [];
        for (const item of items) {
          const pid = String(item.productId ?? item.name ?? "?"); nameMap[pid] = item.name ?? "Producto";
          if (now - d < 7 * 86400000) thisWeekMap[pid] = (thisWeekMap[pid] ?? 0) + item.quantity;
          else if (now - d < 14 * 86400000) lastWeekMap[pid] = (lastWeekMap[pid] ?? 0) + item.quantity;
        }
      } catch { /* ignore */ }
    }
    let worst: { name: string; pct: number } | null = null;
    for (const [pid, qtyLast] of Object.entries(lastWeekMap)) {
      if (qtyLast <= 3) continue; const qtyThis = thisWeekMap[pid] ?? 0;
      if (qtyThis < qtyLast * 0.7) { const pct = Math.round(((qtyLast - qtyThis) / qtyLast) * 100); if (!worst || pct > worst.pct) worst = { name: nameMap[pid], pct }; }
    }
    return worst;
  }, [sales]);

  const bestDay = useMemo(() => {
    const dayNames = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
    const dayTotals: Record<number, number[]> = {};
    for (const s of sales) { try { const dow = new Date(s.createdAt).getDay(); if (!dayTotals[dow]) dayTotals[dow] = []; dayTotals[dow].push(s.total ?? 0); } catch { /* ignore */ } }
    if (Object.keys(dayTotals).length < 3) return null;
    const dayAvgs = Object.entries(dayTotals).map(([dow, vals]) => ({ dow: Number(dow), name: dayNames[Number(dow)], avg: vals.reduce((a, b) => a + b, 0) / vals.length }));
    dayAvgs.sort((a, b) => b.avg - a.avg);
    const best = dayAvgs[0]; const worst = dayAvgs[dayAvgs.length - 1];
    const othersAvg = dayAvgs.slice(1).reduce((s, d) => s + d.avg, 0) / Math.max(1, dayAvgs.length - 1);
    return { best, worst, pctVsOthers: othersAvg > 0 ? Math.round(((best.avg - othersAvg) / othersAvg) * 100) : 0 };
  }, [sales]);

  const growingCategory = useMemo(() => {
    const now = Date.now(); const thisWeekMap: Record<string, number> = {}; const lastWeekMap: Record<string, number> = {};
    for (const s of sales) {
      try {
        const d = new Date(s.createdAt).getTime();
        const items: Array<{ productId?: number | string; price?: number; quantity: number }> = (s as unknown as { items?: Array<{ productId?: number | string; price?: number; quantity: number }> }).items ?? [];
        for (const item of items) {
          const prod = products.find(p => String(p.id) === String(item.productId)); const cat = prod?.category ?? "General"; const rev = (item.price ?? 0) * item.quantity;
          if (now - d < 7 * 86400000) thisWeekMap[cat] = (thisWeekMap[cat] ?? 0) + rev;
          else if (now - d < 14 * 86400000) lastWeekMap[cat] = (lastWeekMap[cat] ?? 0) + rev;
        }
      } catch { /* ignore */ }
    }
    const cats = Object.keys({ ...thisWeekMap, ...lastWeekMap }); if (cats.length === 0) return null;
    const growth = cats.map(cat => ({ cat, thisWeek: thisWeekMap[cat] ?? 0, lastWeek: lastWeekMap[cat] ?? 0, pct: (lastWeekMap[cat] ?? 0) > 0 ? (((thisWeekMap[cat] ?? 0) - (lastWeekMap[cat] ?? 0)) / (lastWeekMap[cat] ?? 0)) * 100 : (thisWeekMap[cat] ?? 0) > 0 ? 100 : 0 })).filter(c => c.thisWeek > 0 || c.lastWeek > 0);
    growth.sort((a, b) => b.pct - a.pct);
    const top = growth[0] ?? null; const bottom = growth[growth.length - 1] ?? null;
    return { top, bottom: bottom && bottom.pct < -5 ? bottom : null };
  }, [sales, products]);

  const topClientMonth = useMemo(() => {
    if (topCustomers.length === 0) return null;
    const c = topCustomers[0]; const monthName = new Date().toLocaleString("es-PE", { month: "long" });
    return { ...c, monthName, avg: c.orderCount > 0 ? c.total / c.orderCount : 0 };
  }, [topCustomers]);

  const comboData = useMemo(() => {
    const comboSeed = new Date().getDate();
    const combosPredefinidos = [
      { nombre: "Combo Desayuno", items: ["pan", "leche", "huevo"], descuento: 8 },
      { nombre: "Combo Almuerzo", items: ["arroz", "aceite", "fideos"], descuento: 10 },
      { nombre: "Combo Fiesta", items: ["cerveza", "gaseosa", "galleta"], descuento: 12 },
      { nombre: "Combo Limpieza", items: ["detergente", "lejia", "jabon"], descuento: 7 },
      { nombre: "Combo Bebe", items: ["panal", "leche", "colonia"], descuento: 9 },
    ];
    const comboPredefinido = combosPredefinidos[comboSeed % combosPredefinidos.length];
    const comboProducts: { product: Product; found: boolean }[] = [];
    for (const searchTerm of comboPredefinido.items) {
      const found = products.find(p => p.name.toLowerCase().includes(searchTerm) && p.active !== false && (p.stock ?? 1) > 0);
      comboProducts.push({ product: found || { id: 0, name: searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1), price: 0, active: true } as Product, found: !!found });
    }
    const allFound = comboProducts.every(c => c.found);
    const totalNormal = comboProducts.filter(c => c.found).reduce((s, c) => s + c.product.price, 0);
    const totalCombo = totalNormal * (1 - comboPredefinido.descuento / 100);
    if (!allFound && topProducts.length >= 3) {
      const top3Products = topProducts.slice(0, 3).map(tp => products.find(p => String(p.id) === String(tp.id))).filter(Boolean) as Product[];
      if (top3Products.length >= 2) {
        const total = top3Products.reduce((s, p) => s + p.price, 0);
        return { nombre: "Combo Top Ventas", products: top3Products.map(p => ({ name: p.name, price: p.price, image: p.image, found: true })), totalNormal: total, totalCombo: total * 0.9, ahorro: total * 0.1 };
      }
    }
    return { nombre: comboPredefinido.nombre, products: comboProducts.map(cp => ({ name: cp.product.name, price: cp.product.price, image: cp.found ? cp.product.image : undefined, found: cp.found })), totalNormal, totalCombo: allFound ? totalCombo : 0, ahorro: allFound ? totalNormal - totalCombo : 0 };
  }, [products, topProducts]);

  const insights = useMemo(() => {
    const list: { type: "positive" | "negative" | "neutral"; text: string }[] = [];
    const fiadosVencidos = payables.filter(p => p.dueDate && new Date(p.dueDate) < new Date() && p.status !== "pagado").length;
    if (fiadosVencidos > 0) list.push({ type: "negative", text: `${fiadosVencidos} fiado${fiadosVencidos > 1 ? "s" : ""} vencido${fiadosVencidos > 1 ? "s" : ""} pendiente${fiadosVencidos > 1 ? "s" : ""} de cobro` });
    const dow = new Date().getDay();
    if (dow === 6) list.push({ type: "neutral", text: "Hoy es sabado — prepara stock de bebidas y productos de fin de semana" });
    else if (dow === 0) list.push({ type: "neutral", text: "Hoy es domingo — dia ideal para revisar inventario y planificar la semana" });
    if (hoyVsAyerPct > 20 && revenueToday > 0) list.push({ type: "positive", text: `Ventas +${hoyVsAyerPct.toFixed(0)}% vs ayer — buen ritmo` });
    else if (hoyVsAyerPct < -30 && revenueYesterday > 0) list.push({ type: "negative", text: `Ventas ${hoyVsAyerPct.toFixed(0)}% vs ayer — considera una promocion` });
    if (alerts.lowStock > 5) list.push({ type: "negative", text: `${alerts.lowStock} productos con stock bajo — programa reposicion` });
    if (list.length === 0) {
      const stockOk = products.length > 0 ? products.filter(p => p.stock != null && p.stockMin != null && p.stock > p.stockMin).length : 0;
      const pctStockOk = products.length > 0 ? Math.round((stockOk / products.length) * 100) : 100;
      list.push({ type: "positive", text: `${pctStockOk}% de tu inventario con stock saludable — ${alerts.lowStock === 0 ? "sin alertas" : `${alerts.lowStock} con stock bajo`}` });
    }
    return list.slice(0, 3);
  }, [payables, hoyVsAyerPct, revenueToday, revenueYesterday, alerts.lowStock, products]);

  // ── Chart data ─────────────────────────────────────────────────────────────

  const chartVentasCategoria = useMemo(() => {
    const catMap = new Map<string, number>();
    for (const s of sales) { if (!isThisMonth(s.createdAt)) continue; const items: Array<{ productId?: number | string; price?: number; quantity: number }> = s.items ?? []; for (const item of items) { const prod = products.find(p => String(p.id) === String(item.productId)); const cat = prod?.category ?? "General"; catMap.set(cat, (catMap.get(cat) ?? 0) + (item.price ?? 0) * item.quantity); } }
    return Array.from(catMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [sales, products]);

  const chartMetodoPago = useMemo(() => {
    const payMap = new Map<string, number>();
    for (const s of sales) { if (!isThisMonth(s.createdAt)) continue; const pay = (s as unknown as { payment?: string }).payment ?? (s as unknown as { paymentMethod?: string }).paymentMethod ?? "efectivo"; payMap.set(pay, (payMap.get(pay) ?? 0) + (s.total ?? 0)); }
    return Array.from(payMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [sales]);

  const chartTop10 = useMemo(() => topProducts.map(p => ({ name: p.name.length > 20 ? p.name.slice(0, 20) + "..." : p.name, qty: p.qty, revenue: p.revenue })), [topProducts]);
  const chartVentasHora = useMemo(() => hourBuckets.map(b => ({ name: b.label, ventas: b.amount })), [hourBuckets]);

  const last7DaysData = useMemo(() => {
    const initials = ["D", "L", "M", "M", "J", "V", "S"];
    const days: { label: string; initial: string; total: number; isToday: boolean }[] = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const dStr = d.toDateString(); const dayTotal = sales.filter(s => { try { return new Date(s.createdAt).toDateString() === dStr; } catch { return false; } }).reduce((acc, s) => acc + (s.total ?? 0), 0); days.push({ label: d.toLocaleDateString("es-PE", { weekday: "short" }), initial: initials[d.getDay()], total: dayTotal, isToday: i === 0 }); }
    return days;
  }, [sales]);

  const chartTendenciaSemanal = useMemo(() => last7DaysData.map(d => ({ name: d.initial, ventas: d.total })), [last7DaysData]);

  const chartFlujoCaja = useMemo(() => {
    const days: { name: string; ingresos: number; egresos: number }[] = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const dStr = d.toDateString(); const initials = ["D", "L", "M", "M", "J", "V", "S"]; const ingresos = sales.filter(s => { try { return new Date(s.createdAt).toDateString() === dStr; } catch { return false; } }).reduce((acc, s) => acc + (s.total ?? 0), 0); days.push({ name: initials[d.getDay()], ingresos, egresos: ingresos * 0.7 }); }
    return days;
  }, [sales]);

  // ── Logro state ────────────────────────────────────────────────────────────

  const [showLogro, setShowLogro] = useState(false);
  const logro = useMemo(() => {
    const promedioVentas = revenueThisMonth / Math.max(1, new Date().getDate());
    const logros = [
      revenueToday >= 1000 && { emoji: "trophy", texto: "S/1,000 en un dia!" },
      salesToday.length >= 50 && { emoji: "fire", texto: "50 ventas en un dia!" },
      promedioVentas > 0 && revenueToday > promedioVentas * 1.5 && { emoji: "chart", texto: "Mejor dia del mes!" },
      clientesHoy >= 20 && { emoji: "people", texto: "20 clientes en un dia!" },
    ].filter(Boolean) as { emoji: string; texto: string }[];
    return logros[0] ?? null;
  }, [revenueToday, salesToday.length, revenueThisMonth, clientesHoy]);

  useEffect(() => {
    if (!logro) return;
    const todayKey = `achievements-${new Date().toISOString().slice(0, 10)}`;
    try {
      const seen = JSON.parse(localStorage.getItem(todayKey) || "[]") as string[];
      if (seen.includes(logro.texto)) return;
      seen.push(logro.texto);
      localStorage.setItem(todayKey, JSON.stringify(seen));
      setShowLogro(true);
      const t = setTimeout(() => setShowLogro(false), 10000);
      return () => clearTimeout(t);
    } catch { /* ignore */ }
  }, [logro]);

  const hasAnyAlert = alerts.lowStock > 0 || alerts.overduePayables > 0 || expiringBatchCount > 0;

  // ── Greeting ───────────────────────────────────────────────────────────────
  const { Icon: GreetingIcon } = getGreeting();

  // ══════════════════════════════════════════════════════════════════════════
  // ── RENDER ─────────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 shrink-0">
          <GreetingIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate">
            Panel &mdash; {adminName}
          </h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5 capitalize">{formatDateLong()}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center bg-gray-100 dark:bg-zinc-700 rounded-lg p-0.5">
            {([{ id: "hoy" as Period, label: "Hoy" }, { id: "semana" as Period, label: "Semana" }, { id: "mes" as Period, label: "Mes actual" }]).map(p => (
              <button key={p.id} onClick={() => setPeriod(p.id)} className={cn("px-3 py-1.5 text-xs font-semibold rounded-md transition-all", period === p.id ? "bg-white dark:bg-zinc-800 text-primary shadow-sm" : "text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-300")}>
                {p.label}
              </button>
            ))}
          </div>
          {lastUpdated && <span className="text-[11px] text-gray-400 dark:text-zinc-500 hidden sm:inline">{lastUpdated.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}</span>}
          <button onClick={() => { setLoading(true); load(); }} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-600 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <div className="relative">
            <button onClick={() => setShowRegionalConfig(!showRegionalConfig)} className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-600 transition-colors" title="Configuracion regional">
              <Settings className="w-3.5 h-3.5" />
            </button>
            {showRegionalConfig && (
              <div className="absolute right-0 top-full mt-1 z-30 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl p-4 w-72">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-gray-700 dark:text-zinc-300">Configuracion Regional</span>
                  <button onClick={() => setShowRegionalConfig(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200"><X className="w-4 h-4" /></button>
                </div>
                <div className="mb-3">
                  <span className="text-xs font-semibold text-gray-500 dark:text-zinc-400 block mb-1.5">Moneda</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateRegionalConfig({ currency: "PEN" })} className={cn("flex-1 py-2 px-3 rounded-lg text-xs font-bold border transition-colors", regionalConfig.currency === "PEN" ? "bg-primary/10 border-primary text-primary" : "border-gray-200 dark:border-zinc-600 text-gray-500 dark:text-zinc-400 hover:border-gray-300")}>
                      S/ Soles {regionalConfig.currency === "PEN" && <Check className="w-3 h-3 inline ml-1" />}
                    </button>
                    <button onClick={() => updateRegionalConfig({ currency: "USD" })} className={cn("flex-1 py-2 px-3 rounded-lg text-xs font-bold border transition-colors", regionalConfig.currency === "USD" ? "bg-primary/10 border-primary text-primary" : "border-gray-200 dark:border-zinc-600 text-gray-500 dark:text-zinc-400 hover:border-gray-300")}>
                      $ Dolar {regionalConfig.currency === "USD" && <Check className="w-3 h-3 inline ml-1" />}
                    </button>
                  </div>
                </div>
                <div className="mb-3">
                  <span className="text-xs font-semibold text-gray-500 dark:text-zinc-400 block mb-1.5">Formato de fecha</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateRegionalConfig({ dateFormat: "DD/MM/YYYY" })} className={cn("flex-1 py-2 px-3 rounded-lg text-xs font-bold border transition-colors", regionalConfig.dateFormat === "DD/MM/YYYY" ? "bg-primary/10 border-primary text-primary" : "border-gray-200 dark:border-zinc-600 text-gray-500 dark:text-zinc-400 hover:border-gray-300")}>
                      DD/MM/YYYY {regionalConfig.dateFormat === "DD/MM/YYYY" && <Check className="w-3 h-3 inline ml-1" />}
                    </button>
                    <button onClick={() => updateRegionalConfig({ dateFormat: "MM/DD/YYYY" })} className={cn("flex-1 py-2 px-3 rounded-lg text-xs font-bold border transition-colors", regionalConfig.dateFormat === "MM/DD/YYYY" ? "bg-primary/10 border-primary text-primary" : "border-gray-200 dark:border-zinc-600 text-gray-500 dark:text-zinc-400 hover:border-gray-300")}>
                      MM/DD/YYYY {regionalConfig.dateFormat === "MM/DD/YYYY" && <Check className="w-3 h-3 inline ml-1" />}
                    </button>
                  </div>
                </div>
                <div className="pt-2 border-t border-gray-100 dark:border-zinc-700">
                  <span className="text-xs font-semibold text-gray-500 dark:text-zinc-400 block mb-1">Zona horaria</span>
                  <span className="text-xs text-gray-400 dark:text-zinc-500">America/Lima (UTC-5)</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dashboard sub-tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-zinc-700 overflow-x-auto pb-0">
        {DASHBOARD_TABS.map(tab => (
          <button key={tab.id} onClick={() => handleDashTabChange(tab.id)} className={cn("flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors border-b-2 -mb-[1px]", dashTab === tab.id ? "border-primary text-primary font-semibold" : "border-transparent text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-300 hover:border-gray-300 dark:hover:border-zinc-500")}>
            <tab.Icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {fetchError && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {fetchError}
        </div>
      )}

      {/* KPIs Row (shared: resumen + ventas) */}
      {(dashTab === "resumen" || dashTab === "ventas") && (
        loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <StaggerContainer className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <StaggerItem><KpiCardNew label={`Ventas ${period === "hoy" ? "hoy" : period === "semana" ? "semana" : "mes"}`} value={fmtR(revenueFiltered)} subtext={`${filteredSales.length} transacciones`} colorClass="bg-primary" isEmpty={revenueFiltered === 0} emptyLabel="Sin ventas" /></StaggerItem>
            <StaggerItem><KpiCardNew label="Clientes" value={String(clientesFiltered)} subtext={`${clientesHoy} nuevos hoy`} colorClass="bg-blue-500" isEmpty={clientesFiltered === 0} emptyLabel="Sin clientes" /></StaggerItem>
            <StaggerItem><KpiCardNew label="Margen" value={`${marginFiltered.toFixed(0)}%`} subtext={marginFiltered >= 25 ? "Saludable" : marginFiltered >= 15 ? "Puede mejorar" : marginFiltered > 0 ? "Revisar costos" : `${fmtR(rentabilidadHoy)} ganancia`} subtextColorClass={marginFiltered >= 25 ? "text-emerald-600 dark:text-emerald-400" : marginFiltered >= 15 ? "text-amber-500 dark:text-amber-400" : marginFiltered > 0 ? "text-red-500 dark:text-red-400" : undefined} colorClass="bg-[#f97316]" isEmpty={marginFiltered === 0} /></StaggerItem>
            <StaggerItem><KpiCardNew label="vs Ayer" value={`${hoyVsAyerPct > 0 ? "+" : ""}${hoyVsAyerPct.toFixed(0)}%`} subtext={revenueYesterday > 0 ? `${fmtR(revenueYesterday)} ayer` : "Sin datos ayer"} colorClass={hoyVsAyerPct >= 0 ? "bg-emerald-500" : "bg-red-500"} isEmpty={revenueToday === 0 && revenueYesterday === 0} emptyLabel="Sin datos" /></StaggerItem>
            <StaggerItem><KpiCardNew label="Ticket promedio" value={fmtR(ticketPromedio)} subtext={salesToday.length > 0 ? `Max: ${fmtR(Math.max(...salesToday.map(s => s.total ?? 0)))}` : "Sin ventas"} colorClass="bg-purple-500" isEmpty={ticketPromedio === 0} emptyLabel="Sin ventas" /></StaggerItem>
          </StaggerContainer>
        )
      )}

      {/* Monthly sales chart (shared: resumen + ventas) */}
      {!loading && (dashTab === "resumen" || dashTab === "ventas") && (
        <div className="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-4">
            <div>
              <h2 className="text-sm font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wider">Total de ventas</h2>
              <p className="text-xs text-gray-400 dark:text-zinc-500">La grafica muestra el valor de tus ventas con impuestos incluidos</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-mono font-bold text-gray-900 dark:text-zinc-100">{fmtR(revenueThisMonth)}</p>
              {monthDelta !== 0 && (
                <span className={cn("text-xs font-bold", monthDelta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>
                  {monthDelta >= 0 ? "+" : ""}{monthDelta.toFixed(1)}% vs mes anterior
                </span>
              )}
            </div>
          </div>
          {monthlyDailyData.length > 0 ? (
            <MonthlySalesAreaChart data={monthlyDailyData} fmtShort={fmtShort} fmt={fmt} />
          ) : (
            <div className="flex items-center justify-center h-[280px]">
              <p className="text-sm text-gray-400 dark:text-zinc-500">Sin ventas registradas este mes</p>
            </div>
          )}
        </div>
      )}

      {/* Financial cards (shared: resumen + finanzas) */}
      {!loading && (dashTab === "resumen" || dashTab === "finanzas") && dashTab === "resumen" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 p-5 shadow-sm">
            <a href="/admin?module=fiados" className="text-xs font-semibold text-gray-700 dark:text-zinc-300 hover:text-primary transition-colors cursor-pointer">Cuentas por cobrar</a>
            <p className="text-2xl font-mono font-bold text-gray-900 dark:text-zinc-100 mt-1">{fmtR(cuentasPorCobrar.total)}</p>
            <div className="flex items-center gap-2 mt-2 text-[10px]"><span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" /><span className="text-gray-500 dark:text-zinc-400">Vigentes {fmtShortR(cuentasPorCobrar.vigentes)}</span></span></div>
            <div className="flex items-center gap-2 mt-0.5 text-[10px]"><span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" /><span className="text-gray-500 dark:text-zinc-400">Vencidas {fmtShortR(cuentasPorCobrar.vencidas)}</span></span></div>
            <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-1">{cuentasPorCobrar.count} documentos</p>
          </div>
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 p-5 shadow-sm">
            <a href="/admin?module=compras" className="text-xs font-semibold text-gray-700 dark:text-zinc-300 hover:text-primary transition-colors cursor-pointer">Cuentas por pagar</a>
            <p className="text-2xl font-mono font-bold text-gray-900 dark:text-zinc-100 mt-1">{fmtR(cuentasPorPagar.total)}</p>
            <div className="flex items-center gap-2 mt-2 text-[10px]"><span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" /><span className="text-gray-500 dark:text-zinc-400">Vigentes {fmtShortR(cuentasPorPagar.vigentes)}</span></span></div>
            <div className="flex items-center gap-2 mt-0.5 text-[10px]"><span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" /><span className="text-gray-500 dark:text-zinc-400">Vencidas {fmtShortR(cuentasPorPagar.vencidas)}</span></span></div>
            <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-1">{cuentasPorPagar.count} documentos</p>
          </div>
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 p-5 shadow-sm">
            <span className="text-xs font-semibold text-gray-700 dark:text-zinc-300">Impuestos en venta</span>
            <p className="text-2xl font-mono font-bold text-gray-900 dark:text-zinc-100 mt-1">{fmtR(igvVentasMes)}</p>
            <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-2">IGV estimado del mes</p>
          </div>
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 p-5 shadow-sm">
            <span className="text-xs font-semibold text-gray-700 dark:text-zinc-300">Devoluciones</span>
            <p className={cn("text-2xl font-mono font-bold mt-1", devoluciones > 0 ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-zinc-100")}>{fmtR(devoluciones)}</p>
            <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-2">Incluye impuestos</p>
          </div>
        </div>
      )}

      {/* ── SUB-TAB CONTENT ──────────────────────────────────────────────── */}

      {dashTab === "resumen" && (
        <ResumenSubTab
          loading={loading}
          revenueToday={revenueToday}
          revenueThisMonth={revenueThisMonth}
          revenuePrevMonth={revenuePrevMonth}
          revenueYesterday={revenueYesterday}
          revenueFiltered={revenueFiltered}
          monthDelta={monthDelta}
          marginToday={marginToday}
          rentabilidadHoy={rentabilidadHoy}
          clientesHoy={clientesHoy}
          clientesAyer={clientesAyer}
          clientesPromedio={clientesPromedio}
          hoyVsAyerPct={hoyVsAyerPct}
          salesYesterdayCount={salesYesterdayCount}
          sales={sales}
          salesToday={salesToday}
          products={products}
          orders={orders}
          payables={payables}
          topProducts={topProducts}
          topCustomers={topCustomers}
          hourBuckets={hourBuckets}
          maxProductQty={maxProductQty}
          maxHourAmount={maxHourAmount}
          alerts={alerts}
          monthProjection={monthProjection}
          cuentasPorCobrar={cuentasPorCobrar}
          cuentasPorPagar={cuentasPorPagar}
          upcomingPayables={upcomingPayables}
          productsRunningOut={productsRunningOut}
          expiringBatchCount={expiringBatchCount}
          bestDay={bestDay}
          growingCategory={growingCategory}
          topClientMonth={topClientMonth}
          comboData={comboData}
          insights={insights}
          semanaAnterior={semanaAnterior}
          hitoProximo={hitoProximo}
          bestHourToday={bestHourToday}
          productosSinVenderHoy={productosSinVenderHoy}
          decliningProduct={decliningProduct}
          abandonedCartCount={abandonedCartCount}
          abandonedCartValue={abandonedCartValue}
          hasAnyAlert={hasAnyAlert}
          sectionOrder={sectionOrder}
          setSectionOrder={setSectionOrder}
          fmtR={fmtR}
          fmtShortR={fmtShortR}
          showLogro={showLogro}
          setShowLogro={setShowLogro}
          logro={logro}
        />
      )}

      {dashTab === "ventas" && (
        <VentasSubTab
          loading={loading}
          revenueToday={revenueToday}
          activeCharts={activeCharts}
          setActiveCharts={setActiveCharts}
          showChartPicker={showChartPicker}
          setShowChartPicker={setShowChartPicker}
          chartVentasCategoria={chartVentasCategoria}
          chartMetodoPago={chartMetodoPago}
          chartTop10={chartTop10}
          chartVentasHora={chartVentasHora}
          chartTendenciaSemanal={chartTendenciaSemanal}
          chartFlujoCaja={chartFlujoCaja}
          sales={sales}
          salesToday={salesToday}
          topProducts={topProducts}
          topCustomers={topCustomers}
          hourBuckets={hourBuckets}
          maxProductQty={maxProductQty}
          maxHourAmount={maxHourAmount}
          sectionOrder={sectionOrder}
          fmtR={fmtR}
          fmt={fmt}
          fmtShort={fmtShort}
        />
      )}

      {dashTab === "inventario" && (
        <InventarioSubTab
          loading={loading}
          products={products}
          sales={sales}
          upcomingPayables={upcomingPayables}
          productsRunningOut={productsRunningOut}
          clientesHoy={clientesHoy}
          clientesAyer={clientesAyer}
          clientesPromedio={clientesPromedio}
          alerts={alerts}
          expiringBatchCount={expiringBatchCount}
          hasAnyAlert={hasAnyAlert}
          fmtR={fmtR}
        />
      )}

      {dashTab === "clientes" && (
        <ClientesSubTab
          loading={loading}
          orders={orders}
          sales={sales}
          topCustomers={topCustomers}
          upcomingPayables={upcomingPayables}
          productsRunningOut={productsRunningOut}
          clientesHoy={clientesHoy}
          clientesAyer={clientesAyer}
          clientesPromedio={clientesPromedio}
          alerts={alerts}
          expiringBatchCount={expiringBatchCount}
          hasAnyAlert={hasAnyAlert}
          abandonedCartCount={abandonedCartCount}
          abandonedCartValue={abandonedCartValue}
          bestDay={bestDay}
          growingCategory={growingCategory}
          topClientMonth={topClientMonth}
          sectionOrder={sectionOrder}
          fmtR={fmtR}
        />
      )}

      {dashTab === "finanzas" && (
        <FinanzasSubTab
          loading={loading}
          cuentasPorCobrar={cuentasPorCobrar}
          cuentasPorPagar={cuentasPorPagar}
          igvVentasMes={igvVentasMes}
          devoluciones={devoluciones}
          revenueThisMonth={revenueThisMonth}
          revenuePrevMonth={revenuePrevMonth}
          monthDelta={monthDelta}
          upcomingPayables={upcomingPayables}
          productsRunningOut={productsRunningOut}
          clientesHoy={clientesHoy}
          clientesAyer={clientesAyer}
          clientesPromedio={clientesPromedio}
          alerts={alerts}
          expiringBatchCount={expiringBatchCount}
          hasAnyAlert={hasAnyAlert}
          sectionOrder={sectionOrder}
          fmtR={fmtR}
          fmtShortR={fmtShortR}
        />
      )}

      {/* Insights avanzados (shared: ventas + clientes) — ventas only here since clientes has its own */}
      {!loading && dashTab === "ventas" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {bestDay && (
            <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wider">Mejor dia de la semana</span>
              </div>
              <p className="text-sm font-bold text-gray-900 dark:text-zinc-100">Tu mejor dia es el {bestDay.best.name}</p>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">Promedio: {fmtR(bestDay.best.avg)} {bestDay.pctVsOthers > 0 && <span className="text-emerald-600 dark:text-emerald-400 font-bold">(+{bestDay.pctVsOthers}% vs otros dias)</span>}</p>
              {bestDay.worst && <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-1.5">Peor dia: {bestDay.worst.name} -- {fmtR(bestDay.worst.avg)}</p>}
            </div>
          )}
          {growingCategory?.top && (
            <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <span className="text-sm font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wider">Categoria en crecimiento</span>
              </div>
              <p className="text-sm font-bold text-gray-900 dark:text-zinc-100">{growingCategory.top.cat} crecio {growingCategory.top.pct.toFixed(0)}% esta semana</p>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">De {fmtR(growingCategory.top.lastWeek)} a {fmtR(growingCategory.top.thisWeek)}</p>
              {growingCategory.bottom && <p className="text-[10px] text-orange-500 dark:text-orange-400 mt-1.5 font-medium">{growingCategory.bottom.cat} bajo {Math.abs(growingCategory.bottom.pct).toFixed(0)}%</p>}
            </div>
          )}
          {topClientMonth && (
            <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wider">Cliente del mes</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold text-white" style={{ backgroundColor: "var(--color-primary)" }}>{topClientMonth.name.charAt(0).toUpperCase()}</span>
                <p className="text-sm font-bold text-gray-900 dark:text-zinc-100">{topClientMonth.name}</p>
              </div>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">{topClientMonth.orderCount} compras &middot; {fmtR(topClientMonth.total)} &middot; Ticket: {fmtR(topClientMonth.avg)}</p>
              <span className="inline-block text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-full mt-1.5 capitalize">Cliente mas fiel de {topClientMonth.monthName}</span>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

export default memo(SmartDashboardTab);
