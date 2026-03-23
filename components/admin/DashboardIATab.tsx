"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  DollarSign,
  ShoppingCart,
  Receipt,
  Percent,
  Users,
  Landmark,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight,
  Send,
  Loader2,
  Sun,
  Moon,
  Sunset,
  Clock,
  Package,
  CreditCard,
  RefreshCw,
  CalendarDays,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface OrderItem {
  id: number;
  name: string;
  price: number;
  costPrice?: number;
  quantity: number;
}

interface Order {
  id: string;
  status: string;
  total: number;
  totalCogs?: number;
  items: OrderItem[];
  paymentMethod?: string;
  createdAt: string;
}

interface Sale {
  id: string;
  total: number;
  totalCogs?: number;
  items: { productId: number; name: string; price: number; costPrice?: number; quantity: number }[];
  payment: string;
  createdAt: string;
}

interface Product {
  id: number;
  name: string;
  price: number;
  costPrice?: number;
  stock?: number;
  stockMin?: number;
  active: boolean;
}

interface Customer {
  phone: string;
  name: string;
  createdAt: string;
}

interface Payable {
  id: string;
  amount: number;
  paidAmount: number;
  status: string;
  dueDate: string;
}

interface DashboardData {
  products: Product[];
  orders: Order[];
  sales: Sale[];
  customers: Customer[];
  payables: Payable[];
  alerts: {
    lowStock: number;
    pendingOrders: number;
    overduePayables: number;
  };
}

interface ExpiringBatch {
  id: string;
  productName?: string;
  expiresAt: string;
  quantity?: number;
}

interface Props {
  tenantId?: string;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

function getGreeting(): { text: string; Icon: React.ElementType } {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return { text: "Buenos dias, jefe", Icon: Sun };
  if (h >= 12 && h < 18) return { text: "Buenas tardes, jefe", Icon: Sunset };
  return { text: "Buenas noches, jefe", Icon: Moon };
}

function todayStr(): string {
  return new Date().toDateString();
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toDateString();
}

function trend(current: number, previous: number): { pct: number; direction: "up" | "down" | "flat" } {
  if (previous === 0 && current === 0) return { pct: 0, direction: "flat" };
  if (previous === 0) return { pct: 100, direction: "up" };
  const pct = ((current - previous) / previous) * 100;
  return {
    pct: Math.round(Math.abs(pct) * 10) / 10,
    direction: pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat",
  };
}

function groupByDay(orders: Order[], sales: Sale[], days = 7): { label: string; value: number }[] {
  const dayLabels = ["D", "L", "M", "M", "J", "V", "S"];
  const result: { label: string; value: number }[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const ds = d.toDateString();
    const orderRev = orders
      .filter((o) => o.status !== "cancelado" && new Date(o.createdAt).toDateString() === ds)
      .reduce((s, o) => s + (o.total ?? 0), 0);
    const saleRev = sales
      .filter((s) => new Date(s.createdAt).toDateString() === ds)
      .reduce((s, sl) => s + (sl.total ?? 0), 0);
    result.push({ label: dayLabels[d.getDay()], value: orderRev + saleRev });
  }
  return result;
}

function topProducts(orders: Order[], sales: Sale[], limit = 5): { name: string; revenue: number }[] {
  const map = new Map<string, number>();

  for (const o of orders) {
    if (o.status === "cancelado") continue;
    for (const item of o.items ?? []) {
      const key = item.name ?? `Producto ${item.id}`;
      map.set(key, (map.get(key) ?? 0) + item.price * item.quantity);
    }
  }
  for (const s of sales) {
    for (const item of s.items ?? []) {
      const key = item.name ?? `Producto ${item.productId}`;
      map.set(key, (map.get(key) ?? 0) + item.price * item.quantity);
    }
  }

  return Array.from(map.entries())
    .map(([name, revenue]) => ({ name, revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

function paymentBreakdown(orders: Order[], sales: Sale[]): { method: string; total: number; pct: number; color: string }[] {
  const map = new Map<string, number>();
  const colorMap: Record<string, string> = {
    efectivo: "bg-gray-400 dark:bg-gray-500",
    yape: "bg-purple-500",
    plin: "bg-emerald-500",
    tarjeta: "bg-blue-500",
  };

  for (const o of orders) {
    if (o.status === "cancelado") continue;
    const m = (o.paymentMethod ?? "efectivo").toLowerCase();
    map.set(m, (map.get(m) ?? 0) + (o.total ?? 0));
  }
  for (const s of sales) {
    const m = (s.payment ?? "efectivo").toLowerCase();
    map.set(m, (map.get(m) ?? 0) + (s.total ?? 0));
  }

  const total = Array.from(map.values()).reduce((a, b) => a + b, 0);
  return Array.from(map.entries())
    .map(([method, amt]) => ({
      method: method.charAt(0).toUpperCase() + method.slice(1),
      total: amt,
      pct: total > 0 ? Math.round((amt / total) * 100) : 0,
      color: colorMap[method] ?? "bg-gray-300",
    }))
    .sort((a, b) => b.total - a.total);
}

function formatCompact(n: number): string {
  if (n >= 1000) return `S/${(n / 1000).toFixed(1)}k`;
  return `S/${n.toFixed(0)}`;
}

// ── Skeletons ────────────────────────────────────────────────────────────────

function KPISkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-4 animate-pulse">
          <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
          <div className="h-7 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
          <div className="h-3 w-12 bg-gray-100 dark:bg-gray-800 rounded" />
        </div>
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-5 animate-pulse">
      <div className="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
      <div className="flex items-end gap-2 h-32">
        {[65, 45, 80, 55, 90, 40, 70].map((h, i) => (
          <div key={i} className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-t-md" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function DashboardIATab({ tenantId: _tenantId }: Props) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [expiring, setExpiring] = useState<ExpiringBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Chat state
  const [question, setQuestion] = useState("");
  const [chatAnswer, setChatAnswer] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const [dashRes, batchRes] = await Promise.all([
        fetch("/api/admin/dashboard"),
        fetch("/api/batches/expiring?days=7"),
      ]);
      if (!dashRes.ok) throw new Error("Error al cargar datos");
      const dashData = await dashRes.json();
      setData(dashData);
      if (batchRes.ok) {
        const batchData = await batchRes.json();
        setExpiring(Array.isArray(batchData.data) ? batchData.data : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void fetchData();
    const interval = setInterval(() => void fetchData(true), 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ── Computed values ─────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    if (!data) return null;
    const today = todayStr();
    const yesterday = yesterdayStr();

    // Revenue helpers (orders + sales)
    const todayOrders = data.orders.filter((o) => o.status !== "cancelado" && new Date(o.createdAt).toDateString() === today);
    const todaySales = data.sales.filter((s) => new Date(s.createdAt).toDateString() === today);
    const yesterdayOrders = data.orders.filter((o) => o.status !== "cancelado" && new Date(o.createdAt).toDateString() === yesterday);
    const yesterdaySales = data.sales.filter((s) => new Date(s.createdAt).toDateString() === yesterday);

    const todayRev = todayOrders.reduce((s, o) => s + (o.total ?? 0), 0) + todaySales.reduce((s, sl) => s + (sl.total ?? 0), 0);
    const yesterdayRev = yesterdayOrders.reduce((s, o) => s + (o.total ?? 0), 0) + yesterdaySales.reduce((s, sl) => s + (sl.total ?? 0), 0);

    const todayCount = todayOrders.length + todaySales.length;
    const yesterdayCount = yesterdayOrders.length + yesterdaySales.length;

    const ticketToday = todayCount > 0 ? todayRev / todayCount : 0;
    const ticketYesterday = yesterdayCount > 0 ? yesterdayRev / yesterdayCount : 0;

    // Margin: use totalCogs if available, otherwise estimate from costPrice
    const todayCost =
      todayOrders.reduce((s, o) => s + (o.totalCogs ?? o.items.reduce((a, i) => a + (i.costPrice ?? i.price * 0.7) * i.quantity, 0)), 0) +
      todaySales.reduce((s, sl) => s + (sl.totalCogs ?? sl.items.reduce((a, i) => a + (i.costPrice ?? i.price * 0.7) * i.quantity, 0)), 0);
    const margin = todayRev > 0 ? ((todayRev - todayCost) / todayRev) * 100 : 0;

    // Yesterday margin for trend
    const yesterdayCost =
      yesterdayOrders.reduce((s, o) => s + (o.totalCogs ?? o.items.reduce((a, i) => a + (i.costPrice ?? i.price * 0.7) * i.quantity, 0)), 0) +
      yesterdaySales.reduce((s, sl) => s + (sl.totalCogs ?? sl.items.reduce((a, i) => a + (i.costPrice ?? i.price * 0.7) * i.quantity, 0)), 0);
    const marginYesterday = yesterdayRev > 0 ? ((yesterdayRev - yesterdayCost) / yesterdayRev) * 100 : 0;

    // New customers this week
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const newCustomers = data.customers.filter((c) => new Date(c.createdAt) >= weekAgo).length;
    const prevWeekStart = new Date(weekAgo);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevCustomers = data.customers.filter((c) => {
      const d = new Date(c.createdAt);
      return d >= prevWeekStart && d < weekAgo;
    }).length;

    // Supplier debt
    const debt = (data.payables ?? [])
      .filter((p) => p.status !== "pagado")
      .reduce((s, p) => s + (p.amount - p.paidAmount), 0);

    return {
      todayRev,
      revTrend: trend(todayRev, yesterdayRev),
      pendingOrders: data.alerts.pendingOrders,
      ticketToday,
      ticketTrend: trend(ticketToday, ticketYesterday),
      margin: Math.round(margin),
      marginTrend: trend(margin, marginYesterday),
      newCustomers,
      customerTrend: trend(newCustomers, prevCustomers),
      debt,
    };
  }, [data]);

  const chartData = useMemo(() => {
    if (!data) return null;
    return {
      weekly: groupByDay(data.orders, data.sales, 7),
      topProds: topProducts(data.orders, data.sales, 5),
      payments: paymentBreakdown(data.orders, data.sales),
    };
  }, [data]);

  // ── Chat handler ────────────────────────────────────────────────────────

  const handleAsk = useCallback(async () => {
    const trimmed = question.trim();
    if (!trimmed || chatLoading) return;
    setChatLoading(true);
    setChatAnswer("");
    try {
      const res = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, stream: false }),
      });
      if (!res.ok) throw new Error("Error del asistente");
      const json = await res.json();
      setChatAnswer(json.response ?? json.message ?? "Sin respuesta");
      setQuestion("");
    } catch {
      setChatAnswer("No pude responder en este momento. Intenta de nuevo.");
    }
    setChatLoading(false);
  }, [question, chatLoading]);

  // ── Navigate helper ─────────────────────────────────────────────────────

  const navigateTo = useCallback((tab: string) => {
    window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { tab } }));
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────

  const { text: greetingText, Icon: GreetingIcon } = getGreeting();
  const todayFormatted = new Date().toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-950/20 rounded-2xl border border-red-200 dark:border-red-800/30 p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
        <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-3">{error}</p>
        <button onClick={() => void fetchData()} className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-colors">
          Reintentar
        </button>
      </div>
    );
  }

  if (loading || !kpis || !chartData) {
    return (
      <div className="space-y-5">
        <div className="animate-pulse"><div className="h-6 w-56 bg-gray-200 dark:bg-gray-700 rounded" /></div>
        <KPISkeleton />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4"><ChartSkeleton /><ChartSkeleton /></div>
      </div>
    );
  }

  const weeklyMax = Math.max(...chartData.weekly.map((d) => d.value), 1);
  const topMax = chartData.topProds[0]?.revenue ?? 1;

  // ── Build urgent actions ──────────────────────────────────────────────

  const urgentActions: { id: string; icon: React.ElementType; label: string; detail: string; color: "red" | "orange" | "blue"; href: string }[] = [];

  if (kpis.pendingOrders > 0) {
    urgentActions.push({
      id: "pending",
      icon: ShoppingCart,
      label: `${kpis.pendingOrders} pedido${kpis.pendingOrders > 1 ? "s" : ""} sin atender`,
      detail: "Confirmar para no perder ventas",
      color: "red",
      href: "pedidos",
    });
  }
  if (expiring.length > 0) {
    urgentActions.push({
      id: "expiring",
      icon: Clock,
      label: `${expiring.length} producto${expiring.length > 1 ? "s" : ""} por vencer`,
      detail: "Ponlos en oferta esta semana",
      color: "orange",
      href: "inventario-almacenes",
    });
  }
  if (data && data.alerts.lowStock > 0) {
    urgentActions.push({
      id: "lowstock",
      icon: Package,
      label: `${data.alerts.lowStock} con stock bajo`,
      detail: "Reabastecer antes de quedarte sin",
      color: "orange",
      href: "inventario-almacenes",
    });
  }
  if (kpis.debt > 0) {
    urgentActions.push({
      id: "debt",
      icon: CreditCard,
      label: `${formatCompact(kpis.debt)} deuda proveedores`,
      detail: "Revisa vencimientos y programa pagos",
      color: "blue",
      href: "tesoreria",
    });
  }

  const actionBorderColor = { red: "border-l-red-500", orange: "border-l-orange-500", blue: "border-l-blue-500" };
  const actionDotColor = { red: "bg-red-500", orange: "bg-orange-500", blue: "bg-blue-500" };

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#2d6a4f]/10 dark:bg-[#2d6a4f]/20">
            <GreetingIcon className="w-5 h-5 text-[#2d6a4f] dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 dark:text-foreground">{greetingText}</h2>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-muted">
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Hoy: {todayFormatted}</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => void fetchData(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 dark:text-muted bg-gray-100 dark:bg-surface hover:bg-gray-200 dark:hover:bg-card transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
          Actualizar
        </button>
      </div>

      {/* ── KPI Strip ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <KPICard icon={DollarSign} label="Ventas hoy" value={formatCurrency(kpis.todayRev)} trend={kpis.revTrend} />
        <KPICard
          icon={ShoppingCart}
          label="Pedidos pend."
          value={String(kpis.pendingOrders)}
          alert={kpis.pendingOrders > 0 ? "red" : undefined}
        />
        <KPICard icon={Receipt} label="Ticket prom." value={formatCurrency(kpis.ticketToday)} trend={kpis.ticketTrend} />
        <KPICard icon={Percent} label="Margen" value={`${kpis.margin}%`} trend={kpis.marginTrend} />
        <KPICard icon={Users} label="Clientes nuevos" value={String(kpis.newCustomers)} sub="esta semana" trend={kpis.customerTrend} />
        <KPICard
          icon={Landmark}
          label="Deuda proveed."
          value={formatCompact(kpis.debt)}
          alert={kpis.debt > 0 ? "yellow" : undefined}
        />
      </div>

      {/* ── Charts row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Weekly sales bar chart */}
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-5">
          <h3 className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide mb-4">
            Ventas ultimos 7 dias
          </h3>
          <div className="flex items-end gap-2 h-36">
            {chartData.weekly.map((day, i) => {
              const pct = weeklyMax > 0 ? (day.value / weeklyMax) * 100 : 0;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] font-semibold text-gray-500 dark:text-muted">
                    {day.value > 0 ? formatCompact(day.value) : ""}
                  </span>
                  <div className="w-full relative group" style={{ height: "100px" }}>
                    <div
                      className="absolute bottom-0 left-1 right-1 rounded-t-md bg-[#2d6a4f] dark:bg-emerald-600 transition-all duration-500"
                      style={{ height: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-gray-400 dark:text-muted">{day.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top 5 products */}
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-5">
          <h3 className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide mb-4">
            Top 5 productos
          </h3>
          {chartData.topProds.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-muted">Sin datos de productos aun.</p>
          ) : (
            <div className="space-y-3">
              {chartData.topProds.map((p, i) => {
                const barPct = topMax > 0 ? (p.revenue / topMax) * 100 : 0;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-gray-400 dark:text-muted w-4 text-right">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-gray-800 dark:text-foreground truncate">{p.name}</span>
                        <span className="text-xs font-bold text-gray-600 dark:text-muted ml-2 shrink-0">{formatCurrency(p.revenue)}</span>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#f4a261] rounded-full transition-all duration-500"
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Payment + Actions row ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Payment breakdown */}
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-5">
          <h3 className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide mb-4">
            Pagos por metodo
          </h3>
          {chartData.payments.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-muted">Sin ventas registradas.</p>
          ) : (
            <div className="space-y-3">
              {chartData.payments.map((pm) => (
                <div key={pm.method}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-gray-700 dark:text-foreground">{pm.method}</span>
                    <span className="text-xs font-bold text-gray-500 dark:text-muted">{pm.pct}%</span>
                  </div>
                  <div className="h-2.5 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all duration-500", pm.color)} style={{ width: `${pm.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Urgent actions */}
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-5">
          <h3 className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide mb-4">
            Acciones urgentes
          </h3>
          {urgentActions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mb-2">
                <TrendingUp className="w-5 h-5 text-emerald-500" />
              </div>
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Todo en orden</p>
              <p className="text-xs text-gray-400 dark:text-muted mt-0.5">Sin alertas pendientes</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {urgentActions.map((a) => {
                const Icon = a.icon;
                return (
                  <button
                    key={a.id}
                    onClick={() => navigateTo(a.href)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl border-l-4 bg-gray-50 dark:bg-surface hover:bg-gray-100 dark:hover:bg-card transition-colors text-left",
                      actionBorderColor[a.color],
                    )}
                  >
                    <div className={cn("w-2 h-2 rounded-full shrink-0", actionDotColor[a.color])} />
                    <Icon className="w-4 h-4 text-gray-500 dark:text-muted shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 dark:text-foreground truncate">{a.label}</p>
                      <p className="text-xs text-gray-400 dark:text-muted">{a.detail}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-300 dark:text-muted shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── AI Quick Chat ──────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-4 sm:p-5">
        {chatAnswer && (
          <div className="mb-3 bg-gray-50 dark:bg-surface rounded-xl p-3 text-sm text-gray-700 dark:text-foreground whitespace-pre-line">
            {chatAnswer}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleAsk(); }}
            placeholder="Preguntame sobre tu negocio..."
            className="flex-1 bg-gray-50 dark:bg-surface border border-gray-200 dark:border-card-border rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-foreground placeholder:text-gray-400 dark:placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[#2d6a4f]/30 focus:border-[#2d6a4f] transition-colors"
            disabled={chatLoading}
          />
          <button
            onClick={() => void handleAsk()}
            disabled={chatLoading || !question.trim()}
            className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-[#2d6a4f] hover:bg-[#245a42] disabled:opacity-50 text-white transition-colors"
          >
            {chatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── KPI Card subcomponent ─────────────────────────────────────────────────────

function KPICard({
  icon: Icon,
  label,
  value,
  sub,
  trend: t,
  alert,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  trend?: { pct: number; direction: "up" | "down" | "flat" };
  alert?: "red" | "yellow";
}) {
  const alertBorder = alert === "red"
    ? "border-red-300 dark:border-red-800/40"
    : alert === "yellow"
      ? "border-yellow-300 dark:border-yellow-800/40"
      : "border-gray-200 dark:border-card-border";

  const alertValue = alert === "red"
    ? "text-red-600 dark:text-red-400"
    : alert === "yellow"
      ? "text-yellow-600 dark:text-yellow-400"
      : "text-gray-900 dark:text-foreground";

  return (
    <div className={cn("bg-white dark:bg-card rounded-2xl border p-4 transition-colors", alertBorder)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold text-gray-500 dark:text-muted uppercase tracking-wide leading-tight">{label}</span>
        <Icon className="w-4 h-4 text-[#2d6a4f] dark:text-emerald-400 shrink-0" />
      </div>
      <p className={cn("text-xl font-extrabold", alertValue)}>{value}</p>
      {t && t.direction !== "flat" ? (
        <div className={cn(
          "flex items-center gap-1 mt-1 text-xs font-semibold",
          t.direction === "up" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
        )}>
          {t.direction === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {t.direction === "up" ? "+" : "-"}{t.pct}%
        </div>
      ) : sub ? (
        <p className="text-xs text-gray-400 dark:text-muted mt-1">{sub}</p>
      ) : t?.direction === "flat" ? (
        <div className="flex items-center gap-1 mt-1 text-xs font-semibold text-gray-400 dark:text-muted">
          <Minus className="w-3 h-3" />
          Sin cambio
        </div>
      ) : (
        <div className="h-4 mt-1" />
      )}
    </div>
  );
}
