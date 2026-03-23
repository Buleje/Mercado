"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ShoppingBag, RefreshCw, Clock, CheckCircle, XCircle, Truck,
  Search, ChevronDown, ChevronUp, Download,
  ArrowRight, Package,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface OrderItem {
  name: string;
  qty: number;
  price?: number;
}

interface Order {
  id: string;
  customerName?: string;
  customerPhone?: string;
  total: number;
  status: string;
  createdAt: string;
  items?: OrderItem[];
  paymentMethod?: string;
  notes?: string;
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

  // ── Data loading ─────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/orders?limit=200");
      if (!res.ok) throw new Error("No se pudo cargar los pedidos");
      const data = await res.json();
      const arr: Order[] = Array.isArray(data) ? data : (data.orders ?? []);

      // Detect new orders for notification badge
      if (prevCountRef.current > 0 && arr.length > prevCountRef.current) {
        setNewCount(prev => prev + (arr.length - prevCountRef.current));
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

  // ── Actions ──────────────────────────────────────────────────────────────

  const changeStatus = async (orderId: string, newStatus: string) => {
    setUpdatingId(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) await load();
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

    return result;
  }, [orders, filter, search, dateFilter]);

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

      {/* ── Search + actions ──────────────────────────────────────────── */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar cliente o ID..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 dark:text-foreground"
          />
        </div>
        <button onClick={load} className="p-2 rounded-xl bg-gray-100 dark:bg-surface hover:bg-gray-200 dark:hover:bg-accent transition-colors" title="Actualizar">
          <RefreshCw className="h-4 w-4 text-gray-500" />
        </button>
        <button onClick={exportCSV} className="p-2 rounded-xl bg-gray-100 dark:bg-surface hover:bg-gray-200 dark:hover:bg-accent transition-colors" title="Exportar CSV">
          <Download className="h-4 w-4 text-gray-500" />
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

      {/* ── Results count ─────────────────────────────────────────────── */}
      <p className="text-xs text-gray-500 dark:text-muted">
        {filtered.length} pedido{filtered.length !== 1 ? "s" : ""}
        {search && ` para "${search}"`}
      </p>

      {/* ── Orders list ───────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
          <ShoppingBag className="h-10 w-10 text-gray-300 dark:text-muted" />
          <p className="text-sm font-semibold text-gray-500 dark:text-muted">
            {search ? "Sin resultados para esa búsqueda" : "No hay pedidos con estos filtros"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {paginated.map(order => {
            const cfg = STATUS_CONFIG[order.status] ?? { label: order.status, color: "bg-gray-100 text-gray-600", icon: null };
            const isExpanded = expandedId === order.id;
            const isTerminal = TERMINAL.has(order.status);
            const nextStatus = cfg.next;

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
                    <span className="text-sm font-extrabold text-primary">{fmt(order.total)}</span>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                  </div>
                </button>

                {/* Expanded detail panel */}
                {isExpanded && (
                  <div className="px-3.5 pb-3.5 border-t border-gray-100 dark:border-card-border pt-3 space-y-3">
                    {/* Meta info */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-400 dark:text-muted">ID:</span>{" "}
                        <span className="font-mono font-bold text-gray-700 dark:text-foreground">{order.id.slice(0, 8)}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 dark:text-muted">Pago:</span>{" "}
                        <span className="font-bold text-gray-700 dark:text-foreground capitalize">{order.paymentMethod ?? "efectivo"}</span>
                      </div>
                      {order.customerPhone && (
                        <div className="col-span-2">
                          <span className="text-gray-400 dark:text-muted">Tel:</span>{" "}
                          <span className="font-bold text-gray-700 dark:text-foreground">{order.customerPhone}</span>
                        </div>
                      )}
                    </div>

                    {/* Items list */}
                    {order.items && order.items.length > 0 && (
                      <div className="bg-gray-50 dark:bg-surface rounded-lg p-2.5 space-y-1.5">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Productos</p>
                        {order.items.map((item, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="text-gray-700 dark:text-foreground">{item.qty}x {item.name}</span>
                            {item.price != null && (
                              <span className="font-bold text-gray-600 dark:text-muted">{fmt(item.price * item.qty)}</span>
                            )}
                          </div>
                        ))}
                        <div className="flex justify-between text-xs pt-1.5 border-t border-gray-200 dark:border-card-border">
                          <span className="font-bold text-gray-900 dark:text-foreground">Total</span>
                          <span className="font-extrabold text-primary">{fmt(order.total)}</span>
                        </div>
                      </div>
                    )}

                    {order.notes && (
                      <p className="text-xs text-gray-500 dark:text-muted italic">Nota: {order.notes}</p>
                    )}

                    {/* Status change actions */}
                    {!isTerminal && nextStatus && (
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => changeStatus(order.id, nextStatus)}
                          disabled={updatingId === order.id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                        >
                          {updatingId === order.id ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : (
                            <ArrowRight className="h-3 w-3" />
                          )}
                          Pasar a {STATUS_CONFIG[nextStatus]?.label ?? nextStatus}
                        </button>
                        <button
                          onClick={() => changeStatus(order.id, "cancelado")}
                          disabled={updatingId === order.id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 text-red-600 text-xs font-bold hover:bg-red-100 disabled:opacity-50 transition-colors"
                        >
                          <XCircle className="h-3 w-3" /> Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Load more button */}
          {hasMore && (
            <button
              onClick={() => setPage(p => p + 1)}
              className="w-full py-3 rounded-xl border border-gray-200 dark:border-card-border text-sm font-bold text-gray-500 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors"
            >
              Cargar más ({filtered.length - paginated.length} restantes)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
