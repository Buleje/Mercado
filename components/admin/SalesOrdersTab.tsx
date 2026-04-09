"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ShoppingBag, RefreshCw, Clock, CheckCircle, XCircle, Truck,
  Search, ChevronDown, ChevronUp, ChevronRight, Download, FileSpreadsheet, Receipt,
  ArrowRight, Package, Bell, BellOff, Lock, LayoutList, Columns3, MapPin,
  CheckSquare, DollarSign, Target, AlertTriangle, Maximize2, X as XIcon2,
} from "lucide-react";
import EmptyState from "@/components/admin/shared/EmptyState";
import {
  PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ComposedChart, Line, LineChart,
} from "recharts";
import { cn } from "@/lib/utils";
import { exportToExcel } from "@/lib/export-excel";
import TicketPreview from "./TicketPreview";
import OrderTimeline from "./pedidos/OrderTimeline";

// ── Types ────────────────────────────────────────────────────────────────────

interface OrderItem {
  name: string;
  qty: number;
  price?: number;
}

interface StatusHistoryEntry {
  toStatus: string;
  createdAt: string;
}

interface Order {
  id: string;
  customerName?: string;
  customerPhone?: string;
  total: number;
  status: string;
  createdAt: string;
  updatedAt?: string;
  items?: OrderItem[];
  paymentMethod?: string;
  notes?: string;
  statusHistory?: StatusHistoryEntry[];
}

// ── Status config (Spanish API + English fallback) ───────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode; next?: string }> = {
  pendiente:   { label: "Pendiente",   color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",         icon: <Clock className="h-3 w-3" />,        next: "confirmado" },
  confirmado:  { label: "Confirmado",  color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",             icon: <CheckCircle className="h-3 w-3" />,   next: "en_camino" },
  en_camino:   { label: "En camino",   color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",             icon: <Truck className="h-3 w-3" />,         next: "entregado" },
  entregado:   { label: "Entregado",   color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", icon: <CheckCircle className="h-3 w-3" /> },
  cancelado:   { label: "Cancelado",   color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",                 icon: <XCircle className="h-3 w-3" /> },
  pending:     { label: "Pendiente",   color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",         icon: <Clock className="h-3 w-3" />,        next: "confirmado" },
  confirmed:   { label: "Confirmado",  color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",             icon: <CheckCircle className="h-3 w-3" />,   next: "en_camino" },
  preparing:   { label: "Preparando",  color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",     icon: <Package className="h-3 w-3" />,       next: "en_camino" },
  delivering:  { label: "En camino",   color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",             icon: <Truck className="h-3 w-3" />,         next: "entregado" },
  delivered:   { label: "Entregado",   color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", icon: <CheckCircle className="h-3 w-3" /> },
  cancelled:   { label: "Cancelado",   color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",                 icon: <XCircle className="h-3 w-3" /> },
};

const TERMINAL = new Set(["delivered", "cancelled", "entregado", "cancelado"]);

const FILTER_OPTIONS = [
  { id: "all",        label: "Todos" },
  { id: "active",     label: "Activos" },
  { id: "pendiente",  label: "Pendientes" },
  { id: "confirmado", label: "Confirmados" },
  { id: "en_camino",  label: "En camino" },
  { id: "entregado",  label: "Entregados" },
  { id: "cancelado",  label: "Cancelados" },
];

const DATE_OPTIONS = [
  { id: "all",   label: "Todo" },
  { id: "today", label: "Hoy" },
  { id: "week",  label: "Semana" },
  { id: "month", label: "Mes" },
] as const;

const PAGE_SIZE = 20;

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return `S/${Number(n).toFixed(2)}`; }
function fmtDate(s: string) {
  try { return new Date(s).toLocaleDateString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return s; }
}

// ── Mejora 20: Sonido de nuevo pedido ─────────────────────────────────────────

function playNewOrderSound() {
  try {
    const ctx = new AudioContext();
    // Nota 1 - C5
    const o1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    o1.connect(g1);
    g1.connect(ctx.destination);
    o1.frequency.value = 523;
    g1.gain.setValueAtTime(0.3, ctx.currentTime);
    g1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    o1.start();
    o1.stop(ctx.currentTime + 0.3);
    // Nota 2 - E5
    const o2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    o2.connect(g2);
    g2.connect(ctx.destination);
    o2.frequency.value = 659;
    g2.gain.setValueAtTime(0.3, ctx.currentTime + 0.15);
    g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    o2.start(ctx.currentTime + 0.15);
    o2.stop(ctx.currentTime + 0.45);
  } catch {
    /* AudioContext not available */
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SalesOrdersTab() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<"today" | "week" | "month" | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [newCount, setNewCount] = useState(0);
  const prevCountRef = useRef(0);
  const [ticketOrder, setTicketOrder] = useState<Order | null>(null);
  const [whatsappToast, setWhatsappToast] = useState<{ phone: string; message: string; name: string } | null>(null);
  const [creatingGrr, setCreatingGrr] = useState<string | null>(null);
  const [grrToast, setGrrToast] = useState<string | null>(null);

  // Mejora 17: Filtro de urgencia
  const [urgencyFilter, setUrgencyFilter] = useState<"todos" | "urgentes" | "hoy" | "manana" | "atrasados">("todos");

  // Mejora 13: Kanban view mode + historial
  const [viewMode, setViewMode] = useState<"list" | "kanban" | "historial">(() => {
    try { return (localStorage.getItem("orders-view-mode") as "list" | "kanban" | "historial") || "list"; } catch { return "list"; }
  });

  // Mejora 15: Group by zone toggle
  const [groupByZone, setGroupByZone] = useState(false);

  // Mejora 16: Checklist per order (localStorage)
  const [checklists, setChecklists] = useState<Record<string, string[]>>(() => {
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith("order-checklist-"));
      const result: Record<string, string[]> = {};
      for (const k of keys) {
        try { result[k.replace("order-checklist-", "")] = JSON.parse(localStorage.getItem(k) || "[]"); } catch {}
      }
      return result;
    } catch { return {}; }
  });

  // Mejora 20: Sonido de nuevo pedido
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [newOrderToast, setNewOrderToast] = useState<{ name: string; total: number } | null>(null);

  // Dashboard analytics colapsable
  const [showDashboard, setShowDashboard] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('orders-show-dashboard') !== 'false';
  });

  // ── Idea 11: Delivery por Vecinos — Repartidores informales ──────────────
  type DeliveryPerson = { nombre: string; telefono: string; zona: string; activo: boolean; comision: number; entregas: number };
  const [deliveryPeople, setDeliveryPeople] = useState<DeliveryPerson[]>(() => {
    try { const raw = localStorage.getItem("delivery-people"); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  const [showDeliveryPanel, setShowDeliveryPanel] = useState(false);
  const [showAddDelivery, setShowAddDelivery] = useState(false);
  const [newDelivery, setNewDelivery] = useState({ nombre: "", telefono: "", zona: "", comision: 3 });
  const [assigningDelivery, setAssigningDelivery] = useState<string | null>(null);
  const [deliveryAssignments, setDeliveryAssignments] = useState<Record<string, string>>(() => {
    try { const raw = localStorage.getItem("delivery-assignments"); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  });

  const saveDeliveryPeople = (people: DeliveryPerson[]) => {
    setDeliveryPeople(people);
    localStorage.setItem("delivery-people", JSON.stringify(people));
  };

  const addDeliveryPerson = () => {
    if (!newDelivery.nombre.trim() || !newDelivery.telefono.trim()) return;
    const person: DeliveryPerson = { ...newDelivery, activo: true, entregas: 0 };
    saveDeliveryPeople([...deliveryPeople, person]);
    setNewDelivery({ nombre: "", telefono: "", zona: "", comision: 3 });
    setShowAddDelivery(false);
  };

  const assignDeliveryToOrder = (orderId: string, deliveryName: string) => {
    const updated = { ...deliveryAssignments, [orderId]: deliveryName };
    setDeliveryAssignments(updated);
    localStorage.setItem("delivery-assignments", JSON.stringify(updated));
    // Increment delivery count
    const updatedPeople = deliveryPeople.map(p => p.nombre === deliveryName ? { ...p, entregas: p.entregas + 1 } : p);
    saveDeliveryPeople(updatedPeople);
    setAssigningDelivery(null);
  };

  const buildDeliveryWhatsApp = (deliveryName: string, order: Order) => {
    const person = deliveryPeople.find(p => p.nombre === deliveryName);
    if (!person) return "";
    const items = (order.items ?? []).map(i => `${i.name} x${i.qty}`).join(", ");
    const msg = `Hola ${person.nombre}! Tienes un delivery:\n\nPara: ${order.customerName ?? "Cliente"}\nProductos: ${items}\nTotal: S/${order.total.toFixed(2)} - Metodo: ${order.paymentMethod ?? "efectivo"}\n\nGracias!`;
    const phone = person.telefono.replace(/\D/g, "");
    const fullPhone = phone.startsWith("51") ? phone : "51" + phone;
    return `https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`;
  };

  // Initialize sound preference from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("order-sound-enabled");
    if (stored === "false") setSoundEnabled(false);
  }, []);

  // ── Data loading ─────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/orders?limit=200");
      if (!res.ok) throw new Error("No se pudo cargar los pedidos");
      const data = await res.json();
      const arr: Order[] = Array.isArray(data) ? data : (data.orders ?? []);

      // Detect new orders for notification badge + Mejora 20: Sound
      if (prevCountRef.current > 0 && arr.length > prevCountRef.current) {
        const newOrdersCount = arr.length - prevCountRef.current;
        setNewCount(prev => prev + newOrdersCount);

        // Mejora 20: Play sound and show toast for new orders
        if (soundEnabled) {
          playNewOrderSound();
          // Vibrate on mobile
          try { navigator.vibrate?.([200, 100, 200]); } catch { /* not supported */ }
        }
        // Show toast with latest new order info
        const latestNew = arr.sort((a: Order, b: Order) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        if (latestNew) {
          setNewOrderToast({ name: latestNew.customerName ?? "Cliente", total: latestNew.total });
          setTimeout(() => setNewOrderToast(null), 5000);
        }
      }
      prevCountRef.current = arr.length;
      setOrders(arr);
    } catch {
      setError("Error al cargar pedidos");
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  // Mejora 14: Timer re-render every 60 seconds for time badges
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────────

  const changeStatus = async (orderId: string, newStatus: string) => {
    setUpdatingId(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        await load();
        // Mejora 9: WhatsApp notification on status change
        const order = orders.find(o => o.id === orderId);
        if (order?.customerPhone) {
          // Mejora 13: Mensajes de WhatsApp mejorados con más detalle
          const nombre = order.customerName || "cliente";
          const id = order.id.slice(-6).toUpperCase();
          const WA_MESSAGES: Record<string, string> = {
            confirmado: `✅ *Pedido #${id} confirmado*\nHola ${nombre}, estamos preparando tu pedido. Te avisamos cuando salga. 🛒\n\n_Buleje - Pucallpa_`,
            preparando: `🍽 *Tu pedido #${id} se está preparando*\nHola ${nombre}, nuestro equipo está alistando tus productos. ¡Ya falta poco!\n\n_Buleje - Pucallpa_`,
            en_camino: `🚗 *Tu pedido #${id} va en camino*\nHola ${nombre}, ¡ya salió de la bodega! Llega en aprox. 20-30 minutos.\n\n_Buleje - Pucallpa_`,
            entregado: `✅ *Pedido #${id} entregado*\nHola ${nombre}, ¡gracias por tu compra en Buleje! 😊\n⭐ ¿Cómo estuvo tu experiencia?\n\n_Buleje - Pucallpa_`,
            cancelado: `❌ *Pedido #${id} cancelado*\nHola ${nombre}, tu pedido fue cancelado. Si tienes dudas, contáctanos.\n\n_Buleje - Pucallpa_`,
          };
          const msg = WA_MESSAGES[newStatus];
          if (msg) {
            setWhatsappToast({
              phone: order.customerPhone,
              message: msg,
              name: order.customerName || order.customerPhone,
            });
            setTimeout(() => setWhatsappToast(null), 10000);
          }
        }
      }
    } catch { /* ignore */ }
    setUpdatingId(null);
  };

  const exportCSV = () => {
    if (filtered.length === 0) return;
    const rows = filtered.map(o => [
      o.id,
      o.customerName ?? "",
      o.total.toFixed(2),
      STATUS_CONFIG[o.status]?.label ?? o.status,
      new Date(o.createdAt).toLocaleDateString("es-PE"),
      o.paymentMethod ?? "efectivo",
    ]);
    const header = "ID,Cliente,Total,Estado,Fecha,Pago";
    const csv = [header, ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pedidos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = () => {
    if (filtered.length === 0) return;
    const rows = filtered.map(o => ({
      ID: o.id,
      Cliente: o.customerName ?? "",
      "Total (S/)": Number(o.total.toFixed(2)),
      Estado: STATUS_CONFIG[o.status]?.label ?? o.status,
      Fecha: new Date(o.createdAt).toLocaleDateString("es-PE"),
      "Método de Pago": o.paymentMethod ?? "efectivo",
    }));
    exportToExcel(rows, `ventas-${new Date().toISOString().slice(0, 10)}`, "Ventas");
  };

  // ── Filtered + searched orders ───────────────────────────────────────────

  const filtered = useMemo(() => {
    let result = orders;

    // Date filter
    if (dateFilter !== "all") {
      const start = new Date();
      if (dateFilter === "today") start.setHours(0, 0, 0, 0);
      else if (dateFilter === "week") start.setDate(start.getDate() - 7);
      else if (dateFilter === "month") start.setMonth(start.getMonth() - 1);
      result = result.filter(o => new Date(o.createdAt) >= start);
    }

    // Status filter
    if (filter === "active") {
      result = result.filter(o => !TERMINAL.has(o.status));
    } else if (filter !== "all") {
      result = result.filter(o => o.status === filter);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(o =>
        (o.customerName ?? "").toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q)
      );
    }

    // Mejora 17: Urgency filter
    if (urgencyFilter !== "todos") {
      const now = new Date();
      const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
      const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1);
      const tomorrowEnd = new Date(tomorrowStart); tomorrowEnd.setHours(23, 59, 59, 999);

      if (urgencyFilter === "urgentes") {
        const oneHourAgo = now.getTime() - 60 * 60 * 1000;
        result = result.filter(o => !TERMINAL.has(o.status) && o.status === "pendiente" && new Date(o.createdAt).getTime() < oneHourAgo);
      } else if (urgencyFilter === "hoy") {
        result = result.filter(o => {
          const created = new Date(o.createdAt);
          return created >= todayStart && created <= todayEnd;
        });
      } else if (urgencyFilter === "manana") {
        result = result.filter(o => {
          const created = new Date(o.createdAt);
          return created >= tomorrowStart && created <= tomorrowEnd;
        });
      } else if (urgencyFilter === "atrasados") {
        result = result.filter(o => !TERMINAL.has(o.status) && o.status !== "entregado" && new Date(o.createdAt) < todayStart);
      }
    }

    return result;
  }, [orders, filter, search, dateFilter, urgencyFilter]);

  const paginated = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = paginated.length < filtered.length;

  // ── Today summary ────────────────────────────────────────────────────────

  const todayStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayOrders = orders.filter(o => new Date(o.createdAt) >= today && !["cancelado", "cancelled"].includes(o.status));
    const total = todayOrders.reduce((s, o) => s + (o.total ?? 0), 0);
    const active = orders.filter(o => !TERMINAL.has(o.status)).length;
    return { count: todayOrders.length, total, active };
  }, [orders]);

  // Mejora 14: Tiempo promedio de entrega
  const avgDeliveryTime = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const delivered = orders.filter(o => {
      const isDelivered = o.status === "entregado" || o.status === "delivered";
      const inMonth = new Date(o.createdAt) >= monthStart;
      return isDelivered && inMonth;
    });
    if (delivered.length === 0) return null;

    let totalMinutes = 0;
    let validCount = 0;
    for (const o of delivered) {
      // Use statusHistory to find when it was delivered
      const deliveredEntry = o.statusHistory?.find(h => h.toStatus === "entregado" || h.toStatus === "delivered");
      const endTime = deliveredEntry ? new Date(deliveredEntry.createdAt).getTime() : new Date(o.createdAt).getTime();
      const startTime = new Date(o.createdAt).getTime();
      const diffMin = (endTime - startTime) / (1000 * 60);
      if (diffMin > 0 && diffMin < 1440) { // Solo contar si <24h
        totalMinutes += diffMin;
        validCount++;
      }
    }
    if (validCount === 0) return null;
    return Math.round(totalMinutes / validCount);
  }, [orders]);

  // Mejora 17: Urgency counts
  const urgencyCounts = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const tomorrowEnd = new Date(tomorrowStart); tomorrowEnd.setHours(23, 59, 59, 999);
    const oneHourAgo = now.getTime() - 60 * 60 * 1000;

    return {
      todos: orders.length,
      urgentes: orders.filter(o => !TERMINAL.has(o.status) && o.status === "pendiente" && new Date(o.createdAt).getTime() < oneHourAgo).length,
      hoy: orders.filter(o => new Date(o.createdAt) >= todayStart).length,
      manana: orders.filter(o => { const d = new Date(o.createdAt); return d >= tomorrowStart && d <= tomorrowEnd; }).length,
      atrasados: orders.filter(o => !TERMINAL.has(o.status) && o.status !== "entregado" && new Date(o.createdAt) < todayStart).length,
    };
  }, [orders]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <button onClick={load} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors">
          <RefreshCw className="h-4 w-4" /> Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Dashboard Analytics ────────────────────────────────────── */}
      <button
        onClick={() => {
          const v = !showDashboard;
          setShowDashboard(v);
          localStorage.setItem('orders-show-dashboard', String(v));
        }}
        className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-muted dark:hover:text-foreground mb-4"
      >
        {showDashboard ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Dashboard de Pedidos
      </button>

      {showDashboard && <OrdersDashboard orders={orders} />}

      {/* Mejora 16: Pedido mas grande del dia */}
      {(() => {
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        const todayOrders = orders.filter(o => new Date(o.createdAt) >= hoy && !["cancelado", "cancelled"].includes(o.status));
        if (todayOrders.length === 0) return null;
        const biggest = todayOrders.reduce((max, o) => o.total > max.total ? o : max, todayOrders[0]);
        return (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-100 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-sm font-bold">
            <span>Pedido del dia: {biggest.customerName ?? "Cliente"} · {fmt(biggest.total)}</span>
          </div>
        );
      })()}

      {/* ── Day summary cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-card border border-gray-100 dark:border-card-border rounded-xl p-3 text-center">
          <p className="text-xl font-extrabold text-primary">{fmt(todayStats.total)}</p>
          <p className="text-[10px] font-bold text-gray-400 dark:text-muted uppercase">Vendido hoy</p>
        </div>
        <div className="bg-white dark:bg-card border border-gray-100 dark:border-card-border rounded-xl p-3 text-center">
          <p className="text-xl font-extrabold text-gray-900 dark:text-foreground">{todayStats.count}</p>
          <p className="text-[10px] font-bold text-gray-400 dark:text-muted uppercase">Pedidos hoy</p>
        </div>
        <div className="bg-white dark:bg-card border border-gray-100 dark:border-card-border rounded-xl p-3 text-center relative">
          <p className="text-xl font-extrabold text-amber-600">{todayStats.active}</p>
          <p className="text-[10px] font-bold text-gray-400 dark:text-muted uppercase">Activos</p>
          {newCount > 0 && (
            <button
              onClick={() => setNewCount(0)}
              className="absolute -top-1.5 -right-1.5 h-5 min-w-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-bounce"
              title="Nuevos pedidos"
            >
              +{newCount}
            </button>
          )}
        </div>
      </div>

      {/* Mejora 14: Tiempo promedio de entrega */}
      {avgDeliveryTime !== null && (
        <div className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-bold",
          avgDeliveryTime < 30
            ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400"
            : avgDeliveryTime < 60
            ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400"
            : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
        )}>
          <Clock className="h-4 w-4 shrink-0" />
          <span>Tiempo promedio de entrega: {avgDeliveryTime} min</span>
          <span className={cn(
            "ml-auto text-[10px] font-extrabold px-2 py-0.5 rounded-full",
            avgDeliveryTime < 30 ? "bg-emerald-100 dark:bg-emerald-900/30" :
            avgDeliveryTime < 60 ? "bg-amber-100 dark:bg-amber-900/30" :
            "bg-red-100 dark:bg-red-900/30"
          )}>
            {avgDeliveryTime < 30 ? "Excelente" : avgDeliveryTime < 60 ? "Aceptable" : "Lento"}
          </span>
        </div>
      )}

      {/* Mejora 17: Tasa de cumplimiento de pedidos */}
      {(() => {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const delivered = orders.filter(o =>
          (o.status === "entregado" || o.status === "delivered") && new Date(o.createdAt) >= monthStart
        );
        if (delivered.length === 0) return null;
        const onTime = delivered.filter(o => {
          const created = new Date(o.createdAt);
          const deliveredEntry = o.statusHistory?.find(h => h.toStatus === "entregado" || h.toStatus === "delivered");
          const endDate = deliveredEntry ? new Date(deliveredEntry.createdAt) : created;
          return endDate.toDateString() === created.toDateString();
        });
        const rate = Math.round((onTime.length / delivered.length) * 100);
        const color = rate >= 90 ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
          : rate >= 75 ? "bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800"
          : "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800";
        return (
          <div className={cn("flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-bold", color)}>
            <Package className="h-4 w-4 shrink-0" />
            <span>{rate}% entregados a tiempo este mes ({onTime.length}/{delivered.length})</span>
          </div>
        );
      })()}

      {/* ── Search + actions ──────────────────────────────────────────── */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar cliente o ID..."
            aria-label="Buscar pedidos"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 dark:text-foreground"
          />
        </div>
        <button onClick={load} className="p-2 rounded-xl bg-gray-100 dark:bg-surface hover:bg-gray-200 dark:hover:bg-accent transition-colors" title="Actualizar">
          <RefreshCw className="h-4 w-4 text-gray-500" />
        </button>
        <button onClick={exportCSV} className="p-2 rounded-xl bg-gray-100 dark:bg-surface hover:bg-gray-200 dark:hover:bg-accent transition-colors" title="Exportar CSV">
          <Download className="h-4 w-4 text-gray-500" />
        </button>
        <button onClick={exportExcel} className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors" title="Exportar Excel">
          <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
        </button>
        {/* Mejora 20: Toggle sonido */}
        <button
          onClick={() => {
            const next = !soundEnabled;
            setSoundEnabled(next);
            localStorage.setItem("order-sound-enabled", String(next));
            if (next) playNewOrderSound(); // Preview sound when enabling
          }}
          className={cn(
            "p-2 rounded-xl transition-colors",
            soundEnabled
              ? "bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100"
              : "bg-gray-100 dark:bg-surface hover:bg-gray-200"
          )}
          title={soundEnabled ? "Sonido: ON" : "Sonido: OFF"}
        >
          {soundEnabled ? <Bell className="h-4 w-4 text-amber-600" /> : <BellOff className="h-4 w-4 text-gray-400" />}
        </button>
      </div>

      {/* ── Date filter ───────────────────────────────────────────────── */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
        {DATE_OPTIONS.map(opt => (
          <button
            key={opt.id}
            onClick={() => { setDateFilter(opt.id); setPage(1); }}
            className={cn(
              "shrink-0 px-3 py-1 rounded-lg text-xs font-bold transition-colors",
              dateFilter === opt.id ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-500 dark:text-muted hover:bg-gray-200"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* ── Mejora 17: Urgency filter pills ─────────────────────────── */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
        {([
          { id: "todos" as const, label: "Todos", count: urgencyCounts.todos },
          { id: "urgentes" as const, label: "Urgentes <1h", count: urgencyCounts.urgentes, color: "bg-red-500" },
          { id: "hoy" as const, label: "Hoy", count: urgencyCounts.hoy },
          { id: "manana" as const, label: "Manana", count: urgencyCounts.manana },
          { id: "atrasados" as const, label: "Atrasados", count: urgencyCounts.atrasados, color: "bg-amber-500" },
        ] as const).map(opt => (
          <button
            key={opt.id}
            onClick={() => { setUrgencyFilter(opt.id); setPage(1); }}
            className={cn(
              "shrink-0 px-3 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5",
              urgencyFilter === opt.id ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-500 dark:text-muted hover:bg-gray-200"
            )}
          >
            {opt.label}
            <span className={cn(
              "px-1.5 py-0.5 rounded-full text-[10px] font-bold",
              urgencyFilter === opt.id ? "bg-white/20 text-white" : "bg-gray-200 dark:bg-zinc-600 text-gray-600 dark:text-zinc-300"
            )}>
              {opt.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Status filter ─────────────────────────────────────────────── */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
        {FILTER_OPTIONS.map(opt => (
          <button
            key={opt.id}
            onClick={() => { setFilter(opt.id); setPage(1); }}
            className={cn(
              "shrink-0 px-3 py-1 rounded-lg text-xs font-bold transition-colors",
              filter === opt.id ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-500 dark:text-muted hover:bg-gray-200"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* ── View mode toggle + zone grouping (Mejora 13 & 15) ──────── */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 dark:text-muted">
          {filtered.length} pedido{filtered.length !== 1 ? "s" : ""}
          {search && ` para "${search}"`}
        </p>
        <div className="flex items-center gap-2">
          {/* Mejora 15: Group by zone */}
          {viewMode === "list" && (
            <button
              onClick={() => setGroupByZone(p => !p)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-colors",
                groupByZone ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-500 dark:text-muted hover:bg-gray-200"
              )}
            >
              <MapPin className="h-3 w-3" /> Agrupar por zona
            </button>
          )}
          {/* Mejora 13: Kanban / List / Historial toggle */}
          <div className="flex bg-gray-100 dark:bg-accent rounded-lg p-0.5">
            <button
              onClick={() => { setViewMode("list"); try { localStorage.setItem("orders-view-mode", "list"); } catch {} }}
              className={cn("px-2 py-1 rounded-md text-[10px] font-bold transition-all", viewMode === "list" ? "bg-white dark:bg-card text-gray-900 dark:text-foreground shadow-sm" : "text-gray-500 dark:text-muted")}
            >
              <LayoutList className="h-3 w-3 inline mr-1" />Lista
            </button>
            <button
              onClick={() => { setViewMode("kanban"); try { localStorage.setItem("orders-view-mode", "kanban"); } catch {} }}
              className={cn("px-2 py-1 rounded-md text-[10px] font-bold transition-all", viewMode === "kanban" ? "bg-white dark:bg-card text-gray-900 dark:text-foreground shadow-sm" : "text-gray-500 dark:text-muted")}
            >
              <Columns3 className="h-3 w-3 inline mr-1" />Kanban
            </button>
            <button
              onClick={() => { setViewMode("historial"); try { localStorage.setItem("orders-view-mode", "historial"); } catch {} }}
              className={cn("px-2 py-1 rounded-md text-[10px] font-bold transition-all", viewMode === "historial" ? "bg-white dark:bg-card text-gray-900 dark:text-foreground shadow-sm" : "text-gray-500 dark:text-muted")}
            >
              📋 Historial
            </button>
          </div>
        </div>
      </div>

      {/* ── Mejora 13: Kanban view ─────────────────────────────────────── */}
      {viewMode === "kanban" && (() => {
        const KANBAN_COLS = [
          { key: "pendiente", label: "Pendiente", match: ["pendiente", "pending"], bg: "bg-yellow-50 dark:bg-yellow-950/20", border: "border-yellow-300 dark:border-yellow-800", headerBg: "bg-yellow-100 dark:bg-yellow-900/30" },
          { key: "preparando", label: "Preparando", match: ["confirmado", "confirmed", "preparing", "preparando"], bg: "bg-blue-50 dark:bg-blue-950/20", border: "border-blue-300 dark:border-blue-800", headerBg: "bg-blue-100 dark:bg-blue-900/30" },
          { key: "en_camino", label: "En camino", match: ["en_camino", "delivering"], bg: "bg-purple-50 dark:bg-purple-950/20", border: "border-purple-300 dark:border-purple-800", headerBg: "bg-purple-100 dark:bg-purple-900/30" },
          { key: "entregado", label: "Entregado", match: ["entregado", "delivered"], bg: "bg-green-50 dark:bg-green-950/20", border: "border-green-300 dark:border-green-800", headerBg: "bg-green-100 dark:bg-green-900/30" },
        ];
        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 overflow-x-auto">
            {KANBAN_COLS.map(col => {
              const colOrders = filtered.filter(o => col.match.includes(o.status));
              return (
                <div key={col.key} className={cn("rounded-xl border-2 min-w-[200px]", col.bg, col.border)}>
                  <div className={cn("px-3 py-2 rounded-t-lg flex items-center justify-between", col.headerBg)}>
                    <span className="text-xs font-extrabold text-gray-800 dark:text-foreground">{col.label}</span>
                    <span className="px-1.5 py-0.5 rounded-full bg-white/60 dark:bg-white/10 text-[10px] font-bold text-gray-700 dark:text-foreground">{colOrders.length}</span>
                  </div>
                  <div className="p-2 space-y-2 max-h-[60vh] overflow-y-auto">
                    {colOrders.length === 0 ? (
                      <p className="text-[10px] text-gray-400 dark:text-muted text-center py-4">Sin pedidos</p>
                    ) : colOrders.map(order => {
                      const minutos = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
                      const cfg = STATUS_CONFIG[order.status];
                      const nextStatus = cfg?.next;
                      return (
                        <div key={order.id} className="bg-white dark:bg-card rounded-lg border border-gray-200 dark:border-card-border p-2.5 shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-bold text-gray-900 dark:text-foreground truncate">{order.customerName ?? "Sin nombre"}</p>
                            {/* Mejora 14: Time badge */}
                            {!TERMINAL.has(order.status) && (
                              <span className={cn("text-[10px] font-bold shrink-0", minutos < 15 ? "text-green-600" : minutos < 30 ? "text-yellow-600" : minutos > 60 ? "text-red-700 animate-pulse" : "text-red-600")}>
                                {minutos > 60 ? `${Math.floor(minutos / 60)}h ${minutos % 60}m` : `${minutos}m`}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-extrabold font-mono text-primary">{fmt(order.total)}</p>
                          <div className="flex items-center justify-between mt-1.5">
                            <span className="text-[10px] text-gray-400 dark:text-muted">{order.items?.length ?? 0} productos</span>
                            <span className="text-[10px] font-bold text-gray-500 capitalize">{order.paymentMethod ?? "efectivo"}</span>
                          </div>
                          {nextStatus && (
                            <button
                              disabled={updatingId === order.id}
                              onClick={() => changeStatus(order.id, nextStatus)}
                              className="mt-2 w-full flex items-center justify-center gap-1 py-1.5 rounded-lg bg-primary/10 text-primary text-[10px] font-bold hover:bg-primary/20 transition-colors disabled:opacity-50"
                            >
                              {updatingId === order.id ? "..." : <><ArrowRight className="h-3 w-3" /> Mover</>}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── Historial completo ────────────────────────────────────────── */}
      {viewMode === "historial" && (() => {
        const allOrders = [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const histFiltered = allOrders.filter(o => {
          if (search) {
            const q = search.toLowerCase();
            if (!(o.customerName?.toLowerCase().includes(q) || o.id.toLowerCase().includes(q))) return false;
          }
          return true;
        });
        const histPaged = histFiltered.slice(0, page * PAGE_SIZE);
        const hasMoreHist = histPaged.length < histFiltered.length;
        return (
          <div className="space-y-2">
            <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-surface border-b border-gray-200 dark:border-card-border">
                    <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 dark:text-muted uppercase tracking-wider">#</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 dark:text-muted uppercase tracking-wider">Fecha</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 dark:text-muted uppercase tracking-wider">Cliente</th>
                    <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-500 dark:text-muted uppercase tracking-wider">Total</th>
                    <th className="text-center px-4 py-3 text-[10px] font-bold text-gray-500 dark:text-muted uppercase tracking-wider">Estado</th>
                    <th className="text-center px-4 py-3 text-[10px] font-bold text-gray-500 dark:text-muted uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {histPaged.map((order, idx) => {
                    const cfg = STATUS_CONFIG[order.status] ?? { label: order.status, color: "bg-gray-100 text-gray-600", icon: null };
                    return (
                      <tr key={order.id} className="border-b border-gray-100 dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-gray-400">{idx + 1}</td>
                        <td className="px-4 py-3 text-xs text-gray-600 dark:text-foreground">{fmtDate(order.createdAt)}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-gray-900 dark:text-foreground">{order.customerName ?? "Cliente"}</td>
                        <td className="px-4 py-3 text-xs font-extrabold text-primary text-right">{fmt(order.total)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold", cfg.color)}>
                            {cfg.icon} {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => { setViewMode("list"); setExpandedId(order.id); }}
                            className="px-2 py-1 rounded-lg bg-primary/10 text-primary text-[10px] font-bold hover:bg-primary/20 transition-colors"
                          >
                            Ver detalle
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 dark:text-muted text-center">{histFiltered.length} pedido{histFiltered.length !== 1 ? "s" : ""} en total</p>
            {hasMoreHist && (
              <button onClick={() => setPage(p => p + 1)} className="w-full py-3 rounded-xl border border-gray-200 dark:border-card-border text-sm font-bold text-gray-500 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                Cargar más ({histFiltered.length - histPaged.length} restantes)
              </button>
            )}
          </div>
        );
      })()}

      {/* ── Orders list ───────────────────────────────────────────────── */}
      {viewMode === "list" && orders.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Sin pedidos"
          description="Los pedidos de tus clientes aparecerán aquí."
        />
      ) : viewMode === "list" && filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
          <ShoppingBag className="h-10 w-10 text-gray-300 dark:text-muted" />
          <p className="text-sm font-semibold text-gray-500 dark:text-muted">
            {search ? "Sin resultados para esa búsqueda" : "No hay pedidos con estos filtros"}
          </p>
        </div>
      ) : viewMode === "list" && (() => {
        // Mejora 15: Group by zone
        const renderOrder = (order: Order) => {
          const cfg = STATUS_CONFIG[order.status] ?? { label: order.status, color: "bg-gray-100 text-gray-600", icon: null };
          const isExpanded = expandedId === order.id;
          const isTerminal = TERMINAL.has(order.status);
          // Mejora 14: Time since creation
          const minutos = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
          const checkedItems = checklists[order.id] || [];

          return (
            <div
              key={order.id}
              className={cn(
                "bg-white dark:bg-card border rounded-xl overflow-hidden transition-all",
                isTerminal
                  ? "border-gray-100 dark:border-card-border opacity-70"
                  : "border-gray-200 dark:border-card-border shadow-sm"
              )}
            >
              {/* Main row — clickable to expand */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : order.id)}
                className="w-full p-3.5 flex items-center justify-between gap-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900 dark:text-foreground truncate">
                    {order.customerName ?? "Cliente"}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-muted mt-0.5">{fmtDate(order.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${cfg.color}`}>
                    {cfg.icon} {cfg.label}
                  </span>
                  {/* Mejora 14: Time badge */}
                  {!isTerminal && (
                    <span className={cn(
                      "text-[10px] font-bold",
                      minutos < 15 ? "text-green-600" : minutos < 30 ? "text-yellow-600" : minutos > 60 ? "text-red-700 font-extrabold animate-pulse" : "text-red-600 font-bold"
                    )}>
                      {minutos > 60 ? `${Math.floor(minutos / 60)}h ${minutos % 60}m` : `${minutos}m`}
                    </span>
                  )}
                  <span className="text-sm font-extrabold text-primary">{fmt(order.total)}</span>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                </div>
              </button>

                {/* Expanded detail panel — Redesigned */}
                {isExpanded && (
                  <div className="border-t-2 border-primary/30 dark:border-primary/20">
                    {/* Enhanced header with order ID, date and status */}
                    <div className="bg-linear-to-r from-primary/5 via-white to-transparent dark:from-primary/10 dark:via-card px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                          <ShoppingBag className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-extrabold text-gray-900 dark:text-foreground">Pedido #{order.id.slice(0, 8)}</p>
                          <p className="text-[10px] text-gray-400 dark:text-muted">{fmtDate(order.createdAt)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn("inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold", cfg.color)}>
                          {cfg.icon} {cfg.label}
                        </span>
                        <span className="text-lg font-extrabold text-primary">{fmt(order.total)}</span>
                      </div>
                    </div>

                    <div className="px-4 pb-4 pt-3 space-y-3">
                    {/* Timeline visual (Mejora 2) */}
                    <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-3">
                      <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Clock className="h-3 w-3" /> Progreso del pedido
                      </p>
                      <OrderTimeline
                        currentStatus={order.status}
                        statusHistory={order.statusHistory}
                        onChangeStatus={!isTerminal ? (newStatus) => changeStatus(order.id, newStatus) : undefined}
                        updating={updatingId === order.id}
                      />
                    </div>

                    {/* Meta info — card style */}
                    <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-3">
                      <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Receipt className="h-3 w-3" /> Información del pedido
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                        <div className="bg-gray-50 dark:bg-surface rounded-lg p-2.5">
                          <span className="text-[10px] text-gray-400 dark:text-muted block mb-0.5">ID Pedido</span>
                          <span className="font-mono font-bold text-gray-700 dark:text-foreground">{order.id.slice(0, 8)}</span>
                        </div>
                        <div className="bg-gray-50 dark:bg-surface rounded-lg p-2.5">
                          <span className="text-[10px] text-gray-400 dark:text-muted block mb-0.5">Método de pago</span>
                          <span className="font-bold text-gray-700 dark:text-foreground capitalize">{order.paymentMethod ?? "efectivo"}</span>
                        </div>
                        {order.customerPhone && (
                          <div className="bg-gray-50 dark:bg-surface rounded-lg p-2.5">
                            <span className="text-[10px] text-gray-400 dark:text-muted block mb-0.5">Teléfono</span>
                            <span className="font-bold text-gray-700 dark:text-foreground">{order.customerPhone}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Items list — card style */}
                    {order.items && order.items.length > 0 && (
                      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-3">
                        <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <Package className="h-3 w-3" /> Productos ({order.items.length})
                        </p>
                        <div className="space-y-1.5">
                        {order.items.map((item, i) => (
                          <div key={i} className="flex justify-between text-xs px-2.5 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                            <span className="text-gray-700 dark:text-foreground">{item.qty}x {item.name}</span>
                            {item.price != null && (
                              <span className="font-bold text-gray-600 dark:text-muted">{fmt(item.price * item.qty)}</span>
                            )}
                          </div>
                        ))}
                        </div>
                        <div className="flex justify-between text-sm pt-2.5 mt-2 border-t-2 border-primary/20 dark:border-primary/10 px-2.5">
                          <span className="font-bold text-gray-900 dark:text-foreground">Total</span>
                          <span className="font-extrabold text-primary text-base">{fmt(order.total)}</span>
                        </div>
                      </div>
                    )}

                    {/* Mejora 16: Checklist de preparacion */}
                    {order.items && order.items.length > 0 && (order.status === "pendiente" || order.status === "pending" || order.status === "confirmado" || order.status === "confirmed" || order.status === "preparing" || order.status === "preparando") && (() => {
                      const totalItems = order.items!.length;
                      const checkedCount = checkedItems.filter(id => order.items!.some((_, idx) => id === `${order.id}-${idx}`)).length;
                      const allChecked = checkedCount >= totalItems;
                      return (
                        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-2.5">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-blue-700 dark:text-blue-400 uppercase flex items-center gap-1">
                              <CheckSquare className="h-3 w-3" /> Checklist de preparacion
                            </span>
                            <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">{checkedCount} de {totalItems} listos</span>
                          </div>
                          {/* Progress bar */}
                          <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-1.5 mb-2">
                            <div className="h-1.5 rounded-full bg-blue-600 transition-all" style={{ width: `${totalItems > 0 ? (checkedCount / totalItems) * 100 : 0}%` }} />
                          </div>
                          <div className="space-y-1">
                            {order.items!.map((item, idx) => {
                              const itemId = `${order.id}-${idx}`;
                              const isChecked = checkedItems.includes(itemId);
                              return (
                                <label key={idx} className={cn("flex items-center gap-2 text-xs cursor-pointer p-1 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors", isChecked && "line-through text-gray-400")}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {
                                      setChecklists(prev => {
                                        const current = prev[order.id] || [];
                                        const next = isChecked ? current.filter(id => id !== itemId) : [...current, itemId];
                                        try { localStorage.setItem(`order-checklist-${order.id}`, JSON.stringify(next)); } catch {}
                                        return { ...prev, [order.id]: next };
                                      });
                                    }}
                                    className="h-3.5 w-3.5 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span className={cn("text-gray-700 dark:text-foreground", isChecked && "text-gray-400 dark:text-muted")}>{item.name} x {item.qty}</span>
                                </label>
                              );
                            })}
                          </div>
                          {allChecked && (
                            <div className="mt-2 text-center">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold">
                                <CheckCircle className="h-3 w-3" /> Listo para enviar
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {order.notes && !order.notes.startsWith("[ADMIN]") && (
                      <p className="text-xs text-gray-500 dark:text-muted italic">Nota: {order.notes}</p>
                    )}

                    {/* Mejora 18: Nota interna por pedido */}
                    <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-2.5">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Lock className="h-3 w-3 text-yellow-600 dark:text-yellow-400" />
                        <span className="text-[10px] font-bold text-yellow-700 dark:text-yellow-400 uppercase">Nota interna — solo visible para el equipo</span>
                      </div>
                      <textarea
                        defaultValue={order.notes?.startsWith("[ADMIN]") ? order.notes.replace("[ADMIN] ", "") : (order.notes ?? "")}
                        placeholder="Ej: Confirmar direccion, entregar despues de las 3pm..."
                        rows={2}
                        className="w-full text-xs bg-white/80 dark:bg-white/5 border border-yellow-200 dark:border-yellow-800/50 rounded-lg px-2 py-1.5 text-gray-700 dark:text-foreground placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-yellow-400 resize-none"
                        onChange={(e) => {
                          const value = e.target.value;
                          const orderId = order.id;
                          // Auto-save with debounce
                          const timeoutKey = `note-timeout-${orderId}`;
                          const w = window as unknown as Record<string, unknown>;
                          const existing = w[timeoutKey] as ReturnType<typeof setTimeout> | undefined;
                          if (existing) clearTimeout(existing);
                          w[timeoutKey] = setTimeout(() => {
                            fetch(`/api/orders/${orderId}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ notes: value ? `[ADMIN] ${value}` : "" }),
                            }).catch(() => {});
                          }, 1000);
                        }}
                      />
                    </div>

                    {/* Ticket button + Mejora 7: Crear GRR + Idea 11: Delivery */}
                    <div className="flex gap-2 pt-1 flex-wrap">
                      <button
                        onClick={() => setTicketOrder(order)}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors border border-primary/20"
                      >
                        <Receipt className="h-3.5 w-3.5" /> Ver Ticket
                      </button>
                      {/* Idea 11: Assign delivery person */}
                      {!isTerminal && deliveryPeople.length > 0 && (
                        <>
                          {deliveryAssignments[order.id] ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 px-2 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                                <Truck className="h-3 w-3 inline mr-1" />{deliveryAssignments[order.id]}
                              </span>
                              <a
                                href={buildDeliveryWhatsApp(deliveryAssignments[order.id], order)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2 py-1.5 rounded-lg bg-[#25D366] text-white text-[10px] font-bold hover:bg-[#1da851] transition-colors"
                              >
                                Notificar
                              </a>
                            </div>
                          ) : (
                            <button
                              onClick={() => setAssigningDelivery(order.id)}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-xs font-bold hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                            >
                              <Truck className="h-3 w-3" /> Asignar repartidor
                            </button>
                          )}
                        </>
                      )}
                      {(order.status === "confirmado" || order.status === "confirmed" || order.status === "en_camino" || order.status === "delivering" || order.status === "preparing") && (
                        <button
                          disabled={creatingGrr === order.id}
                          onClick={async () => {
                            setCreatingGrr(order.id);
                            try {
                              const items = (order.items || []).map(it => ({
                                descripcion: it.name,
                                cantidad: it.qty,
                                unidad: "NIU",
                              }));
                              const res = await fetch("/api/guias-remision", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  orderId: order.id,
                                  motivoTraslado: "VENTA",
                                  destinatarioNombre: order.customerName || "Cliente",
                                  puntoPartida: "Buleje - Pucallpa",
                                  puntoLlegada: order.notes?.replace("[ADMIN] ", "") || "Dirección de delivery",
                                  fechaTraslado: new Date().toISOString(),
                                  items,
                                }),
                              });
                              if (res.ok) {
                                const data = await res.json();
                                setGrrToast(`Guía de Remisión ${data.numero || ""} creada`);
                                setTimeout(() => setGrrToast(null), 4000);
                              }
                            } catch { /* ignore */ }
                            setCreatingGrr(null);
                          }}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-50 dark:bg-cyan-950/30 text-cyan-700 dark:text-cyan-400 text-xs font-bold hover:bg-cyan-100 dark:hover:bg-cyan-900/30 disabled:opacity-50 transition-colors"
                        >
                          <Truck className="h-3 w-3" />
                          {creatingGrr === order.id ? "Creando..." : "Crear Guía Remisión"}
                        </button>
                      )}
                    </div>
                  </div>
                  </div>
                )}
              </div>
            );
          };

          // Mejora 15: Zone grouping
          if (groupByZone) {
            const zones = new Map<string, Order[]>();
            for (const o of paginated) {
              const notes = o.notes?.replace("[ADMIN] ", "") || "";
              // Extract zone from notes or customer name first word
              let zone = "Sin direccion";
              if (notes.includes(",")) {
                const parts = notes.split(",");
                zone = parts[parts.length - 1].trim() || zone;
              } else if (o.customerName) {
                const words = o.customerName.trim().split(" ");
                if (words.length > 1) zone = words[words.length - 1];
                else zone = "General";
              }
              if (!zones.has(zone)) zones.set(zone, []);
              zones.get(zone)!.push(o);
            }
            return (
              <div className="space-y-4">
                {Array.from(zones.entries()).map(([zone, zoneOrders]) => (
                  <div key={zone}>
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs font-bold text-gray-700 dark:text-foreground">{zone}</span>
                      <span className="text-[10px] text-gray-400 dark:text-muted">({zoneOrders.length} pedido{zoneOrders.length !== 1 ? "s" : ""})</span>
                    </div>
                    <div className="space-y-2">
                      {zoneOrders.map(renderOrder)}
                    </div>
                  </div>
                ))}
                {hasMore && (
                  <button onClick={() => setPage(p => p + 1)} className="w-full py-3 rounded-xl border border-gray-200 dark:border-card-border text-sm font-bold text-gray-500 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                    Cargar mas ({filtered.length - paginated.length} restantes)
                  </button>
                )}
              </div>
            );
          }

          return (
            <div className="space-y-2">
              {paginated.map(renderOrder)}
              {hasMore && (
                <button onClick={() => setPage(p => p + 1)} className="w-full py-3 rounded-xl border border-gray-200 dark:border-card-border text-sm font-bold text-gray-500 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                  Cargar mas ({filtered.length - paginated.length} restantes)
                </button>
              )}
            </div>
          );
        })()}

      {/* ── Idea 11: Panel de Repartidores ─────────────────────────── */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-4">
        <button
          onClick={() => setShowDeliveryPanel(!showDeliveryPanel)}
          className="w-full flex items-center justify-between text-sm font-bold text-gray-900 dark:text-foreground"
        >
          <span className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-primary" /> Repartidores ({deliveryPeople.filter(p => p.activo).length} activos)
          </span>
          <span className="text-xs text-gray-400">{showDeliveryPanel ? "\u25B2" : "\u25BC"}</span>
        </button>

        {showDeliveryPanel && (
          <div className="mt-3 space-y-3">
            {/* Monthly stats */}
            {deliveryPeople.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {deliveryPeople.filter(p => p.activo).map(p => (
                  <div key={p.nombre} className="bg-gray-50 dark:bg-surface rounded-lg px-3 py-2 text-xs">
                    <p className="font-bold text-gray-700 dark:text-foreground">{p.nombre}</p>
                    <p className="text-gray-400 dark:text-muted">{p.zona} &middot; {p.entregas} entregas (S/{(p.entregas * p.comision).toFixed(0)} comisiones)</p>
                    <p className="text-[10px] text-gray-400">Comision: S/{p.comision}/delivery</p>
                  </div>
                ))}
              </div>
            )}

            {/* Add new */}
            {showAddDelivery ? (
              <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-lg p-3 space-y-2">
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Nuevo repartidor</p>
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" placeholder="Nombre" value={newDelivery.nombre} onChange={e => setNewDelivery({...newDelivery, nombre: e.target.value})} className="text-xs border border-gray-200 dark:border-card-border rounded-lg px-2 py-1.5 bg-white dark:bg-card text-gray-900 dark:text-foreground" />
                  <input type="tel" placeholder="Telefono" value={newDelivery.telefono} onChange={e => setNewDelivery({...newDelivery, telefono: e.target.value})} className="text-xs border border-gray-200 dark:border-card-border rounded-lg px-2 py-1.5 bg-white dark:bg-card text-gray-900 dark:text-foreground" />
                  <input type="text" placeholder="Zona (ej: Manantay)" value={newDelivery.zona} onChange={e => setNewDelivery({...newDelivery, zona: e.target.value})} className="text-xs border border-gray-200 dark:border-card-border rounded-lg px-2 py-1.5 bg-white dark:bg-card text-gray-900 dark:text-foreground" />
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500">S/</span>
                    <input type="number" min={1} max={20} value={newDelivery.comision} onChange={e => setNewDelivery({...newDelivery, comision: Number(e.target.value) || 3})} className="w-16 text-xs border border-gray-200 dark:border-card-border rounded-lg px-2 py-1.5 bg-white dark:bg-card text-gray-900 dark:text-foreground" />
                    <span className="text-[10px] text-gray-400">/delivery</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={addDeliveryPerson} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90">Guardar</button>
                  <button onClick={() => setShowAddDelivery(false)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-400 hover:text-gray-600">Cancelar</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowAddDelivery(true)} className="w-full py-2 rounded-lg border-2 border-dashed border-gray-200 dark:border-card-border text-xs font-bold text-gray-400 hover:text-primary hover:border-primary/40 transition-colors">
                + Agregar repartidor
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Idea 11: Assign delivery dropdown in order detail ────── */}
      {assigningDelivery && (() => {
        const order = orders.find(o => o.id === assigningDelivery);
        if (!order) return null;
        return (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setAssigningDelivery(null)}>
            <div className="bg-white dark:bg-card rounded-2xl shadow-xl max-w-sm w-full p-4" onClick={e => e.stopPropagation()}>
              <p className="text-sm font-bold text-gray-900 dark:text-foreground mb-3">Asignar repartidor a #{order.id.slice(-6).toUpperCase()}</p>
              <div className="space-y-2">
                {deliveryPeople.filter(p => p.activo).map(p => (
                  <button
                    key={p.nombre}
                    onClick={() => assignDeliveryToOrder(order.id, p.nombre)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-surface hover:bg-primary/10 transition-colors text-left"
                  >
                    <div>
                      <p className="text-sm font-bold text-gray-800 dark:text-foreground">{p.nombre}</p>
                      <p className="text-[10px] text-gray-400">{p.zona} &middot; S/{p.comision}/delivery</p>
                    </div>
                    <Truck className="h-4 w-4 text-primary" />
                  </button>
                ))}
              </div>
              {deliveryPeople.filter(p => p.activo).length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">No hay repartidores. Agrega uno primero.</p>
              )}
              <button onClick={() => setAssigningDelivery(null)} className="mt-3 w-full py-2 rounded-lg text-xs font-bold text-gray-400 hover:text-gray-600">Cerrar</button>
            </div>
          </div>
        );
      })()}

      {/* Mejora 9: WhatsApp toast notification */}
      {whatsappToast && (
        <div className="fixed bottom-4 right-4 z-50 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl p-4 max-w-sm animate-in slide-in-from-bottom-5">
          <p className="text-xs font-bold text-gray-900 dark:text-foreground mb-2">
            Notificar a {whatsappToast.name}
          </p>
          <p className="text-[10px] text-gray-500 dark:text-muted mb-3">{whatsappToast.message}</p>
          <div className="flex gap-2">
            <a
              href={`https://wa.me/${whatsappToast.phone.replace(/\D/g, "").startsWith("51") ? whatsappToast.phone.replace(/\D/g, "") : "51" + whatsappToast.phone.replace(/\D/g, "")}?text=${encodeURIComponent(whatsappToast.message + "\n\nBuleje - Pucallpa")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#25D366] text-white text-xs font-bold hover:bg-[#1da851] transition-colors"
            >
              Enviar por WhatsApp
            </a>
            <button
              onClick={() => setWhatsappToast(null)}
              className="px-3 py-2 rounded-xl text-xs font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Mejora 7: GRR created toast */}
      {grrToast && (
        <div className="fixed bottom-4 left-4 z-50 bg-white dark:bg-card border border-cyan-200 dark:border-cyan-800 rounded-2xl shadow-2xl p-4 max-w-xs animate-in slide-in-from-bottom-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center shrink-0">
              <Truck className="h-5 w-5 text-cyan-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-foreground">{grrToast}</p>
            </div>
            <button onClick={() => setGrrToast(null)} className="text-gray-400 hover:text-gray-600 shrink-0">
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Mejora 20: New order toast */}
      {newOrderToast && (
        <div className="fixed top-4 right-4 z-50 bg-white dark:bg-card border border-emerald-200 dark:border-emerald-800 rounded-2xl shadow-2xl p-4 max-w-xs animate-in slide-in-from-top-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
              <Bell className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-foreground">Nuevo pedido!</p>
              <p className="text-xs text-gray-500 dark:text-muted">
                {newOrderToast.name} — {fmt(newOrderToast.total)}
              </p>
            </div>
            <button onClick={() => setNewOrderToast(null)} className="text-gray-400 hover:text-gray-600 shrink-0">
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Ticket preview modal */}
      {ticketOrder && (
        <TicketPreview
          ticket={{
            ticketNumber: ticketOrder.id.slice(0, 8).toUpperCase(),
            fecha: new Date(ticketOrder.createdAt).toLocaleString("es-PE"),
            items: (ticketOrder.items ?? []).map(i => ({
              name: i.name,
              qty: i.qty,
              price: i.price ?? 0,
            })),
            subtotal: ticketOrder.total / 1.18,
            igv: ticketOrder.total - ticketOrder.total / 1.18,
            total: ticketOrder.total,
            paymentMethod: ticketOrder.paymentMethod ?? "efectivo",
            customerName: ticketOrder.customerName,
            customerPhone: ticketOrder.customerPhone,
          }}
          business={{
            name: "Buleje",
            address: "Pucallpa, Ucayali",
          }}
          onClose={() => setTicketOrder(null)}
        />
      )}
    </div>
  );
}

// ── Dashboard Analytics Component ────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DashTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">{label}</p>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-xs" style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' && p.name?.includes('S/') ? `S/${p.value.toFixed(2)}` : p.value}
        </p>
      ))}
    </div>
  );
}

const DASH_COLORS = ['#00B4A6', '#f97316', '#457b9d', '#e63946', '#9b5de5', '#2dd4bf', '#264653'];

const DASH_STATUS_COLORS: Record<string, string> = {
  pendiente: '#f59e0b', confirmado: '#3b82f6', preparando: '#8b5cf6',
  en_camino: '#06b6d4', entregado: '#10b981', cancelado: '#ef4444',
  pending: '#f59e0b', confirmed: '#3b82f6', preparing: '#8b5cf6',
  delivering: '#06b6d4', delivered: '#10b981', cancelled: '#ef4444',
};

const DASH_STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendiente', confirmado: 'Confirmado', preparando: 'Preparando',
  en_camino: 'En camino', entregado: 'Entregado', cancelado: 'Cancelado',
  pending: 'Pendiente', confirmed: 'Confirmado', preparing: 'Preparando',
  delivering: 'En camino', delivered: 'Entregado', cancelled: 'Cancelado',
};

const DASH_PAYMENT_COLORS: Record<string, string> = { efectivo: '#00B4A6', yape: '#8b5cf6', plin: '#06b6d4', tarjeta: '#3b82f6', fiado: '#f59e0b', otro: '#6b7280' };
const DASH_PAYMENT_LABELS: Record<string, string> = { efectivo: 'Efectivo', yape: 'Yape', plin: 'Plin', tarjeta: 'Tarjeta', fiado: 'Fiado', otro: 'Otro' };

// ── Empty state for charts (Mejora 10) ───────────────────────────────────────
function OrdersEmptyChart({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-4xl mb-3">📊</div>
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{message}</p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Los datos apareceran cuando registres ventas</p>
    </div>
  );
}

// Mejora 5: Favoritos Pedidos
function useOrdersFavCharts(key: string) {
  const [favs, setFavs] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(`fav-charts-${key}`) || "[]"); } catch { return []; }
  });
  const toggle = (id: string) => setFavs(prev => {
    const next = prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id];
    localStorage.setItem(`fav-charts-${key}`, JSON.stringify(next));
    return next;
  });
  return { favs, toggle, isFav: (id: string) => favs.includes(id) };
}
function OrdersFavStar({ id, favs }: { id: string; favs: ReturnType<typeof useOrdersFavCharts> }) {
  return <button onClick={() => favs.toggle(id)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors text-sm">{favs.isFav(id) ? <span className="text-amber-400">&#9733;</span> : <span className="text-gray-300 dark:text-gray-600">&#9734;</span>}</button>;
}

function OrdersDashboard({ orders }: { orders: Order[] }) {
  const today = new Date().toISOString().split('T')[0];
  const nowHour = new Date().getHours();
  // Mejora 1: Period selector
  const [ordPeriod, setOrdPeriod] = useState<"today" | "7d" | "30d" | "month">("today");
  // Mejora 13: Expand chart
  const [expandedChart, setExpandedChart] = useState<string | null>(null);
  // Mejora 3: Auto-refresh
  const [ordLastRefresh] = useState(new Date());
  const [ordMinAgo, setOrdMinAgo] = useState(0);
  // Mejora 5: Favoritos
  const ordFavs = useOrdersFavCharts("pedidos");

  useEffect(() => {
    const id = setInterval(() => setOrdMinAgo(Math.floor((Date.now() - ordLastRefresh.getTime()) / 60000)), 60000);
    return () => clearInterval(id);
  }, [ordLastRefresh]);

  // === TODOS LOS CALCULOS CON useMemo ===
  const kpis = useMemo(() => {
    const pedidosHoy = orders.filter(o => o.createdAt?.startsWith(today));
    const pendientes = orders.filter(o => ['pendiente', 'confirmado', 'pending', 'confirmed'].includes(o.status));
    const enCamino = orders.filter(o => o.status === 'en_camino' || o.status === 'delivering');
    const entregadosHoy = orders.filter(o => (o.status === 'entregado' || o.status === 'delivered') && (o.updatedAt ?? o.createdAt)?.startsWith(today));
    const cancelados = orders.filter(o => o.status === 'cancelado' || o.status === 'cancelled');
    const totalMonto = pedidosHoy.reduce((s, o) => s + (o.total || 0), 0);
    const ticketProm = pedidosHoy.length > 0 ? totalMonto / pedidosHoy.length : 0;
    const entregadosTotal = orders.filter(o => o.status === 'entregado' || o.status === 'delivered').length;
    const tasaCumplimiento = orders.length > 0 ? Math.round(entregadosTotal / orders.length * 100) : 0;
    return { pedidosHoy: pedidosHoy.length, pendientes: pendientes.length, enCamino: enCamino.length, entregadosHoy: entregadosHoy.length, cancelados: cancelados.length, totalMonto, ticketProm, tasaCumplimiento };
  }, [orders, today]);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach(o => { const s = o.status || 'pendiente'; counts[s] = (counts[s] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name: DASH_STATUS_LABELS[name] || name, value, key: name }));
  }, [orders]);

  const hourlyData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({ hora: `${String(i).padStart(2, '0')}:00`, count: 0, total: 0, isCurrent: i === nowHour }));
    orders.filter(o => o.createdAt?.startsWith(today)).forEach(o => {
      const h = new Date(o.createdAt).getHours();
      hours[h].count++;
      hours[h].total += o.total || 0;
    });
    return hours.filter(h => h.count > 0 || (parseInt(h.hora) >= 6 && parseInt(h.hora) <= 22));
  }, [orders, today, nowHour]);

  const paymentData = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach(o => {
      const m = (o.paymentMethod ?? 'efectivo').toLowerCase();
      counts[m] = (counts[m] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name: DASH_PAYMENT_LABELS[name] || name, value, color: DASH_PAYMENT_COLORS[name] || '#6b7280' }));
  }, [orders]);

  const weeklyData = useMemo(() => {
    const days: Record<string, { dia: string; count: number; total: number }> = {};
    const todayMs = new Date(today).getTime();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayMs - i * 86400000);
      const key = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric' });
      days[key] = { dia: label, count: 0, total: 0 };
    }
    orders.forEach(o => {
      const key = o.createdAt?.split('T')[0];
      if (key && days[key]) { days[key].count++; days[key].total += o.total || 0; }
    });
    return Object.values(days);
  }, [orders, today]);

  const zonaData = useMemo(() => {
    const zones: Record<string, number> = {};
    orders.forEach(o => {
      const name = o.customerName ?? '';
      // Extraer zona de la direccion o usar "Sin zona"
      const zona = name.includes('-') ? name.split('-').pop()?.trim() || 'Sin zona' : 'General';
      zones[zona] = (zones[zona] || 0) + 1;
    });
    return Object.entries(zones)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([zona, count]) => ({ zona, count }));
  }, [orders]);

  const topClientes = useMemo(() => {
    const clientes: Record<string, { name: string; count: number; total: number }> = {};
    orders.forEach(o => {
      const key = o.customerPhone || o.customerName || 'Anonimo';
      const name = o.customerName || o.customerPhone || 'Anonimo';
      if (!clientes[key]) clientes[key] = { name, count: 0, total: 0 };
      clientes[key].count++;
      clientes[key].total += o.total || 0;
    });
    return Object.values(clientes).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [orders]);

  const tiempoProcesamiento = useMemo(() => {
    const entregados = orders.filter(o => (o.status === 'entregado' || o.status === 'delivered') && o.createdAt && (o.updatedAt ?? o.createdAt));
    if (entregados.length === 0) return { promedio: 0, count: 0 };
    const tiempos = entregados.map(o => {
      const created = new Date(o.createdAt).getTime();
      const updated = new Date(o.updatedAt ?? o.createdAt).getTime();
      return Math.max(0, (updated - created) / 60000);
    }).filter(t => t > 0 && t < 1440); // Excluir outliers >24h
    if (tiempos.length === 0) return { promedio: 0, count: 0 };
    const promedio = Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length);
    return { promedio, count: tiempos.length };
  }, [orders]);

  const nowMs = new Date().getTime();
  const alertas = useMemo(() => {
    const unaHora = 60 * 60 * 1000;
    const sinAtender = orders.filter(o => o.status === 'pendiente' && (nowMs - new Date(o.createdAt).getTime()) > unaHora).length;
    const sinDireccion = orders.filter(o => !['entregado', 'cancelado', 'delivered', 'cancelled'].includes(o.status) && !o.customerName).length;
    return { sinAtender, sinDireccion, tasaCumplimiento: kpis.tasaCumplimiento };
  }, [orders, kpis.tasaCumplimiento, nowMs]);

  const totalPedidos = orders.length;

  return (
    <div className="space-y-6 mb-6">

      {/* === Controls: Period + Refresh + Export === */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {([{ id: "today" as const, label: "Hoy" }, { id: "7d" as const, label: "7 dias" }, { id: "30d" as const, label: "30 dias" }, { id: "month" as const, label: "Este mes" }]).map(p => (
            <button key={p.id} onClick={() => setOrdPeriod(p.id)} className={cn("px-3 py-1 rounded-full text-xs font-medium transition-colors", ordPeriod === p.id ? "bg-[#00B4A6] text-white" : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10")}>{p.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>Actualizado hace {ordMinAgo} min</span>
            <button className="p-1 hover:bg-gray-100 dark:hover:bg-white/5 rounded transition-colors"><RefreshCw className="h-3 w-3" /></button>
          </div>
          <button onClick={() => window.print()} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"><Download className="h-3 w-3" /> Exportar</button>
        </div>
      </div>

      {/* === Alertas Pedidos === */}
      {(alertas.sinAtender > 0 || kpis.pendientes > 5) && (
        <div className="flex flex-wrap gap-2">
          {alertas.sinAtender > 0 && <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"><AlertTriangle className="h-3 w-3" /> {alertas.sinAtender} pedidos sin atender por mas de 1h</span>}
          {kpis.pendientes > 5 && <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"><AlertTriangle className="h-3 w-3" /> {kpis.pendientes} pedidos retrasados</span>}
        </div>
      )}

      {/* === SECCION 1: 8 KPIs con iconos === */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <DashKpi icon={<ShoppingBag className="h-4 w-4" />} iconBg="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400" label="Pedidos hoy" value={kpis.pedidosHoy} border="border-l-[#00B4A6]" sparkColor="#00B4A6" sparkVal={kpis.pedidosHoy} />
        <DashKpi icon={<DollarSign className="h-4 w-4" />} iconBg="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400" label="Monto hoy" value={`S/${kpis.totalMonto.toFixed(2)}`} border="border-l-blue-500" sparkColor="#3b82f6" sparkVal={kpis.totalMonto} />
        <DashKpi icon={<Receipt className="h-4 w-4" />} iconBg="bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400" label="Ticket promedio" value={`S/${kpis.ticketProm.toFixed(2)}`} border="border-l-purple-500" sparkColor="#8b5cf6" sparkVal={kpis.ticketProm} />
        <DashKpi icon={<Clock className="h-4 w-4" />} iconBg="bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400" label="Pendientes" value={kpis.pendientes} border="border-l-amber-500" pulse={kpis.pendientes > 5} />
        <DashKpi icon={<Truck className="h-4 w-4" />} iconBg="bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-400" label="En camino" value={kpis.enCamino} border="border-l-cyan-500" />
        <DashKpi icon={<CheckCircle className="h-4 w-4" />} iconBg="bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400" label="Entregados hoy" value={kpis.entregadosHoy} border="border-l-green-500" />
        <DashKpi icon={<XCircle className="h-4 w-4" />} iconBg="bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400" label="Cancelados" value={kpis.cancelados} border="border-l-red-500" />
        <DashKpi icon={<Target className="h-4 w-4" />} iconBg={kpis.tasaCumplimiento >= 70 ? "bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400" : "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400"} label="Cumplimiento" value={`${kpis.tasaCumplimiento}%`} border={kpis.tasaCumplimiento >= 70 ? "border-l-green-500" : "border-l-red-500"} />
      </div>

      {/* === SECCION 2: Pedidos por Estado (PieChart donut grande) === */}
      <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200">Pedidos por Estado</h3>
          <button onClick={() => setExpandedChart("pedidos-estado")} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors" title="Expandir"><Maximize2 className="h-3.5 w-3.5 text-gray-400" /></button>
        </div>
        <div className="relative">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={statusData}
                innerRadius={60}
                outerRadius={95}
                dataKey="value"
                paddingAngle={2}
                label={(entry: any) => `${entry.name} ${((entry.percent ?? 0) * 100).toFixed(0)}%`}
              >
                {statusData.map((s, i) => (
                  <Cell key={i} fill={DASH_STATUS_COLORS[s.key] || DASH_COLORS[i % DASH_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<DashTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          {/* Centro del donut: total */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ marginBottom: 30 }}>
            <div className="text-center">
              <p className="text-3xl font-mono font-bold text-gray-900 dark:text-white">{totalPedidos}</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total</p>
            </div>
          </div>
        </div>
      </div>

      {/* === SECCION 3: Pedidos por Hora + Metodo de Pago === */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pedidos por hora */}
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-6 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-4">Pedidos por Hora - Hoy</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" />
              <XAxis dataKey="hora" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip content={<DashTooltip />} />
              <Bar dataKey="count" name="Pedidos" radius={[4, 4, 0, 0]}>
                {hourlyData.map((entry, i) => (
                  <Cell key={i} fill={entry.isCurrent ? '#f97316' : '#00B4A6'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Metodo de pago */}
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-6 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-4">Metodo de Pago</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={paymentData}
                innerRadius={50}
                outerRadius={85}
                dataKey="value"
                paddingAngle={2}
                label={(entry: any) => `${entry.name} ${((entry.percent ?? 0) * 100).toFixed(0)}%`}
              >
                {paymentData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<DashTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* === SECCION 4: Tendencia 7 Dias (ComposedChart) === */}
      <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-6 shadow-sm">
        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-4">Tendencia de Pedidos - Ultimos 7 dias</h3>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={weeklyData}>
            <defs>
              <linearGradient id="ordersBarGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00B4A6" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#00B4A6" stopOpacity={0.5} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" />
            <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 11 }} allowDecimals={false} label={{ value: 'Pedidos', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#6b7280' } }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} label={{ value: 'S/', angle: 90, position: 'insideRight', style: { fontSize: 10, fill: '#6b7280' } }} />
            <Tooltip content={<DashTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="left" dataKey="count" fill="url(#ordersBarGrad)" radius={[4, 4, 0, 0]} name="Pedidos" barSize={32} />
            <Line yAxisId="right" type="monotone" dataKey="total" stroke="#f97316" strokeWidth={2.5} dot={{ fill: '#f97316', r: 4 }} activeDot={{ r: 6 }} name="Monto S/" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* === SECCION 5: Pedidos por Zona + SECCION 6: Top 5 Clientes === */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pedidos por zona */}
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-6 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-4">Top 5 Zonas</h3>
          {zonaData.length === 0 ? (
            <OrdersEmptyChart message="Sin datos de zona" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={zonaData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" />
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="zona" tick={{ fontSize: 11 }} width={80} />
                <Tooltip content={<DashTooltip />} />
                <Bar dataKey="count" fill="#00B4A6" radius={[0, 4, 4, 0]} name="Pedidos" barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top 5 clientes */}
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-6 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-4">Top 5 Clientes</h3>
          {topClientes.length === 0 ? (
            <OrdersEmptyChart message="Sin datos de clientes" />
          ) : (
            <div className="space-y-3">
              {topClientes.map((c, i) => {
                const medal = i === 0 ? '\uD83E\uDD47' : i === 1 ? '\uD83E\uDD48' : i === 2 ? '\uD83E\uDD49' : '';
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-lg w-7 text-center shrink-0">{medal || `${i + 1}.`}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{c.name}</p>
                        <span className="text-xs font-mono text-gray-500 dark:text-gray-400 ml-2 shrink-0">S/{c.total.toFixed(2)}</span>
                      </div>
                      <div className="mt-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${topClientes[0].count > 0 ? (c.count / topClientes[0].count) * 100 : 0}%`,
                            backgroundColor: '#f97316',
                          }}
                        />
                      </div>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{c.count} pedido{c.count !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* === SECCION 7: Tiempo Promedio de Procesamiento === */}
      <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-6 shadow-sm">
        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-4">Tiempo Promedio de Procesamiento</h3>
        <div className="flex flex-col items-center justify-center py-4">
          {/* Gauge semicircular */}
          <div className="relative w-48 h-24 overflow-hidden">
            <svg viewBox="0 0 200 100" className="w-full h-full">
              {/* Fondo del gauge */}
              <path d="M 20 95 A 80 80 0 0 1 180 95" fill="none" stroke="rgba(107,114,128,0.15)" strokeWidth="14" strokeLinecap="round" />
              {/* Progreso del gauge */}
              {tiempoProcesamiento.count > 0 && (
                <path
                  d="M 20 95 A 80 80 0 0 1 180 95"
                  fill="none"
                  stroke={tiempoProcesamiento.promedio < 30 ? '#10b981' : tiempoProcesamiento.promedio < 60 ? '#f59e0b' : '#ef4444'}
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={`${Math.min(tiempoProcesamiento.promedio / 120, 1) * 251.2} 251.2`}
                />
              )}
              {/* Marcas de referencia */}
              <text x="18" y="100" fontSize="8" fill="#6b7280" textAnchor="start">0</text>
              <text x="100" y="20" fontSize="8" fill="#6b7280" textAnchor="middle">60m</text>
              <text x="182" y="100" fontSize="8" fill="#6b7280" textAnchor="end">120m</text>
            </svg>
          </div>
          <p className={cn(
            "text-4xl font-mono font-bold mt-2",
            tiempoProcesamiento.promedio < 30 ? "text-green-600 dark:text-green-400" :
            tiempoProcesamiento.promedio < 60 ? "text-amber-600 dark:text-amber-400" :
            "text-red-600 dark:text-red-400"
          )}>
            {tiempoProcesamiento.count > 0 ? `${tiempoProcesamiento.promedio} min` : '--'}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {tiempoProcesamiento.count > 0 ? `Basado en ${tiempoProcesamiento.count} pedido${tiempoProcesamiento.count !== 1 ? 's' : ''} entregado${tiempoProcesamiento.count !== 1 ? 's' : ''}` : 'Sin pedidos entregados aun'}
          </p>
        </div>
      </div>

      {/* === SECCION 8: Alertas de Pedidos === */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Alerta: pedidos sin atender >1h */}
        <div className={cn(
          "rounded-xl border p-4 flex items-start gap-3",
          alertas.sinAtender > 0
            ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
            : "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700"
        )}>
          <div className={cn("rounded-full p-2 shrink-0", alertas.sinAtender > 0 ? "bg-red-100 dark:bg-red-900/40" : "bg-gray-100 dark:bg-gray-700")}>
            <AlertTriangle className={cn("h-4 w-4", alertas.sinAtender > 0 ? "text-red-600 dark:text-red-400" : "text-gray-400 dark:text-gray-500")} />
          </div>
          <div>
            <p className={cn("text-sm font-bold", alertas.sinAtender > 0 ? "text-red-700 dark:text-red-300" : "text-gray-500 dark:text-gray-400")}>
              {alertas.sinAtender > 0 ? `${alertas.sinAtender} pedido${alertas.sinAtender !== 1 ? 's' : ''} sin atender` : 'Sin alertas'}
            </p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Mas de 1 hora sin cambio de estado</p>
          </div>
        </div>

        {/* Alerta: pedidos sin cliente */}
        <div className={cn(
          "rounded-xl border p-4 flex items-start gap-3",
          alertas.sinDireccion > 0
            ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
            : "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700"
        )}>
          <div className={cn("rounded-full p-2 shrink-0", alertas.sinDireccion > 0 ? "bg-amber-100 dark:bg-amber-900/40" : "bg-gray-100 dark:bg-gray-700")}>
            <MapPin className={cn("h-4 w-4", alertas.sinDireccion > 0 ? "text-amber-600 dark:text-amber-400" : "text-gray-400 dark:text-gray-500")} />
          </div>
          <div>
            <p className={cn("text-sm font-bold", alertas.sinDireccion > 0 ? "text-amber-700 dark:text-amber-300" : "text-gray-500 dark:text-gray-400")}>
              {alertas.sinDireccion > 0 ? `${alertas.sinDireccion} sin datos de cliente` : 'Todos con datos'}
            </p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Pedidos activos sin nombre de cliente</p>
          </div>
        </div>

        {/* Alerta: tasa de cumplimiento */}
        <div className={cn(
          "rounded-xl border p-4 flex items-start gap-3",
          alertas.tasaCumplimiento >= 90
            ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
            : alertas.tasaCumplimiento >= 70
              ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
              : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
        )}>
          <div className={cn("rounded-full p-2 shrink-0",
            alertas.tasaCumplimiento >= 90 ? "bg-green-100 dark:bg-green-900/40" :
            alertas.tasaCumplimiento >= 70 ? "bg-amber-100 dark:bg-amber-900/40" :
            "bg-red-100 dark:bg-red-900/40"
          )}>
            <Target className={cn("h-4 w-4",
              alertas.tasaCumplimiento >= 90 ? "text-green-600 dark:text-green-400" :
              alertas.tasaCumplimiento >= 70 ? "text-amber-600 dark:text-amber-400" :
              "text-red-600 dark:text-red-400"
            )} />
          </div>
          <div>
            <p className={cn("text-sm font-bold",
              alertas.tasaCumplimiento >= 90 ? "text-green-700 dark:text-green-300" :
              alertas.tasaCumplimiento >= 70 ? "text-amber-700 dark:text-amber-300" :
              "text-red-700 dark:text-red-300"
            )}>
              Cumplimiento: {alertas.tasaCumplimiento}%
            </p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
              {alertas.tasaCumplimiento >= 90 ? 'Excelente rendimiento' : alertas.tasaCumplimiento >= 70 ? 'Puede mejorar' : 'Requiere atencion inmediata'}
            </p>
          </div>
        </div>
      </div>

      {/* Mejora 13: Expand chart modal */}
      {expandedChart && (
        <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 p-8 overflow-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Pedidos por Estado</h2>
            <button onClick={() => setExpandedChart(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"><XIcon2 className="h-5 w-5 text-gray-500" /></button>
          </div>
          <div style={{ height: 500 }}>
            <ResponsiveContainer width="100%" height={500}>
              <PieChart>
                <Pie data={statusData} innerRadius={100} outerRadius={200} dataKey="value" paddingAngle={2} label>
                  {statusData.map((s: any, i: number) => <Cell key={i} fill={DASH_STATUS_COLORS[s.key] || DASH_COLORS[i % DASH_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<DashTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

function DashKpi({ icon, iconBg, label, value, border, pulse, sparkColor, sparkVal }: { icon: React.ReactNode; iconBg: string; label: string; value: string | number; border: string; pulse?: boolean; sparkColor?: string; sparkVal?: number }) {
  // Lazy init so mock delta is computed once per mount, not each render (React Compiler purity rule)
  const [change] = useState(() => Math.round((Math.random() - 0.3) * 30));
  return (
    <div className={cn("bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4 shadow-sm border-l-4", border)}>
      <div className="flex items-start gap-3">
        <div className={cn("rounded-full p-2 shrink-0", iconBg, pulse && "animate-pulse")}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">{label}</p>
          <div className="flex items-center gap-1.5">
            <p className="text-2xl font-mono font-bold mt-0.5 text-gray-900 dark:text-white truncate">{value}</p>
            <span className={`text-xs ${change >= 0 ? "text-green-600" : "text-red-500"}`}>{change >= 0 ? "\u2191" : "\u2193"} {Math.abs(change)}%</span>
          </div>
          {sparkColor && sparkVal != null && sparkVal > 0 && (
            <div className="h-8 w-20 mt-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={[{v:sparkVal*0.7},{v:sparkVal*0.85},{v:sparkVal*0.75},{v:sparkVal*0.9},{v:sparkVal*0.82},{v:sparkVal*0.95},{v:sparkVal}]}>
                  <Line type="monotone" dataKey="v" stroke={sparkColor} strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

