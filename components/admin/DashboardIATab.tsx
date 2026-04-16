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
import DailyReportWhatsApp from "@/components/admin/DailyReportWhatsApp";
import ForecastCard from "@/components/admin/ForecastCard";
import SmartReorderCard from "@/components/admin/SmartReorderCard";

// ── Types ────────────────────────────────────────────────────────────────────
interface OrderItem { id: number; name: string; price: number; costPrice?: number; quantity: number }
interface Order { id: string; status: string; total: number; totalCogs?: number; items: OrderItem[]; paymentMethod?: string; createdAt: string }
interface Sale { id: string; total: number; totalCogs?: number; items: { productId: number; name: string; price: number; costPrice?: number; quantity: number }[]; payment: string; createdAt: string }
interface Product { id: number; name: string; price: number; costPrice?: number; stock?: number; stockMin?: number; active: boolean }
interface Customer { phone: string; name: string; createdAt: string }
interface Payable { id: string; amount: number; paidAmount: number; status: string; dueDate: string }
interface DashboardData { products: Product[]; orders: Order[]; sales: Sale[]; customers: Customer[]; payables: Payable[]; alerts: { lowStock: number; pendingOrders: number; overduePayables: number } }
interface ExpiringBatch { id: string; productName?: string; expiresAt: string; quantity?: number }
interface Props { tenantId?: string }

// ── Pure helpers ─────────────────────────────────────────────────────────────
function getGreeting(): { text: string; Icon: React.ElementType } {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return { text: "Buenos dias, jefe", Icon: Sun };
  if (h >= 12 && h < 18) return { text: "Buenas tardes, jefe", Icon: Sunset };
  return { text: "Buenas noches, jefe", Icon: Moon };
}
function todayStr(): string { return new Date().toDateString(); }

function trend(current: number, previous: number): { pct: number; direction: "up" | "down" | "flat" | "new" | "gone" } {
  if (previous === 0 && current === 0) return { pct: 0, direction: "flat" };
  if (previous === 0 && current > 0) return { pct: 0, direction: "new" };
  if (previous > 0 && current === 0) return { pct: 100, direction: "gone" };
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

function topProducts(orders: Order[], sales: Sale[], limit = 5): { name: string; revenue: number; profit: number }[] {
  const revMap = new Map<string, number>();
  const costMap = new Map<string, number>();

  for (const o of orders) {
    if (o.status === "cancelado") continue;
    for (const item of o.items ?? []) {
      const key = item.name ?? `Producto ${item.id}`;
      const rev = item.price * item.quantity;
      const cost = (item.costPrice ?? item.price * 0.7) * item.quantity;
      revMap.set(key, (revMap.get(key) ?? 0) + rev);
      costMap.set(key, (costMap.get(key) ?? 0) + cost);
    }
  }
  for (const s of sales) {
    for (const item of s.items ?? []) {
      const key = item.name ?? `Producto ${item.productId}`;
      const rev = item.price * item.quantity;
      const cost = (item.costPrice ?? item.price * 0.7) * item.quantity;
      revMap.set(key, (revMap.get(key) ?? 0) + rev);
      costMap.set(key, (costMap.get(key) ?? 0) + cost);
    }
  }

  return Array.from(revMap.entries())
    .map(([name, revenue]) => ({ name, revenue, profit: revenue - (costMap.get(name) ?? 0) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

function paymentBreakdown(orders: Order[], sales: Sale[]) {
  const map = new Map<string, number>();
  const colorMap: Record<string, string> = { efectivo: "bg-gray-400 dark:bg-gray-500", yape: "bg-purple-500", plin: "bg-emerald-500", tarjeta: "bg-emerald-500" };
  for (const o of orders) { if (o.status === "cancelado") continue; const m = (o.paymentMethod ?? "efectivo").toLowerCase(); map.set(m, (map.get(m) ?? 0) + (o.total ?? 0)); }
  for (const s of sales) { const m = (s.payment ?? "efectivo").toLowerCase(); map.set(m, (map.get(m) ?? 0) + (s.total ?? 0)); }
  const total = Array.from(map.values()).reduce((a, b) => a + b, 0);
  return Array.from(map.entries()).map(([method, amt]) => ({ method: method.charAt(0).toUpperCase() + method.slice(1), total: amt, pct: total > 0 ? Math.round((amt / total) * 100) : 0, color: colorMap[method] ?? "bg-gray-300" })).sort((a, b) => b.total - a.total);
}
function formatCompact(n: number): string { return n >= 1000 ? `S/${(n / 1000).toFixed(1)}k` : `S/${n.toFixed(0)}`; }
type Period = "today" | "7d" | "30d";
function periodRange(period: Period) {
  const now = new Date();
  const eod = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "today") { const ps = new Date(sod); ps.setDate(ps.getDate() - 1); return { start: sod, end: eod, prevStart: ps, prevEnd: new Date(sod.getTime() - 1) }; }
  const days = period === "7d" ? 6 : 29;
  const prevDays = period === "7d" ? 7 : 30;
  const start = new Date(sod); start.setDate(start.getDate() - days);
  const ps = new Date(start); ps.setDate(ps.getDate() - prevDays);
  return { start, end: eod, prevStart: ps, prevEnd: new Date(start.getTime() - 1) };
}

function salesByHour(orders: Order[], sales: Sale[]) {
  const map = new Map<number, number>(); const today = todayStr();
  for (const o of orders) { if (o.status === "cancelado") continue; const d = new Date(o.createdAt); if (d.toDateString() !== today) continue; map.set(d.getHours(), (map.get(d.getHours()) ?? 0) + (o.total ?? 0)); }
  for (const s of sales) { const d = new Date(s.createdAt); if (d.toDateString() !== today) continue; map.set(d.getHours(), (map.get(d.getHours()) ?? 0) + (s.total ?? 0)); }
  return Array.from(map.entries()).filter(([h]) => h >= 6 && h <= 22).map(([hour, total]) => ({ hour, total })).sort((a, b) => a.hour - b.hour);
}

function timeAgo(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return "ahora"; if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60); return hrs < 24 ? `hace ${hrs}h` : `hace ${Math.floor(hrs / 24)}d`;
}

function recentActivity(orders: Order[], sales: Sale[], limit = 5) {
  type RA = { id: string; time: string; customer: string; amount: number; method: string; date: Date };
  const items: RA[] = [];
  for (const o of orders) { if (o.status === "cancelado") continue; items.push({ id: o.id, time: timeAgo(o.createdAt), customer: "Cliente", amount: o.total ?? 0, method: (o.paymentMethod ?? "efectivo").toLowerCase(), date: new Date(o.createdAt) }); }
  for (const s of sales) { items.push({ id: s.id, time: timeAgo(s.createdAt), customer: "Cliente", amount: s.total ?? 0, method: (s.payment ?? "efectivo").toLowerCase(), date: new Date(s.createdAt) }); }
  return items.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, limit).map(({ date: _d, ...rest }) => rest);
}

// ── Skeletons ────────────────────────────────────────────────────────────────
function KPISkeleton() { return (<div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">{Array.from({ length: 6 }).map((_, i) => (<div key={i} className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4 animate-pulse"><div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded mb-3" /><div className="h-7 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-2" /><div className="h-3 w-12 bg-gray-100 dark:bg-gray-800 rounded" /></div>))}</div>); }
function ChartSkeleton() { return (<div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-5 animate-pulse"><div className="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-4" /><div className="flex items-end gap-2 h-32">{[65, 45, 80, 55, 90, 40, 70].map((h, i) => (<div key={i} className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-t-md" style={{ height: `${h}%` }} />))}</div></div>); }

// ── Main Component ───────────────────────────────────────────────────────────

export default function DashboardIATab({ tenantId: _tenantId }: Props) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [expiring, setExpiring] = useState<ExpiringBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>("today");
  const [dailyGoal, setDailyGoal] = useState(500);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState("");

  // Load daily goal from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("bodega-daily-goal");
      if (saved) setDailyGoal(Number(saved));
    } catch { /* ignore */ }
  }, []);

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
    const { start, end, prevStart, prevEnd } = periodRange(period);
    const inRange = (d: string) => { const t = new Date(d); return t >= start && t <= end; };
    const inPrev = (d: string) => { const t = new Date(d); return t >= prevStart && t <= prevEnd; };

    // Revenue helpers (orders + sales)
    const curOrders = data.orders.filter((o) => o.status !== "cancelado" && inRange(o.createdAt));
    const curSales = data.sales.filter((s) => inRange(s.createdAt));
    const prevOrders = data.orders.filter((o) => o.status !== "cancelado" && inPrev(o.createdAt));
    const prevSales = data.sales.filter((s) => inPrev(s.createdAt));

    const curRev = curOrders.reduce((s, o) => s + (o.total ?? 0), 0) + curSales.reduce((s, sl) => s + (sl.total ?? 0), 0);
    const prevRev = prevOrders.reduce((s, o) => s + (o.total ?? 0), 0) + prevSales.reduce((s, sl) => s + (sl.total ?? 0), 0);

    const curCount = curOrders.length + curSales.length;
    const prevCount = prevOrders.length + prevSales.length;

    const ticketCur = curCount > 0 ? curRev / curCount : 0;
    const ticketPrev = prevCount > 0 ? prevRev / prevCount : 0;

    // Margin
    const curCost =
      curOrders.reduce((s, o) => s + (o.totalCogs ?? o.items.reduce((a, i) => a + (i.costPrice ?? i.price * 0.7) * i.quantity, 0)), 0) +
      curSales.reduce((s, sl) => s + (sl.totalCogs ?? sl.items.reduce((a, i) => a + (i.costPrice ?? i.price * 0.7) * i.quantity, 0)), 0);
    const margin = curRev > 0 ? ((curRev - curCost) / curRev) * 100 : 0;

    const prevCost =
      prevOrders.reduce((s, o) => s + (o.totalCogs ?? o.items.reduce((a, i) => a + (i.costPrice ?? i.price * 0.7) * i.quantity, 0)), 0) +
      prevSales.reduce((s, sl) => s + (sl.totalCogs ?? sl.items.reduce((a, i) => a + (i.costPrice ?? i.price * 0.7) * i.quantity, 0)), 0);
    const marginPrev = prevRev > 0 ? ((prevRev - prevCost) / prevRev) * 100 : 0;

    // New customers this week (always weekly)
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

    // Today revenue (always for goal bar)
    const todayS = todayStr();
    const todayRevForGoal =
      data.orders.filter((o) => o.status !== "cancelado" && new Date(o.createdAt).toDateString() === todayS).reduce((s, o) => s + (o.total ?? 0), 0) +
      data.sales.filter((s) => new Date(s.createdAt).toDateString() === todayS).reduce((s, sl) => s + (sl.total ?? 0), 0);

    return {
      todayRev: curRev,
      todayRevForGoal,
      revTrend: trend(curRev, prevRev),
      pendingOrders: data.alerts.pendingOrders,
      ticketToday: ticketCur,
      ticketTrend: trend(ticketCur, ticketPrev),
      margin: Math.round(margin),
      marginTrend: trend(margin, marginPrev),
      newCustomers,
      customerTrend: trend(newCustomers, prevCustomers),
      debt,
    };
  }, [data, period]);

  const chartData = useMemo(() => {
    if (!data) return null;
    return {
      weekly: groupByDay(data.orders, data.sales, 7),
      topProds: topProducts(data.orders, data.sales, 5),
      payments: paymentBreakdown(data.orders, data.sales),
      hourly: salesByHour(data.orders, data.sales),
      recent: recentActivity(data.orders, data.sales, 5),
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
      <div className="bg-red-50 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-800/30 p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
        <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-3">{error}</p>
        <button onClick={() => void fetchData()} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-colors">
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
      label: `${data.alerts.lowStock} con pocas existencias`,
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

  const actionBorderColor = { red: "border-l-red-500", orange: "border-l-orange-500", blue: "border-l-emerald-500" };
  const actionDotColor = { red: "bg-red-500", orange: "bg-orange-500", blue: "bg-emerald-500" };

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#00B4A6]/10 dark:bg-[#00B4A6]/20">
            <GreetingIcon className="w-5 h-5 text-[#00B4A6] dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 dark:text-foreground">{greetingText}</h2>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-muted">
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Hoy: {todayFormatted}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-gray-100 dark:bg-surface p-0.5">
            {([["today", "Hoy"], ["7d", "7 dias"], ["30d", "30 dias"]] as const).map(([key, lbl]) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className={cn(
                  "px-2.5 py-1 text-xs font-semibold rounded-md transition-colors",
                  period === key
                    ? "bg-white dark:bg-card text-gray-900 dark:text-foreground "
                    : "text-gray-500 dark:text-muted hover:text-gray-700 dark:hover:text-foreground",
                )}
              >
                {lbl}
              </button>
            ))}
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
      </div>

      {/* ── Daily Goal Progress ─────────────────────────────────────────── */}
      {(() => {
        const goalPct = dailyGoal > 0 ? Math.min(Math.round((kpis.todayRevForGoal / dailyGoal) * 100), 100) : 0;
        const goalColor = goalPct >= 100 ? "bg-emerald-500" : goalPct >= 50 ? "bg-orange-400" : "bg-red-500";
        const goalTextColor = goalPct >= 100 ? "text-emerald-600 dark:text-emerald-400" : goalPct >= 50 ? "text-orange-600 dark:text-orange-400" : "text-red-600 dark:text-red-400";
        return (
          <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
            <div className="flex items-center justify-between mb-2">
              <span className={cn("text-sm font-bold", goalTextColor)}>
                Meta del dia: {formatCurrency(kpis.todayRevForGoal)} de {formatCurrency(dailyGoal)} ({goalPct}%)
              </span>
              {editingGoal ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={goalInput}
                    onChange={(e) => setGoalInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const v = Number(goalInput);
                        if (v > 0) { setDailyGoal(v); localStorage.setItem("bodega-daily-goal", String(v)); }
                        setEditingGoal(false);
                      }
                    }}
                    className="w-20 px-2 py-1 text-xs rounded-lg border border-gray-300 dark:border-card-border bg-gray-50 dark:bg-surface text-gray-900 dark:text-foreground"
                    autoFocus
                  />
                  <button
                    onClick={() => { const v = Number(goalInput); if (v > 0) { setDailyGoal(v); localStorage.setItem("bodega-daily-goal", String(v)); } setEditingGoal(false); }}
                    className="text-xs font-semibold text-[#00B4A6] hover:underline"
                  >OK</button>
                </div>
              ) : (
                <button
                  onClick={() => { setGoalInput(String(dailyGoal)); setEditingGoal(true); }}
                  className="text-xs font-semibold text-gray-400 hover:text-gray-600 dark:text-muted dark:hover:text-foreground transition-colors"
                >Editar meta</button>
              )}
            </div>
            <div className="h-3 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
              <div className={cn("h-full rounded-full transition-all duration-500", goalColor)} style={{ width: `${goalPct}%` }} />
            </div>
          </div>
        );
      })()}

      {/* ── KPI Strip ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <KPICard icon={DollarSign} label={period === "today" ? "Ventas hoy" : period === "7d" ? "Ventas 7 dias" : "Ventas 30 dias"} value={formatCurrency(kpis.todayRev)} trend={kpis.revTrend} />
        <KPICard
          icon={ShoppingCart}
          label="Pedidos pend."
          value={String(kpis.pendingOrders)}
          alert={kpis.pendingOrders > 0 ? "red" : undefined}
        />
        <KPICard icon={Receipt} label="Ticket prom." value={formatCurrency(kpis.ticketToday)} trend={kpis.ticketTrend} />
        <KPICard icon={Percent} label="Margen" value={`${kpis.margin}%`} trend={kpis.marginTrend} tooltip="Porcentaje de ganancia sobre el precio de venta" />
        <KPICard icon={Users} label="Clientes nuevos" value={String(kpis.newCustomers)} sub="esta semana" trend={kpis.customerTrend} />
        <KPICard
          icon={Landmark}
          label="Deuda proveed."
          value={formatCompact(kpis.debt)}
          alert={kpis.debt > 0 ? "yellow" : undefined}
        />
      </div>

      {/* ── Sales by Hour ────────────────────────────────────────────────── */}
      {chartData.hourly.length > 0 && (() => {
        const hourlyMax = Math.max(...chartData.hourly.map((h) => h.total), 1);
        return (
          <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
            <h3 className="text-xs font-bold text-gray-500 dark:text-muted mb-3">Horario de ventas</h3>
            <div className="space-y-1.5" style={{ maxHeight: "100px", overflowY: "auto" }}>
              {chartData.hourly.map((h) => (
                <div key={h.hour} className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-gray-500 dark:text-muted w-10 text-right shrink-0">
                    {h.hour.toString().padStart(2, "0")}:00
                  </span>
                  <div className="flex-1 h-3 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#00B4A6] dark:bg-emerald-600 rounded-full transition-all duration-300"
                      style={{ width: `${(h.total / hourlyMax) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-gray-500 dark:text-muted w-14 text-right shrink-0">
                    {formatCompact(h.total)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Charts row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Weekly sales bar chart */}
        <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-5">
          <h3 className="text-xs font-bold text-gray-500 dark:text-muted mb-4">
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
                      className="absolute bottom-0 left-1 right-1 rounded-t-md bg-[#00B4A6] dark:bg-emerald-600 transition-all duration-500"
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
        <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-5">
          <h3 className="text-xs font-bold text-gray-500 dark:text-muted mb-4">
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
                        <div className="flex items-center gap-2 ml-2 shrink-0">
                          <span className="text-xs font-bold text-gray-600 dark:text-muted">{formatCurrency(p.revenue)}</span>
                          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">+{formatCurrency(p.profit)} ganancia</span>
                        </div>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#f97316] rounded-full transition-all duration-500"
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
        <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-5">
          <h3 className="text-xs font-bold text-gray-500 dark:text-muted mb-4">
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
        <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-5">
          <h3 className="text-xs font-bold text-gray-500 dark:text-muted mb-4">
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
                      "w-full flex items-center gap-3 p-3 rounded-lg border-l-4 bg-gray-50 dark:bg-surface hover:bg-gray-100 dark:hover:bg-card transition-colors text-left",
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

      {/* ── Recent Activity ──────────────────────────────────────────────── */}
      {chartData.recent.length > 0 && (
        <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-5">
          <h3 className="text-xs font-bold text-gray-500 dark:text-muted mb-4">
            Actividad reciente
          </h3>
          <div className="space-y-2">
            {chartData.recent.map((item) => {
              const methodIcons: Record<string, string> = { efectivo: "E", yape: "Y", plin: "P", tarjeta: "T" };
              return (
                <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50 dark:bg-surface">
                  <span className="w-6 h-6 shrink-0 flex items-center justify-center rounded-full bg-gray-200 dark:bg-accent text-[10px] font-bold text-gray-600 dark:text-muted">{methodIcons[item.method] ?? "?"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-800 dark:text-foreground truncate">{item.customer}</span>
                      <span className="text-sm font-bold text-gray-700 dark:text-foreground ml-2 shrink-0">{formatCurrency(item.amount)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[10px] text-gray-400 dark:text-muted">{item.time}</span>
                      <span className="text-[10px] text-gray-400 dark:text-muted capitalize">{item.method}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── WhatsApp Daily Report ─────────────────────────────────────────── */}
      <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4 sm:p-5">
        <h3 className="text-xs font-bold text-gray-500 dark:text-muted mb-4">
          Reporte diario por WhatsApp
        </h3>
        <DailyReportWhatsApp />
      </div>

      {/* ── Predicción IA ─────────────────────────────────────────────────── */}
      <div className="space-y-1">
        <h2 className="text-xs font-bold text-gray-400 dark:text-muted px-1">
          Inteligencia artificial local
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ForecastCard />
          <SmartReorderCard />
        </div>
      </div>

      {/* ── AI Quick Chat ──────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4 sm:p-5">
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
            className="flex-1 bg-gray-50 dark:bg-surface border border-gray-200 dark:border-card-border rounded-lg px-4 py-2.5 text-sm text-gray-900 dark:text-foreground placeholder:text-gray-400 dark:placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30 focus:border-[#00B4A6] transition-colors"
            disabled={chatLoading}
          />
          <button
            onClick={() => void handleAsk()}
            disabled={chatLoading || !question.trim()}
            className="shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-[#00B4A6] hover:bg-[#009690] disabled:opacity-50 text-white transition-colors"
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
  tooltip,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  trend?: { pct: number; direction: "up" | "down" | "flat" | "new" | "gone" };
  alert?: "red" | "yellow";
  tooltip?: string;
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

  const renderTrend = () => {
    if (!t) return sub ? <p className="text-xs text-gray-400 dark:text-muted mt-1">{sub}</p> : <div className="h-4 mt-1" />;
    if (t.direction === "new") {
      return <div className="flex items-center gap-1 mt-1 text-xs font-semibold text-gray-400 dark:text-muted"><TrendingUp className="w-3 h-3" />Nuevo</div>;
    }
    if (t.direction === "gone") {
      return <div className="flex items-center gap-1 mt-1 text-xs font-semibold text-red-500 dark:text-red-400"><TrendingDown className="w-3 h-3" />Sin ventas hoy</div>;
    }
    if (t.direction === "up") {
      return <div className="flex items-center gap-1 mt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><TrendingUp className="w-3 h-3" />+{t.pct}%</div>;
    }
    if (t.direction === "down") {
      return <div className="flex items-center gap-1 mt-1 text-xs font-semibold text-red-600 dark:text-red-400"><TrendingDown className="w-3 h-3" />-{t.pct}%</div>;
    }
    if (sub) return <p className="text-xs text-gray-400 dark:text-muted mt-1">{sub}</p>;
    return <div className="flex items-center gap-1 mt-1 text-xs font-semibold text-gray-400 dark:text-muted"><Minus className="w-3 h-3" />Sin cambio</div>;
  };

  return (
    <div className={cn("bg-white dark:bg-card rounded-xl border p-4 transition-colors", alertBorder)} title={tooltip}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold text-gray-500 dark:text-muted leading-tight">{label}</span>
        <Icon className="w-4 h-4 text-[#00B4A6] dark:text-emerald-400 shrink-0" />
      </div>
      <p className={cn("text-xl font-extrabold", alertValue)}>{value}</p>
      {renderTrend()}
    </div>
  );
}
