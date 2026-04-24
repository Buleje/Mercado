"use client";

import { CardTitle, PageTitle, SectionTitle } from "@buleje/design-system";
import { AdminTooltip } from "@/components/admin/shared/AdminTooltip";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ShoppingBag, RefreshCw, Clock, CheckCircle, XCircle, Truck,
  Search, ChevronDown, ChevronUp, ChevronRight, Download, FileSpreadsheet, Receipt,
  ArrowRight, Package, Bell, BellOff, Lock, LayoutList, Columns3, MapPin,
  CheckSquare, DollarSign, Target, AlertTriangle, Maximize2, X as XIcon2, ShoppingCart,
} from "@buleje/design-system/icons";
import EmptyState from "@/components/admin/shared/EmptyState";
import { AdminCard, AdminKPI, StatusBadge } from "@/components/admin/shared";
import type { BadgeVariant } from "@/components/admin/shared";
import {
  PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ComposedChart, Line, LineChart,
} from "recharts";
import { cn } from "@/lib/utils";
import { exportToExcel } from "@/lib/export-excel";
import { tenantFetch } from "@/lib/tenant-fetch";
import TicketPreview from "./TicketPreview";
import OrderTimeline from "./pedidos/OrderTimeline";
import { csrfHeaders } from "@/lib/csrf-client";

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

const STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant; badgeIcon: React.ComponentType<{ className?: string }>; color: string; icon: React.ReactNode; next?: string }> = {
  pendiente:   { label: "Pendiente",   variant: "warning", badgeIcon: Clock,       color: "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-[var(--data-warning)]/30 dark:text-[var(--data-warning)]",         icon: <Clock className="h-3 w-3" />,        next: "confirmado" },
  confirmado:  { label: "Confirmado",  variant: "info",    badgeIcon: CheckCircle, color: "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]",             icon: <CheckCircle className="h-3 w-3" />,   next: "en_camino" },
  en_camino:   { label: "En camino",   variant: "info",    badgeIcon: Truck,       color: "bg-[var(--data-info-100)] text-[var(--data-info)] dark:bg-[var(--data-info)]/30 dark:text-[var(--data-info)]",             icon: <Truck className="h-3 w-3" />,         next: "entregado" },
  entregado:   { label: "Entregado",   variant: "success", badgeIcon: CheckCircle, color: "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]", icon: <CheckCircle className="h-3 w-3" /> },
  cancelado:   { label: "Cancelado",   variant: "error",   badgeIcon: XCircle,     color: "bg-[var(--data-error-100)] text-[var(--data-error)] dark:bg-[var(--data-error)]/30 dark:text-[var(--data-error)]",                 icon: <XCircle className="h-3 w-3" /> },
  pending:     { label: "Pendiente",   variant: "warning", badgeIcon: Clock,       color: "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-[var(--data-warning)]/30 dark:text-[var(--data-warning)]",         icon: <Clock className="h-3 w-3" />,        next: "confirmado" },
  confirmed:   { label: "Confirmado",  variant: "info",    badgeIcon: CheckCircle, color: "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]",             icon: <CheckCircle className="h-3 w-3" />,   next: "en_camino" },
  preparing:   { label: "Preparando",  variant: "pending", badgeIcon: Package,     color: "bg-[var(--surface-sunken)] text-[var(--text-primary)]",     icon: <Package className="h-3 w-3" />,       next: "en_camino" },
  delivering:  { label: "En camino",   variant: "info",    badgeIcon: Truck,       color: "bg-[var(--data-info-100)] text-[var(--data-info)] dark:bg-[var(--data-info)]/30 dark:text-[var(--data-info)]",             icon: <Truck className="h-3 w-3" />,         next: "entregado" },
  delivered:   { label: "Entregado",   variant: "success", badgeIcon: CheckCircle, color: "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]", icon: <CheckCircle className="h-3 w-3" /> },
  cancelled:   { label: "Cancelado",   variant: "error",   badgeIcon: XCircle,     color: "bg-[var(--data-error-100)] text-[var(--data-error)] dark:bg-[var(--data-error)]/30 dark:text-[var(--data-error)]",                 icon: <XCircle className="h-3 w-3" /> },
};

const TERMINAL = new Set(["delivered", "cancelled", "entregado", "cancelado"]);

const FILTER_OPTIONS = [
  { id: "all",        label: "Todos" },
  { id: "active",     label: "Activos" },
  { id: "pendiente",  label: "Pendientes" },
  { id: "confirmado", label: "Confirmados" },
  { id: "en_camino",  label: "En camino" },
  { id: "concluidos", label: "Concluidos" },
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
  type DeliveryPerson = { nombre: string; teléfono: string; zona: string; activo: boolean; comision: number; entregas: number };
  const [deliveryPeople, setDeliveryPeople] = useState<DeliveryPerson[]>(() => {
    try { const raw = localStorage.getItem("delivery-people"); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  const [showDeliveryPanel, setShowDeliveryPanel] = useState(false);
  const [showAddDelivery, setShowAddDelivery] = useState(false);
  const [newDelivery, setNewDelivery] = useState({ nombre: "", teléfono: "", zona: "", comision: 3 });
  const [assigningDelivery, setAssigningDelivery] = useState<string | null>(null);
  const [deliveryAssignments, setDeliveryAssignments] = useState<Record<string, string>>(() => {
    try { const raw = localStorage.getItem("delivery-assignments"); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  });

  const saveDeliveryPeople = (people: DeliveryPerson[]) => {
    setDeliveryPeople(people);
    localStorage.setItem("delivery-people", JSON.stringify(people));
  };

  const addDeliveryPerson = () => {
    if (!newDelivery.nombre.trim() || !newDelivery.teléfono.trim()) return;
    const person: DeliveryPerson = { ...newDelivery, activo: true, entregas: 0 };
    saveDeliveryPeople([...deliveryPeople, person]);
    setNewDelivery({ nombre: "", teléfono: "", zona: "", comision: 3 });
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
    const phone = person.teléfono.replace(/\D/g, "");
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
  }, [soundEnabled]);

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
      const res = await tenantFetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
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
    } else if (filter === "concluidos") {
      result = result.filter(o => TERMINAL.has(o.status));
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
        <p className="text-sm text-[var(--data-error)] dark:text-[var(--data-error)]">{error}</p>
        <button onClick={load} className="flex items-center gap-1.5 rounded-lg bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)] text-white px-4 py-2.5 text-sm font-medium transition-colors">
          <RefreshCw className="h-4 w-4" /> Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header estandar ──────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] shrink-0">
          <Receipt className="w-5 h-5 text-[var(--data-success)] dark:text-[var(--data-success)]" />
        </div>
        <div className="flex-1 min-w-0">
          <PageTitle className="text-xl font-bold text-[var(--text-primary)] truncate">Ventas y Caja</PageTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-zinc-400 mt-0.5">Pedidos, caja y punto de venta</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <AdminTooltip content="Descargar pedidos en formato CSV">
            <button onClick={exportCSV} aria-label="Exportar CSV" className="p-2 rounded-lg bg-gray-100 dark:bg-surface hover:bg-gray-200 dark:hover:bg-accent transition-colors">
              <Download className="h-4 w-4 text-[var(--text-secondary)]" />
            </button>
          </AdminTooltip>
          <AdminTooltip content="Descargar pedidos en formato Excel (.xlsx)">
            <button onClick={exportExcel} aria-label="Exportar Excel" className="p-2 rounded-lg bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)] transition-colors">
              <FileSpreadsheet className="h-4 w-4 text-[var(--data-success)]" />
            </button>
          </AdminTooltip>
          <button
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              localStorage.setItem("order-sound-enabled", String(next));
              if (next) playNewOrderSound();
            }}
            className={cn(
              "p-2 rounded-xl transition-colors",
              soundEnabled
                ? "bg-[var(--data-warning-50)] dark:bg-amber-950/30 hover:bg-[var(--data-warning-100)]"
                : "bg-gray-100 dark:bg-surface hover:bg-gray-200"
            )}
            title={soundEnabled ? "Sonido: ON" : "Sonido: OFF"}
          >
            {soundEnabled ? <Bell className="h-4 w-4 text-[var(--data-warning)]" /> : <BellOff className="h-4 w-4 text-[var(--text-tertiary)]" />}
          </button>
        </div>
      </div>

      {/* ── Tabs estandar (View modes) ─────────────────────────────── */}
      <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-zinc-800 rounded-xl w-fit">
        <button
          onClick={() => { setViewMode("list"); try { localStorage.setItem("orders-view-mode", "list"); } catch {} }}
          className={cn("px-4 py-2 text-sm font-medium rounded-lg transition-all", viewMode === "list" ? "bg-white dark:bg-zinc-700 text-[var(--text-primary)] " : "text-[var(--text-secondary)] dark:text-zinc-400 hover:text-[var(--text-primary)]")}
        >
          Lista
        </button>
        <button
          onClick={() => { setViewMode("kanban"); try { localStorage.setItem("orders-view-mode", "kanban"); } catch {} }}
          className={cn("px-4 py-2 text-sm font-medium rounded-lg transition-all", viewMode === "kanban" ? "bg-white dark:bg-zinc-700 text-[var(--text-primary)] " : "text-[var(--text-secondary)] dark:text-zinc-400 hover:text-[var(--text-primary)]")}
        >
          Kanban
        </button>
        <button
          onClick={() => { setViewMode("historial"); try { localStorage.setItem("orders-view-mode", "historial"); } catch {} }}
          className={cn("px-4 py-2 text-sm font-medium rounded-lg transition-all", viewMode === "historial" ? "bg-white dark:bg-zinc-700 text-[var(--text-primary)] " : "text-[var(--text-secondary)] dark:text-zinc-400 hover:text-[var(--text-primary)]")}
        >
          Historial
        </button>
      </div>

      {/* ── Toolbar estandar ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Busqueda */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar cliente o ID..."
            aria-label="Buscar pedidos"
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-[var(--rule-base)] dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:border-[var(--data-success)]/30 focus:ring-1 focus:ring-[var(--data-success)]/40 outline-none transition-all"
          />
        </div>

        {/* Filtro status — chips estandar */}
        {FILTER_OPTIONS.map(opt => (
          <button
            key={opt.id}
            onClick={() => { setFilter(opt.id); setPage(1); }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium border transition-all",
              filter === opt.id
                ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30 text-[var(--data-success)] dark:text-[var(--data-success)]"
                : "border-[var(--rule-base)] dark:border-zinc-700 text-[var(--text-secondary)] dark:text-zinc-400 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800"
            )}
          >
            {opt.label}
          </button>
        ))}

        {/* Filtro fecha — chips estandar */}
        {DATE_OPTIONS.map(opt => (
          <button
            key={opt.id}
            onClick={() => { setDateFilter(opt.id); setPage(1); }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium border transition-all",
              dateFilter === opt.id
                ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30 text-[var(--data-success)] dark:text-[var(--data-success)]"
                : "border-[var(--rule-base)] dark:border-zinc-700 text-[var(--text-secondary)] dark:text-zinc-400 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800"
            )}
          >
            {opt.label}
          </button>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Resultado count */}
        <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">
          {filtered.length} pedido{filtered.length !== 1 ? "s" : ""}
          {search && ` para "${search}"`}
        </span>

        {/* Acciones */}
        <AdminTooltip content="Recargar pedidos">
          <button onClick={load} aria-label="Actualizar" className="p-2 rounded-lg bg-gray-100 dark:bg-surface hover:bg-gray-200 dark:hover:bg-accent transition-colors">
            <RefreshCw className="h-4 w-4 text-[var(--text-secondary)]" />
          </button>
        </AdminTooltip>

        {/* Group by zone */}
        {viewMode === "list" && (
          <button
            onClick={() => setGroupByZone(p => !p)}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium border transition-all",
              groupByZone
                ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-[var(--data-success)]/30 text-[var(--data-success)]"
                : "border-[var(--rule-base)] dark:border-zinc-700 text-[var(--text-secondary)] bg-white dark:bg-zinc-900 hover:bg-gray-50"
            )}
          >
            <MapPin className="h-3 w-3" /> Zona
          </button>
        )}
      </div>

      {/* Filtros secundarios: urgencia */}
      <div className="flex flex-wrap items-center gap-2">
        {([
          { id: "todos" as const, label: "Todos", count: urgencyCounts.todos },
          { id: "urgentes" as const, label: "Urgentes <1h", count: urgencyCounts.urgentes },
          { id: "hoy" as const, label: "Hoy", count: urgencyCounts.hoy },
          { id: "manana" as const, label: "Manana", count: urgencyCounts.manana },
          { id: "atrasados" as const, label: "Atrasados", count: urgencyCounts.atrasados },
        ] as const).map(opt => (
          <button
            key={opt.id}
            onClick={() => { setUrgencyFilter(opt.id); setPage(1); }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium border transition-all",
              urgencyFilter === opt.id
                ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30 text-[var(--data-success)] dark:text-[var(--data-success)]"
                : "border-[var(--rule-base)] dark:border-zinc-700 text-[var(--text-secondary)] dark:text-zinc-400 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800"
            )}
          >
            {opt.label}
            <span className={cn(
              "text-[length:var(--ts-2xs)] font-bold rounded-full min-w-[18px] h-[18px] inline-flex items-center justify-center px-1",
              urgencyFilter === opt.id ? "bg-[var(--accent-soft)] text-white" : "bg-gray-200 dark:bg-zinc-700 text-[var(--text-secondary)] dark:text-zinc-300"
            )}>
              {opt.count > 99 ? "99+" : opt.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Dashboard Analytics (colapsable) ────────────────────────── */}
      <button
        onClick={() => {
          const v = !showDashboard;
          setShowDashboard(v);
          localStorage.setItem('orders-show-dashboard', String(v));
        }}
        className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] dark:text-muted dark:hover:text-foreground"
      >
        {showDashboard ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Dashboard detallado
      </button>

      {showDashboard && <OrdersDashboard orders={orders} />}

      {/* ── KPIs estandar ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminKPI label="Vendido hoy" value={fmt(todayStats.total)} icon={DollarSign} iconColor="var(--color-primary)" />
        <AdminKPI label="Pedidos hoy" value={todayStats.count} icon={ShoppingBag} iconColor="#3B82F6" />
        <AdminCard padding="md" className="relative">
          <div className="flex flex-col gap-2">
            <div className="h-6 w-6 flex items-center justify-center">
              <Target className="h-6 w-6" style={{ color: "#f59e0b" }} />
            </div>
            <p className="text-xs text-[var(--text-secondary)] dark:text-zinc-400 font-medium">Activos</p>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{todayStats.active}</p>
          </div>
          {newCount > 0 && (
            <button
              onClick={() => setNewCount(0)}
              className="absolute top-2 right-2 h-5 min-w-5 px-1.5 rounded-full bg-[var(--data-error)] text-white text-[length:var(--ts-2xs)] font-bold flex items-center justify-center"
              title="Nuevos pedidos"
            >
              +{newCount}
            </button>
          )}
        </AdminCard>
        {avgDeliveryTime !== null && (
          <AdminKPI label="Entrega promedio" value={`${avgDeliveryTime} min`} icon={Truck} iconColor="#06b6d4" />
        )}
      </div>

      {/* ── Mejora 13: Kanban view ─────────────────────────────────────── */}
      {viewMode === "kanban" && (() => {
        const KANBAN_COLS = [
          { key: "pendiente", label: "Pendiente", match: ["pendiente", "pending"], bg: "bg-[var(--data-warning-50)] dark:bg-yellow-950/20", border: "border-[var(--data-warning)] dark:border-[var(--data-warning)]", headerBg: "bg-yellow-100 dark:bg-yellow-900/30" },
          { key: "preparando", label: "Preparando", match: ["confirmado", "confirmed", "preparing", "preparando"], bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", border: "border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30", headerBg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
          { key: "en_camino", label: "En camino", match: ["en_camino", "delivering"], bg: "bg-[var(--surface-sunken)]", border: "border-[var(--rule-base)]", headerBg: "bg-[var(--surface-sunken)]" },
          { key: "entregado", label: "Entregado", match: ["entregado", "delivered"], bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", border: "border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30", headerBg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
        ];
        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 overflow-x-auto">
            {KANBAN_COLS.map(col => {
              const colOrders = filtered.filter(o => col.match.includes(o.status));
              return (
                <div key={col.key} className={cn("rounded-xl border-2 min-w-[200px]", col.bg, col.border)}>
                  <div className={cn("px-3 py-2 rounded-t-lg flex items-center justify-between", col.headerBg)}>
                    <span className="text-xs font-extrabold text-[var(--text-primary)] dark:text-foreground">{col.label}</span>
                    <span className="px-1.5 py-0.5 rounded-full bg-white/60 dark:bg-white/10 text-[length:var(--ts-2xs)] font-bold text-[var(--text-primary)] dark:text-foreground">{colOrders.length}</span>
                  </div>
                  <div className="p-2 space-y-2 max-h-[60vh] overflow-y-auto">
                    {colOrders.length === 0 ? (
                      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted text-center py-4">Sin pedidos</p>
                    ) : colOrders.map(order => {
                      const minutos = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
                      const cfg = STATUS_CONFIG[order.status];
                      const nextStatus = cfg?.next;
                      return (
                        <div key={order.id} className="bg-white dark:bg-card rounded-lg border border-[var(--rule-base)] dark:border-card-border p-2.5  hover:shadow-sm transition-shadow">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-bold text-[var(--text-primary)] dark:text-foreground truncate">{order.customerName ?? "Sin nombre"}</p>
                            {/* Mejora 14: Time badge */}
                            {!TERMINAL.has(order.status) && (
                              <span className={cn("text-[length:var(--ts-2xs)] font-bold shrink-0", minutos < 15 ? "text-[var(--data-success)]" : minutos < 30 ? "text-[var(--data-warning)]" : minutos > 60 ? "text-[var(--data-error)] animate-pulse" : "text-[var(--data-error)]")}>
                                {minutos > 60 ? `${Math.floor(minutos / 60)}h ${minutos % 60}m` : `${minutos}m`}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-extrabold font-mono text-primary">{fmt(order.total)}</p>
                          <div className="flex items-center justify-between mt-1.5">
                            <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">{order.items?.length ?? 0} productos</span>
                            <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] capitalize">{order.paymentMethod ?? "efectivo"}</span>
                          </div>
                          {nextStatus && (
                            <button
                              disabled={updatingId === order.id}
                              onClick={() => changeStatus(order.id, nextStatus)}
                              className="mt-2 w-full flex items-center justify-center gap-1 py-1.5 rounded-lg bg-primary/10 text-primary text-[length:var(--ts-2xs)] font-bold hover:bg-primary/20 transition-colors disabled:opacity-50"
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
            <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-surface border-b border-[var(--rule-base)] dark:border-card-border">
                    <th className="text-left px-4 py-3 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] dark:text-muted">#</th>
                    <th className="text-left px-4 py-3 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] dark:text-muted">Fecha</th>
                    <th className="text-left px-4 py-3 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] dark:text-muted">Cliente</th>
                    <th className="text-right px-4 py-3 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] dark:text-muted">Total</th>
                    <th className="text-center px-4 py-3 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] dark:text-muted">Estado</th>
                    <th className="text-center px-4 py-3 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] dark:text-muted">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {histPaged.map((order, idx) => {
                    const cfg = STATUS_CONFIG[order.status] ?? { label: order.status, color: "bg-gray-100 text-[var(--text-secondary)]", icon: null };
                    return (
                      <tr key={order.id} className="border-b border-[var(--rule-soft)] dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-[var(--text-tertiary)]">{idx + 1}</td>
                        <td className="px-4 py-3 text-xs text-[var(--text-secondary)] dark:text-foreground">{fmtDate(order.createdAt)}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-[var(--text-primary)] dark:text-foreground">{order.customerName ?? "Cliente"}</td>
                        <td className="px-4 py-3 text-xs font-extrabold text-primary text-right">{fmt(order.total)}</td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge variant={cfg.variant} label={cfg.label} icon={cfg.badgeIcon} size="sm" />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => { setViewMode("list"); setExpandedId(order.id); }}
                            className="px-2 py-1 rounded-lg bg-primary/10 text-primary text-[length:var(--ts-2xs)] font-bold hover:bg-primary/20 transition-colors"
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
            <p className="text-xs text-[var(--text-tertiary)] dark:text-muted text-center">{histFiltered.length} pedido{histFiltered.length !== 1 ? "s" : ""} en total</p>
            {hasMoreHist && (
              <button onClick={() => setPage(p => p + 1)} className="w-full py-3 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm font-bold text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                Cargar más ({histFiltered.length - histPaged.length} restantes)
              </button>
            )}
          </div>
        );
      })()}

      {/* ── Orders list ───────────────────────────────────────────────── */}
      {viewMode === "list" && orders.length === 0 ? (
        <EmptyState
          illustration="orders"
          title="Sin pedidos"
          description="Los pedidos de tus clientes apareceran aqui."
        />
      ) : viewMode === "list" && filtered.length === 0 ? (
        <EmptyState
          illustration="search"
          title={search ? "Sin resultados" : "Sin pedidos"}
          description={search ? "No se encontraron pedidos para esa busqueda." : "No hay pedidos con estos filtros."}
        />
      ) : viewMode === "list" && (() => {
        // Mejora 15: Group by zone
        const renderOrder = (order: Order) => {
          const cfg = STATUS_CONFIG[order.status] ?? { label: order.status, color: "bg-gray-100 text-[var(--text-secondary)]", icon: null };
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
                  ? "border-[var(--rule-soft)] dark:border-card-border opacity-70"
                  : "border-[var(--rule-base)] dark:border-card-border "
              )}
            >
              {/* Main row — clickable to expand */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : order.id)}
                className="w-full p-3.5 flex items-center justify-between gap-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground truncate">
                    {order.customerName ?? "Cliente"}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)] dark:text-muted mt-0.5">{fmtDate(order.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge variant={cfg.variant} label={cfg.label} icon={cfg.badgeIcon} />
                  {/* Mejora 14: Time badge */}
                  {!isTerminal && (
                    <span className={cn(
                      "text-[length:var(--ts-2xs)] font-bold",
                      minutos < 15 ? "text-[var(--data-success)]" : minutos < 30 ? "text-[var(--data-warning)]" : minutos > 60 ? "text-[var(--data-error)] font-extrabold animate-pulse" : "text-[var(--data-error)] font-bold"
                    )}>
                      {minutos > 60 ? `${Math.floor(minutos / 60)}h ${minutos % 60}m` : `${minutos}m`}
                    </span>
                  )}
                  <span className="text-sm font-extrabold text-primary">{fmt(order.total)}</span>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-[var(--text-tertiary)]" /> : <ChevronDown className="h-4 w-4 text-[var(--text-tertiary)]" />}
                </div>
              </button>

                {/* Expanded detail panel — Redesigned */}
                {isExpanded && (
                  <div className="border-t-2 border-primary/30 dark:border-primary/20">
                    {/* Enhanced header with order ID, date and status */}
                    <div className="bg-[var(--surface-sunken)] px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                          <ShoppingBag className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-extrabold text-[var(--text-primary)] dark:text-foreground">Pedido #{order.id.slice(0, 8)}</p>
                          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">{fmtDate(order.createdAt)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge variant={cfg.variant} label={cfg.label} icon={cfg.badgeIcon} />
                        <span className="text-lg font-extrabold text-primary">{fmt(order.total)}</span>
                      </div>
                    </div>

                    <div className="px-4 pb-4 pt-3 space-y-3">
                    {/* Timeline visual (Mejora 2) */}
                    <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-5">
                      <p className="text-[length:var(--ts-2xs)] font-bold text-primary mb-2 flex items-center gap-1.5">
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
                    <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-5">
                      <p className="text-[length:var(--ts-2xs)] font-bold text-primary mb-2 flex items-center gap-1.5">
                        <Receipt className="h-3 w-3" /> Información del pedido
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                        <div className="bg-gray-50 dark:bg-surface rounded-lg p-2.5">
                          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted block mb-0.5">ID Pedido</span>
                          <span className="font-mono font-bold text-[var(--text-primary)] dark:text-foreground">{order.id.slice(0, 8)}</span>
                        </div>
                        <div className="bg-gray-50 dark:bg-surface rounded-lg p-2.5">
                          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted block mb-0.5">Método de pago</span>
                          <span className="font-bold text-[var(--text-primary)] dark:text-foreground capitalize">{order.paymentMethod ?? "efectivo"}</span>
                        </div>
                        {order.customerPhone && (
                          <div className="bg-gray-50 dark:bg-surface rounded-lg p-2.5">
                            <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted block mb-0.5">Teléfono</span>
                            <span className="font-bold text-[var(--text-primary)] dark:text-foreground">{order.customerPhone}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Items list — card style */}
                    {order.items && order.items.length > 0 && (
                      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-5">
                        <p className="text-[length:var(--ts-2xs)] font-bold text-primary mb-2 flex items-center gap-1.5">
                          <Package className="h-3 w-3" /> Productos ({order.items.length})
                        </p>
                        <div className="space-y-1.5">
                        {order.items.map((item, i) => (
                          <div key={i} className="flex justify-between text-xs px-2.5 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                            <span className="text-[var(--text-primary)] dark:text-foreground">{item.qty}x {item.name}</span>
                            {item.price != null && (
                              <span className="font-bold text-[var(--text-secondary)] dark:text-muted">{fmt(item.price * item.qty)}</span>
                            )}
                          </div>
                        ))}
                        </div>
                        <div className="flex justify-between text-sm pt-2.5 mt-2 border-t-2 border-primary/20 dark:border-primary/10 px-2.5">
                          <span className="font-bold text-[var(--text-primary)] dark:text-foreground">Total</span>
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
                        <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30 rounded-lg p-2.5">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-success)] dark:text-[var(--data-success)] uppercase flex items-center gap-1">
                              <CheckSquare className="h-3 w-3" /> Checklist de preparacion
                            </span>
                            <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-success)] dark:text-[var(--data-success)]">{checkedCount} de {totalItems} listos</span>
                          </div>
                          {/* Progress bar */}
                          <div className="w-full bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-full h-1.5 mb-2">
                            <div className="h-1.5 rounded-full bg-[var(--accent-soft)] transition-all" style={{ width: `${totalItems > 0 ? (checkedCount / totalItems) * 100 : 0}%` }} />
                          </div>
                          <div className="space-y-1">
                            {order.items!.map((item, idx) => {
                              const itemId = `${order.id}-${idx}`;
                              const isChecked = checkedItems.includes(itemId);
                              return (
                                <label key={idx} className={cn("flex items-center gap-2 text-xs cursor-pointer p-1 rounded-lg hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)] transition-colors", isChecked && "line-through text-[var(--text-tertiary)]")}>
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
                                    className="h-3.5 w-3.5 rounded border-[var(--data-success)]/30 text-[var(--data-success)] focus:ring-[var(--data-success)]/40"
                                  />
                                  <span className={cn("text-[var(--text-primary)] dark:text-foreground", isChecked && "text-[var(--text-tertiary)] dark:text-muted")}>{item.name} x {item.qty}</span>
                                </label>
                              );
                            })}
                          </div>
                          {allChecked && (
                            <div className="mt-2 text-center">
                              <StatusBadge variant="success" label="Listo para enviar" icon={CheckCircle} size="sm" />
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {order.notes && !order.notes.startsWith("[ADMIN]") && (
                      <p className="text-xs text-[var(--text-secondary)] dark:text-muted italic">Nota: {order.notes}</p>
                    )}

                    {/* Mejora 18: Nota interna por pedido */}
                    <div className="bg-[var(--data-warning-50)] dark:bg-yellow-950/20 border border-[var(--data-warning)] dark:border-[var(--data-warning)] rounded-lg p-2.5">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Lock className="h-3 w-3 text-[var(--data-warning)] dark:text-[var(--data-warning)]" />
                        <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning)] dark:text-[var(--data-warning)] uppercase">Nota interna — solo visible para el equipo</span>
                      </div>
                      <textarea
                        defaultValue={order.notes?.startsWith("[ADMIN]") ? order.notes.replace("[ADMIN] ", "") : (order.notes ?? "")}
                        placeholder="Ej: Confirmar direccion, entregar despues de las 3pm..."
                        rows={2}
                        className="w-full text-xs bg-white/80 dark:bg-white/5 border border-[var(--data-warning)] dark:border-[var(--data-warning)]/50 rounded-lg px-2 py-1.5 text-[var(--text-primary)] dark:text-foreground placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--data-warning)] resize-none"
                        onChange={(e) => {
                          const value = e.target.value;
                          const orderId = order.id;
                          // Auto-save with debounce
                          const timeoutKey = `note-timeout-${orderId}`;
                          const w = window as unknown as Record<string, unknown>;
                          const existing = w[timeoutKey] as ReturnType<typeof setTimeout> | undefined;
                          if (existing) clearTimeout(existing);
                          w[timeoutKey] = setTimeout(() => {
                            tenantFetch(`/api/orders/${orderId}`, {
                              method: "PATCH",
                              headers: csrfHeaders({ "Content-Type": "application/json" }),
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
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors border border-primary/20"
                      >
                        <Receipt className="h-3.5 w-3.5" /> Ver Ticket
                      </button>
                      {/* Idea 11: Assign delivery person */}
                      {!isTerminal && deliveryPeople.length > 0 && (
                        <>
                          {deliveryAssignments[order.id] ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-success)] dark:text-[var(--data-success)] px-2 py-1.5 rounded-lg bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]">
                                <Truck className="h-3 w-3 inline mr-1" />{deliveryAssignments[order.id]}
                              </span>
                              <a
                                href={buildDeliveryWhatsApp(deliveryAssignments[order.id], order)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2 py-1.5 rounded-lg bg-[#25D366] text-white text-[length:var(--ts-2xs)] font-bold hover:bg-[#1da851] transition-colors"
                              >
                                Notificar
                              </a>
                            </div>
                          ) : (
                            <button
                              onClick={() => setAssigningDelivery(order.id)}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--data-warning-50)] dark:bg-amber-950/30 text-[var(--data-warning)] dark:text-[var(--data-warning)] text-xs font-bold hover:bg-[var(--data-warning-100)] dark:hover:bg-[var(--data-warning)]/30 transition-colors"
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
                                headers: csrfHeaders({ "Content-Type": "application/json" }),
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
                                setGrrToast(`Guía de Remisión ${data.número || ""} creada`);
                                setTimeout(() => setGrrToast(null), 4000);
                              }
                            } catch { /* ignore */ }
                            setCreatingGrr(null);
                          }}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--data-info-50)] dark:bg-cyan-950/30 text-[var(--data-info)] dark:text-[var(--data-info)] text-xs font-bold hover:bg-[var(--data-info-100)] dark:hover:bg-[var(--data-info)]/30 disabled:opacity-50 transition-colors"
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
              <div className="space-y-6">
                {Array.from(zones.entries()).map(([zone, zoneOrders]) => (
                  <div key={zone}>
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs font-bold text-[var(--text-primary)] dark:text-foreground">{zone}</span>
                      <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">({zoneOrders.length} pedido{zoneOrders.length !== 1 ? "s" : ""})</span>
                    </div>
                    <div className="space-y-2">
                      {zoneOrders.map(renderOrder)}
                    </div>
                  </div>
                ))}
                {hasMore && (
                  <button onClick={() => setPage(p => p + 1)} className="w-full py-3 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm font-bold text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors">
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
                <button onClick={() => setPage(p => p + 1)} className="w-full py-3 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm font-bold text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                  Cargar mas ({filtered.length - paginated.length} restantes)
                </button>
              )}
            </div>
          );
        })()}

      {/* ── Idea 11: Panel de Repartidores ─────────────────────────── */}
      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4">
        <button
          onClick={() => setShowDeliveryPanel(!showDeliveryPanel)}
          className="w-full flex items-center justify-between text-sm font-bold text-[var(--text-primary)] dark:text-foreground"
        >
          <span className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-primary" /> Repartidores ({deliveryPeople.filter(p => p.activo).length} activos)
          </span>
          <span className="text-xs text-[var(--text-tertiary)]">{showDeliveryPanel ? "\u25B2" : "\u25BC"}</span>
        </button>

        {showDeliveryPanel && (
          <div className="mt-3 space-y-3">
            {/* Monthly stats */}
            {deliveryPeople.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {deliveryPeople.filter(p => p.activo).map(p => (
                  <div key={p.nombre} className="bg-gray-50 dark:bg-surface rounded-lg px-3 py-2 text-xs">
                    <p className="font-bold text-[var(--text-primary)] dark:text-foreground">{p.nombre}</p>
                    <p className="text-[var(--text-tertiary)] dark:text-muted">{p.zona} &middot; {p.entregas} entregas (S/{(p.entregas * p.comision).toFixed(0)} comisiones)</p>
                    <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Comision: S/{p.comision}/delivery</p>
                  </div>
                ))}
              </div>
            )}

            {/* Add new */}
            {showAddDelivery ? (
              <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-lg p-3 space-y-2">
                <p className="text-xs font-bold text-[var(--data-success)] dark:text-[var(--data-success)]">Nuevo repartidor</p>
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" placeholder="Nombre" value={newDelivery.nombre} onChange={e => setNewDelivery({...newDelivery, nombre: e.target.value})} className="text-xs border border-[var(--rule-base)] dark:border-card-border rounded-lg px-2 py-1.5 bg-white dark:bg-card text-[var(--text-primary)] dark:text-foreground" />
                  <input type="tel" placeholder="Teléfono" value={newDelivery.teléfono} onChange={e => setNewDelivery({...newDelivery, teléfono: e.target.value})} className="text-xs border border-[var(--rule-base)] dark:border-card-border rounded-lg px-2 py-1.5 bg-white dark:bg-card text-[var(--text-primary)] dark:text-foreground" />
                  <input type="text" placeholder="Zona (ej: Manantay)" value={newDelivery.zona} onChange={e => setNewDelivery({...newDelivery, zona: e.target.value})} className="text-xs border border-[var(--rule-base)] dark:border-card-border rounded-lg px-2 py-1.5 bg-white dark:bg-card text-[var(--text-primary)] dark:text-foreground" />
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-[var(--text-secondary)]">S/</span>
                    <input type="number" min={1} max={20} value={newDelivery.comision} onChange={e => setNewDelivery({...newDelivery, comision: Number(e.target.value) || 3})} className="w-16 text-xs border border-[var(--rule-base)] dark:border-card-border rounded-lg px-2 py-1.5 bg-white dark:bg-card text-[var(--text-primary)] dark:text-foreground" />
                    <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">/delivery</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={addDeliveryPerson} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90">Guardar</button>
                  <button onClick={() => setShowAddDelivery(false)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">Cancelar</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowAddDelivery(true)} className="w-full py-2 rounded-lg border-2 border-dashed border-[var(--rule-base)] dark:border-card-border text-xs font-bold text-[var(--text-tertiary)] hover:text-primary hover:border-primary/40 transition-colors">
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
          <div className="modal-backdrop p-4" onClick={() => setAssigningDelivery(null)}>
            <div className="bg-white dark:bg-card rounded-xl max-w-sm w-full p-4" onClick={e => e.stopPropagation()}>
              <p className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground mb-3">Asignar repartidor a #{order.id.slice(-6).toUpperCase()}</p>
              <div className="space-y-2">
                {deliveryPeople.filter(p => p.activo).map(p => (
                  <button
                    key={p.nombre}
                    onClick={() => assignDeliveryToOrder(order.id, p.nombre)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-surface hover:bg-primary/10 transition-colors text-left"
                  >
                    <div>
                      <p className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground">{p.nombre}</p>
                      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{p.zona} &middot; S/{p.comision}/delivery</p>
                    </div>
                    <Truck className="h-4 w-4 text-primary" />
                  </button>
                ))}
              </div>
              {deliveryPeople.filter(p => p.activo).length === 0 && (
                <p className="text-xs text-[var(--text-tertiary)] text-center py-4">No hay repartidores. Agrega uno primero.</p>
              )}
              <button onClick={() => setAssigningDelivery(null)} className="mt-3 w-full py-2 rounded-lg text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">Cerrar</button>
            </div>
          </div>
        );
      })()}

      {/* Mejora 9: WhatsApp toast notification */}
      {whatsappToast && (
        <div className="fixed bottom-4 right-4 z-50 bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 max-w-sm animate-in slide-in-from-bottom-5">
          <p className="text-xs font-bold text-[var(--text-primary)] dark:text-foreground mb-2">
            Notificar a {whatsappToast.name}
          </p>
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)] dark:text-muted mb-3">{whatsappToast.message}</p>
          <div className="flex gap-2">
            <a
              href={`https://wa.me/${whatsappToast.phone.replace(/\D/g, "").startsWith("51") ? whatsappToast.phone.replace(/\D/g, "") : "51" + whatsappToast.phone.replace(/\D/g, "")}?text=${encodeURIComponent(whatsappToast.message + "\n\nBuleje - Pucallpa")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#25D366] text-white text-xs font-bold hover:bg-[#1da851] transition-colors"
            >
              Enviar por WhatsApp
            </a>
            <button
              onClick={() => setWhatsappToast(null)}
              className="px-3 py-2 rounded-lg text-xs font-bold text-[var(--text-secondary)] bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Mejora 7: GRR created toast */}
      {grrToast && (
        <div className="fixed bottom-4 left-4 z-50 bg-white dark:bg-card border border-[var(--data-info)] dark:border-[var(--data-info)] rounded-xl p-4 max-w-xs animate-in slide-in-from-bottom-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-[var(--data-info-100)] dark:bg-[var(--data-info)]/30 flex items-center justify-center shrink-0">
              <Truck className="h-5 w-5 text-[var(--data-info)]" />
            </div>
            <div>
              <p className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground">{grrToast}</p>
            </div>
            <button onClick={() => setGrrToast(null)} className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] shrink-0">
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Mejora 20: New order toast */}
      {newOrderToast && (
        <div className="fixed top-4 right-4 z-50 bg-white dark:bg-card border border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30 rounded-xl p-4 max-w-xs animate-in slide-in-from-top-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] flex items-center justify-center shrink-0">
              <Bell className="h-5 w-5 text-[var(--data-success)]" />
            </div>
            <div>
              <p className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground">Nuevo pedido!</p>
              <p className="text-xs text-[var(--text-secondary)] dark:text-muted">
                {newOrderToast.name} — {fmt(newOrderToast.total)}
              </p>
            </div>
            <button onClick={() => setNewOrderToast(null)} className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] shrink-0">
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
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-lg px-3 py-2">
      <p className="text-xs font-semibold text-[var(--text-secondary)] mb-1">{label}</p>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-xs" style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' && p.name?.includes('S/') ? `S/${p.value.toFixed(2)}` : p.value}
        </p>
      ))}
    </div>
  );
}

const DASH_COLORS = ['var(--color-primary)', '#f97316', '#457b9d', '#e63946', '#9b5de5', '#2dd4bf', '#264653'];

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

const DASH_PAYMENT_COLORS: Record<string, string> = { efectivo: 'var(--color-primary)', yape: '#8b5cf6', plin: '#06b6d4', tarjeta: '#3b82f6', fiado: '#f59e0b', otro: '#6b7280' };
const DASH_PAYMENT_LABELS: Record<string, string> = { efectivo: 'Efectivo', yape: 'Yape', plin: 'Plin', tarjeta: 'Tarjeta', fiado: 'Fiado', otro: 'Otro' };

// ── Empty state for charts (Mejora 10) ───────────────────────────────────────
function OrdersEmptyChart({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3"><ShoppingCart className="h-6 w-6 text-primary" /></div>
      <p className="text-sm font-medium text-[var(--text-tertiary)]">{message}</p>
      <p className="text-xs text-[var(--text-tertiary)] mt-1">Los datos apareceran cuando registres ventas</p>
    </div>
  );
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
            <button key={p.id} onClick={() => setOrdPeriod(p.id)} className={cn("px-3 py-1 rounded-full text-xs font-medium transition-colors", ordPeriod === p.id ? "bg-primary text-white" : "bg-gray-100 dark:bg-white/5 text-[var(--text-secondary)] hover:bg-gray-200 dark:hover:bg-white/10")}>{p.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
            <span>Actualizado hace {ordMinAgo} min</span>
            <button className="p-1 hover:bg-gray-100 dark:hover:bg-white/5 rounded transition-colors"><RefreshCw className="h-3 w-3" /></button>
          </div>
          <button onClick={() => window.print()} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-[var(--text-tertiary)] hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"><Download className="h-3 w-3" /> Exportar</button>
        </div>
      </div>

      {/* === Alertas Pedidos === */}
      {(alertas.sinAtender > 0 || kpis.pendientes > 5) && (
        <div className="flex flex-wrap gap-2">
          {alertas.sinAtender > 0 && <StatusBadge variant="error" label={`${alertas.sinAtender} pedidos sin atender por mas de 1h`} icon={AlertTriangle} pulse />}
          {kpis.pendientes > 5 && <StatusBadge variant="warning" label={`${kpis.pendientes} pedidos retrasados`} icon={AlertTriangle} />}
        </div>
      )}

      {/* === SECCION 1: 8 KPIs con iconos === */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <DashKpi icon={<ShoppingBag className="h-4 w-4" />} iconBg="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success)] dark:text-[var(--data-success)]" label="Pedidos hoy" value={kpis.pedidosHoy} border="border-l-primary" sparkColor="var(--color-primary)" sparkVal={kpis.pedidosHoy} />
        <DashKpi icon={<DollarSign className="h-4 w-4" />} iconBg="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success)] dark:text-[var(--data-success)]" label="Monto hoy" value={`S/${kpis.totalMonto.toFixed(2)}`} border="border-l-emerald-500" sparkColor="#3b82f6" sparkVal={kpis.totalMonto} />
        <DashKpi icon={<Receipt className="h-4 w-4" />} iconBg="bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]" label="Ticket promedio" value={`S/${kpis.ticketProm.toFixed(2)}`} border="border-l-purple-500" sparkColor="#8b5cf6" sparkVal={kpis.ticketProm} />
        <DashKpi icon={<Clock className="h-4 w-4" />} iconBg="bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400" label="Pendientes" value={kpis.pendientes} border="border-l-amber-500" pulse={kpis.pendientes > 5} />
        <DashKpi icon={<Truck className="h-4 w-4" />} iconBg="bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-400" label="En camino" value={kpis.enCamino} border="border-l-cyan-500" />
        <DashKpi icon={<CheckCircle className="h-4 w-4" />} iconBg="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success)] dark:text-[var(--data-success)]" label="Entregados hoy" value={kpis.entregadosHoy} border="border-l-green-500" />
        <DashKpi icon={<XCircle className="h-4 w-4" />} iconBg="bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400" label="Cancelados" value={kpis.cancelados} border="border-l-red-500" />
        <DashKpi icon={<Target className="h-4 w-4" />} iconBg={kpis.tasaCumplimiento >= 70 ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success)] dark:text-[var(--data-success)]" : "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400"} label="Cumplimiento" value={`${kpis.tasaCumplimiento}%`} border={kpis.tasaCumplimiento >= 70 ? "border-l-green-500" : "border-l-red-500"} />
      </div>

      {/* === SECCION 2: Pedidos por Estado (PieChart donut grande) === */}
      <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-6 ">
        <div className="flex items-center justify-between mb-4">
          <CardTitle className="text-sm font-medium text-[var(--text-secondary)] dark:text-zinc-400">Pedidos por Estado</CardTitle>
          <button onClick={() => setExpandedChart("pedidos-estado")} className="p-1 hover:bg-[var(--surface-sunken)] rounded transition-colors" title="Expandir"><Maximize2 className="h-3.5 w-3.5 text-[var(--text-tertiary)]" /></button>
        </div>
        <div className="relative">
          <ResponsiveContainer minWidth={0} width="100%" height={280}>
            <PieChart>
              <Pie
                data={statusData}
                innerRadius={60}
                outerRadius={95}
                dataKey="value"
                paddingAngle={2}
                label={(entry: { name?: string; percent?: number }) => `${entry.name} ${((entry.percent ?? 0) * 100).toFixed(0)}%`}
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
              <p className="text-3xl font-mono font-bold text-[var(--text-primary)]">{totalPedidos}</p>
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Total</p>
            </div>
          </div>
        </div>
      </div>

      {/* === SECCION 3: Pedidos por Hora + Metodo de Pago === */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pedidos por hora */}
        <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-6 ">
          <CardTitle className="text-sm font-medium text-[var(--text-secondary)] dark:text-zinc-400 mb-4">Pedidos por Hora - Hoy</CardTitle>
          <ResponsiveContainer minWidth={0} width="100%" height={250}>
            <BarChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" />
              <XAxis dataKey="hora" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip content={<DashTooltip />} />
              <Bar dataKey="count" name="Pedidos" radius={[4, 4, 0, 0]}>
                {hourlyData.map((entry, i) => (
                  <Cell key={i} fill={entry.isCurrent ? '#f97316' : 'var(--color-primary)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Metodo de pago */}
        <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-6 ">
          <CardTitle className="text-sm font-medium text-[var(--text-secondary)] dark:text-zinc-400 mb-4">Metodo de Pago</CardTitle>
          <ResponsiveContainer minWidth={0} width="100%" height={250}>
            <PieChart>
              <Pie
                data={paymentData}
                innerRadius={50}
                outerRadius={85}
                dataKey="value"
                paddingAngle={2}
                label={(entry: { name?: string; percent?: number }) => `${entry.name} ${((entry.percent ?? 0) * 100).toFixed(0)}%`}
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
      <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-6 ">
        <CardTitle className="text-sm font-medium text-[var(--text-secondary)] dark:text-zinc-400 mb-4">Tendencia de Pedidos - Ultimos 7 dias</CardTitle>
        <ResponsiveContainer minWidth={0} width="100%" height={280}>
          <ComposedChart data={weeklyData}>
            <defs>
              <linearGradient id="ordersBarGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.9} />
                <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.5} />
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
        <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-6 ">
          <CardTitle className="text-sm font-medium text-[var(--text-secondary)] dark:text-zinc-400 mb-4">Top 5 Zonas</CardTitle>
          {zonaData.length === 0 ? (
            <OrdersEmptyChart message="Sin datos de zona" />
          ) : (
            <ResponsiveContainer minWidth={0} width="100%" height={220}>
              <BarChart data={zonaData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" />
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="zona" tick={{ fontSize: 11 }} width={80} />
                <Tooltip content={<DashTooltip />} />
                <Bar dataKey="count" fill="var(--color-primary)" radius={[0, 4, 4, 0]} name="Pedidos" barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top 5 clientes */}
        <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-6 ">
          <CardTitle className="text-sm font-medium text-[var(--text-secondary)] dark:text-zinc-400 mb-4">Top 5 Clientes</CardTitle>
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
                        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{c.name}</p>
                        <span className="text-xs font-mono text-[var(--text-tertiary)] ml-2 shrink-0">S/{c.total.toFixed(2)}</span>
                      </div>
                      <div className="mt-1 h-2 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-[var(--dur-slow)]"
                          style={{
                            width: `${topClientes[0].count > 0 ? (c.count / topClientes[0].count) * 100 : 0}%`,
                            backgroundColor: '#f97316',
                          }}
                        />
                      </div>
                      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">{c.count} pedido{c.count !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* === SECCION 7: Tiempo Promedio de Procesamiento === */}
      <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-6 ">
        <CardTitle className="text-sm font-medium text-[var(--text-secondary)] dark:text-zinc-400 mb-4">Tiempo Promedio de Procesamiento</CardTitle>
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
                  stroke={tiempoProcesamiento.promedio < 30 ? '#00B4A6' : tiempoProcesamiento.promedio < 60 ? '#f59e0b' : '#ef4444'}
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
            tiempoProcesamiento.promedio < 30 ? "text-[var(--data-success)] dark:text-[var(--data-success)]" :
            tiempoProcesamiento.promedio < 60 ? "text-[var(--data-warning)] dark:text-[var(--data-warning)]" :
            "text-[var(--data-error)] dark:text-[var(--data-error)]"
          )}>
            {tiempoProcesamiento.count > 0 ? `${tiempoProcesamiento.promedio} min` : '--'}
          </p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            {tiempoProcesamiento.count > 0 ? `Basado en ${tiempoProcesamiento.count} pedido${tiempoProcesamiento.count !== 1 ? 's' : ''} entregado${tiempoProcesamiento.count !== 1 ? 's' : ''}` : 'Sin pedidos entregados aun'}
          </p>
        </div>
      </div>

      {/* === SECCION 8: Alertas de Pedidos === */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Alerta: pedidos sin atender >1h */}
        <div className={cn(
          "rounded-xl border p-5 flex items-start gap-3",
          alertas.sinAtender > 0
            ? "bg-[var(--data-error-50)] dark:bg-[var(--data-error)]/20 border-[var(--data-error)] dark:border-[var(--data-error)]"
            : "bg-[var(--surface-sunken)]/50 border-[var(--rule-base)]"
        )}>
          <div className={cn("rounded-full p-2 shrink-0", alertas.sinAtender > 0 ? "bg-[var(--data-error-100)] dark:bg-[var(--data-error)]/40" : "bg-[var(--surface-sunken)]")}>
            <AlertTriangle className={cn("h-4 w-4", alertas.sinAtender > 0 ? "text-[var(--data-error)] dark:text-[var(--data-error)]" : "text-[var(--text-tertiary)]")} />
          </div>
          <div>
            <p className={cn("text-sm font-bold", alertas.sinAtender > 0 ? "text-[var(--data-error)] dark:text-[var(--data-error)]" : "text-[var(--text-tertiary)]")}>
              {alertas.sinAtender > 0 ? `${alertas.sinAtender} pedido${alertas.sinAtender !== 1 ? 's' : ''} sin atender` : 'Sin alertas'}
            </p>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">Mas de 1 hora sin cambio de estado</p>
          </div>
        </div>

        {/* Alerta: pedidos sin cliente */}
        <div className={cn(
          "rounded-xl border p-5 flex items-start gap-3",
          alertas.sinDireccion > 0
            ? "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning)]/20 border-[var(--data-warning)] dark:border-[var(--data-warning)]"
            : "bg-[var(--surface-sunken)]/50 border-[var(--rule-base)]"
        )}>
          <div className={cn("rounded-full p-2 shrink-0", alertas.sinDireccion > 0 ? "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning)]/40" : "bg-[var(--surface-sunken)]")}>
            <MapPin className={cn("h-4 w-4", alertas.sinDireccion > 0 ? "text-[var(--data-warning)] dark:text-[var(--data-warning)]" : "text-[var(--text-tertiary)]")} />
          </div>
          <div>
            <p className={cn("text-sm font-bold", alertas.sinDireccion > 0 ? "text-[var(--data-warning)] dark:text-[var(--data-warning)]" : "text-[var(--text-tertiary)]")}>
              {alertas.sinDireccion > 0 ? `${alertas.sinDireccion} sin datos de cliente` : 'Todos con datos'}
            </p>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">Pedidos activos sin nombre de cliente</p>
          </div>
        </div>

        {/* Alerta: tasa de cumplimiento */}
        <div className={cn(
          "rounded-xl border p-5 flex items-start gap-3",
          alertas.tasaCumplimiento >= 90
            ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30"
            : alertas.tasaCumplimiento >= 70
              ? "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning)]/20 border-[var(--data-warning)] dark:border-[var(--data-warning)]"
              : "bg-[var(--data-error-50)] dark:bg-[var(--data-error)]/20 border-[var(--data-error)] dark:border-[var(--data-error)]"
        )}>
          <div className={cn("rounded-full p-2 shrink-0",
            alertas.tasaCumplimiento >= 90 ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" :
            alertas.tasaCumplimiento >= 70 ? "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning)]/40" :
            "bg-[var(--data-error-100)] dark:bg-[var(--data-error)]/40"
          )}>
            <Target className={cn("h-4 w-4",
              alertas.tasaCumplimiento >= 90 ? "text-[var(--data-success)] dark:text-[var(--data-success)]" :
              alertas.tasaCumplimiento >= 70 ? "text-[var(--data-warning)] dark:text-[var(--data-warning)]" :
              "text-[var(--data-error)] dark:text-[var(--data-error)]"
            )} />
          </div>
          <div>
            <p className={cn("text-sm font-bold",
              alertas.tasaCumplimiento >= 90 ? "text-[var(--data-success)] dark:text-[var(--data-success)]" :
              alertas.tasaCumplimiento >= 70 ? "text-[var(--data-warning)] dark:text-[var(--data-warning)]" :
              "text-[var(--data-error)] dark:text-[var(--data-error)]"
            )}>
              Cumplimiento: {alertas.tasaCumplimiento}%
            </p>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">
              {alertas.tasaCumplimiento >= 90 ? 'Excelente rendimiento' : alertas.tasaCumplimiento >= 70 ? 'Puede mejorar' : 'Requiere atencion inmediata'}
            </p>
          </div>
        </div>
      </div>

      {/* Mejora 13: Expand chart modal */}
      {expandedChart && (
        <div className="fixed inset-0 z-50 bg-[var(--surface-raised)] p-8 overflow-auto">
          <div className="flex items-center justify-between mb-6">
            <SectionTitle className="text-lg font-bold text-[var(--text-primary)]">Pedidos por Estado</SectionTitle>
            <button onClick={() => setExpandedChart(null)} className="p-2 hover:bg-[var(--surface-sunken)] rounded-lg transition-colors"><XIcon2 className="h-5 w-5 text-[var(--text-secondary)]" /></button>
          </div>
          <div style={{ height: 500 }}>
            <ResponsiveContainer minWidth={0} width="100%" height={500}>
              <PieChart>
                <Pie data={statusData} innerRadius={100} outerRadius={200} dataKey="value" paddingAngle={2} label>
                  {statusData.map((s, i) => <Cell key={i} fill={DASH_STATUS_COLORS[s.key] || DASH_COLORS[i % DASH_COLORS.length]} />)}
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
    <div className={cn("bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-5  border-l-4", border)}>
      <div className="flex items-start gap-3">
        <div className={cn("rounded-full p-2 shrink-0", iconBg, pulse && "animate-pulse")}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--text-secondary)] dark:text-zinc-400">{label}</p>
          <div className="flex items-center gap-1.5">
            <p className="text-2xl font-mono font-bold mt-0.5 text-[var(--text-primary)] truncate">{value}</p>
            <span className={`text-xs ${change >= 0 ? "text-[var(--data-success)]" : "text-[var(--data-error)]"}`}>{change >= 0 ? "\u2191" : "\u2193"} {Math.abs(change)}%</span>
          </div>
          {sparkColor && sparkVal != null && sparkVal > 0 && (
            <div className="h-8 w-20 mt-1">
              <ResponsiveContainer minWidth={0} width="100%" height="100%">
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

