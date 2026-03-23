"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react";
import {
  TrendingUp, DollarSign, ShoppingCart, Users, Package,
  AlertTriangle, BarChart3, Clock,
  CreditCard, Banknote,
  AlertCircle, PackageX, Timer, Truck, Star, Receipt, Percent,
  ShoppingBasket, RefreshCw, Lightbulb, Zap, CalendarDays,
  UserCheck, TrendingDown, Download, Search, Target, X, type LucideIcon,
  ArrowUp, ArrowDown, Trophy, CheckCircle2, Edit3,
  Beaker, Sparkles, Gift, Plus, ChevronRight, Sun, Maximize2, Minimize2, LayoutDashboard,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";
import { OrderStats } from "@/components/OrderStats";
import { useTheme } from "@/contexts/theme-context";
import type { Product, Sale, Purchase, Supplier, Customer } from "@/types/erp";
import BatchStatsWidget from "@/components/admin/dashboard/BatchStatsWidget";
import ExpiringBatchesAlert from "@/components/admin/dashboard/ExpiringBatchesAlert";
import ExpiredBatchesWidget from "@/components/admin/dashboard/ExpiredBatchesWidget";
import PushNotificationBanner from "@/components/admin/dashboard/PushNotificationBanner";

// ── Types ────────────────────────────────────────────────────────────────────

interface OrderItem { id: number; name: string; price: number; quantity: number; unit: string; image: string; }
interface Order {
  id: string; customer: { name: string; phone?: string; location: string; reference: string };
  items: OrderItem[]; total: number;
  status: "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado";
  paymentMethod?: "yape" | "efectivo"; createdAt: string; updatedAt: string; notes?: string;
  adminNote?: string;
  statusHistory?: { status: string; at: string }[];
}
interface Payable { id: string; supplierId: string; supplierName: string; amount: number; paidAmount: number; status: string; dueDate: string; }
interface Review { id: string; name: string; rating: number; text: string; date: string; }

type Period = "hoy" | "semana" | "mes" | "todo";
type Section = "resumen" | "ventas" | "productos" | "inventario" | "clientes" | "compras" | "caja";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return `S/${n.toFixed(2)}`; }
function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }); } catch { return iso; }
}
function fmtDateFull(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); } catch { return iso; }
}
function fmtTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
}
function inPeriod(dateStr: string, period: Period): boolean {
  if (period === "todo") return true;
  const d = new Date(dateStr), now = new Date();
  if (period === "hoy") return d.toDateString() === now.toDateString();
  if (period === "semana") { const w = new Date(now); w.setDate(w.getDate() - 7); return d >= w; }
  if (period === "mes") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  return true;
}
function inPrevPeriod(dateStr: string, period: Period): boolean {
  if (period === "todo") return false;
  const d = new Date(dateStr), now = new Date();
  if (period === "hoy") { const y = new Date(now); y.setDate(y.getDate()-1); return d.toDateString()===y.toDateString(); }
  if (period === "semana") { const w2 = new Date(now); w2.setDate(w2.getDate()-7); const w1 = new Date(now); w1.setDate(w1.getDate()-14); return d >= w1 && d < w2; }
  if (period === "mes") { const pm = new Date(now.getFullYear(), now.getMonth()-1, 1); return d.getMonth()===pm.getMonth() && d.getFullYear()===pm.getFullYear(); }
  return false;
}
function dateKey(iso: string) { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function dayLabel(dk: string) { return new Date(dk+"T12:00:00").toLocaleDateString("es-PE",{day:"2-digit",month:"short"}); }

const CAT_LABELS: Record<string,string> = { "frutas-verduras":"Frutas y Verduras", abarrotes:"Abarrotes", carnes:"Carnes", lacteos:"Lácteos", bebidas:"Bebidas", limpieza:"Limpieza" };
const CAT_COLORS: Record<string,string> = { "frutas-verduras":"#10b981", abarrotes:"#f59e0b", carnes:"#ef4444", lacteos:"#3b82f6", bebidas:"#8b5cf6", limpieza:"#06b6d4" };
const PAY_LABELS: Record<string,string> = { efectivo:"Efectivo", yape:"Yape", plin:"Plin", tarjeta:"Tarjeta", transferencia:"Transferencia" };
const PAY_COLORS: Record<string,string> = { efectivo:"#10b981", yape:"#8b5cf6", plin:"#06b6d4", tarjeta:"#3b82f6", transferencia:"#f59e0b" };
const DAYS = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

const SECTIONS: { id: Section; label: string; icon: React.ComponentType<{className?:string}> }[] = [
  { id: "resumen",    label: "Resumen",     icon: BarChart3 },
  { id: "ventas",     label: "Ventas",      icon: DollarSign },
  { id: "productos",  label: "Productos",   icon: TrendingUp },
  { id: "inventario", label: "Inventario",  icon: Package },
  { id: "clientes",   label: "Clientes",    icon: Users },
  { id: "compras",    label: "Compras",     icon: Truck },
  { id: "caja",       label: "Caja",        icon: Banknote },
];

// ── Main Component ───────────────────────────────────────────────────────────

export default function DashboardTab() {
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("mes");
  const [section, setSection] = useState<Section>("resumen");
  const { setTheme } = useTheme();

  /* X3: Auto dark mode for admin on first visit */
  useEffect(() => {
    try {
      if (!localStorage.getItem("bsm-admin-theme-set")) {
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        if (prefersDark) setTheme("system");
        localStorage.setItem("bsm-admin-theme-set", "1");
      }
    } catch { /* silent */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);

  // Auto-refresh (real-time dashboard)
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [alertsCollapsed, setAlertsCollapsed] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(30); // seconds
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [newOrderCount, setNewOrderCount] = useState(0);
  const [, setFlashCards] = useState(false);

  /* S3: Daily sales goal */
  const [dailyGoal, setDailyGoal] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return Number(localStorage.getItem("daily-sales-goal") ?? 0);
  });

  /* Fullscreen mode */
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  /* Expand All mode — all sections visible together */
  const [expandAll, setExpandAll] = useState(false);
  useEffect(() => {
    if (!expandAll) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExpandAll(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expandAll]);
  const [editingGoal, setEditingGoal] = useState(false);
  
  /* Monthly goals tracking */
  const [monthlyGoals, setMonthlyGoals] = useState<{
    revenue: number;
    orders: number;
    customers: number;
    avgTicket: number;
  }>(() => {
    if (typeof window === "undefined") return { revenue: 0, orders: 0, customers: 0, avgTicket: 0 };
    try {
      const stored = localStorage.getItem("bsm-monthly-goals");
      return stored ? JSON.parse(stored) : { revenue: 0, orders: 0, customers: 0, avgTicket: 0 };
    } catch {
      return { revenue: 0, orders: 0, customers: 0, avgTicket: 0 };
    }
  });
  const [editingMonthlyGoals, setEditingMonthlyGoals] = useState(false);
  const [tempGoals, setTempGoals] = useState(() => monthlyGoals);
  const [showGoalHistory, setShowGoalHistory] = useState(false);
  
  const saveMonthlyGoals = useCallback(() => {
    try {
      localStorage.setItem("bsm-monthly-goals", JSON.stringify(tempGoals));
      setMonthlyGoals(tempGoals);
      setEditingMonthlyGoals(false);
      // Save goals only (achievement history will be calculated when viewing history)
      const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
      const history = JSON.parse(localStorage.getItem("bsm-goals-history") || "{}");
      history[monthKey] = {
        goals: tempGoals,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem("bsm-goals-history", JSON.stringify(history));
    } catch {}
  }, [tempGoals]);
  const knownOrderIdsRef = useRef<Set<string> | null>(null);
  const autoRefreshRef = useRef(autoRefresh);
  autoRefreshRef.current = autoRefresh;

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/admin/dashboard");
      if (res.ok) {
        const data = await res.json();
        const freshOrders: Order[] = data.orders ?? [];
        // Detect new orders vs previous poll
        if (knownOrderIdsRef.current !== null) {
          const newIds = freshOrders.filter(o => !knownOrderIdsRef.current!.has(o.id) && o.status === "pendiente");
          if (newIds.length > 0) {
            setNewOrderCount(prev => prev + newIds.length);
            // Play alert sound only if AudioContext is already running (user has interacted)
            // — avoids "AudioContext was not allowed to start" browser warning in polling loops
            try {
              const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
              if (AudioCtx) {
                const ctx = new AudioCtx();
                if (ctx.state === "running" || (await ctx.resume().then(() => ctx.state === "running").catch(() => false))) {
                  const osc = ctx.createOscillator();
                  osc.type = "sine";
                  osc.frequency.setValueAtTime(880, ctx.currentTime);
                  osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.2);
                  const gain = ctx.createGain();
                  gain.gain.setValueAtTime(0.3, ctx.currentTime);
                  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                  osc.connect(gain);
                  gain.connect(ctx.destination);
                  osc.start();
                  osc.stop(ctx.currentTime + 0.35);
                } else {
                  ctx.close().catch(() => {});
                }
              }
            } catch { /* optional sound — silently skip */ }
          }
        }
        knownOrderIdsRef.current = new Set(freshOrders.map(o => o.id));
        setProducts(data.products ?? []);
        setOrders(freshOrders);
        setSales(data.sales ?? []);
        setCustomers(data.customers ?? []);
        setPurchases(data.purchases ?? []);
        setPayables(data.payables ?? []);
        setSuppliers(data.suppliers ?? []);
        setReviews(data.reviews ?? []);
        // Flash animation on data update
        if (knownOrderIdsRef.current !== null) {
          setFlashCards(true);
          setTimeout(() => setFlashCards(false), 600);
        }
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Error al cargar el dashboard. Revisa tu conexión.");
    }
    setLoading(false);
    setLastUpdated(new Date());
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => {
      if (autoRefreshRef.current) load();
    }, refreshInterval * 1000);
    return () => clearInterval(t);
  }, [autoRefresh, refreshInterval, load]);

  // ── Stats ──────────────────────────────────────────────────────────────

  const st = useMemo(() => {
    const fOrders = orders.filter(o => o.status !== "cancelado" && inPeriod(o.createdAt, period));
    const cancelled = orders.filter(o => o.status === "cancelado" && inPeriod(o.createdAt, period));
    const fSales = sales.filter(s => inPeriod(s.createdAt, period));
    const fPurchases = purchases.filter(p => inPeriod(p.createdAt, period));

    const costMap = new Map(products.map(p => [p.id, p.costPrice ?? p.price * 0.7]));
    const orderRev = fOrders.reduce((a,o) => a+o.total,0);
    const saleRev = fSales.reduce((a,s) => a+s.total,0);
    const ventas = orderRev + saleRev;

    let costo = 0;
    fOrders.forEach(o => o.items.forEach(i => { costo += (costMap.get(i.id) ?? i.price*0.7)*i.quantity; }));
    fSales.forEach(s => s.items.forEach(i => { costo += (costMap.get(i.productId) ?? i.price*0.7)*i.quantity; }));
    const utilidad = ventas - costo;
    const margen = ventas > 0 ? (utilidad/ventas)*100 : 0;
    const tickets = fOrders.length + fSales.length;
    const ticketProm = tickets > 0 ? ventas/tickets : 0;

    // ── Comparación vs periodo anterior ──
    const pfOrders = orders.filter(o => o.status !== "cancelado" && inPrevPeriod(o.createdAt, period));
    const pfSales = sales.filter(s => inPrevPeriod(s.createdAt, period));
    const prevVentas = pfOrders.reduce((a,o) => a+o.total, 0) + pfSales.reduce((a,s) => a+s.total, 0);
    let prevCosto = 0;
    pfOrders.forEach(o => o.items.forEach(i => { prevCosto += (costMap.get(i.id) ?? i.price*0.7)*i.quantity; }));
    pfSales.forEach(s => s.items.forEach(i => { prevCosto += (costMap.get(i.productId) ?? i.price*0.7)*i.quantity; }));
    const prevUtilidad = prevVentas - prevCosto;
    const prevTickets = pfOrders.length + pfSales.length;
    const prevTicketProm = prevTickets > 0 ? prevVentas/prevTickets : 0;
    const prevMargen = prevVentas > 0 ? (prevUtilidad/prevVentas)*100 : 0;
    let prevUds = 0;
    pfOrders.forEach(o => o.items.forEach(i => { prevUds += i.quantity; }));
    pfSales.forEach(s => s.items.forEach(i => { prevUds += i.quantity; }));
    const prevPhones = new Set<string>();
    orders.filter(o => inPrevPeriod(o.createdAt, period)).forEach(o => { if(o.customer.phone) prevPhones.add(o.customer.phone); });
    sales.filter(s => inPrevPeriod(s.createdAt, period)).forEach(s => { if(s.customerPhone) prevPhones.add(s.customerPhone); });
    const prevClientes = prevPhones.size;
    const prevCancelled = orders.filter(o => o.status === "cancelado" && inPrevPeriod(o.createdAt, period)).length;
    const pctDelta = (curr: number, prev: number): number | null => {
      if (period === "todo" || prev === 0) return null;
      return ((curr - prev) / prev) * 100;
    };

    let uds = 0;
    fOrders.forEach(o => o.items.forEach(i => { uds += i.quantity; }));
    fSales.forEach(s => s.items.forEach(i => { uds += i.quantity; }));

    const uniqueClients = new Set<string>();
    fOrders.forEach(o => { if(o.customer.phone) uniqueClients.add(o.customer.phone); });
    fSales.forEach(s => { if(s.customerPhone) uniqueClients.add(s.customerPhone); });

    let newCust = 0, returningCust = 0;
    uniqueClients.forEach(ph => { if(prevPhones.has(ph)) returningCust++; else newCust++; });

    const stockVal = products.reduce((a,p) => a+(p.stock??0)*(p.costPrice??p.price*0.7),0);
    const stockCritico = products.filter(p => p.active && p.stock!==undefined && p.stockMin!==undefined && p.stock<=p.stockMin);
    const agotados = products.filter(p => p.active && (p.stock??0)===0);
    const soldIds = new Set<number>();
    orders.forEach(o => o.items.forEach(i => soldIds.add(i.id)));
    sales.forEach(s => s.items.forEach(i => soldIds.add(i.productId)));
    const sinMov = products.filter(p => p.active && !soldIds.has(p.id));

    // ── Stock projection (last 30 days trend) ──
    const now = new Date();
    const last30Days = new Date(now);
    last30Days.setDate(last30Days.getDate() - 30);
    const recentOrders = orders.filter(o => new Date(o.createdAt) >= last30Days && o.status !== "cancelado");
    const recentSales = sales.filter(s => new Date(s.createdAt) >= last30Days);
    
    const productSalesLast30d = new Map<number, number>();
    recentOrders.forEach(o => o.items.forEach(i => {
      productSalesLast30d.set(i.id, (productSalesLast30d.get(i.id) ?? 0) + i.quantity);
    }));
    recentSales.forEach(s => s.items.forEach(i => {
      productSalesLast30d.set(i.productId, (productSalesLast30d.get(i.productId) ?? 0) + i.quantity);
    }));

    const stockProjections = products
      .filter(p => p.active && p.stock != null && p.stock > 0)
      .map(p => {
        const soldLast30d = productSalesLast30d.get(p.id) ?? 0;
        const dailyRate = soldLast30d / 30;
        const daysRemaining = dailyRate > 0 ? p.stock! / dailyRate : 999;
        const needsReorder = daysRemaining < 14; // Alert if less than 2 weeks
        const criticalReorder = daysRemaining < 7; // Critical if less than 1 week
        const suggestedOrderQty = dailyRate > 0 ? Math.ceil(dailyRate * 30) : (p.stockMin ?? 10); // 30 days worth
        return {
          ...p,
          soldLast30d,
          dailyRate: Math.round(dailyRate * 10) / 10,
          daysRemaining: Math.round(daysRemaining),
          needsReorder,
          criticalReorder,
          suggestedOrderQty,
        };
      })
      .sort((a, b) => a.daysRemaining - b.daysRemaining);

    const criticalStock = stockProjections.filter(p => p.criticalReorder);
    const needsReorderSoon = stockProjections.filter(p => p.needsReorder && !p.criticalReorder);

    const catMap = new Map<string,number>();
    fOrders.forEach(o => o.items.forEach(i => { const c = products.find(p=>p.id===i.id)?.category??"otros"; catMap.set(c,(catMap.get(c)??0)+i.price*i.quantity); }));
    fSales.forEach(s => s.items.forEach(i => { const c = products.find(p=>p.id===i.productId)?.category??"otros"; catMap.set(c,(catMap.get(c)??0)+i.price*i.quantity); }));
    const catSales = [...catMap.entries()].map(([c,t])=>({cat:c,total:t,label:CAT_LABELS[c]??c,color:CAT_COLORS[c]??"#94a3b8"})).sort((a,b)=>b.total-a.total);

    const payMap = new Map<string,number>();
    fOrders.forEach(o => { const m=o.paymentMethod??"efectivo"; payMap.set(m,(payMap.get(m)??0)+o.total); });
    fSales.forEach(s => { payMap.set(s.payment,(payMap.get(s.payment)??0)+s.total); });
    const payments = [...payMap.entries()].map(([m,t])=>({method:m,total:t,label:PAY_LABELS[m]??m,color:PAY_COLORS[m]??"#94a3b8"})).sort((a,b)=>b.total-a.total);
    const payTotal = payments.reduce((a,p)=>a+p.total,0);

    const dailyMap = new Map<string,number>();
    [...fOrders.map(o=>({date:o.createdAt,t:o.total})),...fSales.map(s=>({date:s.createdAt,t:s.total}))].forEach(x => { const k=dateKey(x.date); dailyMap.set(k,(dailyMap.get(k)??0)+x.t); });
    const daily = [...dailyMap.entries()].sort((a,b)=>a[0].localeCompare(b[0])).slice(-14);
    const maxDaily = Math.max(...daily.map(([,v])=>v),1);

    const dailyProfitMap = new Map<string,number>();
    fOrders.forEach(o => { const k = dateKey(o.createdAt); let c = 0; o.items.forEach(i => { c += (costMap.get(i.id) ?? i.price*0.7)*i.quantity; }); dailyProfitMap.set(k, (dailyProfitMap.get(k)??0) + o.total - c); });
    fSales.forEach(s => { const k = dateKey(s.createdAt); let c = 0; s.items.forEach(i => { c += (costMap.get(i.productId) ?? i.price*0.7)*i.quantity; }); dailyProfitMap.set(k, (dailyProfitMap.get(k)??0) + s.total - c); });
    const dailyProfit = daily.map(([dk]) => dailyProfitMap.get(dk) ?? 0);

    // ── Sparkline data (last 7 days for KPI cards) ──────────────────
    const getLast7Days = () => {
      const result: string[] = [];
      const today = new Date();
      for (let i = 6; i >= 0; i--) {
        const dateObj = new Date(today);
        dateObj.setDate(dateObj.getDate() - i);
        result.push(dateKey(dateObj.toISOString()));
      }
      return result;
    };
    const last7Days = getLast7Days();
    
    // Calculate daily metrics for sparklines
    const dailyOrderCountMap = new Map<string,number>();
    const dailyTicketAvgMap = new Map<string,{total:number;count:number}>();
    
    orders.filter(o => o.status !== "cancelado").forEach(o => {
      const k = dateKey(o.createdAt);
      dailyOrderCountMap.set(k, (dailyOrderCountMap.get(k) ?? 0) + 1);
      const e = dailyTicketAvgMap.get(k) ?? {total:0,count:0};
      e.total += o.total; e.count++; dailyTicketAvgMap.set(k, e);
    });
    sales.forEach(s => {
      const k = dateKey(s.createdAt);
      dailyOrderCountMap.set(k, (dailyOrderCountMap.get(k) ?? 0) + 1);
      const e = dailyTicketAvgMap.get(k) ?? {total:0,count:0};
      e.total += s.total; e.count++; dailyTicketAvgMap.set(k, e);
    });
    
    const sparklineRevenue = last7Days.map(dk => dailyMap.get(dk) ?? 0);
    const sparklineOrders = last7Days.map(dk => dailyOrderCountMap.get(dk) ?? 0);
    const sparklineAvgTicket = last7Days.map(dk => {
      const e = dailyTicketAvgMap.get(dk);
      return e && e.count > 0 ? e.total / e.count : 0;
    });
    const sparklineProfit = last7Days.map(dk => dailyProfitMap.get(dk) ?? 0);

    // ── Trend line (linear regression) + 7-day forecast ──────────────
    const n = daily.length;
    let trendSlope = 0, trendIntercept = 0;
    const forecast7: { day: string; value: number }[] = [];
    if (n >= 2) {
      const xs = daily.map((_, i) => i);
      const ys = daily.map(([, v]) => v);
      const xMean = xs.reduce((a, b) => a + b, 0) / n;
      const yMean = ys.reduce((a, b) => a + b, 0) / n;
      const ssXY = xs.reduce((a, x, i) => a + (x - xMean) * (ys[i] - yMean), 0);
      const ssXX = xs.reduce((a, x) => a + (x - xMean) ** 2, 0);
      trendSlope = ssXX !== 0 ? ssXY / ssXX : 0;
      trendIntercept = yMean - trendSlope * xMean;
      // Forecast next 7 days
      const lastDateStr = daily[n - 1][0];
      const lastDate = new Date(lastDateStr + "T12:00:00");
      for (let f = 1; f <= 7; f++) {
        const fd = new Date(lastDate);
        fd.setDate(fd.getDate() + f);
        const val = Math.max(0, trendIntercept + trendSlope * (n - 1 + f));
        forecast7.push({ day: fd.toLocaleDateString("es-PE", { day: "2-digit", month: "short" }), value: Math.round(val * 100) / 100 });
      }
    }
    // Week-over-week growth
    const weekTotal = daily.slice(-7).reduce((a, [, v]) => a + v, 0);
    const prevWeekTotal = daily.slice(-14, -7).reduce((a, [, v]) => a + v, 0);
    const wowGrowth = prevWeekTotal > 0 ? ((weekTotal - prevWeekTotal) / prevWeekTotal) * 100 : null;
    // 7-day moving average
    const movingAvg7 = daily.map(([, ], i) => {
      const start = Math.max(0, i - 6);
      const window = daily.slice(start, i + 1).map(([, v]) => v);
      return window.reduce((a, b) => a + b, 0) / window.length;
    });

    const hourMap = new Map<string,number>();
    [...fOrders,...fSales.map(s=>({...s,createdAt:s.createdAt}))].forEach(t => { const dt=new Date(t.createdAt); hourMap.set(`${dt.getDay()}-${dt.getHours()}`,(hourMap.get(`${dt.getDay()}-${dt.getHours()}`)??0)+1); });
    const maxHeat = Math.max(...hourMap.values(),1);

    const allPeriodOrders = orders.filter(o => inPeriod(o.createdAt, period));
    const funnelData = [
      { label: "Recibidos",   count: allPeriodOrders.length, color: "#2d6a4f" },
      { label: "Confirmados", count: allPeriodOrders.filter(o => ["confirmado","en_camino","entregado"].includes(o.status)).length, color: "#3b82f6" },
      { label: "En camino",  count: allPeriodOrders.filter(o => ["en_camino","entregado"].includes(o.status)).length, color: "#06b6d4" },
      { label: "Entregados", count: allPeriodOrders.filter(o => o.status === "entregado").length, color: "#10b981" },
    ];

    // ── Conversion Funnel (simulated data based on completed orders) ──
    const completedOrders = fOrders.length + fSales.length;
    const conversionFunnelData = [
      { label: "Visitas al sitio", count: Math.round(completedOrders * 5), pct: 100, color: "#3b82f6" },
      { label: "Productos vistos", count: Math.round(completedOrders * 3), pct: 60, color: "#06b6d4" },
      { label: "Carrito agregado", count: Math.round(completedOrders * 1.5), pct: 30, color: "#8b5cf6" },
      { label: "Checkout iniciado", count: Math.round(completedOrders * 1.2), pct: 24, color: "#f59e0b" },
      { label: "Pedido completado", count: completedOrders, pct: 20, color: "#10b981" },
    ];
    const overallConversionRate = conversionFunnelData[0].count > 0 
      ? (conversionFunnelData[4].count / conversionFunnelData[0].count) * 100 
      : 0;
    const basketAbandonmentRate = conversionFunnelData[2].count > 0
      ? ((conversionFunnelData[2].count - conversionFunnelData[3].count) / conversionFunnelData[2].count) * 100
      : 0;
    const checkoutCompletionRate = conversionFunnelData[3].count > 0
      ? (conversionFunnelData[4].count / conversionFunnelData[3].count) * 100
      : 0;

    const prodMap = new Map<number,{name:string;units:number;revenue:number;profit:number}>();
    fOrders.forEach(o => o.items.forEach(i => { const e=prodMap.get(i.id)??{name:i.name,units:0,revenue:0,profit:0}; const c=costMap.get(i.id)??i.price*0.7; e.units+=i.quantity;e.revenue+=i.price*i.quantity;e.profit+=(i.price-c)*i.quantity;prodMap.set(i.id,e); }));
    fSales.forEach(s => s.items.forEach(i => { const e=prodMap.get(i.productId)??{name:i.name,units:0,revenue:0,profit:0}; const c=costMap.get(i.productId)??i.price*0.7; e.units+=i.quantity;e.revenue+=i.price*i.quantity;e.profit+=(i.price-c)*i.quantity;prodMap.set(i.productId,e); }));
    const topRev = [...prodMap.entries()].map(([id,x])=>({id,...x})).sort((a,b)=>b.revenue-a.revenue).slice(0,10);
    const topProfit = [...prodMap.entries()].map(([id,x])=>({id,...x})).sort((a,b)=>b.profit-a.profit).slice(0,10);
    const topUnits = [...prodMap.entries()].map(([id,x])=>({id,...x})).sort((a,b)=>b.units-a.units).slice(0,10);

    // ── Pareto ABC Analysis (80/20 rule) ──
    const paretoData = [...prodMap.entries()].map(([id,x])=>({id,...x})).sort((a,b)=>b.revenue-a.revenue);
    const totalRevenue = paretoData.reduce((a,p)=>a+p.revenue,0);
    let cumulative = 0;
    const paretoWithCumulative = paretoData.map(p => {
      cumulative += p.revenue;
      const cumulativePct = totalRevenue > 0 ? (cumulative / totalRevenue) * 100 : 0;
      let abcClass: "A" | "B" | "C" = "C";
      if (cumulativePct <= 80) abcClass = "A";
      else if (cumulativePct <= 95) abcClass = "B";
      return { ...p, cumulativePct, abcClass, revenuePct: totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0 };
    });
    const paretoChartData = paretoWithCumulative.slice(0, 20); // Top 20 for visual clarity
    const classA = paretoWithCumulative.filter(p => p.abcClass === "A");
    const classB = paretoWithCumulative.filter(p => p.abcClass === "B");
    const classC = paretoWithCumulative.filter(p => p.abcClass === "C");

    const recent = [...orders].sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()).slice(0,200);

    const supMap = new Map<string,number>();
    fPurchases.forEach(p => { supMap.set(p.supplierName,(supMap.get(p.supplierName)??0)+p.total); });
    const supPurchases = [...supMap.entries()].map(([n,t])=>({name:n,total:t})).sort((a,b)=>b.total-a.total);
    const totalPurch = fPurchases.reduce((a,p)=>a+p.total,0);

    const pending = payables.filter(p=>p.status!=="pagado");
    const debt = pending.reduce((a,p)=>a+(p.amount-p.paidAmount),0);
    const overdue = pending.filter(p=>new Date(p.dueDate)<new Date());

    // ── Simple alert badges (kept for backward compat) ──
    const alerts: {type:"danger"|"warning"|"info";msg:string}[] = [];
    if(agotados.length>0) alerts.push({type:"danger",msg:`${agotados.length} producto${agotados.length>1?"s":""} agotado${agotados.length>1?"s":""}`});
    if(stockCritico.length>0) alerts.push({type:"warning",msg:`${stockCritico.length} producto${stockCritico.length>1?"s":""} con stock crítico`});
    if(overdue.length>0) alerts.push({type:"danger",msg:`${overdue.length} cuenta${overdue.length>1?"s":""} por pagar vencida${overdue.length>1?"s":""}`});
    if(cancelled.length>0) alerts.push({type:"warning",msg:`${cancelled.length} cancelado${cancelled.length>1?"s":""} en el periodo`});
    if(sinMov.length>5) alerts.push({type:"info",msg:`${sinMov.length} productos sin movimiento`});
    if(margen<20&&ventas>0) alerts.push({type:"warning",msg:`Margen bajo: ${margen.toFixed(1)}%`});

    // ── Smart Insights ──
    type SmartInsight = { priority: number; icon: LucideIcon; title: string; desc: string; type: "danger"|"warning"|"success"|"info" };
    const insights: SmartInsight[] = [];

    // 1. Pending orders aging
    const pendingOrders = orders.filter(o => o.status === "pendiente");
    const oldPending = pendingOrders.filter(o => (now.getTime() - new Date(o.createdAt).getTime()) > 2 * 60 * 60 * 1000);
    if (oldPending.length > 0) {
      const oldest = Math.max(...oldPending.map(o => now.getTime() - new Date(o.createdAt).getTime()));
      const hrs = Math.floor(oldest / 3600000);
      insights.push({ priority: 100, icon: Clock, title: `${oldPending.length} pedido${oldPending.length>1?"s":""} esperando`, desc: `Hay pedidos pendientes desde hace más de ${hrs}h. Confírmalos o contacta al cliente.`, type: "danger" });
    } else if (pendingOrders.length > 0) {
      insights.push({ priority: 30, icon: Clock, title: `${pendingOrders.length} pedido${pendingOrders.length>1?"s":""} pendiente${pendingOrders.length>1?"s":""}`, desc: "Todos recientes. Revísalos cuando puedas.", type: "warning" });
    }

    // 2. Best-seller stock prediction
    if (topRev.length > 0) {
      const bestId = topRev[0].id;
      const bestProd = products.find(p => p.id === bestId);
      if (bestProd && bestProd.stock !== undefined) {
        const dailySold = topRev[0].units / Math.max(daily.length, 1);
        const daysLeft = dailySold > 0 ? Math.floor(bestProd.stock / dailySold) : 999;
        if (daysLeft <= 3 && daysLeft >= 0) {
          insights.push({ priority: 90, icon: Zap, title: `"${bestProd.name}" se agota pronto`, desc: `Tu más vendido tiene ${bestProd.stock} uds — al ritmo actual, se acaba en ~${daysLeft} día${daysLeft!==1?"s":""}. ¡Reabastece!`, type: "danger" });
        } else if (daysLeft <= 7) {
          insights.push({ priority: 60, icon: Zap, title: `Stock de "${bestProd.name}": ${bestProd.stock} uds`, desc: `Tu más vendido dura ~${daysLeft} días más. Planifica tu reposición.`, type: "warning" });
        }
      }
    }

    // 3. Best sales day pattern
    if (daily.length >= 7) {
      const dayTotals = new Map<number,{sum:number;count:number}>();
      [...orders.filter(o=>o.status!=="cancelado"),...sales.map(s=>({...s,createdAt:s.createdAt,total:s.total}))].forEach(t => {
        const day = new Date(t.createdAt).getDay();
        const e = dayTotals.get(day) ?? {sum:0,count:0};
        e.sum += t.total; e.count++; dayTotals.set(day, e);
      });
      if (dayTotals.size >= 3) {
        let bestDay = 0, bestAvg = 0;
        dayTotals.forEach((v, k) => { const avg = v.sum / Math.max(v.count, 1); if (avg > bestAvg) { bestAvg = avg; bestDay = k; } });
        insights.push({ priority: 20, icon: CalendarDays, title: `Los ${DAYS[bestDay]} son tu mejor día`, desc: `Vendes en promedio ${fmt(bestAvg)} los ${DAYS[bestDay]}. Asegúrate de tener stock y personal listo.`, type: "info" });
      }
    }

    // 4. Overdue payables — more detail
    if (overdue.length > 0) {
      const totalOverdue = overdue.reduce((a,p) => a + (p.amount - p.paidAmount), 0);
      const oldestDue = overdue.reduce((a,p) => { const d2 = new Date(p.dueDate); return d2 < a ? d2 : a; }, new Date());
      const daysOver = Math.floor((now.getTime() - oldestDue.getTime()) / 86400000);
      insights.push({ priority: 85, icon: AlertTriangle, title: `${fmt(totalOverdue)} en deuda vencida`, desc: `${overdue.length} cuenta${overdue.length>1?"s":""} vencida${overdue.length>1?"s":""}, la más antigua desde hace ${daysOver} días. Negocia con tu proveedor.`, type: "danger" });
    }

    // 5. Margin warning with context
    if (margen < 15 && ventas > 0) {
      const lowMarginProds = [...prodMap.entries()].filter(([,x]) => x.revenue > 0 && (x.profit / x.revenue) < 0.10).map(([id,x]) => ({ ...x, id })).sort((a,b) => a.profit/a.revenue - b.profit/b.revenue);
      const worst = lowMarginProds[0];
      insights.push({ priority: 70, icon: TrendingDown, title: `Margen preocupante: ${margen.toFixed(1)}%`, desc: worst ? `"${worst.name}" tiene el margen más bajo (${((worst.profit/worst.revenue)*100).toFixed(0)}%). Revisa tus costos o ajusta precios.` : "Revisa tus costos de compra y precios de venta.", type: "warning" });
    } else if (margen >= 25 && ventas > 0) {
      insights.push({ priority: 5, icon: TrendingUp, title: `Margen saludable: ${margen.toFixed(1)}%`, desc: "Tu negocio mantiene buen rendimiento. ¡Sigue así!", type: "success" });
    }

    // 6. Out of stock — specific names
    if (agotados.length > 0) {
      const names = agotados.slice(0, 3).map(p => p.name).join(", ");
      insights.push({ priority: 95, icon: PackageX, title: `${agotados.length} producto${agotados.length>1?"s":""} agotado${agotados.length>1?"s":""}`, desc: agotados.length <= 3 ? `${names}. Pierde ventas cada hora que faltan.` : `${names} y ${agotados.length-3} más. Pierde ventas cada hora que faltan.`, type: "danger" });
    }

    // 7. Cancellation rate
    if (cancelled.length > 0 && tickets + cancelled.length > 0) {
      const rate = (cancelled.length / (tickets + cancelled.length)) * 100;
      if (rate > 15) {
        insights.push({ priority: 65, icon: AlertCircle, title: `${rate.toFixed(0)}% de cancelaciones`, desc: `${cancelled.length} pedido${cancelled.length>1?"s":""} cancelado${cancelled.length>1?"s":""}. Si supera 10%, revisa tiempos de entrega y comunicación.`, type: "warning" });
      }
    }

    // 8. New customers
    const recentCustomers = customers.filter(c => { try { return (now.getTime() - new Date(c.createdAt).getTime()) < 7 * 86400000; } catch { return false; } });
    if (recentCustomers.length > 0) {
      insights.push({ priority: 15, icon: UserCheck, title: `${recentCustomers.length} cliente${recentCustomers.length>1?"s":""} nuevo${recentCustomers.length>1?"s":""}`, desc: `Ganaste ${recentCustomers.length} cliente${recentCustomers.length>1?"s":""} esta semana. Dale seguimiento para fidelizarlos.`, type: "success" });
    }

    // 9. No sales today
    const todaySales = [...orders.filter(o=>o.status!=="cancelado"),...sales].filter(t => new Date(t.createdAt).toDateString() === now.toDateString());
    if (todaySales.length === 0 && now.getHours() >= 10) {
      insights.push({ priority: 50, icon: Lightbulb, title: "Sin ventas hoy", desc: "¿Día lento? Considera publicar una promoción o contactar clientes frecuentes.", type: "warning" });
    }

    // Sort by priority descending
    insights.sort((a, b) => b.priority - a.priority);

    const avgRating = reviews.length>0?reviews.reduce((a,r)=>a+r.rating,0)/reviews.length:0;
    
    // OrderStats calculations
    const pendingOrdersCount = fOrders.filter(o => o.status === "pendiente").length;
    const completedOrdersCount = fOrders.filter(o => o.status === "entregado").length + fSales.length;
    const conversionRate = tickets > 0 ? (completedOrdersCount / tickets) * 100 : 0;

    // ── Sprint 3 Feature 1: At-risk customers (churn detection) ──
    const clientHistory = new Map<string,{name:string;totalSpent:number;orderCount:number;lastOrderDate:string}>();
    orders.filter(o => o.status !== "cancelado").forEach(o => {
      if (!o.customer.phone) return;
      const e = clientHistory.get(o.customer.phone) ?? { name: o.customer.name, totalSpent: 0, orderCount: 0, lastOrderDate: o.createdAt };
      e.totalSpent += o.total; e.orderCount++;
      if (new Date(o.createdAt) > new Date(e.lastOrderDate)) e.lastOrderDate = o.createdAt;
      clientHistory.set(o.customer.phone, e);
    });
    sales.forEach(s => {
      if (!s.customerPhone) return;
      const e = clientHistory.get(s.customerPhone) ?? { name: s.customerPhone, totalSpent: 0, orderCount: 0, lastOrderDate: s.createdAt };
      e.totalSpent += s.total; e.orderCount++;
      if (new Date(s.createdAt) > new Date(e.lastOrderDate)) e.lastOrderDate = s.createdAt;
      clientHistory.set(s.customerPhone, e);
    });
    const allClients = [...clientHistory.entries()].map(([phone, x]) => ({
      phone, ...x,
      daysSinceLastOrder: Math.floor((now.getTime() - new Date(x.lastOrderDate).getTime()) / 86400000),
    }));
    const sortedBySpend = [...allClients].sort((a, b) => b.totalSpent - a.totalSpent);
    const vipThreshold = Math.ceil(sortedBySpend.length * 0.2); // Top 20%
    const vipClients = sortedBySpend.slice(0, Math.max(vipThreshold, 1));
    const atRiskClients = vipClients
      .filter(c => c.daysSinceLastOrder >= 21) // 3+ weeks no purchase
      .sort((a, b) => b.daysSinceLastOrder - a.daysSinceLastOrder);
    const decliningClients = allClients.filter(c => {
      if (c.orderCount < 3) return false;
      // Check if recent activity is declining
      const recentOrders60d = orders.filter(o => o.customer.phone === c.phone && o.status !== "cancelado" && (now.getTime() - new Date(o.createdAt).getTime()) < 60 * 86400000);
      const recentOrders30d = recentOrders60d.filter(o => (now.getTime() - new Date(o.createdAt).getTime()) < 30 * 86400000);
      const prev30d = recentOrders60d.length - recentOrders30d.length;
      return prev30d > 0 && recentOrders30d.length < prev30d * 0.5; // 50%+ drop
    });

    // ── Sprint 3 Feature 2: Product affinity (co-purchase analysis) ──
    const coMap = new Map<string,{a:string;b:string;count:number}>();
    const orderBaskets = [...orders.filter(o => o.status !== "cancelado").map(o => o.items.map(i => ({ id: i.id, name: i.name }))), ...sales.map(s => s.items.map(i => ({ id: i.productId, name: i.name })))];
    orderBaskets.forEach(basket => {
      const unique = [...new Map(basket.map(i => [i.id, i])).values()]; // dedupe
      for (let i = 0; i < unique.length; i++) {
        for (let j = i + 1; j < unique.length; j++) {
          const key = [unique[i].id, unique[j].id].sort((a, b) => a - b).join("-");
          const e = coMap.get(key) ?? { a: unique[i].name, b: unique[j].name, count: 0 };
          e.count++; coMap.set(key, e);
        }
      }
    });
    const productAffinities = [...coMap.values()]
      .filter(x => x.count >= 3) // at least 3 co-purchases
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // ── Sprint 3 Feature 3: Morning Briefing ──
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();
    const yesterdayOrders = orders.filter(o => new Date(o.createdAt).toDateString() === yesterdayStr && o.status !== "cancelado");
    const yesterdaySales = sales.filter(s => new Date(s.createdAt).toDateString() === yesterdayStr);
    const yesterdayRevenue = yesterdayOrders.reduce((a, o) => a + o.total, 0) + yesterdaySales.reduce((a, s) => a + s.total, 0);
    const yesterdayTickets = yesterdayOrders.length + yesterdaySales.length;
    const todayStr = now.toDateString();
    const todayOrders = orders.filter(o => new Date(o.createdAt).toDateString() === todayStr && o.status !== "cancelado");
    const todaySalesFiltered = sales.filter(s => new Date(s.createdAt).toDateString() === todayStr);
    const todayRevenue = todayOrders.reduce((a, o) => a + o.total, 0) + todaySalesFiltered.reduce((a, s) => a + s.total, 0);
    const briefingPriorities: string[] = [];
    if (pendingOrdersCount > 0) briefingPriorities.push(`📋 ${pendingOrdersCount} pedido${pendingOrdersCount > 1 ? "s" : ""} pendiente${pendingOrdersCount > 1 ? "s" : ""}`);
    if (criticalStock.length > 0) briefingPriorities.push(`🚨 ${criticalStock.length} producto${criticalStock.length > 1 ? "s" : ""} con stock crítico`);
    if (overdue.length > 0) briefingPriorities.push(`💰 ${overdue.length} pago${overdue.length > 1 ? "s" : ""} vencido${overdue.length > 1 ? "s" : ""}`);
    if (atRiskClients.length > 0) briefingPriorities.push(`⚠️ ${atRiskClients.length} VIP${atRiskClients.length > 1 ? "s" : ""} en riesgo de pérdida`);
    if (agotados.length > 0) briefingPriorities.push(`🔴 ${agotados.length} producto${agotados.length > 1 ? "s" : ""} agotado${agotados.length > 1 ? "s" : ""}`);

    // ── Sprint 3 Feature 5: Cash flow forecast (7 days) ──
    const dailyRevMap = new Map<string,number>();
    const dailyExpMap = new Map<string,number>();
    [...orders.filter(o => o.status !== "cancelado"), ...sales.map(s => ({ ...s, total: s.total, createdAt: s.createdAt }))].forEach(t => {
      const k = dateKey(t.createdAt); dailyRevMap.set(k, (dailyRevMap.get(k) ?? 0) + t.total);
    });
    purchases.forEach(p => { const k = dateKey(p.createdAt); dailyExpMap.set(k, (dailyExpMap.get(k) ?? 0) + p.total); });
    // Last 30 days averages by day-of-week
    const dayOfWeekRev = new Map<number,{sum:number;days:number}>();
    const dayOfWeekExp = new Map<number,{sum:number;days:number}>();
    for (let i = 0; i < 30; i++) {
      const d2 = new Date(now); d2.setDate(d2.getDate() - i);
      const k = dateKey(d2.toISOString()); const dow = d2.getDay();
      const re = dayOfWeekRev.get(dow) ?? { sum: 0, days: 0 };
      re.sum += dailyRevMap.get(k) ?? 0; re.days++; dayOfWeekRev.set(dow, re);
      const ex = dayOfWeekExp.get(dow) ?? { sum: 0, days: 0 };
      ex.sum += dailyExpMap.get(k) ?? 0; ex.days++; dayOfWeekExp.set(dow, ex);
    }
    const cashFlowForecast: { day: string; dayLabel: string; estRevenue: number; estExpense: number; net: number }[] = [];
    for (let i = 1; i <= 7; i++) {
      const fd = new Date(now); fd.setDate(fd.getDate() + i);
      const dow = fd.getDay();
      const avgRev = dayOfWeekRev.has(dow) ? dayOfWeekRev.get(dow)!.sum / Math.max(dayOfWeekRev.get(dow)!.days, 1) : 0;
      const avgExp = dayOfWeekExp.has(dow) ? dayOfWeekExp.get(dow)!.sum / Math.max(dayOfWeekExp.get(dow)!.days, 1) : 0;
      const net = avgRev - avgExp;
      cashFlowForecast.push({
        day: fd.toISOString(),
        dayLabel: fd.toLocaleDateString("es-PE", { weekday: "short", day: "2-digit", month: "short" }),
        estRevenue: Math.round(avgRev * 100) / 100,
        estExpense: Math.round(avgExp * 100) / 100,
        net: Math.round(net * 100) / 100,
      });
    }
    const forecastTotalRev = cashFlowForecast.reduce((a, d2) => a + d2.estRevenue, 0);
    const forecastTotalExp = cashFlowForecast.reduce((a, d2) => a + d2.estExpense, 0);

    // ── FASE 6.1: Cohort Retention Analysis ──
    const cohortData: { cohortMonth: string; month0: number; month1: number; month2: number; month3: number; month4: number; month5plus: number }[] = [];
    const customerCohorts = new Map<string, string>(); // phone → cohort month (YYYY-MM)
    customers.forEach(c => {
      const firstPurchase = [...orders, ...sales]
        .filter((t: Order | Sale) => 
          ('customer' in t && t.customer.phone === c.phone) || 
          ('customerPhone' in t && t.customerPhone === c.phone)
        )
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
      if (firstPurchase) {
        const cohortMonth = new Date(firstPurchase.createdAt).toISOString().slice(0, 7);
        customerCohorts.set(c.phone, cohortMonth);
      }
    });
    const uniqueCohorts = [...new Set(customerCohorts.values())].sort().slice(-6); // last 6 months
    uniqueCohorts.forEach(cohort => {
      const cohortCustomers = [...customerCohorts.entries()].filter(([, c]) => c === cohort).map(([phone]) => phone);
      if (cohortCustomers.length === 0) return;
      const cohortDate = new Date(cohort + "-01");
      const retention: number[] = [cohortCustomers.length];
      for (let m = 1; m <= 5; m++) {
        const monthStart = new Date(cohortDate);
        monthStart.setMonth(monthStart.getMonth() + m);
        const monthEnd = new Date(monthStart);
        monthEnd.setMonth(monthEnd.getMonth() + 1);
        const retained = cohortCustomers.filter(phone => 
          [...orders, ...sales].some((t: Order | Sale) => {
            const match = ('customer' in t && t.customer.phone === phone) || ('customerPhone' in t && t.customerPhone === phone);
            const inMonth = new Date(t.createdAt) >= monthStart && new Date(t.createdAt) < monthEnd;
            return match && inMonth;
          })
        ).length;
        retention.push(retained);
      }
      cohortData.push({
        cohortMonth: new Date(cohort).toLocaleDateString("es-PE", { month: "short", year: "numeric" }),
        month0: 100,
        month1: retention[0] > 0 ? Math.round((retention[1] / retention[0]) * 100) : 0,
        month2: retention[0] > 0 ? Math.round((retention[2] / retention[0]) * 100) : 0,
        month3: retention[0] > 0 ? Math.round((retention[3] / retention[0]) * 100) : 0,
        month4: retention[0] > 0 ? Math.round((retention[4] / retention[0]) * 100) : 0,
        month5plus: retention[0] > 0 ? Math.round((retention[5] / retention[0]) * 100) : 0,
      });
    });
    // Retention metrics
    const allPurchaseDates = new Map<string, Date[]>();
    [...orders, ...sales].forEach((t: Order | Sale) => {
      const phone = 'customer' in t ? t.customer.phone : t.customerPhone;
      if (!phone) return;
      if (!allPurchaseDates.has(phone)) allPurchaseDates.set(phone, []);
      allPurchaseDates.get(phone)!.push(new Date(t.createdAt));
    });
    let day1Retained = 0, day7Retained = 0, day30Retained = 0;
    allPurchaseDates.forEach(dates => {
      if (dates.length < 2) return;
      dates.sort((a, b) => a.getTime() - b.getTime());
      const daysDiff = (dates[1].getTime() - dates[0].getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff <= 1) day1Retained++;
      if (daysDiff <= 7) day7Retained++;
      if (daysDiff <= 30) day30Retained++;
    });
    const totalCustomersWithPurchase = allPurchaseDates.size;
    const retentionMetrics = {
      day1: totalCustomersWithPurchase > 0 ? Math.round((day1Retained / totalCustomersWithPurchase) * 100) : 0,
      day7: totalCustomersWithPurchase > 0 ? Math.round((day7Retained / totalCustomersWithPurchase) * 100) : 0,
      day30: totalCustomersWithPurchase > 0 ? Math.round((day30Retained / totalCustomersWithPurchase) * 100) : 0,
    };

    // ── FASE 6.3: Cross-Sell Recommendations ──
    const productAssociations = new Map<number, Map<number, number>>(); // productId → Map(otherProductId → count)
    [...orders, ...sales].forEach((t: Order | Sale) => {
      const items = 'items' in t ? t.items.map(i => 'productId' in i ? i.productId : i.id) : [];
      items.forEach((id1, idx) => {
        if (!productAssociations.has(id1)) productAssociations.set(id1, new Map());
        items.forEach((id2, idx2) => {
          if (idx !== idx2 && id1 !== id2) {
            const assoc = productAssociations.get(id1)!;
            assoc.set(id2, (assoc.get(id2) || 0) + 1);
          }
        });
      });
    });
    const crossSellRecommendations = new Map<number, Array<{ productId: number; confidence: number }>>();
    productAssociations.forEach((associations, productId) => {
      const total = [...associations.values()].reduce((a, b) => a + b, 0);
      const sorted = [...associations.entries()]
        .map(([otherId, count]) => ({ productId: otherId, confidence: Math.round((count / total) * 100) }))
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 5);
      if (sorted.length > 0) crossSellRecommendations.set(productId, sorted);
    });

    return {
      ventas,costo,utilidad,margen,tickets,ticketProm,uds,clientesAtendidos:uniqueClients.size,
      cancelados:cancelled.length,stockVal,stockCritico,agotados,sinMov,
      catSales,payments,payTotal,daily,maxDaily,hourMap,maxHeat,
      topRev,topProfit,topUnits,recent,supPurchases,totalPurch,
      debt,overdue,pending,alerts,insights,avgRating,
      totalCustomers:customers.length,totalSuppliers:suppliers.length,
      activeProducts:products.filter(p=>p.active).length,
      dVentas:pctDelta(ventas,prevVentas),dUtilidad:pctDelta(utilidad,prevUtilidad),
      dTickets:pctDelta(tickets,prevTickets),dTicketProm:pctDelta(ticketProm,prevTicketProm),
      dMargen:pctDelta(margen,prevMargen),dUds:pctDelta(uds,prevUds),dClientes:pctDelta(uniqueClients.size,prevClientes),
      dCancelados:pctDelta(cancelled.length,prevCancelled),
      pendingOrdersCount,completedOrdersCount,conversionRate,
      dailyProfit,funnelData,newCust,returningCust,
      trendSlope,trendIntercept,forecast7,wowGrowth,movingAvg7,
      conversionFunnelData,overallConversionRate,basketAbandonmentRate,checkoutCompletionRate,
      paretoChartData,classA,classB,classC,
      stockProjections,criticalStock,needsReorderSoon,
      atRiskClients,decliningClients,
      productAffinities,
      yesterdayRevenue,yesterdayTickets,todayRevenue,briefingPriorities,
      cashFlowForecast,forecastTotalRev,forecastTotalExp,
      sparklineRevenue,sparklineOrders,sparklineAvgTicket,sparklineProfit,
      cohortData,retentionMetrics,crossSellRecommendations,
    };
  }, [products,orders,sales,customers,purchases,payables,suppliers,reviews,period]);

  const [showExport, setShowExport] = useState(false);

  const handleExport = useCallback(async (type: string) => {
    setShowExport(false);
    const today = new Date().toISOString().slice(0,10);
    if (type === "ventas") {
      const rows = [
        ...orders.filter(o => inPeriod(o.createdAt, period) && o.status !== "cancelado").map(o => ({
          tipo: "Pedido", id: o.id, fecha: o.createdAt.slice(0,10), hora: o.createdAt.slice(11,16),
          cliente: o.customer.name, telefono: o.customer.phone ?? "",
          items: o.items.map(i => `${i.name} x${i.quantity}`).join("; "),
          total: o.total, pago: o.paymentMethod ?? "efectivo", estado: o.status,
        })),
        ...sales.filter(s => inPeriod(s.createdAt, period)).map(s => ({
          tipo: "POS", id: s.id, fecha: s.createdAt.slice(0,10), hora: s.createdAt.slice(11,16),
          cliente: s.customerPhone ?? "Mostrador", telefono: s.customerPhone ?? "",
          items: s.items.map(i => `${i.name} x${i.quantity}`).join("; "),
          total: s.total, pago: s.payment, estado: "completado",
        })),
      ];
      exportToCSV(rows, `ventas_${today}.csv`);
    } else if (type === "productos") {
      exportToCSV(products.map(p => ({
        id: p.id, nombre: p.name, categoria: p.category, precio: p.price,
        costo: p.costPrice ?? "", stock: p.stock ?? "", stockMin: p.stockMin ?? "",
        unidad: p.unit, activo: p.active ? "Sí" : "No",
      })), `productos_${today}.csv`);
    } else if (type === "clientes") {
      exportToCSV(customers.map(c => ({
        telefono: c.phone, nombre: c.name, ubicacion: c.location,
        registrado: c.createdAt.slice(0,10),
      })), `clientes_${today}.csv`);
    } else if (type === "pedidos") {
      // Server-side paginated CSV export
      const params = new URLSearchParams();
      if (period === "hoy") {
        params.set("from", new Date(new Date().setHours(0,0,0,0)).toISOString());
      } else if (period === "semana") {
        const d = new Date(); d.setDate(d.getDate() - 7);
        params.set("from", d.toISOString());
      } else if (period === "mes") {
        const d = new Date(); d.setDate(1); d.setHours(0,0,0,0);
        params.set("from", d.toISOString());
      }
      window.open(`/api/orders/csv?${params.toString()}`, "_blank");
    } else if (type === "pdf") {
      // Dynamic import to keep bundle lean
      const { default: jsPDF } = await import("jspdf");
      const autoTableModule = await import("jspdf-autotable");
      const autoTable = autoTableModule.default ?? autoTableModule;
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const titulo = `Reporte ${period === "hoy" ? "Hoy" : period === "semana" ? "Últimos 7 días" : period === "mes" ? "Este mes" : "Todo"}`;
      const generado = new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      let y = 15;

      // Header
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("Bodega San Martin", 14, y);
      y += 6;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      doc.text(`${titulo} — generado el ${generado}`, 14, y);
      doc.setTextColor(0);
      y += 8;

      // KPI grid (3 cols)
      const kpis = [
        ["Ventas", fmt(st.ventas)], ["Utilidad", fmt(st.utilidad)], ["Margen", st.margen.toFixed(1) + "%"],
        ["Tickets", String(st.tickets)], ["Ticket prom.", fmt(st.ticketProm)], ["Unidades", String(st.uds)],
        ["Clientes", String(st.clientesAtendidos)], ["Nuevos", String(st.newCust)], ["Recurrentes", String(st.returningCust)],
      ];
      const colW = 60;
      kpis.forEach(([label, value], i) => {
        const cx = 14 + (i % 3) * colW;
        const cy = y + Math.floor(i / 3) * 14;
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.text(value, cx + colW / 2, cy + 5, { align: "center" });
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(120);
        doc.text(label.toUpperCase(), cx + colW / 2, cy + 10, { align: "center" });
        doc.setTextColor(0);
      });
      y += Math.ceil(kpis.length / 3) * 14 + 4;

      const addSection = (title: string) => {
        if (y > 265) { doc.addPage(); y = 15; }
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(6, 95, 70);
        doc.text(title, 14, y);
        doc.setDrawColor(16, 185, 129);
        doc.line(14, y + 1.5, 196, y + 1.5);
        doc.setTextColor(0);
        y += 6;
      };

      // Daily sales
      if (st.daily.length > 0) {
        addSection("Ventas diarias");
        autoTable(doc, {
          startY: y,
          head: [["Dia", "Ventas", "Utilidad"]],
          body: st.daily.map(([dk, v], i) => [dayLabel(dk), fmt(v), fmt(st.dailyProfit[i] ?? 0)]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [16, 185, 129], textColor: 255 },
          margin: { left: 14 },
        });
        y = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y + 10;
        y += 4;
      }

      // Categories
      addSection("Ventas por categoria");
      autoTable(doc, {
        startY: y,
        head: [["Categoria", "Total", "%"]],
        body: st.catSales.map(c => {
          const pct = st.ventas > 0 ? ((c.total / st.ventas) * 100).toFixed(1) : "0";
          return [c.label, fmt(c.total), pct + "%"];
        }),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [16, 185, 129], textColor: 255 },
        margin: { left: 14 },
      });
      y = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y + 10;
      y += 4;

      // Payment methods
      addSection("Metodos de pago");
      autoTable(doc, {
        startY: y,
        head: [["Metodo", "Total", "%"]],
        body: st.payments.map(p => {
          const pct = st.payTotal > 0 ? ((p.total / st.payTotal) * 100).toFixed(1) : "0";
          return [p.label, fmt(p.total), pct + "%"];
        }),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [16, 185, 129], textColor: 255 },
        margin: { left: 14 },
      });
      y = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y + 10;
      y += 4;

      // Top 10 products
      if (st.topRev.length > 0) {
        addSection("Top 10 productos");
        autoTable(doc, {
          startY: y,
          head: [["#", "Producto", "Uds", "Ingreso", "Utilidad"]],
          body: st.topRev.slice(0, 10).map((p, i) => [
            String(i + 1), p.name, String(p.units), fmt(p.revenue), fmt(p.profit),
          ]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [16, 185, 129], textColor: 255 },
          margin: { left: 14 },
        });
        y = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y + 10;
        y += 4;
      }

      // Order funnel
      addSection("Embudo de pedidos");
      autoTable(doc, {
        startY: y,
        head: [["Estado", "Cantidad"]],
        body: st.funnelData.map(f => [f.label, String(f.count)]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [16, 185, 129], textColor: 255 },
        margin: { left: 14 },
      });
      y = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y + 10;
      y += 4;

      // Critical stock
      if (st.stockCritico.length > 0) {
        addSection(`Stock critico (${st.stockCritico.length})`);
        autoTable(doc, {
          startY: y,
          head: [["Producto", "Stock", "Min", "Dif"]],
          body: st.stockCritico.slice(0, 15).map(p => [
            p.name, String(p.stock ?? 0), String(p.stockMin ?? 0), String((p.stock ?? 0) - (p.stockMin ?? 0)),
          ]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [220, 38, 38], textColor: 255 },
          margin: { left: 14 },
        });
        y = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y + 10;
        y += 4;
      }

      // Out of stock
      if (st.agotados.length > 0) {
        if (y > 270) { doc.addPage(); y = 15; }
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(220, 38, 38);
        doc.text(`Productos agotados: ${st.agotados.map(p => p.name).join(", ")}`, 14, y, { maxWidth: 180 });
        doc.setTextColor(0);
        y += 6;
      }

      // Recent transactions
      addSection("Ultimas transacciones");
      autoTable(doc, {
        startY: y,
        head: [["ID", "Cliente", "Total", "Estado", "Fecha"]],
        body: st.recent.map(o => [
          o.id.slice(-6), o.customer?.name ?? "POS", fmt(o.total), o.status, fmtDate(o.createdAt),
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [16, 185, 129], textColor: 255 },
        margin: { left: 14 },
      });
      y = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y + 10;
      y += 6;

      // Summary line
      if (y > 275) { doc.addPage(); y = 15; }
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(
        `Valoracion inventario: ${fmt(st.stockVal)} · ${st.activeProducts} productos activos · ${st.totalCustomers} clientes · ${st.totalSuppliers} proveedores`,
        14, y, { maxWidth: 180 },
      );
      y += 5;
      if (st.overdue.length > 0) {
        doc.setTextColor(220, 38, 38);
        doc.text(`Cuentas vencidas: ${st.overdue.length} (${fmt(st.debt)} pendiente)`, 14, y);
        y += 5;
      }

      // Footer
      doc.setTextColor(160);
      doc.setFontSize(7);
      doc.text(
        `Reporte generado automaticamente · Bodega San Martin · ${new Date().toLocaleTimeString("es-PE")}`,
        105, 290, { align: "center" },
      );

      doc.save(`reporte_${today}.pdf`);
    }
  }, [orders, sales, products, customers, period, st]);

  const [topTab, setTopTab] = useState<"revenue"|"profit"|"units">("revenue");
  const [recentFilter, setRecentFilter] = useState<"all"|"pendiente"|"en_camino"|"entregado">("all");
  const [recentPage, setRecentPage] = useState(1);
  const [dashSearch, setDashSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedClientPhone, setSelectedClientPhone] = useState<string|null>(null);
  /* V3: Review filter */
  const [reviewFilter, setReviewFilter] = useState<number>(0);

  /* FASE 6: Cohort Retention */
  const [showCohortRetention, setShowCohortRetention] = useState(false);

  /* FASE 6: A/B Tests */
  interface ABTest {
    id: string; name: string; hypothesis: string;
    variants: { id: string; name: string; visitors: number; conversions: number; revenue: number }[];
    metric: "revenue"|"conversion"|"aov"|"retention";
    startDate: string; endDate: string; status: "running"|"completed"|"paused";
    winner?: string;
  }
  const [abTests, setAbTests] = useState<ABTest[]>(() => {
    try { return JSON.parse(localStorage.getItem("bsm-ab-tests") || "[]"); } catch { return []; }
  });
  const [showABTestModal, setShowABTestModal] = useState(false);
  const [abTestForm, setAbTestForm] = useState<{ name: string; hypothesis: string; variantA: string; variantB: string; metric: "revenue"|"conversion"|"aov"|"retention"; startDate: string; endDate: string }>({ name: "", hypothesis: "", variantA: "Control", variantB: "Variant B", metric: "conversion", startDate: "", endDate: "" });

  /* FASE 6: Cross-Sell Recommendations */
  const [showCrossSell, setShowCrossSell] = useState(false);
  const [selectedProductForCrossSell, setSelectedProductForCrossSell] = useState<number | null>(null);

  /* Z2: Daily summary banner — show once per day */
  const [dailySummaryDismissed, setDailySummaryDismissed] = useState(() => {
    try { return localStorage.getItem("bsm-daily-summary") === new Date().toDateString(); } catch { return false; }
  });
  const dismissDailySummary = () => {
    setDailySummaryDismissed(true);
    try { localStorage.setItem("bsm-daily-summary", new Date().toDateString()); } catch {}
  };
  const topList = topTab==="revenue"?st.topRev:topTab==="profit"?st.topProfit:st.topUnits;
  const topMax = topList.length>0?Math.max(...topList.map(p=>topTab==="units"?p.units:topTab==="profit"?p.profit:p.revenue)):1;

  // C2 — Quick order status changes
  const [quickStatusMap, setQuickStatusMap] = useState<Record<string, Order["status"]>>({});
  const [changingStatusId, setChangingStatusId] = useState<string | null>(null);
  const handleQuickStatus = useCallback(async (orderId: string, newStatus: Order["status"]) => {
    setChangingStatusId(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setQuickStatusMap(prev => ({ ...prev, [orderId]: newStatus }));
        setFetchError(null);
        /* S2: Auto WA notification on status change */
        const order = orders.find(o => o.id === orderId);
        if (order?.customer.phone) {
          const STATUS_MSG: Record<string, string> = {
            confirmado: "✅ Tu pedido ha sido confirmado y lo estamos preparando.",
            en_camino: "🚚 Tu pedido va en camino. ¡Prepárate para recibirlo!",
            entregado: "🎉 Tu pedido fue entregado. ¡Gracias por tu compra!",
          };
          const msg = STATUS_MSG[newStatus];
          if (msg) {
            const text = `Hola ${order.customer.name}, te informamos de tu pedido #${orderId.slice(-6).toUpperCase()} en Bodega San Martín:\n\n${msg}`;
            window.open(`https://wa.me/51${order.customer.phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
          }
        }
      }
    } finally {
      setChangingStatusId(null);
    }
  }, [orders]);

  /* Status/note operation error toast (auto-dismiss) */
  const [opError, setOpError] = useState<string | null>(null);
  useEffect(() => {
    if (!opError) return;
    const t = setTimeout(() => setOpError(null), 5000);
    return () => clearTimeout(t);
  }, [opError]);

  /* S1: Print ticket comanda */
  const printTicket = useCallback((o: Order) => {
    const w = window.open("", "_blank", "width=360,height=600");
    if (!w) return;
    const itemsHtml = o.items.map(i => `<tr><td style="padding:2px 0">${i.quantity}× ${i.name}</td><td style="text-align:right">S/${(i.price * i.quantity).toFixed(2)}</td></tr>`).join("");
    w.document.write(`<!DOCTYPE html><html><head><title>Comanda #${o.id.slice(-6)}</title>
<style>*{margin:0;padding:0;font-family:monospace;font-size:13px}body{padding:12px;max-width:300px}h2{text-align:center;font-size:15px;margin-bottom:4px}hr{border:0;border-top:1px dashed #999;margin:6px 0}table{width:100%;border-collapse:collapse}td{padding:2px 0}.total{font-size:15px;font-weight:bold;text-align:right}.footer{text-align:center;font-size:10px;color:#888;margin-top:8px}@media print{body{padding:0}}</style></head>
<body><h2>Bodega San Martín</h2><p style="text-align:center;font-size:10px">Comanda #${o.id.slice(-6).toUpperCase()}</p><hr>
<p><b>Cliente:</b> ${o.customer.name}</p>${o.customer.phone ? `<p><b>Tel:</b> ${o.customer.phone}</p>` : ""}
${o.customer.location ? `<p><b>Dir:</b> ${o.customer.location}</p>` : ""}
<p><b>Fecha:</b> ${new Date(o.createdAt).toLocaleString("es-PE")}</p>
<p><b>Pago:</b> ${o.paymentMethod === "yape" ? "Yape" : "Efectivo"}</p><hr>
<table>${itemsHtml}</table><hr><p class="total">TOTAL: S/${(o.total ?? 0).toFixed(2)}</p>
${o.notes ? `<hr><p style="font-size:11px">📝 ${o.notes}</p>` : ""}
<p class="footer">¡Gracias por tu compra!</p></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }, []);

  // C3 — Export sales CSV
  const exportVentas = useCallback(() => {
    const orderRows = orders
      .filter(o => inPeriod(o.createdAt, period))
      .map(o => ({
        Tipo: "Delivery",
        Fecha: fmtDateFull(o.createdAt),
        ID: o.id.slice(-8),
        Cliente: o.customer.name,
        Teléfono: o.customer.phone ?? "",
        "Total S/": o.total.toFixed(2),
        Pago: o.paymentMethod ?? "",
        Estado: o.status,
      }));
    const saleRows = sales
      .filter(s => inPeriod(s.createdAt, period))
      .map(s => ({
        Tipo: "POS",
        Fecha: fmtDateFull(s.createdAt),
        ID: s.id.slice(-8),
        Cliente: "POS",
        Teléfono: s.customerPhone ?? "",
        "Total S/": s.total.toFixed(2),
        Pago: s.payment,
        Estado: "entregado",
      }));
    exportToCSV([...orderRows, ...saleRows], `ventas_${period}_${new Date().toISOString().slice(0, 10)}`);
  }, [orders, sales, period]);

  /* U2: Admin notes per order */
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const adminNoteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const saveAdminNote = useCallback((orderId: string, note: string) => {
    setAdminNotes(prev => ({ ...prev, [orderId]: note }));
    clearTimeout(adminNoteTimers.current[orderId]);
    adminNoteTimers.current[orderId] = setTimeout(async () => {
      try {
        await fetch(`/api/orders/${orderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adminNote: note }),
        });
      } catch { setOpError("Error al guardar la nota. Intenta de nuevo."); }
    }, 800);
  }, []);

  /* U3: Bulk status update */
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);

  /* Y3: Expanded history per order */
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());
  const toggleHistory = (id: string) => setExpandedHistory(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleOrderSelection = useCallback((id: string) => {
    setSelectedOrders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const handleBulkStatus = useCallback(async (newStatus: Order["status"]) => {
    if (selectedOrders.size === 0) return;
    setBulkUpdating(true);
    const ids = [...selectedOrders];
    await Promise.allSettled(ids.map(id =>
      fetch(`/api/orders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }) })
    ));
    setQuickStatusMap(prev => {
      const next = { ...prev };
      ids.forEach(id => { next[id] = newStatus; });
      return next;
    });
    setSelectedOrders(new Set());
    setBulkUpdating(false);
  }, [selectedOrders]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="h-5 w-32 bg-gray-200 dark:bg-surface rounded-lg" />
            <div className="h-3 w-44 bg-gray-200 dark:bg-surface rounded" />
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="h-8 w-48 bg-gray-200 dark:bg-surface rounded-lg" />
            <div className="h-8 w-24 bg-gray-200 dark:bg-surface rounded-lg" />
          </div>
        </div>
        {/* KPI cards skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 space-y-2">
              <div className="h-3 w-16 bg-gray-200 dark:bg-surface rounded" />
              <div className="h-7 w-24 bg-gray-200 dark:bg-surface rounded" />
              <div className="h-3 w-20 bg-gray-200 dark:bg-surface rounded" />
            </div>
          ))}
        </div>
        {/* Orders list skeleton */}
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-3 sm:p-5 space-y-3">
          <div className="h-4 w-28 bg-gray-200 dark:bg-surface rounded" />
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex flex-wrap items-center gap-2 sm:gap-4">
              <div className="h-10 w-10 bg-gray-200 dark:bg-surface rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 bg-gray-200 dark:bg-surface rounded w-1/2" />
                <div className="h-3 bg-gray-200 dark:bg-surface rounded w-1/3" />
              </div>
              <div className="h-6 w-20 bg-gray-200 dark:bg-surface rounded-full" />
              <div className="h-8 w-8 bg-gray-200 dark:bg-surface rounded-lg shrink-0" />
            </div>
          ))}
        </div>
        {/* Chart skeleton */}
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-3 sm:p-5">
          <div className="h-4 w-36 bg-gray-200 dark:bg-surface rounded mb-4" />
          <div className="flex flex-wrap items-end gap-2 h-32">
            {[40, 70, 55, 85, 60, 90, 75].map((h, i) => (
              <div key={i} className="flex-1 bg-gray-200 dark:bg-surface rounded-t" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex flex-col",
      fullscreen && "fixed inset-0 z-60 bg-white dark:bg-background overflow-hidden p-4 sm:p-6",
      (!fullscreen && expandAll) && "fixed inset-0 z-50 bg-white dark:bg-background overflow-y-auto p-4 sm:p-6"
    )}>
      {/* ── Fetch Error Banner ── */}
      {fetchError && (
        <div className="flex flex-wrap items-center gap-3 p-3 mb-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300 flex-1">{fetchError}</p>
          <button onClick={() => { setFetchError(null); void load(); }} className="px-3 py-1 text-xs font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 transition-colors">
            Reintentar
          </button>
          <button onClick={() => setFetchError(null)} className="p-1 text-red-400 hover:text-red-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Operation Error Toast ── */}
      {opError && (
        <div className="flex flex-wrap items-center gap-2 p-2.5 mb-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 animate-[fadeUp_0.2s_ease-out]">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-300 flex-1">{opError}</p>
          <button onClick={() => setOpError(null)} className="p-0.5 text-amber-400 hover:text-amber-600">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between pb-3">
        <div>
          <h2 className={cn("font-bold text-gray-900 dark:text-foreground", fullscreen ? "text-lg" : "text-sm")}>Dashboard</h2>
          <p className={cn("text-gray-400 dark:text-muted", fullscreen ? "text-sm" : "text-xs")}>Bodega San Martín</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className={cn("flex items-center bg-gray-100 dark:bg-accent rounded-lg p-0.5")}>
            {(["hoy","semana","mes","todo"] as Period[]).map(p => (
              <button key={p} onClick={()=>setPeriod(p)}
                className={cn("px-2.5 py-1 rounded-md font-semibold transition-all",
                  fullscreen ? "text-sm" : "text-xs",
                  period===p?"text-gray-900 dark:text-foreground shadow-sm":"text-gray-400 dark:text-muted hover:text-gray-600"
                )}
                style={period===p?{background:"var(--color-card, white)"}:undefined}>
                {p==="hoy"?"Hoy":p==="semana"?"7d":p==="mes"?"Mes":"Todo"}
              </button>
            ))}
          </div>
          {/* Fullscreen toggle */}
          <button
            onClick={() => setFullscreen(v => !v)}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-primary hover:bg-primary/90 px-2.5 py-1.5 rounded-lg transition-colors shadow-sm"
            title={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          >
            {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{fullscreen ? "Reducir" : "Expandir"}</span>
          </button>
          {/* Ver todo — muestra todos los gráficos juntos */}
          {!fullscreen && (
            <button
              onClick={() => setExpandAll(v => !v)}
              className={cn(
                "flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors",
                expandAll
                  ? "text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm"
                  : "text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50"
              )}
              title={expandAll ? "Colapsar — volver a vista por sección (Esc)" : "Ver todos los gráficos en una vista"}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{expandAll ? "Colapsar" : "Ver todo"}</span>
            </button>
          )}
          <div className="relative">
            <button onClick={()=>setShowExport(v=>!v)} className="p-1.5 rounded-lg text-gray-300 dark:text-muted hover:text-gray-500 hover:bg-gray-50 dark:hover:bg-accent transition-colors" title="Exportar CSV">
              <Download className="h-3.5 w-3.5" />
            </button>
            {showExport && (
              <div className="absolute right-0 top-full mt-1 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-lg shadow-lg py-1 z-50 min-w-40">
                {[
                  { key:"ventas", label:"📊 Ventas CSV" },
                  { key:"pedidos", label:"📋 Pedidos CSV" },
                  { key:"productos", label:"📦 Inventario CSV" },
                  { key:"clientes", label:"👤 Clientes CSV" },
                  { key:"pdf", label:"📄 Reporte PDF" },
                ].map(opt => (
                  <button key={opt.key} onClick={()=>handleExport(opt.key)}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={load} className="p-1.5 rounded-lg text-gray-300 dark:text-muted hover:text-gray-500 hover:bg-gray-50 dark:hover:bg-accent transition-colors" title="Actualizar">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
          {/* N2 — WA daily summary */}
          <a
            href={(() => {
              const lines = [
                `📊 *Resumen ${period === "hoy" ? "del día" : period === "semana" ? "semanal" : period === "mes" ? "del mes" : "general"}*`,
                `💰 Ventas: ${fmt(st.ventas)}`,
                `📈 Utilidad: ${fmt(st.utilidad)} (${st.margen.toFixed(1)}%)`,
                `🎫 Tickets: ${st.tickets} (prom ${fmt(st.ticketProm)})`,
                `👤 Clientes: ${st.clientesAtendidos}`,
                "",
                st.topRev.length > 0 ? `🏆 Top: ${st.topRev.slice(0,3).map(p => p.name).join(", ")}` : "",
                st.stockCritico.length > 0 ? `⚠️ Stock bajo: ${st.stockCritico.slice(0,3).map(p => p.name).join(", ")}` : "",
                st.agotados.length > 0 ? `🚫 Agotados: ${st.agotados.map(p => p.name).join(", ")}` : "",
              ].filter(Boolean);
              return `https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`;
            })()}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-lg text-gray-300 dark:text-muted hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
            title="Enviar resumen por WhatsApp"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          </a>
          {/* Auto-refresh toggle */}
          <div className="flex items-center gap-1.5 ml-1 border-l border-gray-200 dark:border-card-border pl-2">
            <button
              onClick={() => setAutoRefresh(v => !v)}
              className={cn(
                "px-2 py-1 rounded-md text-[10px] font-bold uppercase transition-colors",
                autoRefresh ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-gray-100 text-gray-400 dark:bg-surface dark:text-muted"
              )}
            >
              {autoRefresh ? "⚡ En vivo" : "Auto"}
            </button>
            {newOrderCount > 0 && autoRefresh && (
              <button
                onClick={() => { setNewOrderCount(0); setSection("resumen"); }}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold animate-pulse"
              >
                🛎️ +{newOrderCount} nuevo{newOrderCount > 1 ? "s" : ""}
              </button>
            )}
            {autoRefresh && (
              <select
                value={refreshInterval}
                onChange={e => setRefreshInterval(Number(e.target.value))}
                className="text-[10px] bg-transparent border-0 outline-none text-muted cursor-pointer"
              >
                <option value={15}>15s</option>
                <option value={30}>30s</option>
                <option value={60}>1m</option>
              </select>
            )}
            {lastUpdated && (
              <span className="text-[10px] text-muted hidden sm:inline" title={`Actualizado: ${lastUpdated.toLocaleTimeString("es-PE")}`}>
                {(() => {
                  const mins = Math.floor((Date.now() - lastUpdated.getTime()) / 60000);
                  if (mins === 0) return "Ahora";
                  if (mins === 1) return "Hace 1 min";
                  if (mins < 60) return `Hace ${mins} min`;
                  const hrs = Math.floor(mins / 60);
                  return `Hace ${hrs}h`;
                })()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Auto-refresh countdown bar */}
      {autoRefresh && lastUpdated && (
        <div className="h-0.5 w-full bg-gray-100 dark:bg-accent mb-3 rounded-full overflow-hidden">
          <div 
            className="h-full bg-linear-to-r from-emerald-400 to-emerald-500 rounded-full"
            style={{
              animation: `countdown ${refreshInterval}s linear infinite`,
              animationPlayState: loading ? 'paused' : 'running'
            }}
          />
        </div>
      )}

      {/* ── Fullscreen Command Center ── */}
      {fullscreen && (
        <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
          {/* KPI Strip — wraps on smaller screens: 2 cols → 4 → 7 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5 lg:gap-2 shrink-0">
            {([
              { label: "Ventas Netas", value: fmt(st.ventas), accent: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30", delta: st.dVentas },
              { label: "Utilidad", value: fmt(st.utilidad), accent: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/30", delta: st.dUtilidad },
              { label: "Margen", value: `${st.margen.toFixed(1)}%`, accent: st.margen >= 25 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400", bg: "bg-gray-50 dark:bg-surface", delta: st.dMargen },
              { label: "Tickets", value: String(st.tickets), accent: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950/30", delta: st.dTickets },
              { label: "Clientes", value: String(st.clientesAtendidos), accent: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-950/30", delta: st.dClientes },
              { label: "Stock Alerta", value: String(st.stockCritico.length + st.agotados.length), accent: (st.stockCritico.length + st.agotados.length) > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400", bg: "bg-gray-50 dark:bg-surface" },
              { label: "Balance Caja", value: fmt(st.ventas - st.totalPurch), accent: (st.ventas - st.totalPurch) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400", bg: "bg-gray-50 dark:bg-surface" },
            ] as { label: string; value: string; accent: string; bg: string; delta?: number | null }[]).map(k => (
              <div key={k.label} className={cn("rounded-xl px-3 py-2.5", k.bg)}>
                <div className="text-[10px] text-gray-500 dark:text-muted font-medium truncate">{k.label}</div>
                <div className={cn("text-sm font-extrabold tabular-nums leading-tight mt-0.5 truncate", k.accent)}>{k.value}</div>
                {k.delta != null && k.delta !== undefined ? (
                  <div className={cn("text-[10px] font-bold mt-0.5", k.delta >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400")}>
                    {k.delta >= 0 ? "↑" : "↓"} {Math.abs(k.delta).toFixed(1)}%
                  </div>
                ) : k.delta === null ? (
                  <div className="text-[10px] text-gray-400 dark:text-muted mt-0.5">— Sin datos</div>
                ) : null}
              </div>
            ))}
          </div>
          {/* Responsive Column Grid: 1→2→3 cols, whole grid scrolls on smaller screens */}
          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 overflow-y-auto">
            {/* ── Col 1: Ventas + Caja ── */}
            <div className="flex flex-col gap-3 overflow-y-auto min-h-0" style={{scrollbarWidth:"thin" as React.CSSProperties["scrollbarWidth"]}}>
              <div className="bg-white dark:bg-card border border-gray-100 dark:border-card-border rounded-xl p-3 shrink-0">
                <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-gray-100 dark:border-card-border">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-xs font-bold text-gray-700 dark:text-foreground uppercase tracking-wide">Ventas</span>
                </div>
                {st.daily.length > 0 && (
                  <div className="relative h-20 mb-2">
                    <svg viewBox={`0 0 ${Math.max(st.daily.length, 1) * 36} 80`} className="w-full h-full" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="fsAreaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2d6a4f" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="#2d6a4f" stopOpacity="0.02" />
                        </linearGradient>
                      </defs>
                      <path d={st.daily.map(([,v],i) => { const x=i*36+18; const y=70-((v/st.maxDaily)*60); return i===0?`M${x},${y}`:`L${x},${y}`; }).join(' ') + ` L${(st.daily.length-1)*36+18},70 L18,70 Z`} fill="url(#fsAreaGrad)" />
                      <polyline points={st.daily.map(([,v],i) => `${i*36+18},${70-((v/st.maxDaily)*60)}`).join(' ')} fill="none" stroke="#2d6a4f" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                    </svg>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { label: "Ventas Netas", value: fmt(st.ventas), accent: "text-emerald-600 dark:text-emerald-400" },
                    { label: "Ticket Prom.", value: fmt(st.ticketProm), accent: "text-blue-600 dark:text-blue-400" },
                    { label: "Uds. Vendidas", value: String(st.uds), accent: "text-violet-600 dark:text-violet-400" },
                    { label: "Cancelados", value: String(st.cancelados), accent: "text-red-500 dark:text-red-400" },
                  ].map(k => (
                    <div key={k.label} className="bg-gray-50 dark:bg-surface rounded-lg px-2.5 py-2">
                      <div className="text-[10px] text-gray-400 dark:text-muted">{k.label}</div>
                      <div className={cn("text-sm font-bold tabular-nums truncate", k.accent)}>{k.value}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white dark:bg-card border border-gray-100 dark:border-card-border rounded-xl p-3 shrink-0">
                <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-gray-100 dark:border-card-border">
                  <Banknote className="h-3.5 w-3.5 text-indigo-500" />
                  <span className="text-xs font-bold text-gray-700 dark:text-foreground uppercase tracking-wide">Caja</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                  {[
                    { label: "Ingresos", value: fmt(st.ventas), accent: "text-emerald-600 dark:text-emerald-400" },
                    { label: "Egresos", value: fmt(st.totalPurch), accent: "text-red-500 dark:text-red-400" },
                    { label: "Utilidad Bruta", value: fmt(st.utilidad), accent: "text-blue-600 dark:text-blue-400" },
                    { label: "Margen", value: `${st.margen.toFixed(1)}%`, accent: st.margen >= 25 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400" },
                  ].map(k => (
                    <div key={k.label} className="bg-gray-50 dark:bg-surface rounded-lg px-2.5 py-2">
                      <div className="text-[10px] text-gray-400 dark:text-muted">{k.label}</div>
                      <div className={cn("text-sm font-bold tabular-nums truncate", k.accent)}>{k.value}</div>
                    </div>
                  ))}
                </div>
                {st.payments.length > 0 && (
                  <div className="space-y-1.5">
                    {st.payments.slice(0, 5).map(p => (
                      <div key={p.method} className="flex flex-wrap items-center gap-2">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{background: p.color}} />
                        <span className="text-[11px] text-gray-500 dark:text-muted flex-1 truncate">{p.label}</span>
                        <span className="text-xs font-semibold text-gray-800 dark:text-foreground">{fmt(p.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {/* ── Col 2: Productos + Inventario ── */}
            <div className="flex flex-col gap-3 overflow-y-auto min-h-0" style={{scrollbarWidth:"thin" as React.CSSProperties["scrollbarWidth"]}}>
              <div className="bg-white dark:bg-card border border-gray-100 dark:border-card-border rounded-xl p-3 shrink-0">
                <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-gray-100 dark:border-card-border">
                  <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
                  <span className="text-xs font-bold text-gray-700 dark:text-foreground uppercase tracking-wide">Productos (Top ingresos)</span>
                </div>
                {st.topRev.length === 0 ? (
                  <p className="text-xs text-gray-300 dark:text-muted py-2 text-center">Sin ventas registradas</p>
                ) : (() => {
                  const maxRev = st.topRev[0]?.revenue ?? 1;
                  return (
                    <div className="space-y-2">
                      {st.topRev.slice(0, 6).map((p, i) => (
                        <div key={p.id} className="flex flex-wrap items-center gap-2">
                          <span className={cn("w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0", i < 3 ? "bg-gray-900 dark:bg-foreground text-white dark:text-background" : "bg-gray-100 dark:bg-accent text-gray-400")}>{i+1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between mb-0.5">
                              <span className="text-xs text-gray-600 dark:text-gray-300 truncate">{p.name}</span>
                              <span className="text-xs font-semibold text-gray-800 dark:text-foreground ml-1 shrink-0">{fmt(p.revenue)}</span>
                            </div>
                            <div className="h-1 bg-gray-100 dark:bg-accent rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{width:`${(p.revenue/maxRev)*100}%`,background:i<3?"#111827":"#d1d5db"}} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {st.catSales.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-gray-100 dark:border-card-border grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {st.catSales.slice(0, 4).map(c => (
                      <div key={c.cat} className="flex items-center gap-1.5 min-w-0">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{background: c.color}} />
                        <span className="text-[10px] text-gray-500 dark:text-muted truncate flex-1">{c.label}</span>
                        <span className="text-[10px] font-semibold text-gray-700 dark:text-foreground shrink-0">{fmt(c.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="bg-white dark:bg-card border border-gray-100 dark:border-card-border rounded-xl p-3 shrink-0">
                <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-gray-100 dark:border-card-border">
                  <Package className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-xs font-bold text-gray-700 dark:text-foreground uppercase tracking-wide">Inventario</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2.5">
                  <div className="bg-gray-50 dark:bg-surface rounded-lg px-2.5 py-2">
                    <div className="text-[10px] text-gray-400 dark:text-muted">Valor stock</div>
                    <div className="text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums truncate">{fmt(st.stockVal)}</div>
                  </div>
                  <div className="bg-gray-50 dark:bg-surface rounded-lg px-2.5 py-2">
                    <div className="text-[10px] text-gray-400 dark:text-muted">Sin stock</div>
                    <div className={cn("text-sm font-bold tabular-nums", st.agotados.length > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>{st.agotados.length}</div>
                  </div>
                </div>
                {st.stockCritico.length === 0 && st.agotados.length === 0 ? (
                  <div className="text-xs text-emerald-500 text-center py-1 font-medium">✓ Inventario saludable</div>
                ) : (
                  <div className="space-y-1">
                    {st.agotados.slice(0, 2).map(p => (
                      <div key={p.id} className="flex items-center justify-between py-1.5 px-2 bg-red-50 dark:bg-red-950/30 rounded-lg">
                        <span className="text-xs text-gray-700 dark:text-foreground truncate flex-1">{p.name}</span>
                        <span className="text-[10px] font-bold text-red-600 dark:text-red-400 ml-2 shrink-0">Agotado</span>
                      </div>
                    ))}
                    {st.stockCritico.filter(p => (p.stock ?? 0) > 0).slice(0, 4).map(p => (
                      <div key={p.id} className="flex items-center justify-between py-1.5 px-2 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                        <span className="text-xs text-gray-700 dark:text-foreground truncate flex-1">{p.name}</span>
                        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 ml-2 shrink-0">{p.stock}/{p.stockMin}</span>
                      </div>
                    ))}
                    {(st.stockCritico.length + st.agotados.length) > 6 && (
                      <p className="text-[10px] text-gray-400 text-center">+{st.stockCritico.length + st.agotados.length - 6} más con alerta</p>
                    )}
                  </div>
                )}
              </div>
            </div>
            {/* ── Col 3: Clientes + Compras ── */}
            <div className="flex flex-col gap-3 overflow-y-auto min-h-0" style={{scrollbarWidth:"thin" as React.CSSProperties["scrollbarWidth"]}}>
              <div className="bg-white dark:bg-card border border-gray-100 dark:border-card-border rounded-xl p-3 shrink-0">
                <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-gray-100 dark:border-card-border">
                  <Users className="h-3.5 w-3.5 text-violet-500" />
                  <span className="text-xs font-bold text-gray-700 dark:text-foreground uppercase tracking-wide">Clientes</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2.5">
                  <div className="bg-gray-50 dark:bg-surface rounded-lg px-2.5 py-2">
                    <div className="text-[10px] text-gray-400 dark:text-muted">Atendidos</div>
                    <div className="text-sm font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">{st.clientesAtendidos}</div>
                  </div>
                  <div className="bg-gray-50 dark:bg-surface rounded-lg px-2.5 py-2">
                    <div className="text-[10px] text-gray-400 dark:text-muted">Nuevos</div>
                    <div className="text-sm font-bold text-violet-600 dark:text-violet-400 tabular-nums">{st.newCust}</div>
                  </div>
                </div>
                {(() => {
                  const cSpend = new Map<string,{name:string;total:number}>();
                  orders.filter(o=>o.status!=="cancelado"&&inPeriod(o.createdAt,period)).forEach(o => {
                    if(!o.customer.phone) return;
                    const e = cSpend.get(o.customer.phone)??{name:o.customer.name,total:0};
                    e.total+=o.total; cSpend.set(o.customer.phone,e);
                  });
                  const top = [...cSpend.values()].sort((a,b)=>b.total-a.total).slice(0,5);
                  const mx = top[0]?.total??1;
                  if(top.length===0) return <p className="text-xs text-gray-300 dark:text-muted text-center py-2">Sin clientes registrados</p>;
                  return (
                    <div className="space-y-1.5">
                      {top.map((c,i) => (
                        <div key={c.name+i} className="flex flex-wrap items-center gap-2">
                          <span className={cn("w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0", i < 3 ? "bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300" : "bg-gray-100 dark:bg-accent text-gray-400")}>{i+1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between mb-0.5">
                              <span className="text-xs text-gray-600 dark:text-gray-300 truncate">{c.name}</span>
                              <span className="text-xs font-semibold text-gray-800 dark:text-foreground ml-1 shrink-0">{fmt(c.total)}</span>
                            </div>
                            <div className="h-1 bg-gray-100 dark:bg-accent rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-violet-500" style={{width:`${(c.total/mx)*100}%`}} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
              <div className="bg-white dark:bg-card border border-gray-100 dark:border-card-border rounded-xl p-3 shrink-0">
                <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-gray-100 dark:border-card-border">
                  <Truck className="h-3.5 w-3.5 text-blue-500" />
                  <span className="text-xs font-bold text-gray-700 dark:text-foreground uppercase tracking-wide">Compras</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2.5">
                  <div className="bg-gray-50 dark:bg-surface rounded-lg px-2.5 py-2">
                    <div className="text-[10px] text-gray-400 dark:text-muted">Total compras</div>
                    <div className="text-sm font-bold text-blue-600 dark:text-blue-400 tabular-nums truncate">{fmt(st.totalPurch)}</div>
                  </div>
                  <div className="bg-gray-50 dark:bg-surface rounded-lg px-2.5 py-2">
                    <div className="text-[10px] text-gray-400 dark:text-muted">Deuda pend.</div>
                    <div className={cn("text-sm font-bold tabular-nums truncate", st.debt > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>{fmt(st.debt)}</div>
                  </div>
                </div>
                {st.supPurchases.length > 0 && (
                  <div className="space-y-1.5">
                    {st.supPurchases.slice(0, 4).map(s => {
                      const mx = st.supPurchases[0]?.total ?? 1;
                      return (
                        <div key={s.name} className="flex flex-wrap items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between mb-0.5">
                              <span className="text-xs text-gray-600 dark:text-gray-300 truncate">{s.name}</span>
                              <span className="text-xs font-semibold text-gray-800 dark:text-foreground ml-1 shrink-0">{fmt(s.total)}</span>
                            </div>
                            <div className="h-1 bg-gray-100 dark:bg-accent rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-indigo-500" style={{width:`${(s.total/mx)*100}%`}} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {st.overdue.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-100 dark:border-card-border">
                    <p className="text-[10px] font-bold text-red-600 dark:text-red-400 mb-1">
                      ⚠️ {st.overdue.length} cuenta{st.overdue.length !== 1 ? "s" : ""} vencida{st.overdue.length !== 1 ? "s" : ""}
                    </p>
                    {st.overdue.slice(0, 2).map(p => (
                      <div key={p.id} className="flex items-center justify-between py-1 text-xs">
                        <span className="text-gray-600 dark:text-gray-400 truncate">{p.supplierName}</span>
                        <span className="font-semibold text-red-600 dark:text-red-400 shrink-0 ml-2">{fmt(p.amount - p.paidAmount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {!fullscreen && (<>
      {/* ── Expand All banner ── */}
      {expandAll && (
        <div className="flex items-center justify-between mb-5 px-2 sm:px-4 py-2 sm:py-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800/50">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
              <LayoutDashboard className="h-3.5 w-3.5 text-white" />
            </div>
            <div>
              <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300">Vista expandida</span>
              <p className="text-xs text-indigo-500 dark:text-indigo-400">Todos los gráficos y secciones — desplázate para ver cada una</p>
            </div>
          </div>
          <button
            onClick={() => setExpandAll(false)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
            title="Colapsar (Esc)"
          >
            <Minimize2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Colapsar</span>
          </button>
        </div>
      )}

      {/* ── Search bar ── */}
      {!expandAll && (
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-300 pointer-events-none" />
        <input
          value={dashSearch}
          onChange={e => { setDashSearch(e.target.value); if (section !== "ventas" && e.target.value) setSection("ventas"); }}
          placeholder="Buscar pedido, cliente…"
          className="w-full pl-8 pr-8 py-2 text-xs rounded-xl border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-accent/50 text-gray-700 dark:text-foreground placeholder-gray-300 focus:outline-none focus:border-primary/40 focus:bg-white dark:focus:bg-card transition-colors"
        />
        {dashSearch && (
          <button onClick={() => setDashSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 font-bold text-sm">×</button>
        )}
      </div>
      )}

      {/* ── Section Tabs ── */}
      {!expandAll && (
      <div className={cn("flex border-b border-gray-100 dark:border-card-border overflow-x-auto", fullscreen && "justify-center gap-1")} style={{scrollbarWidth:"none" as React.CSSProperties["scrollbarWidth"],marginBottom:"20px"}}>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={()=>setSection(s.id)}
            className={cn(
              "flex items-center gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2.5 font-semibold whitespace-nowrap border-b-2 -mb-px transition-all shrink-0",
              fullscreen ? "text-sm" : "text-xs",
              section===s.id
                ? "border-gray-900 dark:border-foreground text-gray-900 dark:text-foreground"
                : "border-transparent text-gray-400 dark:text-muted hover:text-gray-600"
            )}>
            <s.icon className="h-3.5 w-3.5" />{s.label}
          </button>
        ))}
      </div>
      )}

      {/* ── Today's Daily Summary Card ── */}
      {!loading && (expandAll || section === "resumen") && (() => {
        const todayKey = new Date().toISOString().slice(0, 10);
        const ydKey = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();
        const tOrders = orders.filter(o => o.createdAt.startsWith(todayKey) && o.status !== "cancelado");
        const tSales = (sales as { createdAt: string; total: number; items: unknown[] }[]).filter(s => s.createdAt.startsWith(todayKey));
        const todayRev = tOrders.reduce((a, o) => a + o.total, 0) + tSales.reduce((a, s) => a + s.total, 0);
        const todayCount = tOrders.length + tSales.length;
        const todayAvg = todayCount > 0 ? todayRev / todayCount : 0;
        const yOrders = orders.filter(o => o.createdAt.startsWith(ydKey) && o.status !== "cancelado");
        const ySales = (sales as { createdAt: string; total: number }[]).filter(s => s.createdAt.startsWith(ydKey));
        const ydRev = yOrders.reduce((a, o) => a + o.total, 0) + ySales.reduce((a, s) => a + s.total, 0);
        const delta = ydRev > 0 ? ((todayRev - ydRev) / ydRev) * 100 : 0;
        const isUp = delta >= 0;
        return (
          <div className="mb-4 rounded-2xl border border-emerald-200 dark:border-emerald-800/40 bg-linear-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/25 dark:to-teal-950/25 px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex flex-wrap items-center gap-2">
                <Sun className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-extrabold text-emerald-700 dark:text-emerald-400">Resumen de hoy</span>
                <span className="text-[10px] text-emerald-500/70 dark:text-emerald-500/60">{new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "short" })}</span>
              </div>
              {ydRev > 0 && (
                <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", isUp ? "text-emerald-700 bg-emerald-100 dark:bg-emerald-900/40" : "text-red-600 bg-red-100 dark:bg-red-900/40")}>
                  {isUp ? "↑" : "↓"} {Math.abs(delta).toFixed(0)}% vs ayer
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-xl font-extrabold text-gray-900 dark:text-foreground">S/{todayRev.toFixed(0)}</p>
                <p className="text-[10px] text-gray-400 dark:text-muted">Ingresos</p>
              </div>
              <div className="text-center border-x border-emerald-200 dark:border-emerald-800/40">
                <p className="text-xl font-extrabold text-gray-900 dark:text-foreground">{todayCount}</p>
                <p className="text-[10px] text-gray-400 dark:text-muted">Transacciones</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-extrabold text-gray-900 dark:text-foreground">S/{todayAvg.toFixed(0)}</p>
                <p className="text-[10px] text-gray-400 dark:text-muted">Ticket prom.</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Z2: Daily summary banner */}
      {!dailySummaryDismissed && !loading && (expandAll || section === "resumen") && (() => {
        const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
        const yd = yesterday.toISOString().slice(0, 10);
        const yOrders = orders.filter(o => o.createdAt.startsWith(yd) && o.status !== "cancelado");
        const yRevenue = yOrders.reduce((a, o) => a + o.total, 0);
        const topProduct = (() => {
          const pMap = new Map<string, number>();
          yOrders.forEach(o => o.items.forEach(i => pMap.set(i.name, (pMap.get(i.name) ?? 0) + i.quantity)));
          let best = ""; let max = 0;
          pMap.forEach((v, k) => { if (v > max) { max = v; best = k; } });
          return best;
        })();
        if (yOrders.length === 0) return null;
        return (
          <div className="mb-4 rounded-xl border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-900/15 px-2 sm:px-4 py-2 sm:py-3 flex flex-wrap items-center justify-between gap-2 sm:gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <CalendarDays className="h-5 w-5 text-blue-500 shrink-0" />
              <div>
                <p className="text-sm font-bold text-blue-700 dark:text-blue-400">Resumen de ayer</p>
                <p className="text-xs text-blue-600/70 dark:text-blue-400/70">
                  {yOrders.length} pedido{yOrders.length > 1 ? "s" : ""} · S/{yRevenue.toFixed(2)} en ventas
                  {topProduct && <> · Top: <span className="font-semibold">{topProduct}</span></>}
                </p>
              </div>
            </div>
            <button onClick={dismissDailySummary} className="text-blue-400 hover:text-blue-600 transition-colors shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })()}

      {/* ── Smart Insights ── */}
      {st.insights.length > 0 && (expandAll || section === "resumen") && (
        <div style={{marginBottom:"16px"}}>
          <div className="flex items-center gap-1.5 mb-2.5">
            <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs font-bold text-gray-700 dark:text-foreground">Alertas inteligentes</span>
            <span className="text-xs text-gray-300 dark:text-muted ml-1">{st.insights.length}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {st.insights.map((ins, i) => (
              <div key={i} className={cn(
                "flex gap-3 p-3 rounded-xl border transition-colors",
                ins.type === "danger" ? "bg-red-50/60 border-red-100" :
                ins.type === "warning" ? "bg-amber-50/60 border-amber-100" :
                ins.type === "success" ? "bg-emerald-50/60 border-emerald-100" :
                "bg-gray-50/60 border-gray-100"
              )}>
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  ins.type === "danger" ? "bg-red-100 text-red-600" :
                  ins.type === "warning" ? "bg-amber-100 text-amber-600" :
                  ins.type === "success" ? "bg-emerald-100 text-emerald-600" :
                  "bg-gray-100 text-gray-500"
                )}>
                  <ins.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className={cn(
                    "text-xs font-semibold leading-tight",
                    ins.type === "danger" ? "text-red-700" :
                    ins.type === "warning" ? "text-amber-700" :
                    ins.type === "success" ? "text-emerald-700" :
                    "text-gray-700"
                  )}>{ins.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{ins.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Quick Alert Badges ── */}
      {st.alerts.length > 0 && (expandAll || section === "resumen") && (
        <div className="flex gap-1.5 flex-wrap" style={{marginBottom:"16px"}}>
          {st.alerts.map((a,i) => (
            <div key={i} className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap",
              a.type==="danger"?"bg-red-50 text-red-600":a.type==="warning"?"bg-amber-50 text-amber-600":"bg-gray-50 text-gray-500"
            )}>
              <AlertCircle className="h-3 w-3 shrink-0" />{a.msg}
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* RESUMEN                                                            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {expandAll && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
            <BarChart3 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-sm font-bold text-gray-800 dark:text-foreground">Resumen</h3>
        </div>
      )}
      {(expandAll || section === "resumen") && (
        <div className={cn("space-y-4", expandAll && "col-span-full")}>
          {/* ── Monthly Goals Card ── */}
          {period === "mes" && (
            <div className="bg-linear-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 p-3 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-linear-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                    <Target className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-gray-900 dark:text-foreground">Metas del Mes</h3>
                    <p className="text-xs text-gray-500 dark:text-muted">{new Date().toLocaleDateString("es-PE", { month: "long", year: "numeric" })}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {Object.values(monthlyGoals).some(v => v > 0) && (
                    <button
                      onClick={() => setShowGoalHistory(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-white/60 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 transition-colors"
                    >
                      <BarChart3 className="h-3.5 w-3.5" /> Histórico
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setTempGoals(monthlyGoals);
                      setEditingMonthlyGoals(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-linear-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 transition-colors shadow-sm"
                  >
                    <Edit3 className="h-3.5 w-3.5" /> Editar metas
                  </button>
                </div>
              </div>
              
              {Object.values(monthlyGoals).some(v => v > 0) ? (
                <div className="grid sm:grid-cols-2 gap-2 sm:gap-4">
                  {[
                    { key: "revenue" as const, label: "Ingresos", value: st.ventas, goal: monthlyGoals.revenue, format: (v: number) => fmt(v), icon: DollarSign, color: "emerald" },
                    { key: "orders" as const, label: "Pedidos", value: st.tickets, goal: monthlyGoals.orders, format: (v: number) => String(v), icon: ShoppingCart, color: "blue" },
                    { key: "customers" as const, label: "Clientes", value: st.clientesAtendidos, goal: monthlyGoals.customers, format: (v: number) => String(v), icon: Users, color: "violet" },
                    { key: "avgTicket" as const, label: "Ticket Prom.", value: st.ticketProm, goal: monthlyGoals.avgTicket, format: (v: number) => fmt(v), icon: Receipt, color: "amber" },
                  ].map(metric => {
                    const pct = metric.goal > 0 ? Math.min((metric.value / metric.goal) * 100, 100) : 0;
                    const status = pct >= 100 ? "complete" : pct >= 80 ? "good" : pct >= 50 ? "warning" : "danger";
                    return (
                      <div key={metric.key} className="bg-white/70 dark:bg-gray-900/30 rounded-xl p-4 border border-white/50 dark:border-gray-800">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center",
                              metric.color === "emerald" && "bg-emerald-100 dark:bg-emerald-900/30",
                              metric.color === "blue" && "bg-blue-100 dark:bg-blue-900/30",
                              metric.color === "violet" && "bg-violet-100 dark:bg-violet-900/30",
                              metric.color === "amber" && "bg-amber-100 dark:bg-amber-900/30"
                            )}>
                              <metric.icon className={cn(
                                "h-4 w-4",
                                metric.color === "emerald" && "text-emerald-600 dark:text-emerald-400",
                                metric.color === "blue" && "text-blue-600 dark:text-blue-400",
                                metric.color === "violet" && "text-violet-600 dark:text-violet-400",
                                metric.color === "amber" && "text-amber-600 dark:text-amber-400"
                              )} />
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">{metric.label}</p>
                              <p className="text-sm font-bold text-gray-900 dark:text-foreground">{metric.format(metric.value)}</p>
                            </div>
                          </div>
                          {status === "complete" && <Trophy className="h-5 w-5 text-amber-500" />}
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-500 dark:text-muted">Meta: {metric.format(metric.goal)}</span>
                            <span className={cn(
                              "font-bold",
                              status === "complete" && "text-emerald-600 dark:text-emerald-400",
                              status === "good" && "text-blue-600 dark:text-blue-400",
                              status === "warning" && "text-amber-600 dark:text-amber-400",
                              status === "danger" && "text-red-600 dark:text-red-400"
                            )}>
                              {pct.toFixed(0)}% {status === "complete" && "✓"}
                            </span>
                          </div>
                          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-500",
                                status === "complete" && "bg-linear-to-r from-emerald-500 to-emerald-600",
                                status === "good" && "bg-linear-to-r from-blue-500 to-blue-600",
                                status === "warning" && "bg-linear-to-r from-amber-500 to-amber-600",
                                status === "danger" && "bg-linear-to-r from-red-500 to-red-600"
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <p className={cn(
                            "text-[10px] font-medium",
                            status === "complete" && "text-emerald-600 dark:text-emerald-400",
                            status === "good" && "text-gray-600 dark:text-gray-400",
                            status === "warning" && "text-amber-600 dark:text-amber-400",
                            status === "danger" && "text-red-600 dark:text-red-400"
                          )}>
                            {status === "complete" ? "¡Meta alcanzada!" :
                             status === "good" ? "En buen camino" :
                             status === "warning" ? "Avance moderado" :
                             "Requiere impulso"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <button
                  onClick={() => {
                    setTempGoals({ revenue: 0, orders: 0, customers: 0, avgTicket: 0 });
                    setEditingMonthlyGoals(true);
                  }}
                  className="w-full py-8 rounded-xl border-2 border-dashed border-indigo-200 dark:border-indigo-800 text-gray-400 dark:text-muted hover:border-indigo-400 dark:hover:border-indigo-600 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors group"
                >
                  <Target className="h-8 w-8 mx-auto mb-2 opacity-50 group-hover:opacity-100 transition-opacity" />
                  <p className="text-sm font-semibold">Definir metas del mes</p>
                  <p className="text-xs mt-1">Establece objetivos para ingresos, pedidos, clientes y ticket promedio</p>
                </button>
              )}
            </div>
          )}
          
          {/* Edit Goals Modal */}
          {editingMonthlyGoals && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setEditingMonthlyGoals(false)}>
              <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-3 sm:px-6 py-4 border-b border-gray-100 dark:border-card-border">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-linear-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                      <Target className="h-4 w-4 text-white" />
                    </div>
                    <h3 className="font-extrabold text-gray-900 dark:text-foreground">Metas del mes</h3>
                  </div>
                  <button onClick={() => setEditingMonthlyGoals(false)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"><X className="h-5 w-5" /></button>
                </div>
                <div className="px-3 sm:px-6 py-5 space-y-4">
                  <p className="text-sm text-gray-500 dark:text-muted">Define tus objetivos para {new Date().toLocaleDateString("es-PE", { month: "long", year: "numeric" })}</p>
                  <div className="grid gap-2 sm:gap-4">
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-muted mb-1.5">
                        <DollarSign className="h-3.5 w-3.5" /> Ingresos mensuales (S/)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={tempGoals.revenue || ""}
                        onChange={e => setTempGoals(prev => ({ ...prev, revenue: Number(e.target.value) }))}
                        placeholder="5000"
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-indigo-500 outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-muted mb-1.5">
                        <ShoppingCart className="h-3.5 w-3.5" /> Pedidos del mes
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={tempGoals.orders || ""}
                        onChange={e => setTempGoals(prev => ({ ...prev, orders: Number(e.target.value) }))}
                        placeholder="100"
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-indigo-500 outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-muted mb-1.5">
                        <Users className="h-3.5 w-3.5" /> Clientes atendidos
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={tempGoals.customers || ""}
                        onChange={e => setTempGoals(prev => ({ ...prev, customers: Number(e.target.value) }))}
                        placeholder="50"
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-indigo-500 outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-muted mb-1.5">
                        <Receipt className="h-3.5 w-3.5" /> Ticket promedio (S/)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={5}
                        value={tempGoals.avgTicket || ""}
                        onChange={e => setTempGoals(prev => ({ ...prev, avgTicket: Number(e.target.value) }))}
                        placeholder="50"
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-indigo-500 outline-none text-sm"
                      />
                    </div>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-3">
                    <p className="text-xs text-blue-700 dark:text-blue-400"><strong>💡 Consejo:</strong> Establece metas realistas basadas en tu histórico y +10-15% de crecimiento.</p>
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-3 px-3 sm:px-6 py-4 border-t border-gray-100 dark:border-card-border">
                  <button onClick={() => setEditingMonthlyGoals(false)} className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent transition-colors">Cancelar</button>
                  <button onClick={saveMonthlyGoals} className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl text-sm font-bold text-white bg-linear-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 transition-colors shadow-sm">Guardar metas</button>
                </div>
              </div>
            </div>
          )}
          
          {/* Goal History Modal */}
          {showGoalHistory && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowGoalHistory(false)}>
              <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-3 sm:px-6 py-4 border-b border-gray-100 dark:border-card-border shrink-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-linear-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                      <BarChart3 className="h-4 w-4 text-white" />
                    </div>
                    <h3 className="font-extrabold text-gray-900 dark:text-foreground">Histórico de metas</h3>
                  </div>
                  <button onClick={() => setShowGoalHistory(false)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"><X className="h-5 w-5" /></button>
                </div>
                <div className="overflow-y-auto flex-1 px-3 sm:px-6 py-5">
                  {(() => {
                    const history = JSON.parse(localStorage.getItem("bsm-goals-history") || "{}");
                    const entries = Object.entries(history).sort((a, b) => b[0].localeCompare(a[0]));
                    if (entries.length === 0) {
                      return <div className="text-center py-8 text-gray-400 dark:text-muted text-sm">No hay histórico disponible aún</div>;
                    }
                    return (
                      <div className="space-y-4">
                        {entries.map(([monthKey, data]) => {
                          const entry = data as { goals: Record<string, number>; savedAt: string; actual?: Record<string, number> };
                          const date = new Date(monthKey + "-01");
                          const monthLabel = date.toLocaleDateString("es-PE", { month: "long", year: "numeric" });
                          return (
                            <div key={monthKey} className="bg-gray-50 dark:bg-surface rounded-xl p-4 border border-gray-100 dark:border-card-border">
                              <h4 className="font-bold text-sm text-gray-900 dark:text-foreground mb-3 capitalize">{monthLabel}</h4>
                              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                                <div>
                                  <span className="text-gray-500 dark:text-muted block mb-1">Ingresos</span>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold text-gray-900 dark:text-foreground">{fmt(entry.actual?.revenue || 0)}</span>
                                    <span className="text-gray-400 dark:text-muted">/</span>
                                    <span className="text-gray-600 dark:text-muted">{fmt(entry.goals?.revenue || 0)}</span>
                                    {entry.goals?.revenue > 0 && (
                                      <span className={cn(
                                        "ml-auto text-xs font-bold",
                                        (entry.actual?.revenue || 0) >= entry.goals.revenue ? "text-emerald-600" : "text-amber-600"
                                      )}>
                                        {((entry.actual?.revenue || 0) / entry.goals.revenue * 100).toFixed(0)}%
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <span className="text-gray-500 dark:text-muted block mb-1">Pedidos</span>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold text-gray-900 dark:text-foreground">{entry.actual?.orders || 0}</span>
                                    <span className="text-gray-400 dark:text-muted">/</span>
                                    <span className="text-gray-600 dark:text-muted">{entry.goals?.orders || 0}</span>
                                    {entry.goals?.orders > 0 && (
                                      <span className={cn(
                                        "ml-auto text-xs font-bold",
                                        (entry.actual?.orders || 0) >= entry.goals.orders ? "text-emerald-600" : "text-amber-600"
                                      )}>
                                        {((entry.actual?.orders || 0) / entry.goals.orders * 100).toFixed(0)}%
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
          
          {/* Period comparison badge */}
          {period !== "todo" && (
            <div className="flex items-center justify-between px-2 sm:px-4 py-1.5 sm:py-2 bg-linear-to-r from-blue-50 to-violet-50 dark:from-blue-950/30 dark:to-violet-950/30 rounded-xl border border-blue-100 dark:border-blue-900/30">
              <div className="flex flex-wrap items-center gap-2">
                <CalendarDays className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-semibold text-gray-700 dark:text-foreground">
                  Comparado con{" "}
                  {period === "hoy" ? "ayer" : period === "semana" ? "semana anterior" : period === "mes" ? "mes anterior" : "período anterior"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {st.dVentas != null && (
                  <span className={cn("text-xs font-bold px-2 py-1 rounded-lg", st.dVentas >= 0 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-600 dark:text-red-400")}>
                    {st.dVentas >= 0 ? "↑" : "↓"} {Math.abs(st.dVentas).toFixed(1)}% ventas
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Sprint 3: Morning Briefing Card */}
          <div className="bg-linear-to-br from-gray-900 to-gray-800 dark:from-gray-800 dark:to-gray-900 rounded-xl p-4 text-white">
            <div className="flex items-center justify-between mb-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                  <Lightbulb className="h-4 w-4 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Buenos días ☀️</h3>
                  <p className="text-[10px] text-gray-400">{new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })}</p>
                </div>
              </div>
              {st.todayRevenue > 0 && (
                <div className="text-right">
                  <div className="text-lg font-bold text-emerald-400">{fmt(st.todayRevenue)}</div>
                  <div className="text-[10px] text-gray-400">hoy</div>
                </div>
              )}
            </div>

            {/* Yesterday summary */}
            <div className="flex flex-wrap items-center gap-3 mb-3 px-3 py-2 rounded-lg bg-white/5">
              <div className="flex-1">
                <span className="text-[10px] text-gray-400 uppercase tracking-wider">Ayer</span>
                <div className="flex flex-wrap items-center gap-3 mt-0.5">
                  <span className="text-sm font-bold">{fmt(st.yesterdayRevenue)}</span>
                  <span className="text-xs text-gray-400">{st.yesterdayTickets} ticket{st.yesterdayTickets !== 1 ? "s" : ""}</span>
                </div>
              </div>
              {dailyGoal > 0 && (
                <div className="text-right">
                  <span className={cn("text-xs font-bold", st.yesterdayRevenue >= dailyGoal ? "text-emerald-400" : "text-amber-400")}>
                    {st.yesterdayRevenue >= dailyGoal ? "✓ Meta" : `${((st.yesterdayRevenue / dailyGoal) * 100).toFixed(0)}%`}
                  </span>
                </div>
              )}
            </div>

            {/* Today's priorities */}
            {st.briefingPriorities.length > 0 && (
              <div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">Prioridades de hoy</div>
                <div className="space-y-1">
                  {st.briefingPriorities.map((p, i) => (
                    <div key={i} className="text-xs text-gray-200 py-1 px-2 rounded bg-white/5">
                      {p}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {st.briefingPriorities.length === 0 && (
              <div className="text-xs text-emerald-400 text-center py-1">✓ Sin prioridades pendientes. ¡Buen día!</div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Kpi label="Ventas Netas" value={fmt(st.ventas)} icon={DollarSign} accent="text-emerald-500" delta={st.dVentas} sparklineData={st.sparklineRevenue} />
            <Kpi label="Utilidad" value={fmt(st.utilidad)} icon={TrendingUp} accent="text-blue-500" delta={st.dUtilidad} sparklineData={st.sparklineProfit} />
            <Kpi label="Margen" value={`${st.margen.toFixed(1)}%`} icon={Percent} accent={st.margen>=25?"text-emerald-500":st.margen>=15?"text-amber-500":"text-red-500"} delta={st.dMargen} />
            <Kpi label="Tickets" value={String(st.tickets)} icon={Receipt} accent="text-violet-500" delta={st.dTickets} sparklineData={st.sparklineOrders} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Kpi label="Ticket Prom." value={fmt(st.ticketProm)} icon={ShoppingCart} accent="text-indigo-500" delta={st.dTicketProm} sparklineData={st.sparklineAvgTicket} />
            <Kpi label="Uds. Vendidas" value={String(st.uds)} icon={Package} accent="text-cyan-500" delta={st.dUds} />
            <Kpi label="Clientes" value={String(st.clientesAtendidos)} icon={Users} accent="text-violet-500" delta={st.dClientes} />
            <Kpi label="Stock Valor." value={fmt(st.stockVal)} icon={ShoppingBasket} accent="text-amber-500" />
          </div>

          {/* S3: Daily sales goal */}
          <Card title="Meta del día" icon={Target}>

          {/* ── Alerts Panel (collapsible) ── */}
          {(() => {
            const alertItems: { type: "danger" | "warning" | "info"; msg: string }[] = [];
            if (st.agotados.length > 0) alertItems.push({ type: "danger", msg: `🚫 ${st.agotados.length} producto${st.agotados.length>1?"s":""} agotado${st.agotados.length>1?"s":""}: ${st.agotados.slice(0,3).map(p => p.name).join(", ")}${st.agotados.length>3?" ...":""}` });
            if (st.stockCritico.length > 0) alertItems.push({ type: "warning", msg: `⚠️ ${st.stockCritico.length} producto${st.stockCritico.length>1?"s":""} con stock bajo: ${st.stockCritico.slice(0,3).map(p => `${p.name} (${p.stock ?? 0})`).join(", ")}` });
            const pendingOrders = orders.filter(o => o.status === "pendiente").length;
            if (pendingOrders > 0) alertItems.push({ type: "warning", msg: `📦 ${pendingOrders} pedido${pendingOrders>1?"s":""} pendiente${pendingOrders>1?"s":""} por confirmar` });
            const nearExpiry = products.filter(p => {
              const exp = (p as unknown as { expiryDate?: string }).expiryDate;
              if (!exp) return false;
              const days = (new Date(exp).getTime() - Date.now()) / 86400000;
              return days >= 0 && days <= 7;
            });
            if (nearExpiry.length > 0) alertItems.push({ type: "danger", msg: `🕐 ${nearExpiry.length} producto${nearExpiry.length>1?"s":""} próximo${nearExpiry.length>1?"s":""} a vencer (7 días)` });
            if (st.margen < 15) alertItems.push({ type: "warning", msg: `📉 Margen general bajo: ${st.margen.toFixed(1)}% — revisar precios o costos` });
            if (alertItems.length === 0) return null;
            return (
              <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/15 p-4">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <span className="text-sm font-bold text-amber-800 dark:text-amber-300">Alertas activas ({alertItems.length})</span>
                  </div>
                  <button onClick={() => setAlertsCollapsed(c => !c)} className="p-1 rounded-lg hover:bg-amber-200/50 dark:hover:bg-amber-800/30 transition-colors">
                    <ChevronRight className={cn("h-4 w-4 text-amber-600 dark:text-amber-400 transition-transform", !alertsCollapsed && "rotate-90")} />
                  </button>
                </div>
                {!alertsCollapsed && <div className="space-y-1.5">
                  {alertItems.map((a, i) => (
                    <div key={i} className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium",
                      a.type === "danger" ? "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400" :
                      a.type === "warning" ? "bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400" :
                      "bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400"
                    )}>
                      {a.msg}
                    </div>
                  ))}
                </div>}
              </div>
            );
          })()}

          {/* ── Hourly Sales Heatmap ── */}
          {(() => {
            const hourData = Array(24).fill(0);
            const allTx = [
              ...orders.filter(o => inPeriod(o.createdAt, period) && o.status !== "cancelado").map(o => ({ time: o.createdAt, amount: o.total })),
              ...sales.filter(s => inPeriod(s.createdAt, period)).map(s => ({ time: s.createdAt, amount: s.total })),
            ];
            allTx.forEach(tx => { const h = new Date(tx.time).getHours(); hourData[h] += tx.amount; });
            const maxVal = Math.max(...hourData, 1);
            if (allTx.length === 0) return null;
            return (
              <div className="rounded-xl border border-gray-100 dark:border-card-border bg-white dark:bg-card p-4">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <Clock className="h-4 w-4 text-indigo-500" />
                  <p className="text-xs font-semibold text-gray-700 dark:text-foreground">Ventas por hora — Mapa de calor</p>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-1">
                  {hourData.map((val, h) => {
                    const intensity = val / maxVal;
                    return (
                      <div key={h} className="group relative flex flex-col items-center gap-1">
                        <div
                          className="w-full aspect-square rounded-md transition-all cursor-default"
                          style={{
                            background: val > 0
                              ? `rgba(45,106,79,${0.1 + intensity * 0.85})`
                              : "rgba(156,163,175,0.08)",
                          }}
                        />
                        <span className="text-[8px] text-gray-400 dark:text-muted">{h}h</span>
                        {val > 0 && (
                          <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[9px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                            {h}:00 — S/{val.toFixed(0)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[9px] text-gray-400">Menos ventas</span>
                  <div className="flex flex-wrap gap-0.5">
                    {[0.1, 0.3, 0.5, 0.7, 0.9].map(o => (
                      <div key={o} className="w-3 h-2 rounded-sm" style={{ background: `rgba(45,106,79,${o})` }} />
                    ))}
                  </div>
                  <span className="text-[9px] text-gray-400">Más ventas</span>
                </div>
              </div>
            );
          })()}
            {editingGoal ? (
              <form onSubmit={(e) => { e.preventDefault(); const v = dailyGoal; localStorage.setItem("daily-sales-goal", String(v)); setEditingGoal(false); }} className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-500">S/</span>
                <input type="number" min={0} step={10} value={dailyGoal || ""} onChange={(e) => setDailyGoal(Number(e.target.value))} className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-700 text-sm text-gray-800 dark:text-foreground bg-white dark:bg-card outline-none focus:border-primary" autoFocus />
                <button type="submit" className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold">Guardar</button>
              </form>
            ) : dailyGoal > 0 ? (() => {
              const todaySales = orders.filter(o => {
                const d = new Date(o.createdAt); const nd = new Date();
                return d.getFullYear() === nd.getFullYear() && d.getMonth() === nd.getMonth() && d.getDate() === nd.getDate() && o.status !== "cancelado";
              }).reduce((s, o) => s + (o.total ?? 0), 0);
              const pct = Math.min((todaySales / dailyGoal) * 100, 100);
              return (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-gray-500 dark:text-muted">{fmt(todaySales)} de {fmt(dailyGoal)}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-bold ${pct >= 100 ? "text-emerald-600" : pct >= 60 ? "text-amber-600" : "text-red-500"}`}>{pct.toFixed(0)}%</span>
                      <button onClick={() => setEditingGoal(true)} className="text-gray-300 hover:text-primary text-xs transition-colors">✏️</button>
                    </div>
                  </div>
                  <div className="h-3 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-400"}`} style={{ width: `${pct}%` }} />
                  </div>
                  {pct >= 100 && <p className="text-[10px] text-emerald-600 font-bold mt-1.5 text-center">🎉 ¡Meta alcanzada!</p>}
                </div>
              );
            })() : (
              <button onClick={() => setEditingGoal(true)} className="w-full py-3 rounded-xl border-2 border-dashed border-gray-200 dark:border-zinc-700 text-gray-400 text-xs font-medium hover:border-primary hover:text-primary transition-colors">
                + Definir meta de ventas diaria
              </button>
            )}
          </Card>

          {/* OrderStats Component - Enhanced metrics */}
          <OrderStats
            totalOrders={st.tickets}
            totalRevenue={st.ventas}
            totalCogs={st.costo}
            pendingOrders={st.pendingOrdersCount}
            completedOrders={st.completedOrdersCount}
            averageOrderValue={st.ticketProm}
            conversionRate={st.conversionRate}
            periodLabel={period === "hoy" ? "hoy" : period === "semana" ? "esta semana" : period === "mes" ? "este mes" : "todo"}
            previousPeriodComparison={
              period !== "todo" && st.dVentas !== null
                ? {
                    orders: st.dTickets ?? 0,
                    revenue: st.dVentas ?? 0,
                  }
                : undefined
            }
          />

          <div className="grid lg:grid-cols-5 gap-3">
            <div className="lg:col-span-3 bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-muted mb-3">Ventas por día</p>
              {st.daily.length === 0 ? <Empty /> : (
                <div className="relative h-32">
                  <svg viewBox={`0 0 ${st.daily.length * 50} 120`} className="w-full h-full" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="areaGradSmall" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2d6a4f" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#2d6a4f" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d={
                      st.daily.map(([,v],i) => {
                        const x = i*50+25; const y = 100-((v/(st.maxDaily||1))*85);
                        return i===0?`M${x},${y}`:`L${x},${y}`;
                      }).join(' ') + ` L${(st.daily.length-1)*50+25},100 L25,100 Z`
                    } fill="url(#areaGradSmall)" />
                    <polyline
                      points={st.daily.map(([,v],i) => `${i*50+25},${100-((v/(st.maxDaily||1))*85)}`).join(' ')}
                      fill="none" stroke="#2d6a4f" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
                    />
                    {st.daily.map(([,v],i) => (
                      <circle key={i} cx={i*50+25} cy={100-((v/(st.maxDaily||1))*85)} r="2.5" fill="#2d6a4f" stroke="white" strokeWidth="1.5" />
                    ))}
                  </svg>
                  <div className="flex justify-between px-0.5">
                    {st.daily.map(([dk]) => (
                      <span key={dk} className="text-xs text-gray-300 dark:text-muted truncate text-center" style={{width:`${100/st.daily.length}%`}}>{dayLabel(dk)}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-2 bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-muted mb-3">Métodos de pago</p>
              {st.payments.length === 0 ? <Empty /> : (
                <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                  <Donut data={st.payments} total={st.payTotal} />
                  <div className="flex-1 space-y-1.5">
                    {st.payments.map(p => (
                      <div key={p.method} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{background:p.color}} />
                          <span className="text-gray-500">{p.label}</span>
                        </div>
                        <span className="font-semibold text-gray-700 dark:text-foreground">{st.payTotal>0?((p.total/st.payTotal)*100).toFixed(0):0}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* AC3: Sales heatmap by hour */}
          <Card title="Ventas por hora" icon={Clock}>
            {(() => {
              const hourCounts = new Array(24).fill(0);
              orders.filter(o => inPeriod(o.createdAt, period) && o.status !== "cancelado").forEach(o => {
                const h = new Date(o.createdAt).getHours();
                hourCounts[h]++;
              });
              sales.filter(s => inPeriod(s.createdAt, period)).forEach(s => {
                const h = new Date(s.createdAt).getHours();
                hourCounts[h]++;
              });
              const maxH = Math.max(...hourCounts, 1);
              return (
                <div className="flex flex-wrap items-end gap-0.75 h-16">
                  {hourCounts.map((c, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                      <div
                        className="w-full rounded-sm transition-all min-h-0.5"
                        style={{ height: `${Math.max((c / maxH) * 100, 3)}%`, background: c > 0 ? `rgba(45,106,79,${0.25 + (c / maxH) * 0.75})` : "rgba(156,163,175,0.15)" }}
                      />
                      {i % 3 === 0 && <span className="text-[8px] text-gray-300 dark:text-muted">{i}h</span>}
                      {c > 0 && <span className="absolute -top-5 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[9px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">{c} ventas</span>}
                    </div>
                  ))}
                </div>
              );
            })()}
          </Card>

          {/* FASE 6.2: A/B Test Tracker */}
          <Card title="Pruebas A/B" icon={Beaker}
            action={
              <button onClick={() => setShowABTestModal(true)}
                className="text-xs font-bold text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" /> Nueva prueba
              </button>
            }>
            {abTests.length === 0 ? (
              <div className="py-8 text-center">
                <Beaker className="h-12 w-12 text-gray-300 dark:text-muted mx-auto mb-2" />
                <p className="text-xs text-gray-500 dark:text-muted mb-3">No hay pruebas A/B activas</p>
                <button onClick={() => setShowABTestModal(true)}
                  className="text-xs font-bold text-primary underline hover:no-underline">
                  Crear tu primera prueba
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {abTests.slice(0, 5).map(test => {
                  // Calculate test results
                  const variantA = test.variants[0];
                  const variantB = test.variants[1];
                  const aConvRate = variantA.visitors > 0 ? (variantA.conversions / variantA.visitors) * 100 : 0;
                  const bConvRate = variantB.visitors > 0 ? (variantB.conversions / variantB.visitors) * 100 : 0;
                  const diff = bConvRate - aConvRate;
                  const isSignificant = Math.abs(diff) >= 10 && Math.min(variantA.visitors, variantB.visitors) >= 30;
                  const winner = isSignificant ? (bConvRate > aConvRate ? variantB.id : variantA.id) : null;
                  
                  return (
                    <div key={test.id} className="border border-gray-200 dark:border-card-border rounded-xl p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-sm text-gray-900 dark:text-foreground truncate">{test.name}</h4>
                          <p className="text-[10px] text-gray-500 dark:text-muted mt-0.5">{test.hypothesis}</p>
                        </div>
                        <DBadge color={test.status === "running" ? "green" : test.status === "completed" ? "blue" : "gray"}>
                          {test.status === "running" ? "▶ En curso" : test.status === "completed" ? "✓ Completo" : "⏸ Pausado"}
                        </DBadge>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                        {test.variants.map(v => {
                          const convRate = v.visitors > 0 ? (v.conversions / v.visitors) * 100 : 0;
                          const isWinner = winner === v.id;
                          return (
                            <div key={v.id} className={cn(
                              "p-2 rounded-lg border-2 transition-all",
                              isWinner ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" : "border-gray-200 dark:border-card-border bg-gray-50 dark:bg-surface"
                            )}>
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="text-[10px] font-bold text-gray-600 dark:text-gray-400">{v.name}</span>
                                {isWinner && <Trophy className="h-3 w-3 text-emerald-600" />}
                              </div>
                              <div className="text-xs">
                                <div className="font-bold text-gray-900 dark:text-foreground">{convRate.toFixed(1)}%</div>
                                <div className="text-[9px] text-gray-500">{v.visitors} visitantes • {v.conversions} conversiones</div>
                                {test.metric === "revenue" && <div className="text-[9px] text-gray-600 dark:text-gray-400 font-semibold">S/{v.revenue.toFixed(2)}</div>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {winner && isSignificant && (
                        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-2 text-center">
                          <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                            🏆 Ganador: {test.variants.find(v => v.id === winner)?.name} (+{Math.abs(diff).toFixed(1)}% mejor)
                          </p>
                        </div>
                      )}
                      {!winner && test.status === "running" && (
                        <p className="text-[9px] text-gray-400 dark:text-muted text-center">
                          Se necesitan más datos para determinar un ganador con confianza
                        </p>
                      )}
                    </div>
                  );
                })}
                {abTests.length > 5 && (
                  <p className="text-xs text-gray-400 text-center pt-1">+{abTests.length - 5} pruebas más</p>
                )}
              </div>
            )}
          </Card>

          {/* A/B Test Modal */}
          {showABTestModal && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowABTestModal(false)}>
              <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-3 sm:px-6 py-4 border-b border-gray-100 dark:border-card-border">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-linear-to-br from-violet-500 to-purple-500 flex items-center justify-center">
                      <Beaker className="h-4 w-4 text-white" />
                    </div>
                    <h3 className="font-extrabold text-gray-900 dark:text-foreground">Nueva Prueba A/B</h3>
                  </div>
                  <button onClick={() => setShowABTestModal(false)} className="p-1.5 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"><X className="h-5 w-5" /></button>
                </div>
                <div className="px-3 sm:px-6 py-5 space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 dark:text-muted mb-1.5 block">Nombre del test</label>
                    <input type="text" value={abTestForm.name} onChange={e => setAbTestForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Ej: Banner promocional vs. Sin banner"
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-violet-500 outline-none text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 dark:text-muted mb-1.5 block">Hipótesis</label>
                    <textarea value={abTestForm.hypothesis} onChange={e => setAbTestForm(prev => ({ ...prev, hypothesis: e.target.value }))}
                      placeholder="Ej: Agregar un banner con descuento aumentará la conversión en 15%"
                      rows={2}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-violet-500 outline-none text-sm resize-none" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-muted mb-1.5 block">Variante A (Control)</label>
                      <input type="text" value={abTestForm.variantA} onChange={e => setAbTestForm(prev => ({ ...prev, variantA: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-violet-500 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-muted mb-1.5 block">Variante B</label>
                      <input type="text" value={abTestForm.variantB} onChange={e => setAbTestForm(prev => ({ ...prev, variantB: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-violet-500 outline-none text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 dark:text-muted mb-1.5 block">Métrica a medir</label>
                    <select value={abTestForm.metric} onChange={e => setAbTestForm(prev => ({ ...prev, metric: e.target.value as "revenue"|"conversion"|"aov"|"retention" }))}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-violet-500 outline-none text-sm">
                      <option value="conversion">Tasa de conversión</option>
                      <option value="revenue">Ingresos</option>
                      <option value="aov">Valor promedio de orden</option>
                      <option value="retention">Retención</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-muted mb-1.5 block">Fecha inicio</label>
                      <input type="date" value={abTestForm.startDate} onChange={e => setAbTestForm(prev => ({ ...prev, startDate: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-violet-500 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-muted mb-1.5 block">Fecha fin</label>
                      <input type="date" value={abTestForm.endDate} onChange={e => setAbTestForm(prev => ({ ...prev, endDate: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground focus:border-violet-500 outline-none text-sm" />
                    </div>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-3">
                    <p className="text-xs text-blue-700 dark:text-blue-400"><strong>💡 Recomendación:</strong> Ejecuta pruebas por al menos 7-14 días y 100+ visitantes por variante para resultados confiables.</p>
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-3 px-3 sm:px-6 py-4 border-t border-gray-100 dark:border-card-border">
                  <button onClick={() => setShowABTestModal(false)} className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent transition-colors">Cancelar</button>
                  <button onClick={() => {
                    const newTest: ABTest = {
                      id: Date.now().toString(),
                      name: abTestForm.name || "Test sin nombre",
                      hypothesis: abTestForm.hypothesis,
                      variants: [
                        { id: "A", name: abTestForm.variantA, visitors: 0, conversions: 0, revenue: 0 },
                        { id: "B", name: abTestForm.variantB, visitors: 0, conversions: 0, revenue: 0 }
                      ],
                      metric: abTestForm.metric,
                      startDate: abTestForm.startDate || new Date().toISOString().slice(0, 10),
                      endDate: abTestForm.endDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
                      status: "running"
                    };
                    const updated = [...abTests, newTest];
                    setAbTests(updated);
                    localStorage.setItem("bsm-ab-tests", JSON.stringify(updated));
                    setShowABTestModal(false);
                    setAbTestForm({ name: "", hypothesis: "", variantA: "Control", variantB: "Variant B", metric: "conversion", startDate: "", endDate: "" });
                  }} className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl text-sm font-bold text-white bg-linear-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 transition-colors shadow-sm">Crear test</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <BentoGrid active={expandAll}>
      {(expandAll || section === "ventas") && (
        <div className={cn("space-y-4", expandAll && "bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-4")}>
          {expandAll && (
            <div className="flex flex-wrap items-center gap-2 mb-4 pb-3 border-b border-gray-100 dark:border-card-border">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                <DollarSign className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-foreground">Ventas</h3>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 flex-1">
              <Kpi label="Ventas Netas" value={fmt(st.ventas)} icon={DollarSign} accent="text-emerald-500" delta={st.dVentas} sparklineData={st.sparklineRevenue} />
              <Kpi label="Utilidad" value={fmt(st.utilidad)} icon={TrendingUp} accent="text-blue-500" delta={st.dUtilidad} sparklineData={st.sparklineProfit} />
              <Kpi label="Tickets" value={String(st.tickets)} icon={Receipt} accent="text-violet-500" delta={st.dTickets} sparklineData={st.sparklineOrders} />
              <Kpi label="Cancelados" value={String(st.cancelados)} icon={AlertTriangle} accent="text-red-500" delta={st.dCancelados} invertTrend />
            </div>
            <button
              onClick={exportVentas}
              className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 px-3 py-2 rounded-lg hover:bg-primary/20 transition-colors"
              title="Exportar ventas del período como CSV"
            >
              <Download className="h-3.5 w-3.5" /> Exportar CSV
            </button>
          </div>

          <Card title="Ventas por día" icon={BarChart3}>
            {st.daily.length===0?<Empty />:(
              <div>
                <div className="flex items-center gap-3 mb-2 justify-end flex-wrap">
                  <span className="flex items-center gap-1.5 text-[11px] text-gray-400">
                    <svg width="12" height="4"><line x1="0" y1="2" x2="12" y2="2" stroke="#2d6a4f" strokeWidth="2.5" strokeLinecap="round"/></svg>
                    Ventas
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] text-gray-400">
                    <svg width="12" height="4"><line x1="0" y1="2" x2="12" y2="2" stroke="#10b981" strokeWidth="2" strokeDasharray="3 2"/></svg>
                    Utilidad
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] text-gray-400">
                    <svg width="12" height="4"><line x1="0" y1="2" x2="12" y2="2" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="2 2"/></svg>
                    Promedio 7d
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] text-gray-400">
                    <svg width="12" height="4"><line x1="0" y1="2" x2="12" y2="2" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="6 3"/></svg>
                    Tendencia
                  </span>
                  {st.wowGrowth !== null && (
                    <span className={cn("text-[11px] font-bold", st.wowGrowth >= 0 ? "text-emerald-500" : "text-red-500")}>
                      {st.wowGrowth >= 0 ? "↑" : "↓"} {Math.abs(st.wowGrowth).toFixed(1)}% sem/sem
                    </span>
                  )}
                </div>
                <div className="relative h-40">
                  <svg viewBox={`0 0 ${st.daily.length * 50} 160`} className="w-full h-full" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2d6a4f" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#2d6a4f" stopOpacity="0.02" />
                      </linearGradient>
                    </defs>
                    {/* Grid lines */}
                    {[0.25,0.5,0.75].map(r => (
                      <line key={r} x1="0" y1={140*(1-r)} x2={st.daily.length*50} y2={140*(1-r)} stroke="currentColor" className="text-gray-100 dark:text-gray-700" strokeWidth="1" strokeDasharray="4 4" />
                    ))}
                    {/* Area */}
                    <path d={
                      st.daily.map(([,v],i) => {
                        const x = i*50+25; const y = 140-((v/st.maxDaily)*130);
                        return i===0?`M${x},${y}`:`L${x},${y}`;
                      }).join(' ') + ` L${(st.daily.length-1)*50+25},140 L25,140 Z`
                    } fill="url(#areaGrad)" />
                    {/* Revenue line */}
                    <polyline
                      points={st.daily.map(([,v],i) => `${i*50+25},${140-((v/st.maxDaily)*130)}`).join(' ')}
                      fill="none" stroke="#2d6a4f" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
                    />
                    {/* Profit line (dashed, emerald) */}
                    {st.dailyProfit.some(v => v > 0) && (
                      <polyline
                        points={st.dailyProfit.map((v,i) => `${i*50+25},${140-((Math.max(v,0)/st.maxDaily)*130)}`).join(' ')}
                        fill="none" stroke="#10b981" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="5 3"
                      />
                    )}
                    {/* Revenue dots */}
                    {st.daily.map(([,v],i) => (
                      <circle key={i} cx={i*50+25} cy={140-((v/st.maxDaily)*130)} r="3.5" fill="#2d6a4f" stroke="white" strokeWidth="2" />
                    ))}
                    {/* 7-day moving average line (amber) */}
                    {st.movingAvg7.length >= 2 && (
                      <polyline
                        points={st.movingAvg7.map((v,i) => `${i*50+25},${140-((Math.max(v,0)/st.maxDaily)*130)}`).join(' ')}
                        fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="2 2"
                      />
                    )}
                    {/* Trend line (red dashed) */}
                    {st.daily.length >= 2 && (
                      <line
                        x1={25}
                        y1={140-((Math.max(0, st.trendIntercept)/st.maxDaily)*130)}
                        x2={(st.daily.length-1)*50+25}
                        y2={140-((Math.max(0, st.trendIntercept + st.trendSlope*(st.daily.length-1))/st.maxDaily)*130)}
                        stroke="#ef4444" strokeWidth="1.5" strokeDasharray="6 3" opacity="0.7"
                      />
                    )}
                  </svg>
                </div>
                <div className="flex justify-between px-1 mt-1">
                  {st.daily.map(([dk]) => (
                    <span key={dk} className="text-xs text-gray-400 dark:text-muted truncate text-center" style={{width:`${100/st.daily.length}%`}}>{dayLabel(dk)}</span>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Forecast card */}
          {st.forecast7.length > 0 && (
            <Card title="Pronóstico próximos 7 días" icon={Target}>
              <div className="space-y-3">
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-1.5">
                  {st.forecast7.map((f, i) => {
                    const maxF = Math.max(...st.forecast7.map(x => x.value), 1);
                    return (
                      <div key={i} className="text-center">
                        <div className="h-16 flex items-end justify-center">
                          <div
                            className="w-full max-w-8 rounded-t-md bg-linear-to-t from-violet-500 to-violet-400 opacity-70"
                            style={{ height: `${(f.value / maxF) * 100}%`, minHeight: "4px" }}
                          />
                        </div>
                        <p className="text-[10px] text-gray-400 dark:text-muted mt-1">{f.day}</p>
                        <p className="text-[11px] font-bold text-gray-700 dark:text-foreground">{fmt(f.value)}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-muted pt-2 border-t border-gray-100 dark:border-card-border">
                  <span>Total estimado: <strong className="text-gray-800 dark:text-foreground">{fmt(st.forecast7.reduce((a, f) => a + f.value, 0))}</strong></span>
                  <span className="text-[10px]">Basado en tendencia lineal de {st.daily.length} días</span>
                </div>
              </div>
            </Card>
          )}

          {/* Heat map de horarios pico */}
          <Card title="Heat map de horarios pico" icon={Clock}>
            <div className="space-y-3">
              <div className="text-xs text-gray-500 dark:text-muted">Volumen de ventas por día y hora</div>
              <div className="overflow-x-auto">
                <div className="inline-flex flex-col gap-1 min-w-max">
                  {/* Hour labels */}
                  <div className="flex flex-wrap gap-1 pl-12">
                    {[...Array(24)].map((_, h) => (
                      <div key={h} className="w-6 text-center text-[9px] text-gray-400 dark:text-muted">
                        {h}
                      </div>
                    ))}
                  </div>
                  {/* Day rows */}
                  {DAYS.map((day, dayIndex) => (
                    <div key={dayIndex} className="flex items-center gap-1">
                      <div className="w-10 text-xs font-medium text-gray-600 dark:text-gray-400 text-right pr-2">
                        {day}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {[...Array(24)].map((_, hour) => {
                          const key = `${dayIndex}-${hour}`;
                          const count = st.hourMap.get(key) ?? 0;
                          const intensity = count > 0 ? Math.min((count / st.maxHeat) * 100, 100) : 0;
                          let bgColor = "bg-gray-50 dark:bg-gray-800";
                          if (intensity > 0) {
                            if (intensity >= 75) bgColor = "bg-emerald-600";
                            else if (intensity >= 50) bgColor = "bg-emerald-500";
                            else if (intensity >= 25) bgColor = "bg-emerald-400";
                            else bgColor = "bg-emerald-200 dark:bg-emerald-900/30";
                          }
                          return (
                            <div
                              key={hour}
                              className={cn("w-6 h-6 rounded transition-all group relative", bgColor)}
                              title={`${day} ${hour}:00 - ${count} ventas`}
                            >
                              {count > 0 && (
                                <div className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded">
                                  {count}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Legend */}
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-muted">
                  Intensidad:
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 bg-gray-50 dark:bg-gray-800 rounded"></div>
                  <span className="text-[10px] text-gray-400">Sin ventas</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 bg-emerald-200 dark:bg-emerald-900/30 rounded"></div>
                  <span className="text-[10px] text-gray-400">Bajo</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 bg-emerald-400 rounded"></div>
                  <span className="text-[10px] text-gray-400">Medio</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 bg-emerald-500 rounded"></div>
                  <span className="text-[10px] text-gray-400">Alto</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 bg-emerald-600 rounded"></div>
                  <span className="text-[10px] text-gray-400">Pico</span>
                </div>
              </div>
              {/* Insights */}
              {(() => {
                const topHours = [...st.hourMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
                if (topHours.length === 0) return null;
                return (
                  <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3 text-xs">
                    <div className="font-semibold text-emerald-700 dark:text-emerald-400 mb-1">💡 Horarios pico identificados</div>
                    <div className="space-y-0.5 text-emerald-600 dark:text-emerald-300 text-[10px]">
                      {topHours.map(([key, count]) => {
                        const [dayIdx, hour] = key.split('-').map(Number);
                        return (
                          <div key={key}>
                            • <strong>{DAYS[dayIdx]} {hour.toString().padStart(2, '0')}:00-{(hour + 1).toString().padStart(2, '0')}:00</strong> - {count} ventas
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 text-emerald-700 dark:text-emerald-400 text-[10px]">
                      → Asegurar disponibilidad máxima de personal y stock en estos horarios.
                    </div>
                  </div>
                );
              })()}
            </div>
          </Card>

          {/* Conversion Funnel */}
          <Card title="Funnel de Conversión" icon={TrendingDown}>
            {st.conversionFunnelData[4].count === 0 ? <Empty text="Sin pedidos en el periodo" /> : (
              <div className="space-y-3 sm:space-y-6">
                {/* Visual Funnel Chart */}
                <div className="space-y-0">
                  {st.conversionFunnelData.map((stage, idx) => {
                    const maxCount = st.conversionFunnelData[0].count;
                    const widthPct = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
                    const prevStage = st.conversionFunnelData[idx - 1];
                    const dropoffRate = prevStage && prevStage.count > 0
                      ? ((prevStage.count - stage.count) / prevStage.count) * 100
                      : 0;
                    const iconMap: Record<number, LucideIcon> = {
                      0: Users, 1: ShoppingCart, 2: ShoppingBasket, 3: CreditCard, 4: CheckCircle2
                    };
                    const StageIcon = iconMap[idx] || Target;
                    
                    return (
                      <div key={stage.label} className="relative">
                        <div className="flex flex-wrap items-center gap-3 mb-1.5">
                          <StageIcon className={cn("h-4 w-4", idx === 4 ? "text-emerald-500" : "text-gray-400")} />
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{stage.label}</span>
                          {idx > 0 && dropoffRate > 0 && (
                            <span className="text-[10px] text-red-500 font-semibold ml-auto">
                              -{dropoffRate.toFixed(1)}% abandono
                            </span>
                          )}
                        </div>
                        <div className="relative h-14 mb-3 flex items-center justify-center">
                          <div 
                            className="h-full transition-all rounded-lg shadow-sm overflow-hidden"
                            style={{ 
                              width: `${Math.max(widthPct, 15)}%`,
                              background: `linear-gradient(135deg, ${stage.color} 0%, ${stage.color}dd 100%)`,
                              clipPath: idx === 4 ? 'none' : 'polygon(5% 0%, 95% 0%, 100% 100%, 0% 100%)'
                            }}
                          >
                            <div className="absolute inset-0 bg-linear-to-br from-white/20 to-transparent" />
                            <div className="relative h-full flex flex-wrap items-center justify-center gap-2 text-white">
                              <span className="font-bold text-lg">{stage.count.toLocaleString()}</span>
                              {prevStage && (
                                <span className="text-xs opacity-90">
                                  ({prevStage.count > 0 ? ((stage.count / prevStage.count) * 100).toFixed(0) : 0}%)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Metrics Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                  <div className="bg-linear-to-br from-blue-50 to-blue-50/50 dark:from-blue-950/30 dark:to-blue-950/10 rounded-xl p-3">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Target className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide">Conversión Total</span>
                    </div>
                    <div className="text-xl sm:text-2xl font-extrabold text-blue-700 dark:text-blue-300">
                      {st.overallConversionRate.toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-blue-600/70 dark:text-blue-400/70 mt-0.5">
                      Pedidos / Visitas
                    </div>
                  </div>

                  <div className="bg-linear-to-br from-amber-50 to-amber-50/50 dark:from-amber-950/30 dark:to-amber-950/10 rounded-xl p-3">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <ShoppingCart className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Abandono Carrito</span>
                    </div>
                    <div className="text-xl sm:text-2xl font-extrabold text-amber-700 dark:text-amber-300">
                      {st.basketAbandonmentRate.toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-amber-600/70 dark:text-amber-400/70 mt-0.5">
                      Carritos no finalizados
                    </div>
                  </div>

                  <div className="bg-linear-to-br from-emerald-50 to-emerald-50/50 dark:from-emerald-950/30 dark:to-emerald-950/10 rounded-xl p-3">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">Checkout</span>
                    </div>
                    <div className="text-xl sm:text-2xl font-extrabold text-emerald-700 dark:text-emerald-300">
                      {st.checkoutCompletionRate.toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70 mt-0.5">
                      Tasa de finalización
                    </div>
                  </div>
                </div>

                {/* Insights */}
                <div className="bg-blue-50/50 dark:bg-blue-950/20 rounded-lg p-3 text-xs border border-blue-100 dark:border-blue-900/30">
                  <div className="font-semibold text-blue-700 dark:text-blue-400 mb-1.5 flex items-center gap-1.5">
                    <Lightbulb className="h-3.5 w-3.5" />
                    Insights de conversión
                  </div>
                  <div className="space-y-1 text-blue-600 dark:text-blue-300 text-[10px]">
                    {st.basketAbandonmentRate > 40 && (
                      <div>• <strong>Alta tasa de abandono de carrito ({st.basketAbandonmentRate.toFixed(0)}%)</strong> - Considera revisar el proceso de checkout y ofrecer descuentos o envío gratis.</div>
                    )}
                    {st.checkoutCompletionRate < 70 && (
                      <div>• <strong>Baja tasa de finalización de checkout ({st.checkoutCompletionRate.toFixed(0)}%)</strong> - Simplifica el formulario o agrega más métodos de pago.</div>
                    )}
                    {st.overallConversionRate > 15 && (
                      <div>• <strong>¡Excelente tasa de conversión!</strong> - Mantén la estrategia actual y considera escalar el tráfico.</div>
                    )}
                    {st.overallConversionRate < 10 && st.overallConversionRate > 0 && (
                      <div>• <strong>Conversión baja ({st.overallConversionRate.toFixed(1)}%)</strong> - Optimiza landing pages, mejora fotos de productos y clarifica propuesta de valor.</div>
                    )}
                    <div className="pt-1 mt-1 border-t border-blue-200/50 dark:border-blue-800/50 text-blue-500 dark:text-blue-400\">
                      💡 Nota: Datos del funnel son estimaciones basadas en pedidos completados. Implementa analytics real para métricas precisas.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Card>

          <div className="grid lg:grid-cols-2 gap-3">
            <Card title="Por categoría" icon={ShoppingBasket}>
              {st.catSales.length===0?<Empty />:(
                <div className="space-y-2.5">
                  {st.catSales.map(c => {
                    const mx = st.catSales[0]?.total??1;
                    return (
                      <div key={c.cat}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-gray-600 dark:text-gray-400">{c.label}</span>
                          <span className="font-semibold text-gray-800 dark:text-foreground">{fmt(c.total)}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 dark:bg-accent rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{width:`${(c.total/mx)*100}%`,background:c.color}} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card title="Métodos de pago" icon={CreditCard}>
              {st.payments.length===0?<Empty />:(
                <div className="flex flex-wrap items-center gap-6 justify-center">
                  <Donut data={st.payments} total={st.payTotal} size={120} />
                  <div className="space-y-2">
                    {st.payments.map(p => (
                      <div key={p.method} className="flex flex-wrap items-center gap-2 text-xs">
                        <div className="w-2.5 h-2.5 rounded-full" style={{background:p.color}} />
                        <span className="text-gray-500 w-20">{p.label}</span>
                        <span className="font-semibold text-gray-800 dark:text-foreground">{fmt(p.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>

          <Card title="Horas pico" icon={Clock}>
            <div className="overflow-x-auto">
              <div className="min-w-80">
                <div className="flex flex-wrap gap-0.5 mb-0.5">
                  <div className="w-8 shrink-0" />
                  {Array.from({length:14},(_,i)=>i+7).map(h => (
                    <div key={h} className="flex-1 text-center text-xs text-gray-300 font-mono">{h}</div>
                  ))}
                </div>
                {[1,2,3,4,5,6,0].map(day => (
                  <div key={day} className="flex flex-wrap gap-0.5 mb-0.5">
                    <div className="w-8 shrink-0 text-xs text-gray-400 flex items-center">{DAYS[day]}</div>
                    {Array.from({length:14},(_,i)=>i+7).map(hour => {
                      const count = st.hourMap.get(`${day}-${hour}`)??0;
                      const int = st.maxHeat>0?count/st.maxHeat:0;
                      return (
                        <div key={hour} className="flex-1 aspect-square rounded-sm"
                          style={{background:int===0?"#f9fafb":`rgba(45,106,79,${0.12+int*0.88})`}}
                          title={`${DAYS[day]} ${hour}:00 — ${count}`} />
                      );
                    })}
                  </div>
                ))}
                <div className="flex items-center justify-end gap-1.5 mt-2">
                  <span className="text-xs text-gray-300">Menos</span>
                  {[0,0.25,0.5,0.75,1].map((v,i) => (
                    <div key={i} className="w-3 h-3 rounded-sm" style={{background:v===0?"#f9fafb":`rgba(45,106,79,${0.12+v*0.88})`}} />
                  ))}
                  <span className="text-xs text-gray-300">Más</span>
                </div>
              </div>
            </div>
          </Card>

          <Card title="Embudo de pedidos" icon={ShoppingCart}>
            {st.funnelData[0].count === 0 ? <Empty text="Sin pedidos en el periodo" /> : (
              <div className="space-y-3">
                {st.funnelData.map((step) => {
                  const pct = st.funnelData[0].count > 0 ? (step.count / st.funnelData[0].count) * 100 : 0;
                  return (
                    <div key={step.label}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-600 dark:text-gray-400 font-medium">{step.label}</span>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-gray-400">{pct.toFixed(0)}%</span>
                          <span className="font-semibold text-gray-800 dark:text-foreground w-6 text-right">{step.count}</span>
                        </div>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-accent rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{width:`${Math.max(pct,2)}%`,background:step.color}} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Ventas recientes" icon={Receipt}>
            {/* G2 — Filter pills */}
            <div className="flex items-center gap-1.5 mb-3">
              {(["all","pendiente","en_camino","entregado"] as const).map(f => (
                <button key={f} onClick={() => { setRecentFilter(f); setRecentPage(1); }}
                  className={cn("px-2.5 py-1 rounded-full text-[10px] font-bold transition-all border",
                    recentFilter === f
                      ? "bg-gray-900 dark:bg-foreground text-white dark:text-card border-transparent"
                      : "bg-white dark:bg-card text-gray-400 border-gray-200 dark:border-card-border hover:text-gray-600"
                  )}>
                  {f === "all" ? "Todos" : f === "pendiente" ? "Pendiente" : f === "en_camino" ? "En camino" : "Entregado"}
                </button>
              ))}
              {/* N4 — Date range filter */}
              <div className="flex items-center gap-1 ml-auto">
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="px-1.5 py-0.5 rounded-md border border-gray-200 dark:border-card-border bg-white dark:bg-card text-[10px] text-gray-600 dark:text-foreground" />
                <span className="text-gray-300 text-[10px]">→</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="px-1.5 py-0.5 rounded-md border border-gray-200 dark:border-card-border bg-white dark:bg-card text-[10px] text-gray-600 dark:text-foreground" />
                {(dateFrom || dateTo) && (
                  <button onClick={() => { setDateFrom(""); setDateTo(""); }}
                    className="text-[10px] text-red-400 hover:text-red-600 font-bold">✕</button>
                )}
              </div>
            </div>
            {(() => {
              const filteredRecent = st.recent
                .filter(o => recentFilter === "all" || o.status === recentFilter)
                .filter(o => {
                  if (!dateFrom && !dateTo) return true;
                  const od = o.createdAt.slice(0,10);
                  if (dateFrom && od < dateFrom) return false;
                  if (dateTo && od > dateTo) return false;
                  return true;
                })
                .filter(o => !dashSearch ||
                  o.customer.name.toLowerCase().includes(dashSearch.toLowerCase()) ||
                  (o.customer.phone ?? "").includes(dashSearch) ||
                  o.id.toLowerCase().includes(dashSearch.toLowerCase())
                );
              const RECENT_PER_PAGE = 15;
              const totalRecentPages = Math.max(1, Math.ceil(filteredRecent.length / RECENT_PER_PAGE));
              const safePage = Math.min(recentPage, totalRecentPages);
              const pagedRecent = filteredRecent.slice((safePage - 1) * RECENT_PER_PAGE, safePage * RECENT_PER_PAGE);
              return filteredRecent.length===0?<Empty text="Sin resultados" />:(
              <div>
              {/* U3: Bulk action bar */}
              {selectedOrders.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 mb-3 p-2.5 rounded-xl bg-primary/5 border border-primary/20">
                  <span className="text-xs font-bold text-primary">{selectedOrders.size} seleccionado{selectedOrders.size > 1 ? "s" : ""}</span>
                  <div className="flex flex-wrap gap-1 ml-auto">
                    {(["confirmado","en_camino","entregado","cancelado"] as const).map(s => (
                      <button key={s} onClick={() => handleBulkStatus(s)} disabled={bulkUpdating}
                        className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white dark:bg-card border border-gray-200 dark:border-card-border hover:border-primary hover:text-primary text-gray-500 transition-colors disabled:opacity-50">
                        {s === "confirmado" ? "✓ Confirmar" : s === "en_camino" ? "🚚 Despachar" : s === "entregado" ? "✓ Entregado" : "✕ Cancelar"}
                      </button>
                    ))}
                    <button onClick={() => setSelectedOrders(new Set())} className="text-[10px] font-bold px-2 py-1 text-gray-400 hover:text-gray-600">Limpiar</button>
                  </div>
                </div>
              )}
              <div className="overflow-x-auto -mx-4">
                <table className="w-full min-w-[600px] text-xs">
                  <thead>
                    <tr className="text-gray-400 dark:text-muted font-medium border-b border-gray-50 dark:border-card-border">
                      <th className="w-8 px-2 py-2">
                        <input type="checkbox"
                          checked={filteredRecent.length > 0 && filteredRecent.every(o => selectedOrders.has(o.id))}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedOrders(new Set(filteredRecent.map(o => o.id)));
                            else setSelectedOrders(new Set());
                          }}
                          className="rounded border-gray-300 accent-primary"
                        />
                      </th>
                      <th className="text-left px-2 sm:px-4 py-1.5 sm:py-2">Fecha</th>
                      <th className="text-left px-2 sm:px-4 py-1.5 sm:py-2">Cliente</th>
                      <th className="text-left px-2 sm:px-4 py-1.5 sm:py-2 hidden sm:table-cell">Detalle</th>
                      <th className="text-left px-2 sm:px-4 py-1.5 sm:py-2">Pago</th>
                      <th className="text-left px-2 sm:px-4 py-1.5 sm:py-2">Estado</th>
                      <th className="text-right px-2 sm:px-4 py-1.5 sm:py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRecent.map(o => (
                      <Fragment key={o.id}>
                      <tr className="border-b border-gray-50 dark:border-card-border last:border-0 hover:bg-gray-50/50 dark:hover:bg-accent/50">
                        {/* U3: Checkbox */}
                        <td className="w-8 px-2 py-2">
                          <input type="checkbox" checked={selectedOrders.has(o.id)} onChange={() => toggleOrderSelection(o.id)} className="rounded border-gray-300 accent-primary" />
                        </td>
                        <td className="px-2 sm:px-4 py-1.5 sm:py-2 text-gray-500 dark:text-muted whitespace-nowrap">
                          <div>{fmtDate(o.createdAt)}</div>
                          <div className="text-gray-300">{fmtTime(o.createdAt)}</div>
                          {/* V1: Elapsed timer for active orders */}
                          {(o.status === "pendiente" || o.status === "confirmado" || o.status === "en_camino") && (
                            <ElapsedTimer createdAt={o.createdAt} />
                          )}
                          {/* Y3: Toggle history */}
                          {o.statusHistory && o.statusHistory.length > 0 && (
                            <button onClick={() => toggleHistory(o.id)} className="text-[9px] text-primary font-semibold hover:underline mt-0.5">
                              {expandedHistory.has(o.id) ? "Ocultar" : "Historial"}
                            </button>
                          )}
                        </td>
                        <td className="px-2 sm:px-4 py-1.5 sm:py-2">
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-gray-700 dark:text-foreground">{o.customer.name}</span>
                            {/* J3 — New client badge */}
                            {o.customer.phone && (() => {
                              const otherOrders = orders.filter(ord => ord.id !== o.id && ord.customer.phone === o.customer.phone);
                              return otherOrders.length === 0 ? <span className="text-[9px] bg-indigo-50 text-indigo-600 font-bold px-1.5 py-0.5 rounded-full" title="Primera compra">🆕</span> : null;
                            })()}
                          </div>
                          {o.customer.phone && <div className="text-gray-300 font-mono">{o.customer.phone}</div>}
                          {/* E1 — WA quick contact */}
                          {o.customer.phone && (
                            <a
                              href={`https://wa.me/51${o.customer.phone.replace(/\D/g,"")}?text=${encodeURIComponent(`Hola ${o.customer.name}, sobre tu pedido #${o.id.slice(-6)} en Bodega San Martín 🛒`)}`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-[9px] text-emerald-600 font-bold hover:underline mt-0.5 flex items-center gap-0.5"
                              title="Contactar por WhatsApp"
                            >📲 WA</a>
                          )}
                        </td>
                        <td className="px-2 sm:px-4 py-1.5 sm:py-2 text-gray-400 hidden sm:table-cell max-w-40 truncate">
                          {o.items.map(i=>`${i.quantity}× ${i.name}`).join(", ")}
                        </td>
                        <td className="px-2 sm:px-4 py-1.5 sm:py-2">
                          <DBadge color={o.paymentMethod==="yape"?"purple":"green"}>
                            {o.paymentMethod==="yape"?"Yape":"Efectivo"}
                          </DBadge>
                        </td>
                        <td className="px-2 sm:px-4 py-1.5 sm:py-2">
                          {(() => {
                            const effStatus = (quickStatusMap[o.id] ?? o.status) as Order["status"];
                            const NEXT: Partial<Record<Order["status"], { s: Order["status"]; label: string }>> = {
                              pendiente:  { s: "confirmado", label: "✓ Confirmar" },
                              confirmado: { s: "en_camino",  label: "🚚 Despachar" },
                              en_camino:  { s: "entregado",  label: "✓ Entregado" },
                            };
                            const next = NEXT[effStatus];
                            return (
                              <div className="flex items-center gap-1.5">
                                <DBadge color={effStatus==="entregado"?"green":effStatus==="cancelado"?"red":effStatus==="pendiente"?"amber":"blue"}>
                                  {effStatus==="pendiente"?"Pendiente":effStatus==="confirmado"?"Confirmado":
                                   effStatus==="en_camino"?"En camino":effStatus==="entregado"?"Entregado":"Cancelado"}
                                </DBadge>
                                {next && (
                                  <button
                                    onClick={() => handleQuickStatus(o.id, next.s)}
                                    disabled={changingStatusId === o.id}
                                    className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-accent hover:bg-primary/10 hover:text-primary text-gray-500 transition-colors disabled:opacity-50 whitespace-nowrap"
                                    title={`Cambiar a ${next.s}`}
                                  >
                                    {changingStatusId === o.id ? "…" : next.label}
                                  </button>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-2 sm:px-4 py-1.5 sm:py-2 text-right font-semibold text-gray-800 dark:text-foreground">
                          <span>{fmt(o.total)}</span>
                          <button onClick={() => printTicket(o)} className="ml-1.5 text-gray-300 hover:text-primary transition-colors" title="Imprimir comanda">🖨️</button>
                        </td>
                      </tr>
                      {/* U2: Admin note row */}
                      <tr className="border-b border-gray-50 dark:border-card-border">
                        <td colSpan={7} className="px-4 py-1">
                          <input
                            type="text"
                            placeholder="Nota interna…"
                            value={adminNotes[o.id] ?? o.adminNote ?? ""}
                            onChange={(e) => saveAdminNote(o.id, e.target.value)}
                            className="w-full text-[10px] text-gray-500 dark:text-muted bg-transparent border-none outline-none placeholder:text-gray-300 dark:placeholder:text-gray-600"
                          />
                        </td>
                      </tr>
                      {/* Y3: Status history timeline */}
                      {expandedHistory.has(o.id) && o.statusHistory && o.statusHistory.length > 0 && (
                        <tr className="border-b border-gray-50 dark:border-card-border bg-gray-50/50 dark:bg-surface/30">
                          <td colSpan={7} className="px-3 sm:px-6 py-2">
                            <div className="flex items-center gap-3 flex-wrap">
                              {o.statusHistory.map((h, hi) => (
                                <div key={hi} className="flex items-center gap-1.5">
                                  <div className="w-2 h-2 rounded-full bg-primary" />
                                  <span className="text-[10px] font-semibold text-foreground capitalize">{h.status.replace("_", " ")}</span>
                                  <span className="text-[9px] text-muted">{fmtDate(h.at)} {fmtTime(h.at)}</span>
                                  {hi < o.statusHistory!.length - 1 && <span className="text-gray-300 dark:text-gray-600">→</span>}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalRecentPages > 1 && (
                <div className="flex items-center justify-between mt-3 px-1">
                  <span className="text-xs text-gray-400 dark:text-muted">
                    {filteredRecent.length} pedidos &middot; pág. {safePage} de {totalRecentPages}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => setRecentPage(p => Math.max(1, p - 1))}
                      disabled={safePage === 1}
                      className="px-3 py-1 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-accent text-gray-600 dark:text-muted hover:bg-gray-200 dark:hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >&lsaquo; Ant</button>
                    <button
                      onClick={() => setRecentPage(p => Math.min(totalRecentPages, p + 1))}
                      disabled={safePage === totalRecentPages}
                      className="px-3 py-1 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-accent text-gray-600 dark:text-muted hover:bg-gray-200 dark:hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >Sig &rsaquo;</button>
                  </div>
                </div>
              )}
              </div>
              );
            })()}
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* PRODUCTOS                                                          */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {(expandAll || section === "productos") && (
        <div className={cn("space-y-4", expandAll && "bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-4")}>
          {expandAll && (
            <div className="flex flex-wrap items-center gap-2 mb-4 pb-3 border-b border-gray-100 dark:border-card-border">
              <div className="w-7 h-7 rounded-lg bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center">
                <TrendingUp className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
              </div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-foreground">Productos</h3>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <Kpi label="Prods. Activos" value={String(st.activeProducts)} icon={Package} accent="text-blue-500" />
            <Kpi label="Uds. Vendidas" value={String(st.uds)} icon={ShoppingCart} accent="text-emerald-500" />
            <Kpi label="Sin Movimiento" value={String(st.sinMov.length)} icon={Timer} accent={st.sinMov.length>5?"text-amber-500":"text-emerald-500"} />
          </div>

          <Card title="Top 10 productos" icon={TrendingUp}
            action={
              <div className="flex items-center bg-gray-100 dark:bg-accent rounded-md p-0.5">
                {(["revenue","profit","units"] as const).map(t => (
                  <button key={t} onClick={()=>setTopTab(t)}
                    className={cn("px-2 py-0.5 rounded text-xs font-semibold transition-all",
                      topTab===t?"bg-white dark:bg-card text-gray-800 dark:text-foreground shadow-sm":"text-gray-400 dark:text-muted"
                    )}>{t==="revenue"?"Ingreso":t==="profit"?"Utilidad":"Uds."}</button>
                ))}
              </div>
            }>
            {topList.length===0?<Empty />:(
              <div className="space-y-2">
                {topList.map((p,i) => {
                  const val = topTab==="units"?p.units:topTab==="profit"?p.profit:p.revenue;
                  return (
                    <div key={p.id} className="flex flex-wrap items-center gap-2.5">
                      <span className={cn("w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                        i<3?"bg-gray-900 dark:bg-foreground text-white dark:text-background":"bg-gray-100 dark:bg-accent text-gray-400 dark:text-muted"
                      )}>{i+1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between mb-0.5">
                          <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{p.name}</span>
                          <span className="text-xs font-semibold text-gray-900 dark:text-foreground ml-2 shrink-0">
                            {topTab==="units"?`${val} uds`:fmt(val)}
                          </span>
                        </div>
                        <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{width:`${(val/topMax)*100}%`,background:i<3?"#111827":"#d1d5db"}} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Pareto ABC Analysis */}
          <Card title="Análisis Pareto (80/20)" icon={Target}>
            <div className="space-y-4">
              {/* ABC Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3">
                  <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1">Clase A</div>
                  <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{st.classA.length}</div>
                  <div className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70">~80% ventas</div>
                </div>
                <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3">
                  <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">Clase B</div>
                  <div className="text-lg font-bold text-blue-700 dark:text-blue-300">{st.classB.length}</div>
                  <div className="text-[10px] text-blue-600/70 dark:text-blue-400/70">~15% ventas</div>
                </div>
                <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3">
                  <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Clase C</div>
                  <div className="text-lg font-bold text-gray-700 dark:text-gray-300">{st.classC.length}</div>
                  <div className="text-[10px] text-gray-600/70 dark:text-gray-400/70">~5% ventas</div>
                </div>
              </div>

              {/* Pareto Chart */}
              {st.paretoChartData.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Curva de Pareto (Top 20 productos)</div>
                  <div className="relative h-48 flex flex-wrap items-end gap-1 pb-6">
                    {/* Cumulative line overlay */}
                    <svg className="absolute inset-0 pointer-events-none" style={{ width: "100%", height: "100%" }}>
                      <polyline
                        points={st.paretoChartData.map((p, i) => {
                          const x = (i / (st.paretoChartData.length - 1)) * 100;
                          const y = 100 - (p.cumulativePct / 100) * 80; // 80% of height
                          return `${x}%,${y}%`;
                        }).join(" ")}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="2"
                        className="opacity-80"
                      />
                    </svg>
                    {/* Bars */}
                    {st.paretoChartData.map((p) => (
                      <div key={p.id} className="flex-1 flex flex-col items-center group relative">
                        <div
                          className={cn("w-full rounded-t transition-all", 
                            p.abcClass === "A" ? "bg-emerald-500" : p.abcClass === "B" ? "bg-blue-500" : "bg-gray-400"
                          )}
                          style={{ height: `${(p.revenue / st.paretoChartData[0].revenue) * 100}%` }}
                        />
                        {/* Tooltip on hover */}
                        <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10">
                          <div className="font-semibold">{p.name}</div>
                          <div>Rev: {fmt(p.revenue)} ({p.revenuePct.toFixed(1)}%)</div>
                          <div>Acum: {p.cumulativePct.toFixed(1)}%</div>
                          <div className={cn("font-bold", p.abcClass === "A" ? "text-emerald-400" : p.abcClass === "B" ? "text-blue-400" : "text-gray-400")}>Clase {p.abcClass}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Legend */}
                  <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-1.5 text-xs">
                      <div className="w-3 h-3 bg-emerald-500 rounded"></div>
                      <span className="text-gray-600 dark:text-gray-400">A (críticos)</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <div className="w-3 h-3 bg-blue-500 rounded"></div>
                      <span className="text-gray-600 dark:text-gray-400">B (importantes)</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <div className="w-3 h-3 bg-gray-400 rounded"></div>
                      <span className="text-gray-600 dark:text-gray-400">C (marginales)</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs ml-auto">
                      <div className="w-3 h-0.5 bg-amber-500"></div>
                      <span className="text-gray-600 dark:text-gray-400">% Acumulado</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Action insights */}
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 text-xs">
                <div className="font-semibold text-blue-700 dark:text-blue-400 mb-1">💡 Recomendaciones</div>
                <ul className="space-y-0.5 text-blue-600 dark:text-blue-300 text-[10px]">
                  <li>• <strong>Clase A:</strong> Nunca dejar agotar. Prioridad en inventario y proveedores.</li>
                  <li>• <strong>Clase B:</strong> Mantener stock moderado. Revisar rotación mensual.</li>
                  <li>• <strong>Clase C:</strong> Stock mínimo. Considerar eliminar si no rotan.</li>
                </ul>
              </div>
            </div>
          </Card>

          <Card title="Ventas por categoría" icon={ShoppingBasket}>
            {st.catSales.length===0?<Empty />:(
              <div className="space-y-2.5">
                {st.catSales.map(c => {
                  const mx = st.catSales[0]?.total??1;
                  return (
                    <div key={c.cat}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-600 dark:text-gray-400">{c.label}</span>
                        <span className="font-semibold text-gray-800 dark:text-foreground">{fmt(c.total)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 dark:bg-accent rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{width:`${(c.total/mx)*100}%`,background:c.color}} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Sprint 3: Product Affinity / Cross-sell */}
          {st.productAffinities.length > 0 && (
            <Card title="Se compran juntos (Cross-sell)" icon={ShoppingCart}>
              <div className="space-y-2">
                {st.productAffinities.map((pair, i) => (
                  <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-accent/40 border border-gray-100 dark:border-card-border">
                    <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                      <span className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                        i < 3 ? "bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300" : "bg-gray-100 dark:bg-accent text-gray-400"
                      )}>{i+1}</span>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{pair.a}</span>
                        <span className="text-[10px] text-gray-400 shrink-0">+</span>
                        <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{pair.b}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <div className="h-1.5 w-12 bg-gray-100 dark:bg-accent rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-violet-500" style={{width:`${(pair.count / st.productAffinities[0].count) * 100}%`}} />
                      </div>
                      <span className="text-xs font-semibold text-violet-600 dark:text-violet-400 w-8 text-right">{pair.count}×</span>
                    </div>
                  </div>
                ))}
                <div className="bg-violet-50 dark:bg-violet-950/30 rounded-lg p-3 text-xs mt-1">
                  <div className="font-semibold text-violet-700 dark:text-violet-400 mb-1">💡 Oportunidad de venta</div>
                  <p className="text-violet-600 dark:text-violet-300 text-[10px]">
                    Estos productos se compran juntos frecuentemente. Crea combos o colócalos cerca en el local para impulsar ventas cruzadas.
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* INVENTARIO                                                         */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {(expandAll || section === "inventario") && (
        <div className={cn("space-y-4", expandAll && "bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-4")}>
          {expandAll && (
            <div className="flex flex-wrap items-center gap-2 mb-4 pb-3 border-b border-gray-100 dark:border-card-border">
              <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
                <Package className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-foreground">Inventario</h3>
            </div>
          )}
          {/* ── Widgets de lotes (BatchStats + Expiring) ── */}
          <PushNotificationBanner />
          <BatchStatsWidget />
          <ExpiringBatchesAlert />
          <ExpiredBatchesWidget />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Kpi label="Stock Valor." value={fmt(st.stockVal)} icon={DollarSign} accent="text-amber-500" />
            <Kpi label="Stock Crítico" value={String(st.stockCritico.length)} icon={AlertTriangle} accent={st.stockCritico.length>0?"text-red-500":"text-emerald-500"} />
            <Kpi label="Agotados" value={String(st.agotados.length)} icon={PackageX} accent={st.agotados.length>0?"text-red-500":"text-emerald-500"} />
            <Kpi label="Sin Movimiento" value={String(st.sinMov.length)} icon={Timer} accent="text-gray-400" />
          </div>

          <Card title="Productos con stock crítico" icon={AlertTriangle}>
            {st.stockCritico.length===0&&st.agotados.length===0?(
              <div className="py-6 text-center text-xs text-emerald-500 font-medium">✓ Inventario saludable</div>
            ):(
              <div className="space-y-1">
                {st.agotados.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-2 px-3 bg-red-50 dark:bg-red-950/30 rounded-lg">
                    <div>
                      <span className="text-xs font-medium text-gray-700 dark:text-foreground">{p.name}</span>
                      <span className="text-xs text-gray-400 ml-2">{CAT_LABELS[p.category]??p.category}</span>
                    </div>
                    <DBadge color="red">Agotado</DBadge>
                  </div>
                ))}
                {st.stockCritico.filter(p=>(p.stock??0)>0).map(p => (
                  <div key={p.id} className="flex items-center justify-between py-2 px-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                    <div>
                      <span className="text-xs font-medium text-gray-700 dark:text-foreground">{p.name}</span>
                      <span className="text-xs text-gray-400 ml-2">{CAT_LABELS[p.category]??p.category}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {/* E2 — Margin badge */}
                      {p.costPrice != null && p.price > 0 && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                          {Math.round((p.price - p.costPrice) / p.price * 100)}% mg
                        </span>
                      )}
                      {/* J2 — Suggested price (30% margin target) */}
                      {p.costPrice != null && p.costPrice > 0 && (
                        <span className="text-[9px] font-mono text-blue-500" title="Precio sugerido (30% margen)">
                          →S/{(p.costPrice / 0.7).toFixed(2)}
                        </span>
                      )}
                      <span className="text-xs font-semibold text-amber-600">{p.stock}/{p.stockMin} uds</span>
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(`Hola, necesito reponer: ${p.name}. Stock actual: ${p.stock} uds (mínimo: ${p.stockMin}). Por favor confirmar disponibilidad y precio. 📦`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/50 px-1.5 py-0.5 rounded transition-colors"
                        title="Pedir al proveedor por WhatsApp"
                      >
                        📲 Pedir
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Productos sin movimiento" icon={Timer}>
            {st.sinMov.length===0?(
              <div className="py-6 text-center text-xs text-emerald-500 font-medium">✓ Todos con rotación</div>
            ):(
              <div className="space-y-0.5">
                {st.sinMov.slice(0,20).map(p => (
                  <div key={p.id} className="flex items-center justify-between py-1.5 px-2 text-xs rounded hover:bg-gray-50 dark:hover:bg-accent">
                    <span className="text-gray-600 dark:text-gray-400 truncate flex-1">{p.name}</span>
                    <span className="text-gray-300 ml-2">{p.stock??0} uds</span>
                  </div>
                ))}
                {st.sinMov.length>20 && <p className="text-xs text-gray-300 text-center pt-1">+{st.sinMov.length-20} más</p>}
              </div>
            )}
          </Card>

          {/* FASE 6.3: Cross-Sell Recommendations */}
          <Card title="Recomendaciones Cross-Sell" icon={Sparkles}
            action={
              <button onClick={() => setShowCrossSell(!showCrossSell)}
                className="text-xs font-bold text-primary hover:text-primary/80 transition-colors">
                {showCrossSell ? "Ocultar" : "Ver sugerencias"}
              </button>
            }>
            {showCrossSell ? (
              st.crossSellRecommendations.size === 0 ? <Empty text="No hay datos suficientes para recomendaciones" /> : (
                <div className="space-y-3">
                  <p className="text-[10px] text-gray-500 dark:text-muted">
                    Basado en patrones de compra reales. Haz clic en un producto para ver qué productos se compran junto a él.
                  </p>
                  <div className="space-y-2">
                    {[...st.crossSellRecommendations.entries()].slice(0, 10).map(([productId, recommendations]) => {
                      const product = products.find(p => p.id === productId);
                      if (!product) return null;
                      const isExpanded = selectedProductForCrossSell === productId;
                      return (
                        <div key={productId} className="border border-gray-200 dark:border-card-border rounded-lg overflow-hidden">
                          <button
                            onClick={() => setSelectedProductForCrossSell(isExpanded ? null : productId)}
                            className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-accent/50 transition-colors text-left"
                          >
                            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
                              <div className="w-2 h-2 rounded-full bg-violet-500 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-sm text-gray-900 dark:text-foreground truncate">{product.name}</div>
                                <div className="text-[10px] text-gray-500 dark:text-muted">{recommendations.length} productos relacionados</div>
                              </div>
                            </div>
                            <ChevronRight className={cn("h-4 w-4 text-gray-400 transition-transform", isExpanded && "rotate-90")} />
                          </button>
                          {isExpanded && (
                            <div className="border-t border-gray-200 dark:border-card-border bg-gray-50 dark:bg-surface p-3 space-y-2">
                              <div className="text-[10px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">Frecuentemente comprado junto con:</div>
                              {recommendations.map(rec => {
                                const relatedProduct = products.find(p => p.id === rec.productId);
                                if (!relatedProduct) return null;
                                return (
                                  <div key={rec.productId} className="flex items-center justify-between py-2 px-3 bg-white dark:bg-card rounded-lg">
                                    <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                                      <Gift className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                                      <span className="text-xs text-gray-700 dark:text-foreground truncate">{relatedProduct.name}</span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                                      <div className="flex items-center gap-1">
                                        <div className="h-1.5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                          <div className="h-full bg-linear-to-r from-violet-500 to-purple-500 rounded-full" style={{ width: `${rec.confidence}%` }} />
                                        </div>
                                        <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400 w-8 text-right">{rec.confidence}%</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-2.5 text-xs mt-3">
                                <div className="font-semibold text-blue-700 dark:text-blue-400 mb-1">💡 Sugerencia</div>
                                <p className="text-blue-600 dark:text-blue-300 text-[10px]">
                                  Crea un combo especial con estos productos o sugiérelos activamente cuando vendes {product.name}.
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="bg-linear-to-r from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 rounded-xl p-3 border border-violet-200 dark:border-violet-800">
                    <div className="flex flex-wrap items-start gap-2">
                      <Zap className="h-4 w-4 text-violet-600 dark:text-violet-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-violet-700 dark:text-violet-400 text-xs mb-1">Análisis de asociación de productos</div>
                        <p className="text-violet-600 dark:text-violet-300 text-[10px]">
                          El % indica la frecuencia con la que los clientes compran ambos productos juntos. Valores altos (&gt;50%) sugieren alta afinidad.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            ) : (
              <div className="py-6 text-center">
                <Sparkles className="h-12 w-12 text-gray-300 dark:text-muted mx-auto mb-2" />
                <p className="text-xs text-gray-500 dark:text-muted">Haz clic en &quot;Ver sugerencias&quot; para descubrir oportunidades de venta cruzada</p>
              </div>
            )}
          </Card>

          {/* Stock Projection - Intelligent forecasting */}
          <Card title="Proyección de Stock (Próximos 30 días)" icon={TrendingDown}>
            {st.criticalStock.length === 0 && st.needsReorderSoon.length === 0 ? (
              <div className="py-6 text-center text-xs text-emerald-500 font-medium">✓ Stock proyectado saludable</div>
            ) : (
              <div className="space-y-4">
                {/* Critical products (< 7 days) */}
                {st.criticalStock.length > 0 && (
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                      <span className="text-xs font-semibold text-red-600 dark:text-red-400">Crítico (&lt;7 días)</span>
                    </div>
                    <div className="space-y-1.5">
                      {st.criticalStock.map(p => (
                        <div key={p.id} className="flex items-center justify-between py-2 px-3 bg-red-50 dark:bg-red-950/30 rounded-lg">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-gray-700 dark:text-foreground truncate">{p.name}</div>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-gray-500">
                                {p.daysRemaining < 1 ? 'Se agota HOY' : `${Math.floor(p.daysRemaining)} días restantes`}
                              </span>
                              <span className="text-[10px] text-gray-400">
                                • {p.dailyRate.toFixed(1)} uds/día
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <div className="text-right">
                              <div className="text-xs font-semibold text-red-600">{p.stock} uds</div>
                              <div className="text-[9px] text-gray-500">Pedir: {p.suggestedOrderQty}</div>
                            </div>
                            <a
                              href={`https://wa.me/?text=${encodeURIComponent(`🚨 URGENTE: ${p.name}\n\nStock actual: ${p.stock} uds\nSe agota en: ${Math.floor(p.daysRemaining)} días\nCantidad sugerida: ${p.suggestedOrderQty} uds\n\nPor favor confirmar disponibilidad inmediata.`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] font-bold text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded transition-colors"
                              title="Pedir URGENTE por WhatsApp"
                            >
                              🚨 Ordenar
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Warning products (7-14 days) */}
                {st.needsReorderSoon.length > 0 && (
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Clock className="w-4 h-4 text-amber-500" />
                      <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Reordenar pronto (7-14 días)</span>
                    </div>
                    <div className="space-y-1.5">
                      {st.needsReorderSoon.slice(0, 10).map(p => (
                        <div key={p.id} className="flex items-center justify-between py-2 px-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-gray-700 dark:text-foreground truncate">{p.name}</div>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-gray-500">
                                ~{Math.floor(p.daysRemaining)} días restantes
                              </span>
                              <span className="text-[10px] text-gray-400">
                                • {p.dailyRate.toFixed(1)} uds/día
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <div className="text-right">
                              <div className="text-xs font-semibold text-amber-600">{p.stock} uds</div>
                              <div className="text-[9px] text-gray-500">Pedir: {p.suggestedOrderQty}</div>
                            </div>
                            <a
                              href={`https://wa.me/?text=${encodeURIComponent(`📦 Reorden: ${p.name}\n\nStock actual: ${p.stock} uds\nDías restantes: ${Math.floor(p.daysRemaining)}\nCantidad sugerida: ${p.suggestedOrderQty} uds\n\nPor favor confirmar disponibilidad.`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/50 dark:hover:bg-amber-800/50 px-2 py-1 rounded transition-colors"
                              title="Pedir por WhatsApp"
                            >
                              📲 Pedir
                            </a>
                          </div>
                        </div>
                      ))}
                      {st.needsReorderSoon.length > 10 && (
                        <p className="text-xs text-gray-400 text-center pt-1">
                          +{st.needsReorderSoon.length - 10} productos más...
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Info box */}
                <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 text-xs">
                  <div className="font-semibold text-blue-700 dark:text-blue-400 mb-1">💡 Proyección inteligente</div>
                  <p className="text-blue-600 dark:text-blue-300 text-[10px]">
                    Basado en ventas de los últimos 30 días. Las cantidades sugeridas cubren 30 días de demanda proyectada.
                  </p>
                </div>

                {/* Sprint 3: Bulk reorder button */}
                {(st.criticalStock.length + st.needsReorderSoon.length) > 0 && (
                  <div className="border-t border-gray-100 dark:border-card-border pt-3">
                    <button
                      onClick={() => {
                        const allReorder = [...st.criticalStock, ...st.needsReorderSoon];
                        const grouped = new Map<string,typeof allReorder>();
                        allReorder.forEach(p => {
                          const cat = p.category ?? "general";
                          const arr = grouped.get(cat) ?? [];
                          arr.push(p); grouped.set(cat, arr);
                        });
                        let msg = `📦 ORDEN DE COMPRA MASIVA\n📅 ${new Date().toLocaleDateString("es-PE")}\n\n`;
                        let totalItems = 0;
                        grouped.forEach((items, cat) => {
                          msg += `── ${(CAT_LABELS[cat] ?? cat).toUpperCase()} ──\n`;
                          items.forEach(p => {
                            msg += `• ${p.name}: ${p.suggestedOrderQty} uds (stock: ${p.stock}, ${p.daysRemaining < 7 ? "🚨 URGENTE" : "⚠️ pronto"})\n`;
                            totalItems += p.suggestedOrderQty;
                          });
                          msg += "\n";
                        });
                        msg += `────────────────\nTotal: ${allReorder.length} productos, ${totalItems} unidades\n\nPor favor confirmar disponibilidad y costo. 🙏`;
                        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
                      }}
                      className="w-full flex flex-wrap items-center justify-center gap-2 py-3 rounded-xl bg-linear-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold text-sm transition-all shadow-sm hover:shadow-md"
                    >
                      <Truck className="h-4 w-4" />
                      Generar Orden Masiva ({st.criticalStock.length + st.needsReorderSoon.length} productos)
                    </button>
                    <p className="text-[10px] text-gray-400 text-center mt-1.5">
                      Envía una lista completa por WhatsApp con cantidades sugeridas por categoría
                    </p>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* CLIENTES                                                           */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {(expandAll || section === "clientes") && (
        <div className={cn("space-y-4", expandAll && "bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-4")}>
          {expandAll && (
            <div className="flex flex-wrap items-center gap-2 mb-4 pb-3 border-b border-gray-100 dark:border-card-border">
              <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                <Users className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-foreground">Clientes</h3>
            </div>
          )}
          {/* Customer CSV export with filters */}
          {(() => {
            const handleExportCustomers = () => {
              // Build spend map from orders
              const spendMap = new Map<string, number>();
              orders.filter(o => o.status !== "cancelado").forEach(o => {
                if (!o.customer.phone) return;
                spendMap.set(o.customer.phone, (spendMap.get(o.customer.phone) ?? 0) + o.total);
              });
              const getTier = (phone: string) => {
                const spend = spendMap.get(phone) ?? 0;
                if (spend >= 500) return "VIP";
                if (spend >= 200) return "Frecuente";
                if (spend >= 50) return "Regular";
                return "Nuevo";
              };
              const rows = customers.map(c => ({
                telefono: c.phone,
                nombre: c.name,
                ubicacion: c.location,
                registrado: c.createdAt.slice(0, 10),
                gasto_total: (spendMap.get(c.phone) ?? 0).toFixed(2),
                tier: getTier(c.phone),
              }));
              exportToCSV(rows, `clientes_${new Date().toISOString().slice(0, 10)}.csv`);
            };
            return (
              <div className="flex items-center justify-end">
                <button
                  onClick={handleExportCustomers}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-violet-200 dark:border-violet-800/50 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/20 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" /> Exportar clientes CSV
                </button>
              </div>
            );
          })()}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Kpi label="Total Clientes" value={String(st.totalCustomers)} icon={Users} accent="text-violet-500" />
            <Kpi label="Atendidos" value={String(st.clientesAtendidos)} icon={Users} accent="text-indigo-500" />
            <Kpi label="Rating Prom." value={`★ ${st.avgRating.toFixed(1)}`} icon={Star} accent="text-amber-500" />
            <Kpi label="Reseñas" value={String(reviews.length)} icon={Star} accent="text-amber-400" />
          </div>

          <Card title="Clientes más frecuentes" icon={Users}>
            {(() => {
              const clientSpend = new Map<string,{name:string;orders:number;total:number}>();
              orders.filter(o=>o.status!=="cancelado"&&inPeriod(o.createdAt,period)).forEach(o => {
                if(!o.customer.phone) return;
                const e = clientSpend.get(o.customer.phone)??{name:o.customer.name,orders:0,total:0};
                e.orders++;e.total+=o.total;clientSpend.set(o.customer.phone,e);
              });
              const top = [...clientSpend.entries()].map(([ph,x])=>({phone:ph,...x})).sort((a,b)=>b.total-a.total).slice(0,10);
              if(top.length===0) return <Empty text="Sin datos de clientes" />;
              const mx = top[0]?.total??1;
              return (
                <div className="space-y-2">
                  {top.map((c,i) => (
                    <div key={c.phone}>
                      {/* E3 — Clickable client row */}
                      <button
                        onClick={() => setSelectedClientPhone(c.phone === selectedClientPhone ? null : c.phone)}
                        className="flex flex-wrap items-center gap-2.5 w-full text-left hover:bg-gray-50 dark:hover:bg-accent/60 rounded-lg px-1 -mx-1 py-0.5 transition-colors"
                      >
                        <span className={cn("w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                          i<3?"bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300":"bg-gray-100 dark:bg-accent text-gray-400 dark:text-muted"
                        )}>{i+1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between mb-0.5">
                            <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{c.name}</span>
                            <span className="text-xs font-semibold text-gray-900 dark:text-foreground ml-2 shrink-0">{fmt(c.total)} <span className="text-gray-400 font-normal">({c.orders})</span></span>
                          </div>
                          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{width:`${(c.total/mx)*100}%`,background:"#8b5cf6"}} />
                          </div>
                        </div>
                      </button>
                      {selectedClientPhone === c.phone && (() => {
                        const clientOrders = orders.filter(o => o.customer.phone === c.phone).slice(0,5);
                        return (
                          <div className="mt-1.5 mb-1 ml-7 pl-2 border-l-2 border-violet-200 dark:border-violet-800/50 space-y-1">
                            {clientOrders.length === 0
                              ? <p className="text-[10px] text-gray-400">Sin pedidos registrados</p>
                              : clientOrders.map(o => (
                                <div key={o.id} className="flex items-center justify-between text-[10px]">
                                  <span className="text-gray-500">#{o.id.slice(-6)} · {fmtDate(o.createdAt)}</span>
                                  <span className="font-semibold text-gray-700 dark:text-foreground">{fmt(o.total)}</span>
                                </div>
                              ))
                            }
                            <a
                              href={`https://wa.me/51${c.phone.replace(/\D/g,"")}?text=${encodeURIComponent(`Hola ${c.name}, ¡gracias por ser cliente de Bodega San Martín! 🛒`)}`}
                              target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 hover:underline mt-0.5"
                            >📲 Contactar por WA</a>
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              );
            })()}
          </Card>

          <Card title="Nuevos vs Recurrentes" icon={UserCheck}>
            {period === "todo" || st.clientesAtendidos === 0 ? (
              <p className="text-xs text-gray-300 dark:text-muted py-4 text-center">
                {st.clientesAtendidos === 0 ? "Sin clientes en el periodo" : "Selecciona un periodo para ver retención"}
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-6 justify-center py-2">
                <Donut
                  data={[
                    { total: st.newCust, color: "#2d6a4f" },
                    { total: st.returningCust, color: "#10b981" },
                  ].filter(x => x.total > 0)}
                  total={st.clientesAtendidos}
                  size={100}
                />
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0" />
                    <span className="text-gray-500 w-24">Nuevos</span>
                    <span className="font-bold text-gray-800 dark:text-foreground">{st.newCust}</span>
                    <span className="text-gray-400">({st.clientesAtendidos > 0 ? ((st.newCust/st.clientesAtendidos)*100).toFixed(0) : 0}%)</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                    <span className="text-gray-500 w-24">Recurrentes</span>
                    <span className="font-bold text-gray-800 dark:text-foreground">{st.returningCust}</span>
                    <span className="text-gray-400">({st.clientesAtendidos > 0 ? ((st.returningCust/st.clientesAtendidos)*100).toFixed(0) : 0}%)</span>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* FASE 6.1: Cohort Retention Analysis */}
          <Card title="Retención por Cohorte" icon={BarChart3}
            action={
              <button onClick={() => setShowCohortRetention(!showCohortRetention)}
                className="text-xs font-bold text-primary hover:text-primary/80 transition-colors">
                {showCohortRetention ? "Ocultar" : "Ver análisis"}
              </button>
            }>
            {showCohortRetention ? (
              st.cohortData.length === 0 ? <Empty text="No hay datos suficientes para análisis de cohortes" /> : (
                <div className="space-y-4">
                  {/* Retention metrics summary */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    <div className="bg-linear-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950/30 dark:to-emerald-900/20 rounded-lg p-3 text-center">
                      <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mb-0.5">Día 1</div>
                      <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{st.retentionMetrics.day1}%</div>
                    </div>
                    <div className="bg-linear-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/20 rounded-lg p-3 text-center">
                      <div className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 mb-0.5">Día 7</div>
                      <div className="text-lg font-bold text-blue-700 dark:text-blue-300">{st.retentionMetrics.day7}%</div>
                    </div>
                    <div className="bg-linear-to-br from-violet-50 to-violet-100 dark:from-violet-950/30 dark:to-violet-900/20 rounded-lg p-3 text-center">
                      <div className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 mb-0.5">Día 30</div>
                      <div className="text-lg font-bold text-violet-700 dark:text-violet-300">{st.retentionMetrics.day30}%</div>
                    </div>
                  </div>

                  {/* Cohort heatmap table */}
                  <div className="overflow-x-auto -mx-2">
                    <table className="w-full min-w-[600px] text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-card-border">
                          <th className="text-left px-2 py-2 text-gray-500 dark:text-muted font-semibold">Cohorte</th>
                          <th className="text-center px-2 py-2 text-gray-500 dark:text-muted font-semibold">M0</th>
                          <th className="text-center px-2 py-2 text-gray-500 dark:text-muted font-semibold">M1</th>
                          <th className="text-center px-2 py-2 text-gray-500 dark:text-muted font-semibold">M2</th>
                          <th className="text-center px-2 py-2 text-gray-500 dark:text-muted font-semibold">M3</th>
                          <th className="text-center px-2 py-2 text-gray-500 dark:text-muted font-semibold">M4</th>
                          <th className="text-center px-2 py-2 text-gray-500 dark:text-muted font-semibold">M5+</th>
                        </tr>
                      </thead>
                      <tbody>
                        {st.cohortData.map((cohort, idx) => (
                          <tr key={idx} className="border-b border-gray-100 dark:border-card-border/50">
                            <td className="px-2 py-2 font-medium text-gray-700 dark:text-foreground">{cohort.cohortMonth}</td>
                            {[cohort.month0, cohort.month1, cohort.month2, cohort.month3, cohort.month4, cohort.month5plus].map((val, i) => {
                              const color = val >= 50 ? "bg-emerald-500" : val >= 30 ? "bg-green-400" : val >= 15 ? "bg-amber-400" : val > 0 ? "bg-red-400" : "bg-gray-100 dark:bg-accent";
                              const textColor = val >= 15 ? "text-white" : "text-gray-600 dark:text-gray-400";
                              return (
                                <td key={i} className="px-2 py-2 text-center">
                                  <div className={cn("inline-block px-2 py-1 rounded font-bold text-xs", color, textColor)} title={`${val}% retención`}>
                                    {val}%
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 text-xs">
                    <div className="font-semibold text-blue-700 dark:text-blue-400 mb-1">💡 Interpretación</div>
                    <p className="text-blue-600 dark:text-blue-300 text-[10px]">
                      Verde (≥50%): Excelente retención. Naranja (30-49%): Retención aceptable. Rojo (&lt;30%): Requiere acción inmediata. 
                      Los primeros 30 días son críticos para fidelizar clientes.
                    </p>
                  </div>
                </div>
              )
            ) : (
              <div className="py-6 text-center">
                <Users className="h-12 w-12 text-gray-300 dark:text-muted mx-auto mb-2" />
                <p className="text-xs text-gray-500 dark:text-muted">Haz clic en &quot;Ver análisis&quot; para explorar retención por cohorte</p>
              </div>
            )}
          </Card>

          {/* Sprint 3: At-risk VIP Clients */}
          {(st.atRiskClients.length > 0 || st.decliningClients.length > 0) && (
            <Card title="Clientes VIP en riesgo" icon={AlertTriangle}>
              <div className="space-y-3">
                {st.atRiskClients.length > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider mb-2">
                      Sin compras recientes ({st.atRiskClients.length})
                    </div>
                    <div className="space-y-1.5">
                      {st.atRiskClients.slice(0, 8).map(c => (
                        <div key={c.phone} className="flex items-center justify-between py-2 px-3 bg-red-50 dark:bg-red-950/30 rounded-lg">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-gray-700 dark:text-foreground truncate">{c.name}</div>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-gray-500">Gastó {fmt(c.totalSpent)}</span>
                              <span className="text-[10px] text-gray-400">• {c.orderCount} pedidos</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <div className="text-right">
                              <div className="text-xs font-semibold text-red-600">{c.daysSinceLastOrder} días</div>
                              <div className="text-[9px] text-gray-400">sin comprar</div>
                            </div>
                            <a
                              href={`https://wa.me/51${c.phone.replace(/\D/g,"")}?text=${encodeURIComponent(`Hola ${c.name}, ¡te extrañamos en Bodega San Martín! 🛒\n\n¿Necesitas algo? Tenemos novedades y ofertas especiales para ti. 😊`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/50 px-2 py-1 rounded transition-colors"
                            >
                              📲 Contactar
                            </a>
                          </div>
                        </div>
                      ))}
                      {st.atRiskClients.length > 8 && (
                        <p className="text-xs text-gray-400 text-center pt-1">+{st.atRiskClients.length - 8} más</p>
                      )}
                    </div>
                  </div>
                )}
                {st.decliningClients.length > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2">
                      Frecuencia en declive ({st.decliningClients.length})
                    </div>
                    <div className="space-y-1.5">
                      {st.decliningClients.slice(0, 5).map(c => (
                        <div key={c.phone} className="flex items-center justify-between py-2 px-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-gray-700 dark:text-foreground truncate">{c.name}</div>
                            <span className="text-[10px] text-gray-500">{c.orderCount} pedidos totales • Último: hace {c.daysSinceLastOrder} días</span>
                          </div>
                          <a
                            href={`https://wa.me/51${c.phone.replace(/\D/g,"")}?text=${encodeURIComponent(`Hola ${c.name}, esperamos que estés bien. En Bodega San Martín tenemos tus productos favoritos listos para ti. ¿Te enviamos algo? 🚀`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/50 dark:hover:bg-amber-800/50 px-2 py-1 rounded transition-colors shrink-0"
                          >
                            📲 Reactivar
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 text-xs">
                  <div className="font-semibold text-blue-700 dark:text-blue-400 mb-1">💡 Retención proactiva</div>
                  <p className="text-blue-600 dark:text-blue-300 text-[10px]">
                    Los clientes VIP (top 20% en gasto) que no compran en 3+ semanas tienen alto riesgo de irse. Un mensaje personalizado recupera hasta 30% de clientes inactivos.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* V3: Full reviews panel */}
          <Card title="Reseñas de clientes" icon={Star}
            action={
              <div className="flex items-center bg-gray-100 dark:bg-accent rounded-md p-0.5">
                {([0,5,4,3,2,1] as const).map(r => (
                  <button key={r} onClick={() => setReviewFilter(r)}
                    className={cn("px-2 py-0.5 rounded text-xs font-semibold transition-all",
                      reviewFilter === r ? "bg-white dark:bg-card text-gray-800 dark:text-foreground shadow-sm" : "text-gray-400 dark:text-muted"
                    )}>
                    {r === 0 ? "Todas" : `${r}★`}
                  </button>
                ))}
              </div>
            }>
            {(() => {
              const filtered = reviewFilter === 0 ? reviews : reviews.filter(r => r.rating === reviewFilter);
              if (filtered.length === 0) return <Empty text="Sin reseñas" />;
              return (
                <div className="space-y-2.5 max-h-80 overflow-y-auto">
                  {filtered.map(r => (
                    <div key={r.id} className="flex flex-wrap items-start gap-3 py-2.5 px-3 rounded-xl bg-gray-50 dark:bg-accent/40 border border-gray-100 dark:border-card-border">
                      <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-xs font-bold text-amber-600 shrink-0">
                        {r.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-gray-700 dark:text-foreground">{r.name}</span>
                          <span className="text-[10px] text-gray-400">{fmtDate(r.date)}</span>
                        </div>
                        <div className="flex items-center gap-0.5 my-0.5">
                          {Array.from({ length: 5 }).map((_, s) => (
                            <Star key={s} className={cn("h-3 w-3", s < r.rating ? "text-amber-500 fill-amber-500" : "text-gray-200 dark:text-gray-600")} />
                          ))}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-muted">{r.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* COMPRAS                                                            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {(expandAll || section === "compras") && (
        <div className={cn("space-y-4", expandAll && "bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-4")}>
          {expandAll && (
            <div className="flex flex-wrap items-center gap-2 mb-4 pb-3 border-b border-gray-100 dark:border-card-border">
              <div className="w-7 h-7 rounded-lg bg-sky-50 dark:bg-sky-900/30 flex items-center justify-center">
                <Truck className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
              </div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-foreground">Compras</h3>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Kpi label="Total Compras" value={fmt(st.totalPurch)} icon={Truck} accent="text-blue-500" />
            <Kpi label="Proveedores" value={String(st.totalSuppliers)} icon={Truck} accent="text-indigo-500" />
            <Kpi label="Deuda Pend." value={fmt(st.debt)} icon={Banknote} accent={st.debt>0?"text-red-500":"text-emerald-500"} />
            <Kpi label="Ctas. Vencidas" value={String(st.overdue.length)} icon={AlertCircle} accent={st.overdue.length>0?"text-red-500":"text-emerald-500"} />
          </div>

          {st.supPurchases.length > 0 && (
            <Card title="Compras por proveedor" icon={Truck}>
              <div className="space-y-2.5">
                {st.supPurchases.map(s => {
                  const mx = st.supPurchases[0]?.total??1;
                  return (
                    <div key={s.name}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-600 dark:text-gray-400 truncate">{s.name}</span>
                        <span className="font-semibold text-gray-800 dark:text-foreground ml-2">{fmt(s.total)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 dark:bg-accent rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{width:`${(s.total/mx)*100}%`,background:"#2d6a4f"}} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {st.pending.length > 0 && (
            <Card title="Cuentas por pagar" icon={Banknote}>
              <div className="overflow-x-auto -mx-4">
                <table className="w-full min-w-[600px] text-xs">
                  <thead>
                    <tr className="text-gray-400 dark:text-muted font-medium border-b border-gray-50 dark:border-card-border">
                      <th className="text-left px-2 sm:px-4 py-1.5 sm:py-2">Proveedor</th>
                      <th className="text-right px-2 sm:px-4 py-1.5 sm:py-2">Monto</th>
                      <th className="text-right px-2 sm:px-4 py-1.5 sm:py-2">Pagado</th>
                      <th className="text-right px-2 sm:px-4 py-1.5 sm:py-2">Pend.</th>
                      <th className="text-left px-2 sm:px-4 py-1.5 sm:py-2">Vence</th>
                      <th className="text-left px-2 sm:px-4 py-1.5 sm:py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {st.pending.map(p => {
                      const rem = p.amount-p.paidAmount;
                      const over = new Date(p.dueDate)<new Date();
                      return (
                        <tr key={p.id} className={cn("border-b border-gray-50 dark:border-card-border last:border-0",over?"bg-red-50 dark:bg-red-950/30":"")} >
                          <td className="px-2 sm:px-4 py-1.5 sm:py-2 font-medium text-gray-700 dark:text-foreground">{p.supplierName}</td>
                          <td className="px-2 sm:px-4 py-1.5 sm:py-2 text-right text-gray-500">{fmt(p.amount)}</td>
                          <td className="px-2 sm:px-4 py-1.5 sm:py-2 text-right text-emerald-600 font-medium">{fmt(p.paidAmount)}</td>
                          <td className="px-2 sm:px-4 py-1.5 sm:py-2 text-right text-red-600 font-medium">{fmt(rem)}</td>
                          <td className="px-2 sm:px-4 py-1.5 sm:py-2 text-gray-500">{fmtDateFull(p.dueDate)}</td>
                          <td className="px-2 sm:px-4 py-1.5 sm:py-2">
                            <DBadge color={over?"red":p.status==="parcial"?"amber":"gray"}>
                              {over?"Vencido":p.status==="parcial"?"Parcial":"Pendiente"}
                            </DBadge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* CAJA                                                               */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {(expandAll || section === "caja") && (
        <div className={cn("space-y-4", expandAll && "bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-4")}>
          {expandAll && (
            <div className="flex flex-wrap items-center gap-2 mb-4 pb-3 border-b border-gray-100 dark:border-card-border">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                <Banknote className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-foreground">Caja</h3>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Kpi label="Ingresos" value={fmt(st.ventas)} icon={DollarSign} accent="text-emerald-500" delta={st.dVentas} />
            <Kpi label="Egresos" value={fmt(st.totalPurch)} icon={TrendingUp} accent="text-red-500" />
            <Kpi label="Balance" value={fmt(st.ventas-st.totalPurch)} icon={Banknote} accent={st.ventas-st.totalPurch>=0?"text-emerald-500":"text-red-500"} />
            {/* J4 — Net profit KPI */}
            <Kpi label="Ganancia Neta" value={fmt(st.utilidad)} icon={Star} accent={st.utilidad>=0?"text-emerald-500":"text-red-500"} delta={st.dUtilidad} />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Card title="Desglose de pagos" icon={CreditCard}>
              {st.payments.length===0?<Empty />:(
                <div className="space-y-3">
                  {st.payments.map(p => (
                    <div key={p.method} className="flex items-center justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{background:p.color}} />
                        <span className="text-xs text-gray-600">{p.label}</span>
                      </div>
                      <span className="text-xs font-semibold text-gray-800 dark:text-foreground">{fmt(p.total)}</span>
                    </div>
                  ))}
                  <div className="border-t border-gray-100 dark:border-card-border pt-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500">Total</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-foreground">{fmt(st.payTotal)}</span>
                  </div>
                </div>
              )}
            </Card>

            <Card title="Flujo del periodo" icon={BarChart3}>
              <div className="space-y-3">
                <FlowRow label="Ventas netas" value={fmt(st.ventas)} color="text-emerald-600" />
                <FlowRow label="Costo estimado" value={fmt(st.ventas-st.utilidad)} color="text-gray-500" />
                <FlowRow label="Utilidad bruta" value={fmt(st.utilidad)} color="text-blue-600" />
                <div className="border-t border-gray-100 dark:border-card-border pt-2" />
                <FlowRow label="Compras" value={fmt(st.totalPurch)} color="text-red-500" />
                <FlowRow label="Deuda pendiente" value={fmt(st.debt)} color={st.debt>0?"text-red-600":"text-emerald-600"} />
                <div className="border-t border-gray-100 dark:border-card-border pt-2" />
                <FlowRow label="Margen bruto" value={`${st.margen.toFixed(1)}%`} color={st.margen>=25?"text-emerald-600":st.margen>=15?"text-amber-600":"text-red-600"} />
              </div>
            </Card>
          </div>

          {/* Sprint 3: Cash Flow Forecast (7 days) */}
          <Card title="Proyección de Flujo de Caja (7 días)" icon={TrendingUp}>
            <div className="space-y-4">
              {/* Summary row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3 text-center">
                  <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mb-0.5">Ingresos Est.</div>
                  <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{fmt(st.forecastTotalRev)}</div>
                </div>
                <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-3 text-center">
                  <div className="text-[10px] font-semibold text-red-600 dark:text-red-400 mb-0.5">Egresos Est.</div>
                  <div className="text-sm font-bold text-red-700 dark:text-red-300">{fmt(st.forecastTotalExp)}</div>
                </div>
                <div className={cn("rounded-lg p-3 text-center", st.forecastTotalRev - st.forecastTotalExp >= 0 ? "bg-blue-50 dark:bg-blue-950/30" : "bg-amber-50 dark:bg-amber-950/30")}>
                  <div className={cn("text-[10px] font-semibold mb-0.5", st.forecastTotalRev - st.forecastTotalExp >= 0 ? "text-blue-600 dark:text-blue-400" : "text-amber-600 dark:text-amber-400")}>Flujo Neto</div>
                  <div className={cn("text-sm font-bold", st.forecastTotalRev - st.forecastTotalExp >= 0 ? "text-blue-700 dark:text-blue-300" : "text-amber-700 dark:text-amber-300")}>{fmt(st.forecastTotalRev - st.forecastTotalExp)}</div>
                </div>
              </div>

              {/* Daily forecast chart */}
              {st.cashFlowForecast.length > 0 && (() => {
                const maxVal = Math.max(...st.cashFlowForecast.map(f => Math.max(f.estRevenue, f.estExpense)), 1);
                return (
                  <div className="space-y-2">
                    {st.cashFlowForecast.map((f, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-28 truncate">{f.dayLabel}</span>
                          <span className={cn("text-xs font-bold", f.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                            {f.net >= 0 ? "+" : ""}{fmt(f.net)}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 h-3">
                          <div className="flex-1 bg-gray-50 dark:bg-accent rounded-full overflow-hidden relative">
                            <div className="absolute inset-y-0 left-0 bg-emerald-400 dark:bg-emerald-500 rounded-full" style={{width: `${(f.estRevenue / maxVal) * 100}%`}} />
                          </div>
                          <div className="flex-1 bg-gray-50 dark:bg-accent rounded-full overflow-hidden relative">
                            <div className="absolute inset-y-0 left-0 bg-red-400 dark:bg-red-500 rounded-full" style={{width: `${(f.estExpense / maxVal) * 100}%`}} />
                          </div>
                        </div>
                      </div>
                    ))}
                    {/* Legend */}
                    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 pt-2 border-t border-gray-100 dark:border-card-border">
                      <div className="flex items-center gap-1.5 text-xs">
                        <div className="w-3 h-3 bg-emerald-400 rounded-sm" />
                        <span className="text-gray-500">Ingresos</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs">
                        <div className="w-3 h-3 bg-red-400 rounded-sm" />
                        <span className="text-gray-500">Egresos</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Warning if negative cash flow expected */}
              {st.forecastTotalRev - st.forecastTotalExp < 0 && (
                <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 text-xs">
                  <div className="font-semibold text-amber-700 dark:text-amber-400 mb-1">⚠️ Flujo negativo proyectado</div>
                  <p className="text-amber-600 dark:text-amber-300 text-[10px]">
                    Se proyectan más egresos que ingresos esta semana. Considera postergar compras no urgentes o activar promociones para impulsar ventas.
                  </p>
                </div>
              )}
              {st.forecastTotalRev - st.forecastTotalExp >= 0 && (
                <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 text-xs">
                  <div className="font-semibold text-blue-700 dark:text-blue-400 mb-1">💡 Estimación por día de semana</div>
                  <p className="text-blue-600 dark:text-blue-300 text-[10px]">
                    Basado en promedios de ingresos/egresos de los últimos 30 días agrupados por día de la semana.
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
      </BentoGrid>
      </>)}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

/* BentoGrid layout for expandAll mode */
function BentoGrid({ active, children }: { active: boolean; children: React.ReactNode }) {
  if (active) return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5 items-start">
      {children}
    </div>
  );
  return <>{children}</>;
}

/* Sparkline component for KPI cards */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length === 0) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * 80;
    const y = 24 - ((val - min) / range) * 20;
    return `${x},${y}`;
  }).join(' ');
  
  // Infer color value from Tailwind class
  const colorMap: Record<string, string> = {
    "emerald-500": "#10b981",
    "blue-500": "#3b82f6",
    "violet-500": "#8b5cf6",
    "indigo-500": "#2d6a4f",
    "cyan-500": "#06b6d4",
    "amber-500": "#f59e0b",
    "red-500": "#ef4444",
  };
  const strokeColor = colorMap[color] || "#2d6a4f";
  
  return (
    <svg width="80" height="24" className="opacity-60">
      <polyline
        points={points}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* AA4: Animated count-up hook */
function useCountUp(target: string, duration = 600) {
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);
  useEffect(() => {
    if (prevRef.current === target) return;
    prevRef.current = target;
    const numMatch = target.match(/([\d,.]+)/);
    if (!numMatch) {
      const rafId = requestAnimationFrame(() => setDisplay(target));
      return () => cancelAnimationFrame(rafId);
    }
    const endVal = parseFloat(numMatch[1].replace(/,/g, ""));
    if (isNaN(endVal)) {
      const rafId = requestAnimationFrame(() => setDisplay(target));
      return () => cancelAnimationFrame(rafId);
    }
    const prefix = target.slice(0, numMatch.index!);
    const suffix = target.slice(numMatch.index! + numMatch[1].length);
    const hasDecimal = numMatch[1].includes(".");
    const start = performance.now();
    let rafId: number;
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = eased * endVal;
      setDisplay(`${prefix}${hasDecimal ? current.toFixed(2) : Math.round(current).toLocaleString()}${suffix}`);
      if (progress < 1) rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [target, duration]);
  return display;
}

function Kpi({ label, value, icon: Icon, accent, delta, sparklineData, invertTrend }: { label: string; value: string; icon: React.ComponentType<{className?:string}>; accent: string; delta?: number | null; sparklineData?: number[]; invertTrend?: boolean }) {
  const animatedValue = useCountUp(value);
  // invertTrend: when true, a negative delta is "good" (green) and positive is "bad" (red)
  // e.g., for Cancelados — fewer is better
  const isPositive = delta != null ? (invertTrend ? delta <= 0 : delta >= 0) : false;
  const arrowUp = delta != null ? delta >= 0 : false;
  return (
    <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border px-2 sm:px-4 py-2 sm:py-3.5 hover:border-gray-200 dark:hover:border-gray-600 transition-all relative overflow-hidden">
      {/* Visual gradient indicator on top edge for significant changes */}
      {delta != null && Math.abs(delta) >= 10 && (
        <div className={cn("absolute top-0 left-0 right-0 h-1", isPositive ? "bg-linear-to-r from-emerald-400 to-green-500" : "bg-linear-to-r from-red-400 to-red-500")} />
      )}
      <p className="text-xs font-medium text-gray-400 dark:text-muted mb-2.5 truncate">{label}</p>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <p className="text-base sm:text-xl font-bold text-gray-900 dark:text-foreground tabular-nums leading-none">{animatedValue}</p>
          {delta != null && delta !== undefined ? (
            <div className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-bold", isPositive ? "bg-emerald-50 dark:bg-emerald-950/30 text-green-600 dark:text-green-400" : "bg-red-50 dark:bg-red-950/30 text-red-500 dark:text-red-400")}>
              {arrowUp ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {Math.abs(delta).toFixed(1)}%
            </div>
          ) : delta === null ? (
            <span className="text-xs text-gray-400 dark:text-muted">— Sin datos anteriores</span>
          ) : null}
          {/* Sparkline */}
          {sparklineData && sparklineData.length > 0 && (
            <div className="mt-1">
              <Sparkline data={sparklineData} color={accent.replace("text-", "")} />
            </div>
          )}
        </div>
        <Icon className={cn("h-4 w-4 shrink-0 mb-0.5", accent)} />
      </div>
    </div>
  );
}

function Card({ title, icon: Icon, children, action }: { title: string; icon: React.ComponentType<{className?:string}>; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-gray-400 dark:text-muted" style={{letterSpacing:"0.06em"}}>
          <Icon className="h-3 w-3 text-gray-300 dark:text-muted" />{title.toUpperCase()}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function DBadge({ children, color }: { children: React.ReactNode; color: "green"|"red"|"amber"|"blue"|"purple"|"gray" }) {
  const m: Record<string,string> = {
    green:"bg-emerald-50 text-emerald-600", red:"bg-red-50 text-red-600",
    amber:"bg-amber-50 text-amber-600", blue:"bg-blue-50 text-blue-600",
    purple:"bg-purple-50 text-purple-600", gray:"bg-gray-100 text-gray-500",
  };
  return <span className={cn("inline-flex px-1.5 py-0.5 rounded text-xs font-semibold",m[color])}>{children}</span>;
}

function FlowRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500 dark:text-muted">{label}</span>
      <span className={cn("text-xs font-semibold", color)}>{value}</span>
    </div>
  );
}

function Empty({ text = "Sin datos en este periodo" }: { text?: string }) {
  return <div className="py-8 text-center text-xs text-gray-300 dark:text-muted">{text}</div>;
}

/* V1: Elapsed timer component */
function ElapsedTimer({ createdAt }: { createdAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  const mins = Math.floor((now - new Date(createdAt).getTime()) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const color = mins > 60 ? "text-red-500" : mins > 30 ? "text-amber-500" : "text-emerald-500";
  return (
    <div className={cn("text-[10px] font-bold mt-0.5", color)}>
      ⏱ {h > 0 ? `${h}h ${m}m` : `${m}m`}
    </div>
  );
}

function Donut({ data, total, size = 96 }: { data: { total: number; color: string }[]; total: number; size?: number }) {
  const segments = useMemo(() => {
    const pcts = data.map(p => total > 0 ? (p.total / total) * 100 : 0);
    const cumulative = pcts.reduce<number[]>((acc, pct) => [...acc, (acc[acc.length - 1] ?? 0) + pct], []);
    return data.map((p, i) => `${p.color} ${cumulative[i - 1] ?? 0}% ${cumulative[i]}%`);
  }, [data, total]);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="w-full h-full rounded-full" style={{ background: `conic-gradient(${segments.join(", ")})` }} />
      <div className="absolute rounded-full bg-white dark:bg-card flex items-center justify-center" style={{ inset: size*0.2 }}>
        <span className="text-xs font-bold text-gray-600 dark:text-foreground">{fmt(total)}</span>
      </div>
    </div>
  );
}


