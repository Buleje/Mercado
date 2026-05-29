"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { escapeHtml } from "@/lib/safe-html";
import {
  TrendingUp, DollarSign, ShoppingCart, Users, Package,
  AlertTriangle, BarChart3, Clock, Banknote,
  AlertCircle, PackageX, Truck, Receipt, Percent,
  ShoppingBasket, RefreshCw, Lightbulb, Zap, CalendarDays,
  UserCheck, TrendingDown, Download, Search, Target, X, type LucideIcon,
  ArrowUp, ArrowDown, Trophy, Edit3,
  Beaker, Plus, ChevronRight, Sun, Maximize2, Minimize2, LayoutDashboard } from "@buleje/design-system/icons";
import { CardTitle, ErrorAlert, SectionTitle, WarningAlert } from "@buleje/design-system";
import { PeriodFilter } from "@buleje/design-system/dashboard";
import type { DateRange, Period as DSPeriod } from "@buleje/design-system/dashboard";
import { cn, exportToCSV, startOfLimaDay, startOfLimaDayDaysAgo } from "@/lib/utils";
import { tenantFetch } from "@/lib/tenant-fetch";
import { OrderStats } from "@/components/OrderStats";
import { useTheme } from "@/contexts/theme-context";
import type { Product, Sale, Purchase, Supplier, Customer } from "@/types/erp";
import dynamic from "next/dynamic";
const S = () => (<div className="flex items-center justify-center py-12"><div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>);
const DashboardVentasSection = dynamic(() => import("./dashboard/DashboardVentasSection"), { ssr: false, loading: S });
const DashboardProductosSection = dynamic(() => import("./dashboard/DashboardProductosSection"), { ssr: false, loading: S });
const DashboardInventarioSection = dynamic(() => import("./dashboard/DashboardInventarioSection"), { ssr: false, loading: S });
const DashboardClientesSection = dynamic(() => import("./dashboard/DashboardClientesSection"), { ssr: false, loading: S });
const DashboardComprasCajaSection = dynamic(() => import("./dashboard/DashboardComprasCajaSection"), { ssr: false, loading: S });
const DailySummaryPanel = dynamic(() => import("./DailySummaryPanel"), { ssr: false, loading: S });
const DashboardOverviewCharts = dynamic(() => import("./dashboard/DashboardOverviewCharts").then(m => ({ default: m.DashboardOverviewCharts })), { ssr: false, loading: S });

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

// Period amplificado — "todo" mantenido por compatibilidad con helpers internos,
// "año" y "custom" son nuevas opciones del filtro DS.
type Period = "hoy" | "semana" | "mes" | "todo" | "año" | "custom";
type Section = "resumen" | "ventas" | "productos" | "inventario" | "clientes" | "compras" | "caja";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return `S/${n.toFixed(2)}`; }
function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }); } catch { return iso; }
}
function fmtDateFull(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); } catch { return iso; }
}
function _fmtTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
}
function inPeriod(dateStr: string, period: Period, dateRange?: { from: string; to: string }): boolean {
  if (period === "todo") return true;
  const d = new Date(dateStr), now = new Date();
  if (period === "hoy") return d.toDateString() === now.toDateString();
  if (period === "semana") { const w = new Date(now); w.setDate(w.getDate() - 7); return d >= w; }
  if (period === "mes") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  if (period === "año") return d.getFullYear() === now.getFullYear();
  if (period === "custom" && dateRange?.from && dateRange?.to) {
    const from = new Date(dateRange.from + "T00:00:00");
    const to   = new Date(dateRange.to   + "T23:59:59");
    return d >= from && d <= to;
  }
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
  const [dateRange, setDateRange] = useState<DateRange>({ from: "", to: "" });
  const [section, setSection] = useState<Section>("resumen");
  const { setTheme } = useTheme();

  /* X3: Auto dark mode for admin on first visit */
  useEffect(() => {
    try {
      if (!localStorage.getItem("buleje-admin-theme-set")) {
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        if (prefersDark) setTheme("system");
        localStorage.setItem("buleje-admin-theme-set", "1");
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
      const stored = localStorage.getItem("buleje-monthly-goals");
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
      localStorage.setItem("buleje-monthly-goals", JSON.stringify(tempGoals));
      setMonthlyGoals(tempGoals);
      setEditingMonthlyGoals(false);
      // Save goals only (achievement history will be calculated when viewing history)
      const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
      const history = JSON.parse(localStorage.getItem("buleje-goals-history") || "{}");
      history[monthKey] = {
        goals: tempGoals,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem("buleje-goals-history", JSON.stringify(history));
    } catch {}
  }, [tempGoals]);
  const knownOrderIdsRef = useRef<Set<string> | null>(null);
  const autoRefreshRef = useRef(autoRefresh);
  autoRefreshRef.current = autoRefresh;
  // Guard de inflight: si un poll está en vuelo y empieza otro, abortamos el anterior
  // — evita state updates en componente desmontado y queues en 3G (Pucallpa).
  const inflightRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    // Cancelar request anterior si todavía está vivo
    inflightRef.current?.abort();
    const ctrl = new AbortController();
    inflightRef.current = ctrl;

    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/admin/dashboard", { signal: ctrl.signal });
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
                  // AudioContext.close() puede fallar si el ctx ya está cerrado
                  // por el browser — best-effort, no afecta funcionalidad.
                  ctx.close().catch(() => { /* AudioContext already closed */ });
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
      // Aborts esperados (cleanup o nuevo poll que canceló este) — no son errores
      if (err instanceof DOMException && err.name === "AbortError") return;
      setFetchError(err instanceof Error ? err.message : "Error al cargar el dashboard. Revisa tu conexión.");
    } finally {
      // Solo actualizar UI si este request sigue siendo el actual
      if (inflightRef.current === ctrl) {
        setLoading(false);
        setLastUpdated(new Date());
        inflightRef.current = null;
      }
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Cleanup en unmount: cancelar cualquier request inflight
  useEffect(() => {
    return () => {
      inflightRef.current?.abort();
    };
  }, []);

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
    const dr = period === "custom" ? dateRange : undefined;
    const fOrders = orders.filter(o => o.status !== "cancelado" && inPeriod(o.createdAt, period, dr));
    const cancelled = orders.filter(o => o.status === "cancelado" && inPeriod(o.createdAt, period, dr));
    const fSales = sales.filter(s => inPeriod(s.createdAt, period, dr));
    const fPurchases = purchases.filter(p => inPeriod(p.createdAt ?? "", period, dr));

    const costMap = new Map(products.map(p => [p.id, p.costPrice ?? p.price * 0.7]));
    const orderRev = fOrders.reduce((a,o) => a+o.total,0);
    const saleRev = fSales.reduce((a,s) => a+s.total,0);
    const ventas = orderRev + saleRev;

    let costo = 0;
    fOrders.forEach(o => o.items.forEach(i => { costo += (costMap.get(i.id) ?? (+(i.price ?? 0))*0.7)*i.quantity; }));
    fSales.forEach(s => (s.items ?? []).forEach(i => { costo += (costMap.get(+(i.productId ?? 0)) ?? (+(i.price ?? 0))*0.7)*i.quantity; }));
    const utilidad = ventas - costo;
    const margen = ventas > 0 ? (utilidad/ventas)*100 : 0;
    const tickets = fOrders.length + fSales.length;
    const ticketProm = tickets > 0 ? ventas/tickets : 0;

    // ── Comparación vs periodo anterior ──
    const pfOrders = orders.filter(o => o.status !== "cancelado" && inPrevPeriod(o.createdAt, period));
    const pfSales = sales.filter(s => inPrevPeriod(s.createdAt, period));
    const prevVentas = pfOrders.reduce((a,o) => a+o.total, 0) + pfSales.reduce((a,s) => a+s.total, 0);
    let prevCosto = 0;
    pfOrders.forEach(o => o.items.forEach(i => { prevCosto += (costMap.get(i.id) ?? (+(i.price ?? 0))*0.7)*i.quantity; }));
    pfSales.forEach(s => (s.items ?? []).forEach(i => { prevCosto += (costMap.get(+(i.productId ?? 0)) ?? (+(i.price ?? 0))*0.7)*i.quantity; }));
    const prevUtilidad = prevVentas - prevCosto;
    const prevTickets = pfOrders.length + pfSales.length;
    const prevTicketProm = prevTickets > 0 ? prevVentas/prevTickets : 0;
    const prevMargen = prevVentas > 0 ? (prevUtilidad/prevVentas)*100 : 0;
    let prevUds = 0;
    pfOrders.forEach(o => o.items.forEach(i => { prevUds += i.quantity; }));
    pfSales.forEach(s => (s.items ?? []).forEach(i => { prevUds += i.quantity; }));
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
    fSales.forEach(s => (s.items ?? []).forEach(i => { uds += i.quantity; }));

    const uniqueClients = new Set<string>();
    fOrders.forEach(o => { if(o.customer.phone) uniqueClients.add(o.customer.phone); });
    fSales.forEach(s => { if(s.customerPhone) uniqueClients.add(s.customerPhone); });

    let newCust = 0, returningCust = 0;
    uniqueClients.forEach(ph => { if(prevPhones.has(ph)) returningCust++; else newCust++; });

    const stockVal = products.reduce((a,p) => a+(p.stock??0)*(p.costPrice??p.price*0.7),0);
    const stockCritico = products.filter(p => p.active && p.stock!==undefined && p.stockMin!==undefined && p.stock<=p.stockMin);
    const agotados = products.filter(p => p.active && (p.stock??0)===0);
    const soldIds = new Set<number>();
    orders.forEach(o => o.items.forEach(i => soldIds.add(+i.id)));
    sales.forEach(s => (s.items ?? []).forEach(i => soldIds.add(+(i.productId ?? 0))));
    const sinMov = products.filter(p => p.active && !soldIds.has(+p.id));

    // ── Stock projection (last 30 days trend) ──
    const now = new Date();
    const last30Days = new Date(now);
    last30Days.setDate(last30Days.getDate() - 30);
    const recentOrders = orders.filter(o => new Date(o.createdAt) >= last30Days && o.status !== "cancelado");
    const recentSales = sales.filter(s => new Date(s.createdAt) >= last30Days);
    
    const productSalesLast30d = new Map<number, number>();
    recentOrders.forEach(o => o.items.forEach(i => {
      productSalesLast30d.set(+i.id, (productSalesLast30d.get(+i.id) ?? 0) + i.quantity);
    }));
    recentSales.forEach(s => (s.items ?? []).forEach(i => {
      const pid = +(i.productId ?? 0);
      productSalesLast30d.set(pid, (productSalesLast30d.get(pid) ?? 0) + i.quantity);
    }));

    const stockProjections = products
      .filter(p => p.active && p.stock != null && p.stock > 0)
      .map(p => {
        const soldLast30d = productSalesLast30d.get(+p.id) ?? 0;
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
    fOrders.forEach(o => o.items.forEach(i => { const c = products.find(p=>p.id===i.id)?.category??"otros"; catMap.set(c,(catMap.get(c)??0)+(+(i.price ?? 0))*i.quantity); }));
    fSales.forEach(s => (s.items ?? []).forEach(i => { const c = products.find(p=>p.id===+(i.productId ?? 0))?.category??"otros"; catMap.set(c,(catMap.get(c)??0)+(+(i.price ?? 0))*i.quantity); }));
    const catSales = [...catMap.entries()].map(([c,t])=>({cat:c,total:t,label:CAT_LABELS[c]??c,color:CAT_COLORS[c]??"#94a3b8"})).sort((a,b)=>b.total-a.total);

    const payMap = new Map<string,number>();
    fOrders.forEach(o => { const m=o.paymentMethod??"efectivo"; payMap.set(m,(payMap.get(m)??0)+o.total); });
    fSales.forEach(s => { const pm = s.payment ?? "efectivo"; payMap.set(pm,(payMap.get(pm)??0)+s.total); });
    const payments = [...payMap.entries()].map(([m,t])=>({method:m,total:t,label:PAY_LABELS[m]??m,color:PAY_COLORS[m]??"#94a3b8"})).sort((a,b)=>b.total-a.total);
    const payTotal = payments.reduce((a,p)=>a+p.total,0);

    const dailyMap = new Map<string,number>();
    [...fOrders.map(o=>({date:o.createdAt,t:o.total})),...fSales.map(s=>({date:s.createdAt,t:s.total}))].forEach(x => { const k=dateKey(x.date); dailyMap.set(k,(dailyMap.get(k)??0)+x.t); });
    const daily = [...dailyMap.entries()].sort((a,b)=>a[0].localeCompare(b[0])).slice(-14);
    const maxDaily = Math.max(...daily.map(([,v])=>v),1);

    const dailyProfitMap = new Map<string,number>();
    fOrders.forEach(o => { const k = dateKey(o.createdAt); let c = 0; o.items.forEach(i => { c += (costMap.get(i.id) ?? i.price*0.7)*i.quantity; }); dailyProfitMap.set(k, (dailyProfitMap.get(k)??0) + o.total - c); });
    fSales.forEach(s => { const k = dateKey(s.createdAt); let c = 0; (s.items ?? []).forEach(i => { c += (costMap.get(+(i.productId ?? 0)) ?? (+(i.price ?? 0))*0.7)*i.quantity; }); dailyProfitMap.set(k, (dailyProfitMap.get(k)??0) + s.total - c); });
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
      { label: "Recibidos",   count: allPeriodOrders.length, color: "var(--accent)" },
      { label: "Confirmados", count: allPeriodOrders.filter(o => ["confirmado","en_camino","entregado"].includes(o.status)).length, color: "#3b82f6" },
      { label: "En camino",  count: allPeriodOrders.filter(o => ["en_camino","entregado"].includes(o.status)).length, color: "#06b6d4" },
      { label: "Entregados", count: allPeriodOrders.filter(o => o.status === "entregado").length, color: "var(--accent)" },
    ];

    // ── Conversion Funnel (simulated data based on completed orders) ──
    const completedOrders = fOrders.length + fSales.length;
    const conversionFunnelData = [
      { label: "Visitas al sitio", count: Math.round(completedOrders * 5), pct: 100, color: "#3b82f6" },
      { label: "Productos vistos", count: Math.round(completedOrders * 3), pct: 60, color: "#06b6d4" },
      { label: "Carrito agregado", count: Math.round(completedOrders * 1.5), pct: 30, color: "#8b5cf6" },
      { label: "Checkout iniciado", count: Math.round(completedOrders * 1.2), pct: 24, color: "#f59e0b" },
      { label: "Pedido completado", count: completedOrders, pct: 20, color: "var(--accent)" },
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
    fSales.forEach(s => (s.items ?? []).forEach(i => { const pid=+(i.productId ?? 0); const p0=+(i.price ?? 0); const e=prodMap.get(pid)??{name:String(i.name ?? ""),units:0,revenue:0,profit:0}; const c=costMap.get(pid)??p0*0.7; e.units+=i.quantity;e.revenue+=p0*i.quantity;e.profit+=(p0-c)*i.quantity;prodMap.set(pid,e); }));
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
    fPurchases.forEach(p => { const sn = p.supplierName ?? ""; supMap.set(sn,(supMap.get(sn)??0)+(p.total ?? 0)); });
    const supPurchases = [...supMap.entries()].map(([n,t])=>({name:n,total:t})).sort((a,b)=>b.total-a.total);
    const totalPurch = fPurchases.reduce((a,p)=>a+(p.total ?? 0),0);

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
    const recentCustomers = customers.filter(c => { try { return (now.getTime() - new Date(c.createdAt ?? "").getTime()) < 7 * 86400000; } catch { return false; } });
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
    const orderBaskets = [...orders.filter(o => o.status !== "cancelado").map(o => o.items.map(i => ({ id: i.id as number, name: i.name as string }))), ...sales.map(s => (s.items ?? []).map(i => ({ id: +(i.productId ?? 0), name: String(i.name ?? "") })))];
    orderBaskets.forEach(basket => {
      const unique = [...new Map(basket.map(i => [i.id, i])).values()]; // dedupe
      for (let i = 0; i < unique.length; i++) {
        for (let j = i + 1; j < unique.length; j++) {
          const key = [unique[i].id, unique[j].id].sort((a, b) => +a - +b).join("-");
          const e = coMap.get(key) ?? { a: unique[i].name ?? "", b: unique[j].name ?? "", count: 0 };
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
    if (pendingOrdersCount > 0) briefingPriorities.push(`${pendingOrdersCount} pedido${pendingOrdersCount > 1 ? "s" : ""} pendiente${pendingOrdersCount > 1 ? "s" : ""}`);
    if (criticalStock.length > 0) briefingPriorities.push(`${criticalStock.length} producto${criticalStock.length > 1 ? "s" : ""} con stock crítico`);
    if (overdue.length > 0) briefingPriorities.push(`${overdue.length} pago${overdue.length > 1 ? "s" : ""} vencido${overdue.length > 1 ? "s" : ""}`);
    if (atRiskClients.length > 0) briefingPriorities.push(`${atRiskClients.length} VIP${atRiskClients.length > 1 ? "s" : ""} en riesgo de pérdida`);
    if (agotados.length > 0) briefingPriorities.push(`${agotados.length} producto${agotados.length > 1 ? "s" : ""} agotado${agotados.length > 1 ? "s" : ""}`);

    // ── Sprint 3 Feature 5: Cash flow forecast (7 days) ──
    const dailyRevMap = new Map<string,number>();
    const dailyExpMap = new Map<string,number>();
    [...orders.filter(o => o.status !== "cancelado"), ...sales.map(s => ({ ...s, total: s.total, createdAt: s.createdAt }))].forEach(t => {
      const k = dateKey(t.createdAt); dailyRevMap.set(k, (dailyRevMap.get(k) ?? 0) + t.total);
    });
    purchases.forEach(p => { if (!p.createdAt) return; const k = dateKey(p.createdAt); dailyExpMap.set(k, (dailyExpMap.get(k) ?? 0) + (p.total ?? 0)); });
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
        if (c.phone) customerCohorts.set(c.phone, cohortMonth);
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
      const items = 'items' in t ? (t.items ?? []).map(i => 'productId' in i ? i.productId : i.id) : [];
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
  }, [products,orders,sales,customers,purchases,payables,suppliers,reviews,period,dateRange]);

  const [showExport, setShowExport] = useState(false);

  const handleExport = useCallback(async (type: string) => {
    setShowExport(false);
    const today = new Date().toISOString().slice(0,10);
    if (type === "ventas") {
      const rows = [
        ...orders.filter(o => inPeriod(o.createdAt, period) && o.status !== "cancelado").map(o => ({
          tipo: "Pedido", id: o.id, fecha: o.createdAt.slice(0,10), hora: o.createdAt.slice(11,16),
          cliente: o.customer.name, teléfono: o.customer.phone ?? "",
          items: o.items.map(i => `${i.name} x${i.quantity}`).join("; "),
          total: o.total, pago: o.paymentMethod ?? "efectivo", estado: o.status,
        })),
        ...sales.filter(s => inPeriod(s.createdAt, period)).map(s => ({
          tipo: "POS", id: s.id, fecha: s.createdAt.slice(0,10), hora: s.createdAt.slice(11,16),
          cliente: s.customerPhone ?? "Mostrador", teléfono: s.customerPhone ?? "",
          items: (s.items ?? []).map(i => `${i.name} x${i.quantity}`).join("; "),
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
        teléfono: c.phone, nombre: c.name, ubicacion: c.location,
        registrado: (c.createdAt ?? "").slice(0,10),
      })), `clientes_${today}.csv`);
    } else if (type === "pedidos") {
      // Server-side paginated CSV export
      const params = new URLSearchParams();
      if (period === "hoy") {
        params.set("from", new Date(startOfLimaDay()).toISOString());
      } else if (period === "semana") {
        params.set("from", new Date(startOfLimaDayDaysAgo(7)).toISOString());
      } else if (period === "mes") {
        const d = new Date(); d.setDate(1);
        params.set("from", new Date(startOfLimaDay(d)).toISOString());
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
      doc.text("Buleje", 14, y);
      y += 6;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      doc.text(`${titulo} — generado el ${generado}`, 14, y);
      doc.setTextColor(0);
      y += 8;

      // KPI grid (3 cols)
      const kpis = [
        ["Ventas", fmt(st.ventas)], ["Utilidad", fmt(st.utilidad)], ["Margen", Number(st.margen).toFixed(1) + "%"],
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
        `Reporte generado automaticamente · Buleje · ${new Date().toLocaleTimeString("es-PE")}`,
        105, 290, { align: "center" },
      );

      doc.save(`reporte_${today}.pdf`);
    }
  }, [orders, sales, products, customers, period, st]);

  const [topTab, _setTopTab] = useState<"revenue"|"profit"|"units">("revenue");
  const [_recentFilter, _setRecentFilter] = useState<"all"|"pendiente"|"en_camino"|"entregado">("all");
  const [_recentPage, _setRecentPage] = useState(1);
  const [dashSearch, setDashSearch] = useState("");
  const [_dateFrom, _setDateFrom] = useState("");
  const [_dateTo, _setDateTo] = useState("");
  const [_selectedClientPhone, _setSelectedClientPhone] = useState<string|null>(null);
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
    try { return JSON.parse(localStorage.getItem("buleje-ab-tests") || "[]"); } catch { return []; }
  });
  const [showABTestModal, setShowABTestModal] = useState(false);
  const [abTestForm, setAbTestForm] = useState<{ name: string; hypothesis: string; variantA: string; variantB: string; metric: "revenue"|"conversion"|"aov"|"retention"; startDate: string; endDate: string }>({ name: "", hypothesis: "", variantA: "Control", variantB: "Variant B", metric: "conversion", startDate: "", endDate: "" });

  /* FASE 6: Cross-Sell Recommendations */
  const [showCrossSell, setShowCrossSell] = useState(false);
  const [selectedProductForCrossSell, setSelectedProductForCrossSell] = useState<number | null>(null);

  /* Z2: Daily summary banner — show once per day */
  const [dailySummaryDismissed, setDailySummaryDismissed] = useState(() => {
    try { return localStorage.getItem("buleje-daily-summary") === new Date().toDateString(); } catch { return false; }
  });
  const dismissDailySummary = () => {
    setDailySummaryDismissed(true);
    try { localStorage.setItem("buleje-daily-summary", new Date().toDateString()); } catch {}
  };
  const topList = topTab==="revenue"?st.topRev:topTab==="profit"?st.topProfit:st.topUnits;
  const _topMax = topList.length>0?Math.max(...topList.map(p=>topTab==="units"?p.units:topTab==="profit"?p.profit:p.revenue)):1;

  // C2 — Quick order status changes
  const [quickStatusMap, setQuickStatusMap] = useState<Record<string, Order["status"]>>({});
  const [changingStatusId, setChangingStatusId] = useState<string | null>(null);
  const handleQuickStatus = useCallback(async (orderId: string, newStatus: Order["status"]) => {
    setChangingStatusId(orderId);
    try {
      const res = await tenantFetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setQuickStatusMap(prev => ({ ...prev, [orderId]: newStatus }));
        setFetchError(null);
        /* S2: Auto WA notification on status change */
        const order = orders.find(o => o.id === orderId);
        if (order?.customer.phone) {
          const STATUS_MSG: Record<string, string> = {
            confirmado: "Tu pedido ha sido confirmado y lo estamos preparando.",
            en_camino: "Tu pedido va en camino. ¡Prepárate para recibirlo!",
            entregado: "Tu pedido fue entregado. ¡Gracias por tu compra!",
          };
          const msg = STATUS_MSG[newStatus];
          if (msg) {
            const text = `Hola ${order.customer.name}, te informamos de tu pedido #${orderId.slice(-6).toUpperCase()} en Buleje:\n\n${msg}`;
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
    const itemsHtml = o.items.map(i => `<tr><td style="padding:2px 0">${i.quantity}× ${escapeHtml(String(i.name ?? ""))}</td><td style="text-align:right">S/${(i.price * i.quantity).toFixed(2)}</td></tr>`).join("");
    w.document.write(`<!DOCTYPE html><html><head><title>Comanda #${o.id.slice(-6)}</title>
<style>*{margin:0;padding:0;font-family:monospace;font-size:13px}body{padding:12px;max-width:300px}h2{text-align:center;font-size:15px;margin-bottom:4px}hr{border:0;border-top:1px dashed #999;margin:6px 0}table{width:100%;border-collapse:collapse}td{padding:2px 0}.total{font-size:15px;font-weight:bold;text-align:right}.footer{text-align:center;font-size:10px;color:#888;margin-top:8px}@media print{body{padding:0}}</style></head>
<body><h2>Buleje</h2><p style="text-align:center;font-size:10px">Comanda #${o.id.slice(-6).toUpperCase()}</p><hr>
<p><b>Cliente:</b> ${escapeHtml(String(o.customer.name ?? ""))}</p>${o.customer.phone ? `<p><b>Tel:</b> ${escapeHtml(String(o.customer.phone))}</p>` : ""}
${o.customer.location ? `<p><b>Dir:</b> ${escapeHtml(String(o.customer.location))}</p>` : ""}
<p><b>Fecha:</b> ${new Date(o.createdAt).toLocaleString("es-PE")}</p>
<p><b>Pago:</b> ${o.paymentMethod === "yape" ? "Yape" : "Efectivo"}</p><hr>
<table>${itemsHtml}</table><hr><p class="total">TOTAL: S/${(o.total ?? 0).toFixed(2)}</p>
${o.notes ? `<hr><p style="font-size:11px">${escapeHtml(String(o.notes))}</p>` : ""}
<p class="footer">¡Gracias por tu compra!</p></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }, []);

  // C3 — Export sales CSV
  const _exportVentas = useCallback(() => {
    const orderRows = orders
      .filter(o => inPeriod(o.createdAt, period))
      .map(o => ({
        Tipo: "Delivery",
        Fecha: fmtDateFull(o.createdAt),
        ID: o.id.slice(-8),
        Cliente: o.customer.name,
        Teléfono: o.customer.phone ?? "",
        "Total S/": Number(o.total).toFixed(2),
        Pago: o.paymentMethod ?? "",
        Estado: o.status,
      }));
    const saleRows = sales
      .filter(s => inPeriod(s.createdAt, period))
      .map(s => ({
        Tipo: "POS",
        Fecha: fmtDateFull(s.createdAt),
        ID: String(s.id).slice(-8),
        Cliente: "POS",
        Teléfono: s.customerPhone ?? "",
        "Total S/": Number(s.total).toFixed(2),
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
        await tenantFetch(`/api/orders/${orderId}`, {
          method: "PATCH",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
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
      tenantFetch(`/api/orders/${id}`, { method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ status: newStatus }) })
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
            <div className="h-5 w-32 bg-[var(--rule-soft)] dark:bg-surface rounded-lg" />
            <div className="h-3 w-44 bg-[var(--rule-soft)] dark:bg-surface rounded" />
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="h-8 w-48 bg-[var(--rule-soft)] dark:bg-surface rounded-lg" />
            <div className="h-8 w-24 bg-[var(--rule-soft)] dark:bg-surface rounded-lg" />
          </div>
        </div>
        {/* KPI cards skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 space-y-2">
              <div className="h-3 w-16 bg-[var(--rule-soft)] dark:bg-surface rounded" />
              <div className="h-7 w-24 bg-[var(--rule-soft)] dark:bg-surface rounded" />
              <div className="h-3 w-20 bg-[var(--rule-soft)] dark:bg-surface rounded" />
            </div>
          ))}
        </div>
        {/* Orders list skeleton */}
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 sm:p-5 space-y-3">
          <div className="h-4 w-28 bg-[var(--rule-soft)] dark:bg-surface rounded" />
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex flex-wrap items-center gap-2 sm:gap-4">
              <div className="h-10 w-10 bg-[var(--rule-soft)] dark:bg-surface rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 bg-[var(--rule-soft)] dark:bg-surface rounded w-1/2" />
                <div className="h-3 bg-[var(--rule-soft)] dark:bg-surface rounded w-1/3" />
              </div>
              <div className="h-6 w-20 bg-[var(--rule-soft)] dark:bg-surface rounded-full" />
              <div className="h-8 w-8 bg-[var(--rule-soft)] dark:bg-surface rounded-lg shrink-0" />
            </div>
          ))}
        </div>
        {/* Chart skeleton */}
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 sm:p-5">
          <div className="h-4 w-36 bg-[var(--rule-soft)] dark:bg-surface rounded mb-4" />
          <div className="flex flex-wrap items-end gap-2 h-32">
            {[40, 70, 55, 85, 60, 90, 75].map((h, i) => (
              <div key={i} className="flex-1 bg-[var(--rule-soft)] dark:bg-surface rounded-t" style={{ height: `${h}%` }} />
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
        <div className="mb-3">
          <ErrorAlert
            description={fetchError}
            action={
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setFetchError(null); void load(); }}
                  className="px-3 py-1 text-xs font-semibold rounded-lg bg-[var(--surface-sunken)] text-[var(--text-primary)] hover:opacity-80 transition-opacity"
                >
                  Reintentar
                </button>
                <button
                  onClick={() => setFetchError(null)}
                  className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  aria-label="Cerrar alerta"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            }
          />
        </div>
      )}

      {/* ── Operation Error Toast ── */}
      {opError && (
        <div className="mb-3 animate-[fadeUp_0.2s_ease-out]">
          <WarningAlert
            description={opError}
            action={
              <button
                onClick={() => setOpError(null)}
                className="p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                aria-label="Cerrar alerta"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            }
          />
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between pb-3">
        <div>
          <SectionTitle className={cn(fullscreen ? "text-lg" : "text-sm")}>Dashboard</SectionTitle>
          <p className={cn("text-[var(--text-tertiary)] dark:text-muted", fullscreen ? "text-sm" : "text-xs")}>Buleje</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodFilter
            value={period === "todo" ? "año" : period}
            onChange={(p) => setPeriod(p === "año" ? "año" : p)}
            includeCustom
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            className={fullscreen ? "text-sm" : ""}
          />
          {/* Fullscreen toggle */}
          <button
            onClick={() => setFullscreen(v => !v)}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-primary hover:bg-primary/90 px-2.5 py-1.5 rounded-lg transition-colors "
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
                  ? "text-white bg-[var(--data-info-500)] hover:bg-[var(--data-info-500)] "
                  : "text-[var(--text-secondary)] dark:text-[var(--text-primary)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-sunken)] dark:hover:bg-[var(--data-info-500)]/50"
              )}
              title={expandAll ? "Colapsar — volver a vista por sección (Esc)" : "Ver todos los gráficos en una vista"}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{expandAll ? "Colapsar" : "Ver todo"}</span>
            </button>
          )}
          <div className="relative">
            <button onClick={()=>setShowExport(v=>!v)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--text-secondary)] hover:bg-[var(--surface-alt)] dark:hover:bg-accent transition-colors" title="Exportar CSV">
              <Download className="h-3.5 w-3.5" />
            </button>
            {showExport && (
              <div className="absolute right-0 top-full mt-1 bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg py-1 z-50 min-w-40">
                {[
                  { key:"ventas", label:"Ventas CSV" },
                  { key:"pedidos", label:"Pedidos CSV" },
                  { key:"productos", label:"Inventario CSV" },
                  { key:"clientes", label:"Clientes CSV" },
                  { key:"pdf", label:"Reporte PDF" },
                ].map(opt => (
                  <button key={opt.key} onClick={()=>handleExport(opt.key)}
                    className="w-full text-left px-3 py-1.5 text-xs text-[var(--text-primary)] dark:text-[var(--text-primary)] hover:bg-[var(--surface-alt)] dark:hover:bg-accent transition-colors">
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={load} className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--text-secondary)] hover:bg-[var(--surface-alt)] dark:hover:bg-accent transition-colors" title="Actualizar">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
          {/* N2 — WA daily summary */}
          <a
            href={(() => {
              const lines = [
                `*Resumen ${period === "hoy" ? "del día" : period === "semana" ? "semanal" : period === "mes" ? "del mes" : "general"}*`,
                `Ventas: ${fmt(st.ventas)}`,
                `Utilidad: ${fmt(st.utilidad)} (${Number(st.margen).toFixed(1)}%)`,
                `Tickets: ${st.tickets} (prom ${fmt(st.ticketProm)})`,
                `Clientes: ${st.clientesAtendidos}`,
                "",
                st.topRev.length > 0 ? `Top: ${st.topRev.slice(0,3).map(p => p.name).join(", ")}` : "",
                st.stockCritico.length > 0 ? `Stock bajo: ${st.stockCritico.slice(0,3).map(p => p.name).join(", ")}` : "",
                st.agotados.length > 0 ? `Agotados: ${st.agotados.map(p => p.name).join(", ")}` : "",
              ].filter(Boolean);
              return `https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`;
            })()}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--data-success-500)] hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)] transition-colors"
            title="Enviar resumen por WhatsApp"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          </a>
          {/* Auto-refresh toggle */}
          <div className="flex items-center gap-1.5 ml-1 border-l border-[var(--rule-base)] dark:border-[var(--rule-base)] pl-2">
            <button
              onClick={() => setAutoRefresh(v => !v)}
              className={cn(
                "px-2 py-1 rounded-md text-[length:var(--ts-2xs)] font-bold uppercase transition-colors",
                autoRefresh ? "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]" : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] dark:bg-surface dark:text-muted"
              )}
            >
              {autoRefresh ? "En vivo" : "Auto"}
            </button>
            {newOrderCount > 0 && autoRefresh && (
              <button
                onClick={() => { setNewOrderCount(0); setSection("resumen"); }}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--data-error-500)] text-white text-[length:var(--ts-2xs)] font-bold animate-pulse"
              >
                +{newOrderCount} nuevo{newOrderCount > 1 ? "s" : ""}
              </button>
            )}
            {autoRefresh && (
              <select
                value={refreshInterval}
                onChange={e => setRefreshInterval(Number(e.target.value))}
                className="text-[length:var(--ts-2xs)] bg-transparent border-0 outline-none text-muted cursor-pointer"
              >
                <option value={15}>15s</option>
                <option value={30}>30s</option>
                <option value={60}>1m</option>
              </select>
            )}
            {lastUpdated && (
              <span className="text-[length:var(--ts-2xs)] text-muted hidden sm:inline" title={`Actualizado: ${lastUpdated.toLocaleTimeString("es-PE")}`}>
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
        <div className="h-0.5 w-full bg-[var(--surface-sunken)] dark:bg-accent mb-3 rounded-full overflow-hidden">
          <div 
            className="h-full bg-[var(--data-success-500)] rounded-full"
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
              { label: "Ventas Netas", value: fmt(st.ventas), accent: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", delta: st.dVentas },
              { label: "Utilidad", value: fmt(st.utilidad), accent: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", delta: st.dUtilidad },
              { label: "Margen", value: `${Number(st.margen).toFixed(1)}%`, accent: st.margen >= 25 ? "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" : "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]", bg: "bg-[var(--surface-alt)] dark:bg-surface", delta: st.dMargen },
              { label: "Tickets", value: String(st.tickets), accent: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]", bg: "bg-[var(--surface-sunken)]", delta: st.dTickets },
              { label: "Clientes", value: String(st.clientesAtendidos), accent: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]", bg: "bg-[var(--surface-sunken)]", delta: st.dClientes },
              { label: "Stock Alerta", value: String(st.stockCritico.length + st.agotados.length), accent: (st.stockCritico.length + st.agotados.length) > 0 ? "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]" : "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", bg: "bg-[var(--surface-alt)] dark:bg-surface" },
              { label: "Balance Caja", value: fmt(st.ventas - st.totalPurch), accent: (st.ventas - st.totalPurch) >= 0 ? "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" : "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]", bg: "bg-[var(--surface-alt)] dark:bg-surface" },
            ] as { label: string; value: string; accent: string; bg: string; delta?: number | null }[]).map(k => (
              <div key={k.label} className={cn("rounded-xl px-3 py-2.5", k.bg)}>
                <div className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)] dark:text-muted font-medium truncate">{k.label}</div>
                <div className={cn("text-sm font-extrabold tabular-nums leading-tight mt-0.5 truncate", k.accent)}>{k.value}</div>
                {k.delta != null && k.delta !== undefined ? (
                  <div className={cn("text-[length:var(--ts-2xs)] font-bold mt-0.5", k.delta >= 0 ? "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" : "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]")}>
                    {k.delta >= 0 ? "↑" : "↓"} {Math.abs(k.delta).toFixed(1)}%
                  </div>
                ) : k.delta === null ? (
                  <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted mt-0.5">— Sin datos</div>
                ) : null}
              </div>
            ))}
          </div>
          {/* Responsive Column Grid: 1→2→3 cols, whole grid scrolls on smaller screens */}
          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 overflow-y-auto">
            {/* ── Col 1: Ventas + Caja ── */}
            <div className="flex flex-col gap-3 overflow-y-auto min-h-0" style={{scrollbarWidth:"thin" as React.CSSProperties["scrollbarWidth"]}}>
              <div className="bg-[var(--surface-raised)] border border-[var(--rule-soft)] dark:border-[var(--rule-base)] rounded-xl p-3 shrink-0">
                <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                  <DollarSign className="h-3.5 w-3.5 text-[var(--data-success-500)]" />
                  <span className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Ventas</span>
                </div>
                {st.daily.length > 0 && (
                  <div className="relative h-20 mb-2">
                    <svg viewBox={`0 0 ${Math.max(st.daily.length, 1) * 36} 80`} className="w-full h-full" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="fsAreaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
                        </linearGradient>
                      </defs>
                      <path d={st.daily.map(([,v],i) => { const x=i*36+18; const y=70-((v/st.maxDaily)*60); return i===0?`M${x},${y}`:`L${x},${y}`; }).join(' ') + ` L${(st.daily.length-1)*36+18},70 L18,70 Z`} fill="url(#fsAreaGrad)" />
                      <polyline points={st.daily.map(([,v],i) => `${i*36+18},${70-((v/st.maxDaily)*60)}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                    </svg>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { label: "Ventas Netas", value: fmt(st.ventas), accent: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" },
                    { label: "Ticket Prom.", value: fmt(st.ticketProm), accent: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" },
                    { label: "Uds. Vendidas", value: String(st.uds), accent: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]" },
                    { label: "Cancelados", value: String(st.cancelados), accent: "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]" },
                  ].map(k => (
                    <div key={k.label} className="bg-[var(--surface-alt)] dark:bg-surface rounded-lg px-2.5 py-2">
                      <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">{k.label}</div>
                      <div className={cn("text-sm font-bold tabular-nums truncate", k.accent)}>{k.value}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-[var(--surface-raised)] border border-[var(--rule-soft)] dark:border-[var(--rule-base)] rounded-xl p-3 shrink-0">
                <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                  <Banknote className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                  <span className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Caja</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                  {[
                    { label: "Ingresos", value: fmt(st.ventas), accent: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" },
                    { label: "Egresos", value: fmt(st.totalPurch), accent: "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]" },
                    { label: "Utilidad Bruta", value: fmt(st.utilidad), accent: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" },
                    { label: "Margen", value: `${Number(st.margen).toFixed(1)}%`, accent: st.margen >= 25 ? "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" : "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]" },
                  ].map(k => (
                    <div key={k.label} className="bg-[var(--surface-alt)] dark:bg-surface rounded-lg px-2.5 py-2">
                      <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">{k.label}</div>
                      <div className={cn("text-sm font-bold tabular-nums truncate", k.accent)}>{k.value}</div>
                    </div>
                  ))}
                </div>
                {st.payments.length > 0 && (
                  <div className="space-y-1.5">
                    {st.payments.slice(0, 5).map(p => (
                      <div key={p.method} className="flex flex-wrap items-center gap-2">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{background: p.color}} />
                        <span className="text-[length:var(--ts-xs)] text-[var(--text-secondary)] dark:text-muted flex-1 truncate">{p.label}</span>
                        <span className="text-xs font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(p.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {/* ── Col 2: Productos + Inventario ── */}
            <div className="flex flex-col gap-3 overflow-y-auto min-h-0" style={{scrollbarWidth:"thin" as React.CSSProperties["scrollbarWidth"]}}>
              <div className="bg-[var(--surface-raised)] border border-[var(--rule-soft)] dark:border-[var(--rule-base)] rounded-xl p-3 shrink-0">
                <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                  <TrendingUp className="h-3.5 w-3.5 text-[var(--data-success-500)]" />
                  <span className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Productos (Top ingresos)</span>
                </div>
                {st.topRev.length === 0 ? (
                  <p className="text-xs text-[var(--text-tertiary)] dark:text-muted py-2 text-center">Sin ventas registradas</p>
                ) : (() => {
                  const maxRev = st.topRev[0]?.revenue ?? 1;
                  return (
                    <div className="space-y-2">
                      {st.topRev.slice(0, 6).map((p, i) => (
                        <div key={p.id} className="flex flex-wrap items-center gap-2">
                          <span className={cn("w-4 h-4 rounded-full flex items-center justify-center text-[length:var(--ts-2xs)] font-bold shrink-0", i < 3 ? "bg-gray-900 dark:bg-foreground text-white dark:text-background" : "bg-[var(--surface-sunken)] dark:bg-accent text-[var(--text-tertiary)]")}>{i+1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between mb-0.5">
                              <span className="text-xs text-[var(--text-secondary)] truncate">{p.name}</span>
                              <span className="text-xs font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] ml-1 shrink-0">{fmt(p.revenue)}</span>
                            </div>
                            <div className="h-1 bg-[var(--surface-sunken)] dark:bg-accent rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{width:`${(p.revenue/maxRev)*100}%`,background:i<3?"#111827":"#d1d5db"}} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {st.catSales.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {st.catSales.slice(0, 4).map(c => (
                      <div key={c.cat} className="flex items-center gap-1.5 min-w-0">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{background: c.color}} />
                        <span className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)] dark:text-muted truncate flex-1">{c.label}</span>
                        <span className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] shrink-0">{fmt(c.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="bg-[var(--surface-raised)] border border-[var(--rule-soft)] dark:border-[var(--rule-base)] rounded-xl p-3 shrink-0">
                <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                  <Package className="h-3.5 w-3.5 text-[var(--data-warning-500)]" />
                  <span className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Inventario</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2.5">
                  <div className="bg-[var(--surface-alt)] dark:bg-surface rounded-lg px-2.5 py-2">
                    <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">Valor stock</div>
                    <div className="text-sm font-bold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] tabular-nums truncate">{fmt(st.stockVal)}</div>
                  </div>
                  <div className="bg-[var(--surface-alt)] dark:bg-surface rounded-lg px-2.5 py-2">
                    <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">Sin stock</div>
                    <div className={cn("text-sm font-bold tabular-nums", st.agotados.length > 0 ? "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]" : "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]")}>{st.agotados.length}</div>
                  </div>
                </div>
                {st.stockCritico.length === 0 && st.agotados.length === 0 ? (
                  <div className="text-xs text-[var(--data-success-500)] text-center py-1 font-medium">Inventario saludable</div>
                ) : (
                  <div className="space-y-1">
                    {st.agotados.slice(0, 2).map(p => (
                      <div key={p.id} className="flex items-center justify-between py-1.5 px-2 bg-[var(--data-error-50)] dark:bg-red-950/30 rounded-lg">
                        <span className="text-xs text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate flex-1">{p.name}</span>
                        <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-500)] dark:text-[var(--data-error-500)] ml-2 shrink-0">Agotado</span>
                      </div>
                    ))}
                    {st.stockCritico.filter(p => (p.stock ?? 0) > 0).slice(0, 4).map(p => (
                      <div key={p.id} className="flex items-center justify-between py-1.5 px-2 bg-[var(--data-warning-50)] dark:bg-amber-950/30 rounded-lg">
                        <span className="text-xs text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate flex-1">{p.name}</span>
                        <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] ml-2 shrink-0">{p.stock}/{p.stockMin}</span>
                      </div>
                    ))}
                    {(st.stockCritico.length + st.agotados.length) > 6 && (
                      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] text-center">+{st.stockCritico.length + st.agotados.length - 6} más con alerta</p>
                    )}
                  </div>
                )}
              </div>
            </div>
            {/* ── Col 3: Clientes + Compras ── */}
            <div className="flex flex-col gap-3 overflow-y-auto min-h-0" style={{scrollbarWidth:"thin" as React.CSSProperties["scrollbarWidth"]}}>
              <div className="bg-[var(--surface-raised)] border border-[var(--rule-soft)] dark:border-[var(--rule-base)] rounded-xl p-3 shrink-0">
                <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                  <Users className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                  <span className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Clientes</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2.5">
                  <div className="bg-[var(--surface-alt)] dark:bg-surface rounded-lg px-2.5 py-2">
                    <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">Atendidos</div>
                    <div className="text-sm font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] tabular-nums">{st.clientesAtendidos}</div>
                  </div>
                  <div className="bg-[var(--surface-alt)] dark:bg-surface rounded-lg px-2.5 py-2">
                    <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">Nuevos</div>
                    <div className="text-sm font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] tabular-nums">{st.newCust}</div>
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
                  if(top.length===0) return <p className="text-xs text-[var(--text-tertiary)] dark:text-muted text-center py-2">Sin clientes registrados</p>;
                  return (
                    <div className="space-y-1.5">
                      {top.map((c,i) => (
                        <div key={c.name+i} className="flex flex-wrap items-center gap-2">
                          <span className={cn("w-4 h-4 rounded-full flex items-center justify-center text-[length:var(--ts-2xs)] font-bold shrink-0", i < 3 ? "bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]" : "bg-[var(--surface-sunken)] dark:bg-accent text-[var(--text-tertiary)]")}>{i+1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between mb-0.5">
                              <span className="text-xs text-[var(--text-secondary)] truncate">{c.name}</span>
                              <span className="text-xs font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] ml-1 shrink-0">{fmt(c.total)}</span>
                            </div>
                            <div className="h-1 bg-[var(--surface-sunken)] dark:bg-accent rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-[var(--text-primary)]" style={{width:`${(c.total/mx)*100}%`}} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
              <div className="bg-[var(--surface-raised)] border border-[var(--rule-soft)] dark:border-[var(--rule-base)] rounded-xl p-3 shrink-0">
                <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                  <Truck className="h-3.5 w-3.5 text-[var(--data-success-500)]" />
                  <span className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Compras</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2.5">
                  <div className="bg-[var(--surface-alt)] dark:bg-surface rounded-lg px-2.5 py-2">
                    <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">Total compras</div>
                    <div className="text-sm font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] tabular-nums truncate">{fmt(st.totalPurch)}</div>
                  </div>
                  <div className="bg-[var(--surface-alt)] dark:bg-surface rounded-lg px-2.5 py-2">
                    <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">Deuda pend.</div>
                    <div className={cn("text-sm font-bold tabular-nums truncate", st.debt > 0 ? "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]" : "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]")}>{fmt(st.debt)}</div>
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
                              <span className="text-xs text-[var(--text-secondary)] truncate">{s.name}</span>
                              <span className="text-xs font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] ml-1 shrink-0">{fmt(s.total)}</span>
                            </div>
                            <div className="h-1 bg-[var(--surface-sunken)] dark:bg-accent rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-[var(--text-primary)]" style={{width:`${(s.total/mx)*100}%`}} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {st.overdue.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                    <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-500)] dark:text-[var(--data-error-500)] mb-1">
                      {st.overdue.length} cuenta{st.overdue.length !== 1 ? "s" : ""} vencida{st.overdue.length !== 1 ? "s" : ""}
                    </p>
                    {st.overdue.slice(0, 2).map(p => (
                      <div key={p.id} className="flex items-center justify-between py-1 text-xs">
                        <span className="text-[var(--text-secondary)] truncate">{p.supplierName}</span>
                        <span className="font-semibold text-[var(--data-error-500)] dark:text-[var(--data-error-500)] shrink-0 ml-2">{fmt(p.amount - p.paidAmount)}</span>
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
        <div className="flex items-center justify-between mb-5 px-2 sm:px-4 py-2 sm:py-3 bg-[var(--surface-sunken)] rounded-xl border border-[var(--rule-base)]">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[var(--data-info-500)] flex items-center justify-center shrink-0">
              <LayoutDashboard className="h-3.5 w-3.5 text-white" />
            </div>
            <div>
              <span className="text-sm font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Vista expandida</span>
              <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Todos los gráficos y secciones — desplázate para ver cada una</p>
            </div>
          </div>
          <button
            onClick={() => setExpandAll(false)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] dark:hover:bg-[var(--data-info-500)]/50 transition-colors"
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
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-tertiary)] pointer-events-none" />
        <input
          value={dashSearch}
          onChange={e => { setDashSearch(e.target.value); if (section !== "ventas" && e.target.value) setSection("ventas"); }}
          placeholder="Buscar pedido, cliente…"
          className="w-full pl-8 pr-8 py-2 text-xs rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-alt)] dark:bg-accent/50 text-[var(--text-primary)] dark:text-[var(--text-primary)] placeholder-gray-300 focus:outline-none focus:border-primary/40 focus:bg-white dark:focus:bg-[var(--surface-raised)] transition-colors"
        />
        {dashSearch && (
          <button onClick={() => setDashSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] font-bold text-sm">×</button>
        )}
      </div>
      )}

      {/* ── Section Tabs ── */}
      {!expandAll && (
      <div className={cn("flex border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] overflow-x-auto", fullscreen && "justify-center gap-1")} style={{scrollbarWidth:"none" as React.CSSProperties["scrollbarWidth"],marginBottom:"20px"}}>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={()=>setSection(s.id)}
            className={cn(
              "flex items-center gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2.5 font-semibold whitespace-nowrap border-b-2 -mb-px transition-all shrink-0",
              fullscreen ? "text-sm" : "text-xs",
              section===s.id
                ? "border-gray-900 dark:border-foreground text-[var(--text-primary)] dark:text-[var(--text-primary)]"
                : "border-transparent text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--text-secondary)]"
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
        // Quick status counts
        const pendingCount = orders.filter(o => o.status === "pendiente").length;
        const enCaminoCount = orders.filter(o => o.status === "en_camino").length;
        const agotadosCount = products.filter(p => p.stock != null && p.stock <= 0).length;
        const stockBajoCount = products.filter(p => p.stock != null && p.stockMin != null && p.stock > 0 && p.stock <= p.stockMin).length;
        return (
          <div className="mb-4 rounded-xl border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 bg-[var(--surface-sunken)] px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex flex-wrap items-center gap-2">
                <Sun className="h-4.5 w-4.5 text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" />
                <span className="text-sm font-extrabold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">Resumen de hoy</span>
                <span className="text-[length:var(--ts-2xs)] text-[var(--data-success-500)]/70 dark:text-[var(--data-success-500)]/60">{new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "short" })}</span>
              </div>
              {ydRev > 0 && (
                <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", isUp ? "text-[var(--data-success-500)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" : "text-[var(--data-error-500)] bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/40")}>
                  {isUp ? "↑" : "↓"} {Math.abs(delta).toFixed(0)}% vs ayer
                </span>
              )}
            </div>
            {/* Revenue row */}
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="text-center">
                <p className="text-xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">S/{todayRev.toFixed(0)}</p>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">Ingresos</p>
              </div>
              <div className="text-center border-x border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30">
                <p className="text-xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{todayCount}</p>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">Transacciones</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">S/{todayAvg.toFixed(0)}</p>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">Ticket prom.</p>
              </div>
            </div>
            {/* Status row — pending orders + stock */}
            {(pendingCount > 0 || enCaminoCount > 0 || agotadosCount > 0 || stockBajoCount > 0) && (
              <div className="flex flex-wrap gap-2 pt-3 border-t border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30">
                {pendingCount > 0 && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">
                    <Clock className="h-3 w-3" /> {pendingCount} pendiente{pendingCount !== 1 ? "s" : ""}
                  </span>
                )}
                {enCaminoCount > 0 && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
                    <Truck className="h-3 w-3" /> {enCaminoCount} en camino
                  </span>
                )}
                {agotadosCount > 0 && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30 text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">
                    <PackageX className="h-3 w-3" /> {agotadosCount} agotado{agotadosCount !== 1 ? "s" : ""}
                  </span>
                )}
                {stockBajoCount > 0 && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">
                    <AlertTriangle className="h-3 w-3" /> {stockBajoCount} stock bajo
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Panel Resumen del Día (API real) ── */}
      {!loading && (expandAll || section === "resumen") && (
        <div className="mb-4">
          <DailySummaryPanel />
        </div>
      )}

      {/* ── Smart Insights ── */}
      {st.insights.length > 0 && (expandAll || section === "resumen") && (
        <div style={{marginBottom:"16px"}}>
          <div className="flex items-center gap-1.5 mb-2.5">
            <Lightbulb className="h-3.5 w-3.5 text-[var(--data-warning-500)]" />
            <span className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Alertas inteligentes</span>
            <span className="text-xs text-[var(--text-tertiary)] dark:text-muted ml-1">{st.insights.length}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {st.insights.map((ins, i) => (
              <div key={i} className={cn(
                "flex gap-3 p-3 rounded-xl border transition-colors",
                ins.type === "danger" ? "bg-[var(--data-error-50)]/60 border-[var(--data-error-500)]" :
                ins.type === "warning" ? "bg-[var(--data-warning-50)]/60 border-[var(--data-warning-500)]" :
                ins.type === "success" ? "bg-[var(--accent-soft)]/60 border-[var(--data-success-500)]/30" :
                "bg-[var(--surface-alt)]/60 border-[var(--rule-soft)]"
              )}>
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  ins.type === "danger" ? "bg-[var(--data-error-100)] text-[var(--data-error-500)]" :
                  ins.type === "warning" ? "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]" :
                  ins.type === "success" ? "bg-[var(--accent-soft)] text-[var(--data-success-500)]" :
                  "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                )}>
                  <ins.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className={cn(
                    "text-xs font-semibold leading-tight",
                    ins.type === "danger" ? "text-[var(--data-error-500)]" :
                    ins.type === "warning" ? "text-[var(--data-warning-500)]" :
                    ins.type === "success" ? "text-[var(--data-success-500)]" :
                    "text-[var(--text-primary)]"
                  )}>{ins.title}</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">{ins.desc}</p>
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
              a.type==="danger"?"bg-[var(--data-error-50)] text-[var(--data-error-500)]":a.type==="warning"?"bg-[var(--data-warning-50)] text-[var(--data-warning-500)]":"bg-[var(--surface-alt)] text-[var(--text-secondary)]"
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
          <div className="w-7 h-7 rounded-lg bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] flex items-center justify-center">
            <BarChart3 className="h-3.5 w-3.5 text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" />
          </div>
          <CardTitle className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Resumen</CardTitle>
        </div>
      )}
      {(expandAll || section === "resumen") && (
        <div className={cn("space-y-4", expandAll && "col-span-full")}>
          {/* ── Monthly Goals Card ── */}
          {period === "mes" && (
            <div className="bg-[var(--surface-sunken)] rounded-xl border border-[var(--rule-base)] p-3 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-[var(--text-primary)] flex items-center justify-center">
                    <Target className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Metas del Mes</CardTitle>
                    <p className="text-xs text-[var(--text-secondary)] dark:text-muted">{new Date().toLocaleDateString("es-PE", { month: "long", year: "numeric" })}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {Object.values(monthlyGoals).some(v => v > 0) && (
                    <button
                      onClick={() => setShowGoalHistory(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] bg-white/60 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 transition-colors"
                    >
                      <BarChart3 className="h-3.5 w-3.5" /> Histórico
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setTempGoals(monthlyGoals);
                      setEditingMonthlyGoals(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[var(--text-primary)] hover:opacity-90 transition-colors "
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
                      <div key={metric.key} className="bg-white/70 dark:bg-gray-900/30 rounded-xl p-4 border border-white/50 dark:border-[var(--rule-base)]">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center",
                              metric.color === "emerald" && "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",
                              metric.color === "blue" && "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",
                              metric.color === "violet" && "bg-[var(--surface-sunken)]",
                              metric.color === "amber" && "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30"
                            )}>
                              <metric.icon className={cn(
                                "h-4 w-4",
                                metric.color === "emerald" && "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
                                metric.color === "blue" && "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
                                metric.color === "violet" && "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
                                metric.color === "amber" && "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]"
                              )} />
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-[var(--text-secondary)]">{metric.label}</p>
                              <p className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{metric.format(metric.value)}</p>
                            </div>
                          </div>
                          {status === "complete" && <Trophy className="h-5 w-5 text-[var(--data-warning-500)]" />}
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[var(--text-secondary)] dark:text-muted">Meta: {metric.format(metric.goal)}</span>
                            <span className={cn(
                              "font-bold",
                              status === "complete" && "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
                              status === "good" && "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
                              status === "warning" && "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",
                              status === "danger" && "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]"
                            )}>
                              {pct.toFixed(0)}%
                            </span>
                          </div>
                          <div className="h-2 bg-[var(--rule-soft)] dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-[var(--dur-slow)]",
                                status === "complete" && "bg-[var(--data-success-500)]",
                                status === "good" && "bg-[var(--data-success-500)]",
                                status === "warning" && "bg-[var(--data-warning-500)]",
                                status === "danger" && "bg-[var(--data-error-500)]"
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <p className={cn(
                            "text-[length:var(--ts-2xs)] font-medium",
                            status === "complete" && "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
                            status === "good" && "text-[var(--text-secondary)]",
                            status === "warning" && "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",
                            status === "danger" && "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]"
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
                  className="w-full py-8 rounded-xl border-2 border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)] dark:text-muted hover:border-[var(--data-info-500)] dark:hover:border-[var(--data-info-500)] hover:text-[var(--text-primary)] dark:hover:text-[var(--text-primary)] transition-colors group"
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
            <div className="modal-backdrop p-4" onClick={() => setEditingMonthlyGoals(false)}>
              <div className="bg-[var(--surface-raised)] rounded-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-3 sm:px-6 py-4 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-[var(--text-primary)] flex items-center justify-center">
                      <Target className="h-4 w-4 text-white" />
                    </div>
                    <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Metas del mes</CardTitle>
                  </div>
                  <button onClick={() => setEditingMonthlyGoals(false)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:bg-[var(--surface-sunken)] dark:hover:bg-accent"><X className="h-5 w-5" /></button>
                </div>
                <div className="px-3 sm:px-6 py-5 space-y-4">
                  <p className="text-sm text-[var(--text-secondary)] dark:text-muted">Define tus objetivos para {new Date().toLocaleDateString("es-PE", { month: "long", year: "numeric" })}</p>
                  <div className="grid gap-2 sm:gap-4">
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1.5">
                        <DollarSign className="h-3.5 w-3.5" /> Ingresos mensuales (S/)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={tempGoals.revenue || ""}
                        onChange={e => setTempGoals(prev => ({ ...prev, revenue: Number(e.target.value) }))}
                        placeholder="5000"
                        className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-[var(--text-primary)] outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1.5">
                        <ShoppingCart className="h-3.5 w-3.5" /> Pedidos del mes
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={tempGoals.orders || ""}
                        onChange={e => setTempGoals(prev => ({ ...prev, orders: Number(e.target.value) }))}
                        placeholder="100"
                        className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-[var(--text-primary)] outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1.5">
                        <Users className="h-3.5 w-3.5" /> Clientes atendidos
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={tempGoals.customers || ""}
                        onChange={e => setTempGoals(prev => ({ ...prev, customers: Number(e.target.value) }))}
                        placeholder="50"
                        className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-[var(--text-primary)] outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1.5">
                        <Receipt className="h-3.5 w-3.5" /> Ticket promedio (S/)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={5}
                        value={tempGoals.avgTicket || ""}
                        onChange={e => setTempGoals(prev => ({ ...prev, avgTicket: Number(e.target.value) }))}
                        placeholder="50"
                        className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-[var(--text-primary)] outline-none text-sm"
                      />
                    </div>
                  </div>
                  <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 rounded-xl p-3">
                    <p className="text-xs text-[var(--data-success-500)] dark:text-[var(--data-success-500)]"><strong>Consejo:</strong> Establece metas realistas basadas en tu histórico y +10-15% de crecimiento.</p>
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-3 px-3 sm:px-6 py-4 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                  <button onClick={() => setEditingMonthlyGoals(false)} className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-sunken)] dark:hover:bg-accent transition-colors">Cancelar</button>
                  <button onClick={saveMonthlyGoals} className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg text-sm font-bold text-white bg-[var(--text-primary)] hover:opacity-90 transition-colors ">Guardar metas</button>
                </div>
              </div>
            </div>
          )}
          
          {/* Goal History Modal */}
          {showGoalHistory && (
            <div className="modal-backdrop p-4" onClick={() => setShowGoalHistory(false)}>
              <div className="bg-[var(--surface-raised)] rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-3 sm:px-6 py-4 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] shrink-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-[var(--text-primary)] flex items-center justify-center">
                      <BarChart3 className="h-4 w-4 text-white" />
                    </div>
                    <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Histórico de metas</CardTitle>
                  </div>
                  <button onClick={() => setShowGoalHistory(false)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:bg-[var(--surface-sunken)] dark:hover:bg-accent"><X className="h-5 w-5" /></button>
                </div>
                <div className="overflow-y-auto flex-1 px-3 sm:px-6 py-5">
                  {(() => {
                    const history = JSON.parse(localStorage.getItem("buleje-goals-history") || "{}");
                    const entries = Object.entries(history).sort((a, b) => b[0].localeCompare(a[0]));
                    if (entries.length === 0) {
                      return <div className="text-center py-8 text-[var(--text-tertiary)] dark:text-muted text-sm">No hay histórico disponible aún</div>;
                    }
                    return (
                      <div className="space-y-6">
                        {entries.map(([monthKey, data]) => {
                          const entry = data as { goals: Record<string, number>; savedAt: string; actual?: Record<string, number> };
                          const date = new Date(monthKey + "-01");
                          const monthLabel = date.toLocaleDateString("es-PE", { month: "long", year: "numeric" });
                          return (
                            <div key={monthKey} className="bg-[var(--surface-alt)] dark:bg-surface rounded-xl p-4 border border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                              <h4 className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 capitalize">{monthLabel}</h4>
                              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                                <div>
                                  <span className="text-[var(--text-secondary)] dark:text-muted block mb-1">Ingresos</span>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(entry.actual?.revenue || 0)}</span>
                                    <span className="text-[var(--text-tertiary)] dark:text-muted">/</span>
                                    <span className="text-[var(--text-secondary)] dark:text-muted">{fmt(entry.goals?.revenue || 0)}</span>
                                    {entry.goals?.revenue > 0 && (
                                      <span className={cn(
                                        "ml-auto text-xs font-bold",
                                        (entry.actual?.revenue || 0) >= entry.goals.revenue ? "text-[var(--data-success-500)]" : "text-[var(--data-warning-500)]"
                                      )}>
                                        {((entry.actual?.revenue || 0) / entry.goals.revenue * 100).toFixed(0)}%
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <span className="text-[var(--text-secondary)] dark:text-muted block mb-1">Pedidos</span>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{entry.actual?.orders || 0}</span>
                                    <span className="text-[var(--text-tertiary)] dark:text-muted">/</span>
                                    <span className="text-[var(--text-secondary)] dark:text-muted">{entry.goals?.orders || 0}</span>
                                    {entry.goals?.orders > 0 && (
                                      <span className={cn(
                                        "ml-auto text-xs font-bold",
                                        (entry.actual?.orders || 0) >= entry.goals.orders ? "text-[var(--data-success-500)]" : "text-[var(--data-warning-500)]"
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
            <div className="flex items-center justify-between px-2 sm:px-4 py-1.5 sm:py-2 bg-[var(--surface-sunken)] rounded-xl border border-[var(--rule-base)]">
              <div className="flex flex-wrap items-center gap-2">
                <CalendarDays className="h-4 w-4 text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" />
                <span className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                  Comparado con{" "}
                  {period === "hoy" ? "ayer" : period === "semana" ? "semana anterior" : period === "mes" ? "mes anterior" : "período anterior"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {st.dVentas != null && (
                  <span className={cn("text-xs font-bold px-2 py-1 rounded-lg", st.dVentas >= 0 ? "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" : "bg-[var(--data-error-500)]/10 text-[var(--data-error-500)] dark:text-[var(--data-error-500)]")}>
                    {st.dVentas >= 0 ? "↑" : "↓"} {Math.abs(st.dVentas).toFixed(1)}% ventas
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Sprint 3: Morning Briefing Card */}
          <div className="bg-[var(--brand-ink)] rounded-lg p-4 text-white">
            <div className="flex items-center justify-between mb-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                  <Lightbulb className="h-4 w-4 text-[var(--data-warning-500)]" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold">Buenos días</CardTitle>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })}</p>
                </div>
              </div>
              {st.todayRevenue > 0 && (
                <div className="text-right">
                  <div className="text-lg font-bold text-[var(--data-success-500)]">{fmt(st.todayRevenue)}</div>
                  <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">hoy</div>
                </div>
              )}
            </div>

            {/* Yesterday summary */}
            <div className="flex flex-wrap items-center gap-3 mb-3 px-3 py-2 rounded-lg bg-white/5">
              <div className="flex-1">
                <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Ayer</span>
                <div className="flex flex-wrap items-center gap-3 mt-0.5">
                  <span className="text-sm font-bold">{fmt(st.yesterdayRevenue)}</span>
                  <span className="text-xs text-[var(--text-tertiary)]">{st.yesterdayTickets} ticket{st.yesterdayTickets !== 1 ? "s" : ""}</span>
                </div>
              </div>
              {dailyGoal > 0 && (
                <div className="text-right">
                  <span className={cn("text-xs font-bold", st.yesterdayRevenue >= dailyGoal ? "text-[var(--data-success-500)]" : "text-[var(--data-warning-500)]")}>
                    {st.yesterdayRevenue >= dailyGoal ? "Meta" : `${((st.yesterdayRevenue / dailyGoal) * 100).toFixed(0)}%`}
                  </span>
                </div>
              )}
            </div>

            {/* Today's priorities */}
            {st.briefingPriorities.length > 0 && (
              <div>
                <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mb-1.5">Prioridades de hoy</div>
                <div className="space-y-1">
                  {st.briefingPriorities.map((p, i) => (
                    <div key={i} className="text-xs text-[var(--text-tertiary)] py-1 px-2 rounded bg-white/5">
                      {p}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {st.briefingPriorities.length === 0 && (
              <div className="text-xs text-[var(--data-success-500)] text-center py-1">Sin prioridades pendientes. ¡Buen día!</div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Kpi label="Ventas Netas" value={fmt(st.ventas)} icon={DollarSign} accent="text-[var(--data-success-500)]" delta={st.dVentas} sparklineData={st.sparklineRevenue} />
            <Kpi label="Utilidad" value={fmt(st.utilidad)} icon={TrendingUp} accent="text-[var(--data-success-500)]" delta={st.dUtilidad} sparklineData={st.sparklineProfit} />
            <Kpi label="Margen" value={`${Number(st.margen).toFixed(1)}%`} icon={Percent} accent={st.margen>=25?"text-[var(--data-success-500)]":st.margen>=15?"text-[var(--data-warning-500)]":"text-[var(--data-error-500)]"} delta={st.dMargen} />
            <Kpi label="Tickets" value={String(st.tickets)} icon={Receipt} accent="text-[var(--text-secondary)]" delta={st.dTickets} sparklineData={st.sparklineOrders} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Kpi label="Ticket Prom." value={fmt(st.ticketProm)} icon={ShoppingCart} accent="text-[var(--text-secondary)]" delta={st.dTicketProm} sparklineData={st.sparklineAvgTicket} />
            <Kpi label="Uds. Vendidas" value={String(st.uds)} icon={Package} accent="text-cyan-500" delta={st.dUds} />
            <Kpi label="Clientes" value={String(st.clientesAtendidos)} icon={Users} accent="text-[var(--text-secondary)]" delta={st.dClientes} />
            <Kpi label="Stock Valor." value={fmt(st.stockVal)} icon={ShoppingBasket} accent="text-[var(--data-warning-500)]" />
          </div>

          {/* S3: Daily sales goal */}
          <Card title="Meta del día" icon={Target}>

          {/* ── Alerts Panel (collapsible) ── */}
          {(() => {
            const alertItems: { type: "danger" | "warning" | "info"; msg: string }[] = [];
            if (st.agotados.length > 0) alertItems.push({ type: "danger", msg: `${st.agotados.length} producto${st.agotados.length>1?"s":""} agotado${st.agotados.length>1?"s":""}: ${st.agotados.slice(0,3).map(p => p.name).join(", ")}${st.agotados.length>3?" ...":""}` });
            if (st.stockCritico.length > 0) alertItems.push({ type: "warning", msg: `${st.stockCritico.length} producto${st.stockCritico.length>1?"s":""} con stock bajo: ${st.stockCritico.slice(0,3).map(p => `${p.name} (${p.stock ?? 0})`).join(", ")}` });
            const pendingOrders = orders.filter(o => o.status === "pendiente").length;
            if (pendingOrders > 0) alertItems.push({ type: "warning", msg: `${pendingOrders} pedido${pendingOrders>1?"s":""} pendiente${pendingOrders>1?"s":""} por confirmar` });
            const nearExpiry = products.filter(p => {
              const exp = (p as unknown as { expiryDate?: string }).expiryDate;
              if (!exp) return false;
              const days = (new Date(exp).getTime() - Date.now()) / 86400000;
              return days >= 0 && days <= 7;
            });
            if (nearExpiry.length > 0) alertItems.push({ type: "danger", msg: `${nearExpiry.length} producto${nearExpiry.length>1?"s":""} próximo${nearExpiry.length>1?"s":""} a vencer (7 días)` });
            if (st.margen < 15) alertItems.push({ type: "warning", msg: `Margen general bajo: ${Number(st.margen).toFixed(1)}% — revisar precios o costos` });
            if (alertItems.length === 0) return null;
            return (
              <div className="rounded-xl border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)]/50 dark:bg-amber-950/15 p-4">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]" />
                    <span className="text-sm font-bold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">Alertas activas ({alertItems.length})</span>
                  </div>
                  <button onClick={() => setAlertsCollapsed(c => !c)} className="p-1 rounded-lg hover:bg-[var(--data-warning-500)]/50 dark:hover:bg-[var(--data-warning-500)]/30 transition-colors">
                    <ChevronRight className={cn("h-4 w-4 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] transition-transform", !alertsCollapsed && "rotate-90")} />
                  </button>
                </div>
                {!alertsCollapsed && <div className="space-y-1.5">
                  {alertItems.map((a, i) => (
                    <div key={i} className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium",
                      a.type === "danger" ? "bg-[var(--data-error-100)] dark:bg-red-950/30 text-[var(--data-error-500)] dark:text-[var(--data-error-500)]" :
                      a.type === "warning" ? "bg-[var(--data-warning-100)] dark:bg-amber-950/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]" :
                      "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)]"
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
              <div className="rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <Clock className="h-4 w-4 text-[var(--text-secondary)]" />
                  <p className="text-xs font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Ventas por hora — Mapa de calor</p>
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
                        <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">{h}h</span>
                        {val > 0 && (
                          <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                            {h}:00 — S/{val.toFixed(0)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Menos ventas</span>
                  <div className="flex flex-wrap gap-0.5">
                    {[0.1, 0.3, 0.5, 0.7, 0.9].map(o => (
                      <div key={o} className="w-3 h-2 rounded-sm" style={{ background: `rgba(45,106,79,${o})` }} />
                    ))}
                  </div>
                  <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Más ventas</span>
                </div>
              </div>
            );
          })()}
            {editingGoal ? (
              <form onSubmit={(e) => { e.preventDefault(); const v = dailyGoal; localStorage.setItem("daily-sales-goal", String(v)); setEditingGoal(false); }} className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-[var(--text-secondary)]">S/</span>
                <input type="number" min={0} step={10} value={dailyGoal || ""} onChange={(e) => setDailyGoal(Number(e.target.value))} className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-zinc-700 text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] bg-[var(--surface-raised)] outline-none focus:border-primary" autoFocus />
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
                    <span className="text-xs text-[var(--text-secondary)] dark:text-muted">{fmt(todaySales)} de {fmt(dailyGoal)}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-bold ${pct >= 100 ? "text-[var(--data-success-500)]" : pct >= 60 ? "text-[var(--data-warning-500)]" : "text-[var(--data-error-500)]"}`}>{pct.toFixed(0)}%</span>
                      <button onClick={() => setEditingGoal(true)} className="text-[var(--text-tertiary)] hover:text-primary transition-colors"><Edit3 className="h-3 w-3" /></button>
                    </div>
                  </div>
                  <div className="h-3 bg-[var(--surface-sunken)] dark:bg-surface rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-[var(--dur-slow)] ${pct >= 100 ? "bg-[var(--accent-soft)]" : pct >= 60 ? "bg-[var(--data-warning-500)]" : "bg-[var(--data-error-500)]"}`} style={{ width: `${pct}%` }} />
                  </div>
                  {pct >= 100 && <p className="text-[length:var(--ts-2xs)] text-[var(--data-success-500)] font-bold mt-1.5 text-center">¡Meta alcanzada!</p>}
                </div>
              );
            })() : (
              <button onClick={() => setEditingGoal(true)} className="w-full py-3 rounded-lg border-2 border-dashed border-[var(--rule-base)] dark:border-zinc-700 text-[var(--text-tertiary)] text-xs font-medium hover:border-primary hover:text-primary transition-colors">
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
            periodLabel={period === "hoy" ? "hoy" : period === "semana" ? "esta semana" : period === "mes" ? "este mes" : period === "año" ? "este año" : period === "custom" ? "período" : "todo"}
            previousPeriodComparison={
              period !== "todo" && st.dVentas !== null
                ? {
                    orders: st.dTickets ?? 0,
                    revenue: st.dVentas ?? 0,
                  }
                : undefined
            }
          />

          {/* ── 6 Overview Charts (DS primitives) ── */}
          <DashboardOverviewCharts
            period={(period === "todo" ? "año" : period) as DSPeriod}
            dateRange={period === "custom" ? dateRange : undefined}
            orders={orders}
            sales={sales}
            purchases={purchases}
            products={products}
            customers={customers}
          />

          <div className="grid lg:grid-cols-5 gap-3">
            <div className="lg:col-span-3 bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)] p-4">
              <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-3">Ventas por día</p>
              {st.daily.length === 0 ? <Empty /> : (
                <div className="relative h-32">
                  <svg viewBox={`0 0 ${st.daily.length * 50} 120`} className="w-full h-full" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="areaGradSmall" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--data-success)" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="var(--data-success)" stopOpacity="0" />
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
                      fill="none" stroke="var(--data-success)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
                    />
                    {st.daily.map(([,v],i) => (
                      <circle key={i} cx={i*50+25} cy={100-((v/(st.maxDaily||1))*85)} r="2.5" fill="var(--data-success)" stroke="white" strokeWidth="1.5" />
                    ))}
                  </svg>
                  <div className="flex justify-between px-0.5">
                    {st.daily.map(([dk]) => (
                      <span key={dk} className="text-xs text-[var(--text-tertiary)] dark:text-muted truncate text-center" style={{width:`${100/st.daily.length}%`}}>{dayLabel(dk)}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-2 bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)] p-4">
              <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-3">Métodos de pago</p>
              {st.payments.length === 0 ? <Empty /> : (
                <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                  <Donut data={st.payments} total={st.payTotal} />
                  <div className="flex-1 space-y-1.5">
                    {st.payments.map(p => (
                      <div key={p.method} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{background:p.color}} />
                          <span className="text-[var(--text-secondary)]">{p.label}</span>
                        </div>
                        <span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{st.payTotal>0?((p.total/st.payTotal)*100).toFixed(0):0}%</span>
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
                      {i % 3 === 0 && <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">{i}h</span>}
                      {c > 0 && <span className="absolute -top-5 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">{c} ventas</span>}
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
                <Beaker className="h-12 w-12 text-[var(--text-tertiary)] dark:text-muted mx-auto mb-2" />
                <p className="text-xs text-[var(--text-secondary)] dark:text-muted mb-3">No hay pruebas A/B activas</p>
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
                    <div key={test.id} className="border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">{test.name}</h4>
                          <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)] dark:text-muted mt-0.5">{test.hypothesis}</p>
                        </div>
                        <DBadge color={test.status === "running" ? "green" : test.status === "completed" ? "blue" : "gray"}>
                          {test.status === "running" ? "En curso" : test.status === "completed" ? "Completo" : "Pausado"}
                        </DBadge>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                        {test.variants.map(v => {
                          const convRate = v.visitors > 0 ? (v.conversions / v.visitors) * 100 : 0;
                          const isWinner = winner === v.id;
                          return (
                            <div key={v.id} className={cn(
                              "p-2 rounded-lg border-2 transition-all",
                              isWinner ? "border-[var(--data-success-500)]/30 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" : "border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-alt)] dark:bg-surface"
                            )}>
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">{v.name}</span>
                                {isWinner && <Trophy className="h-3 w-3 text-[var(--data-success-500)]" />}
                              </div>
                              <div className="text-xs">
                                <div className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{convRate.toFixed(1)}%</div>
                                <div className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">{v.visitors} visitantes • {v.conversions} conversiones</div>
                                {test.metric === "revenue" && <div className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)] font-semibold">S/{Number(v.revenue).toFixed(2)}</div>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {winner && isSignificant && (
                        <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 rounded-lg p-2 text-center">
                          <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
                            Ganador: {test.variants.find(v => v.id === winner)?.name} (+{Math.abs(diff).toFixed(1)}% mejor)
                          </p>
                        </div>
                      )}
                      {!winner && test.status === "running" && (
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted text-center">
                          Se necesitan más datos para determinar un ganador con confianza
                        </p>
                      )}
                    </div>
                  );
                })}
                {abTests.length > 5 && (
                  <p className="text-xs text-[var(--text-tertiary)] text-center pt-1">+{abTests.length - 5} pruebas más</p>
                )}
              </div>
            )}
          </Card>

          {/* A/B Test Modal */}
          {showABTestModal && (
            <div className="modal-backdrop p-4" onClick={() => setShowABTestModal(false)}>
              <div className="bg-[var(--surface-raised)] rounded-xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-3 sm:px-6 py-4 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-[var(--text-primary)] flex items-center justify-center">
                      <Beaker className="h-4 w-4 text-white" />
                    </div>
                    <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Nueva Prueba A/B</CardTitle>
                  </div>
                  <button onClick={() => setShowABTestModal(false)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:bg-[var(--surface-sunken)] dark:hover:bg-accent"><X className="h-5 w-5" /></button>
                </div>
                <div className="px-3 sm:px-6 py-5 space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1.5 block">Nombre del test</label>
                    <input type="text" value={abTestForm.name} onChange={e => setAbTestForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Ej: Banner promocional vs. Sin banner"
                      className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-[var(--text-primary)] outline-none text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1.5 block">Hipótesis</label>
                    <textarea value={abTestForm.hypothesis} onChange={e => setAbTestForm(prev => ({ ...prev, hypothesis: e.target.value }))}
                      placeholder="Ej: Agregar un banner con descuento aumentará la conversión en 15%"
                      rows={2}
                      className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-[var(--text-primary)] outline-none text-sm resize-none" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1.5 block">Variante A (Control)</label>
                      <input type="text" value={abTestForm.variantA} onChange={e => setAbTestForm(prev => ({ ...prev, variantA: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-[var(--text-primary)] outline-none text-sm" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1.5 block">Variante B</label>
                      <input type="text" value={abTestForm.variantB} onChange={e => setAbTestForm(prev => ({ ...prev, variantB: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-[var(--text-primary)] outline-none text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1.5 block">Métrica a medir</label>
                    <select value={abTestForm.metric} onChange={e => setAbTestForm(prev => ({ ...prev, metric: e.target.value as "revenue"|"conversion"|"aov"|"retention" }))}
                      className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-[var(--text-primary)] outline-none text-sm">
                      <option value="conversion">Tasa de conversión</option>
                      <option value="revenue">Ingresos</option>
                      <option value="aov">Valor promedio de orden</option>
                      <option value="retention">Retención</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1.5 block">Fecha inicio</label>
                      <input type="date" value={abTestForm.startDate} onChange={e => setAbTestForm(prev => ({ ...prev, startDate: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-[var(--text-primary)] outline-none text-sm" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1.5 block">Fecha fin</label>
                      <input type="date" value={abTestForm.endDate} onChange={e => setAbTestForm(prev => ({ ...prev, endDate: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-[var(--text-primary)] outline-none text-sm" />
                    </div>
                  </div>
                  <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 rounded-xl p-3">
                    <p className="text-xs text-[var(--data-success-500)] dark:text-[var(--data-success-500)]"><strong>Recomendación:</strong> Ejecuta pruebas por al menos 7-14 días y 100+ visitantes por variante para resultados confiables.</p>
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-3 px-3 sm:px-6 py-4 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                  <button onClick={() => setShowABTestModal(false)} className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-sunken)] dark:hover:bg-accent transition-colors">Cancelar</button>
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
                    localStorage.setItem("buleje-ab-tests", JSON.stringify(updated));
                    setShowABTestModal(false);
                    setAbTestForm({ name: "", hypothesis: "", variantA: "Control", variantB: "Variant B", metric: "conversion", startDate: "", endDate: "" });
                  }} className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg text-sm font-bold text-white bg-[var(--text-primary)] hover:opacity-90 transition-colors ">Crear test</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <BentoGrid active={expandAll}>
      {(expandAll || section === "ventas") && (
        <DashboardVentasSection st={st} expandAll={expandAll} orders={orders} sales={sales} period={period} quickStatusMap={quickStatusMap} changingStatusId={changingStatusId} handleQuickStatus={handleQuickStatus} printTicket={printTicket} adminNotes={adminNotes} saveAdminNote={saveAdminNote} selectedOrders={selectedOrders} toggleOrderSelection={toggleOrderSelection} handleBulkStatus={handleBulkStatus} bulkUpdating={bulkUpdating} expandedHistory={expandedHistory} toggleHistory={toggleHistory} />
      )}
      {(expandAll || section === "productos") && (
        <DashboardProductosSection st={st} expandAll={expandAll} products={products} />
      )}
      {(expandAll || section === "inventario") && (
        <DashboardInventarioSection st={st} expandAll={expandAll} />
      )}
      {(expandAll || section === "clientes") && (
        <DashboardClientesSection st={st} expandAll={expandAll} orders={orders} customers={customers} products={products} showCohortRetention={showCohortRetention} setShowCohortRetention={setShowCohortRetention} showCrossSell={showCrossSell} setShowCrossSell={setShowCrossSell} selectedProductForCrossSell={selectedProductForCrossSell} setSelectedProductForCrossSell={setSelectedProductForCrossSell} reviewFilter={reviewFilter} setReviewFilter={setReviewFilter} reviews={reviews} />
      )}
      {(expandAll || section === "compras") && (
        <DashboardComprasCajaSection st={st} expandAll={expandAll} section="compras" />
      )}
      {(expandAll || section === "caja") && (
        <DashboardComprasCajaSection st={st} expandAll={expandAll} section="caja" />
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
    "emerald-500": "var(--accent)",
    "violet-500": "#8b5cf6",
    "indigo-500": "var(--accent)",
    "cyan-500": "#06b6d4",
    "amber-500": "#f59e0b",
    "red-500": "#ef4444",
  };
  const strokeColor = colorMap[color] || "var(--accent)";
  
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
    <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)] px-2 sm:px-4 py-2 sm:py-3.5 hover:border-gray-200 dark:hover:border-gray-600 transition-all relative overflow-hidden">
      {/* Visual gradient indicator on top edge for significant changes */}
      {delta != null && Math.abs(delta) >= 10 && (
        <div className={cn("absolute top-0 left-0 right-0 h-1", isPositive ? "bg-[var(--data-success-500)]" : "bg-[var(--data-error-500)]")} />
      )}
      <p className="text-xs font-medium text-[var(--text-tertiary)] dark:text-muted mb-2.5 truncate">{label}</p>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <p className="text-base sm:text-xl font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] tabular-nums leading-none">{animatedValue}</p>
          {delta != null && delta !== undefined ? (
            <div className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-bold", isPositive ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" : "bg-[var(--data-error-50)] dark:bg-red-950/30 text-[var(--data-error-500)] dark:text-[var(--data-error-500)]")}>
              {arrowUp ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {Math.abs(delta).toFixed(1)}%
            </div>
          ) : delta === null ? (
            <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">— Sin datos anteriores</span>
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
    <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)] p-4">
      <div className="flex items-center justify-between mb-4">
        <CardTitle className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-[var(--text-tertiary)] dark:text-muted" style={{letterSpacing:"0.06em"}}>
          <Icon className="h-3 w-3 text-[var(--text-tertiary)] dark:text-muted" />{title.toUpperCase()}
        </CardTitle>
        {action}
      </div>
      {children}
    </div>
  );
}

function DBadge({ children, color }: { children: React.ReactNode; color: "green"|"red"|"amber"|"blue"|"purple"|"gray" }) {
  const m: Record<string,string> = {
    green:"bg-[var(--accent-soft)] text-[var(--data-success-500)]", red:"bg-red-50 text-[var(--data-error-600)]",
    amber:"bg-amber-50 text-[var(--data-warning-600)]", blue:"bg-[var(--accent-soft)] text-[var(--data-success-500)]",
    purple:"bg-[var(--surface-sunken)] text-[var(--text-secondary)]", gray:"bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  };
  return <span className={cn("inline-flex px-1.5 py-0.5 rounded text-xs font-semibold",m[color])}>{children}</span>;
}

function _FlowRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-[var(--text-secondary)] dark:text-muted">{label}</span>
      <span className={cn("text-xs font-semibold", color)}>{value}</span>
    </div>
  );
}

function Empty({ text = "Sin datos en este periodo" }: { text?: string }) {
  return <div className="py-8 text-center text-xs text-[var(--text-tertiary)] dark:text-muted">{text}</div>;
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
      <div className="absolute rounded-full bg-[var(--surface-raised)] flex items-center justify-center" style={{ inset: size*0.2 }}>
        <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{fmt(total)}</span>
      </div>
    </div>
  );
}


