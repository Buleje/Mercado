"use client";

import { SectionTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { m, AnimatePresence } from "@/components/admin/providers";
import {
  Eye, Package, MapPin, Clock, CheckCircle, Truck, Phone,
  Search, Filter, Download, RefreshCw, User, AlertCircle,
  ChevronDown, ChevronUp, TimerReset,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";
import { tenantFetch } from "@/lib/tenant-fetch";
import OrderTrackingTimeline from "./logistics/OrderTrackingTimeline";

// ─── Types ───────────────────────────────────────────────────────────────────

type OrderStatus = "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado";

interface OrderItem {
  id: number;
  name: string;
  quantity: number;
  price: number;
}

interface Order {
  id: string;
  customerName: string;
  customerPhone?: string;
  customerLocation?: string;
  customerReference?: string;
  total: number;
  status: OrderStatus;
  notes?: string;
  paymentMethod?: string;
  riderName?: string;
  cancelReason?: string;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  pendiente:  { label: "Pendiente",   color: "text-[var(--text-secondary)]",    bg: "bg-[var(--surface-sunken)]" },
  confirmado: { label: "Confirmado",  color: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",  bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30" },
  en_camino:  { label: "En camino",   color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",    bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
  entregado:  { label: "Entregado",   color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
  cancelado:  { label: "Cancelado",   color: "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",      bg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30" },
};

// Transiciones válidas (mismo mapa que en la API)
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pendiente:  ["confirmado", "cancelado"],
  confirmado: ["en_camino", "cancelado"],
  en_camino:  ["entregado", "cancelado"],
  entregado:  [],
  cancelado:  [],
};

// Solo los estados relevantes para delivery
const DELIVERY_STATUSES: OrderStatus[] = ["confirmado", "en_camino", "entregado", "cancelado"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}
function fmtMoney(n: number) {
  return `S/ ${n.toFixed(2)}`;
}
function minutesSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

const PROGRESS_STAGES: { key: OrderStatus; label: string }[] = [
  { key: "confirmado", label: "Confirmado" },
  { key: "en_camino",  label: "En camino" },
  { key: "entregado",  label: "Entregado" },
];

function ProgressBar({ status }: { status: OrderStatus }) {
  if (status === "cancelado") {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-red-950/20 rounded-xl px-3 py-2">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" /> Pedido cancelado
      </div>
    );
  }
  const currentIdx = PROGRESS_STAGES.findIndex(s => s.key === status);
  return (
    <div className="mt-4 flex items-center gap-0">
      {PROGRESS_STAGES.map((stage, i) => {
        const done    = i <= currentIdx;
        const current = i === currentIdx;
        return (
          <div key={stage.key} className="flex-1 flex flex-col items-center relative">
            {i > 0 && (
              <div className={cn(
                "absolute top-3 right-1/2 w-full h-0.5 transition-colors duration-[var(--dur-slow)]",
                done ? "bg-primary" : "bg-gray-200 dark:bg-gray-700"
              )} />
            )}
            <m.div
              className={cn(
                "relative z-10 h-6 w-6 rounded-full flex items-center justify-center",
                done ? "bg-primary text-white" : "bg-gray-200 dark:bg-gray-700 text-[var(--text-tertiary)]",
              )}
              animate={current ? { scale: [1, 1.15, 1] } : {}}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              {i === 0 && <Package className="h-3 w-3" />}
              {i === 1 && <Truck className="h-3 w-3" />}
              {i === 2 && <CheckCircle className="h-3 w-3" />}
            </m.div>
            <span className={cn(
              "text-[length:var(--ts-2xs)] mt-1 font-semibold",
              done ? "text-primary" : "text-[var(--text-tertiary)]"
            )}>{stage.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Order Card ───────────────────────────────────────────────────────────────

function OrderCard({
  order,
  onUpdateStatus,
  updating,
}: {
  order: Order;
  onUpdateStatus: (id: string, status: OrderStatus) => Promise<void>;
  updating: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg      = STATUS_CONFIG[order.status];
  const nextSteps = VALID_TRANSITIONS[order.status];
  const mins     = minutesSince(order.createdAt);
  const itemCount = order.items?.reduce((a, i) => a + i.quantity, 0) ?? 0;

  return (
    <m.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
      className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border overflow-hidden"
    >
      {/* Header */}
      <div className="p-3 sm:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          {/* Info izquierda */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h4 className="font-bold text-sm text-[var(--text-primary)] dark:text-foreground">
                #{order.id.slice(-6).toUpperCase()}
              </h4>
              <m.span
                key={order.status}
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={cn("text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full", cfg.bg, cfg.color)}
              >
                {cfg.label}
              </m.span>
              <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] flex items-center gap-0.5">
                <TimerReset className="h-3 w-3" /> {mins}min
              </span>
            </div>

            <p className="text-xs text-[var(--text-primary)] dark:text-foreground font-medium flex items-center gap-1 truncate">
              <User className="h-3 w-3 text-[var(--text-tertiary)] shrink-0" />
              {order.customerName}
            </p>

            {order.customerLocation && (
              <p className="text-xs text-[var(--text-tertiary)] flex items-center gap-1 mt-0.5 truncate">
                <MapPin className="h-3 w-3 shrink-0" /> {order.customerLocation}
              </p>
            )}

            <p className="text-xs text-[var(--text-secondary)] dark:text-muted mt-1">
              {itemCount} producto{itemCount !== 1 ? "s" : ""} · {fmtMoney(order.total)}
              {order.paymentMethod && (
                <span className="ml-2 text-[length:var(--ts-2xs)] bg-gray-100 dark:bg-surface px-1.5 py-0.5 rounded font-semibold uppercase">
                  {order.paymentMethod}
                </span>
              )}
            </p>
          </div>

          {/* Info derecha */}
          <div className="text-right text-xs shrink-0">
            {order.riderName && (
              <p className="text-[var(--text-secondary)] dark:text-muted flex items-center gap-1 justify-end">
                <Truck className="h-3 w-3" /> {order.riderName}
              </p>
            )}
            {order.customerPhone && (
              <p className="text-[var(--text-tertiary)] flex items-center gap-1 justify-end mt-1">
                <Phone className="h-3 w-3" /> {order.customerPhone}
              </p>
            )}
            <p className="text-[var(--text-tertiary)] flex items-center gap-1 justify-end mt-1">
              <Clock className="h-3 w-3" /> {fmtDate(order.createdAt)} {fmtTime(order.createdAt)}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <ProgressBar status={order.status} />

        {/* Botones de estado */}
        {nextSteps.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {nextSteps.map(next => (
              <button
                key={next}
                disabled={updating}
                onClick={() => onUpdateStatus(order.id, next)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                  next === "cancelado"
                    ? "bg-[var(--data-error-50)] dark:bg-red-950/20 text-[var(--data-error-500)] dark:text-[var(--data-error-500)] hover:bg-[var(--data-error-100)] border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]"
                    : "bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20",
                  updating && "opacity-50 cursor-not-allowed"
                )}
              >
                {updating ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : next === "en_camino" ? (
                  <Truck className="h-3 w-3" />
                ) : next === "entregado" ? (
                  <CheckCircle className="h-3 w-3" />
                ) : next === "confirmado" ? (
                  <Package className="h-3 w-3" />
                ) : (
                  <AlertCircle className="h-3 w-3" />
                )}
                {STATUS_CONFIG[next].label}
              </button>
            ))}
          </div>
        )}

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-2 flex items-center gap-1 text-[length:var(--ts-xs)] text-[var(--text-tertiary)] hover:text-primary transition-colors"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? "Ocultar" : "Ver historial"}
        </button>
      </div>

      {/* Timeline expandible */}
      <AnimatePresence>
        {expanded && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-t border-[var(--rule-soft)] dark:border-card-border"
          >
            <div className="p-3 sm:p-5">
              <OrderTrackingTimeline orderId={order.id} currentStatus={order.status} />
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ShipmentTrackingTab() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("active");
  const [filterRider, setFilterRider]   = useState<string>("all");
  const [search, setSearch]             = useState("");
  const [updatingId, setUpdatingId]     = useState<string | null>(null);
  const [lastRefresh, setLastRefresh]   = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh]   = useState(true);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/orders?limit=200", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // La API devuelve { orders: [...] } o un array directo
      const list: Order[] = Array.isArray(data) ? data : (data.orders ?? []);
      // Solo mostrar pedidos relevantes para delivery
      setOrders(list.filter(o => DELIVERY_STATUSES.includes(o.status)));
      setError(null);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar pedidos");
    } finally {
      setLoading(false);
    }
  }, []);

  // Carga inicial
  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Auto-refresh cada 30 segundos
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchOrders, 30_000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchOrders]);

  // ── Update status ──────────────────────────────────────────────────────────

  const handleUpdateStatus = useCallback(async (id: string, status: OrderStatus) => {
    setUpdatingId(id);
    try {
      const res = await tenantFetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      // Optimistic update con animación
      setOrders(prev =>
        prev.map(o => o.id === id ? { ...o, status, updatedAt: new Date().toISOString() } : o)
      );
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setUpdatingId(null);
    }
  }, []);

  // ── KPIs ───────────────────────────────────────────────────────────────────

  const today = new Date().toDateString();
  const kpis = useMemo(() => ({
    enCurso:     orders.filter(o => o.status === "en_camino").length,
    confirmados: orders.filter(o => o.status === "confirmado").length,
    entregadosHoy: orders.filter(o =>
      o.status === "entregado" && new Date(o.updatedAt).toDateString() === today
    ).length,
    cancelados: orders.filter(o => o.status === "cancelado").length,
    tiempoPromedio: (() => {
      const delivered = orders.filter(o =>
        o.status === "entregado" && new Date(o.updatedAt).toDateString() === today
      );
      if (!delivered.length) return null;
      const avg = delivered.reduce(
        (acc, o) => acc + (new Date(o.updatedAt).getTime() - new Date(o.createdAt).getTime()),
        0
      ) / delivered.length;
      return Math.round(avg / 60000);
    })(),
  }), [orders, today]);

  // ── Riders ─────────────────────────────────────────────────────────────────

  const riders = useMemo(() => {
    const set = new Set(orders.map(o => o.riderName).filter(Boolean) as string[]);
    return Array.from(set);
  }, [orders]);

  // ── Filtered list ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = [...orders];
    if (filterStatus === "active") {
      list = list.filter(o => o.status === "confirmado" || o.status === "en_camino");
    } else if (filterStatus !== "all") {
      list = list.filter(o => o.status === filterStatus);
    }
    if (filterRider !== "all") {
      list = list.filter(o => o.riderName === filterRider);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        o.id.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        (o.customerLocation ?? "").toLowerCase().includes(q) ||
        (o.riderName ?? "").toLowerCase().includes(q)
      );
    }
    // Más recientes primero
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, filterStatus, filterRider, search]);

  // ── CSV export ─────────────────────────────────────────────────────────────

  const handleExport = () => {
    exportToCSV(
      filtered.map(o => ({
        pedido: o.id.slice(-6).toUpperCase(),
        cliente: o.customerName,
        teléfono: o.customerPhone ?? "",
        direccion: o.customerLocation ?? "",
        repartidor: o.riderName ?? "",
        estado: STATUS_CONFIG[o.status].label,
        total: o.total,
        creado: o.createdAt,
      })),
      "seguimiento-envios"
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 sm:space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
            <Eye className="h-6 w-6 text-primary" /> Seguimiento de Envíos
          </SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">
            Control en tiempo real · Actualizado {fmtTime(lastRefresh.toISOString())}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border",
              autoRefresh
                ? "bg-primary/10 text-primary border-primary/20"
                : "bg-gray-100 dark:bg-surface text-[var(--text-secondary)] border-[var(--rule-base)] dark:border-card-border"
            )}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", autoRefresh && "animate-spin")} style={autoRefresh ? { animationDuration: "3s" } : {}} />
            Auto
          </button>
          <button
            onClick={fetchOrders}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--text-secondary)] dark:text-muted hover:bg-gray-100 dark:hover:bg-surface border border-[var(--rule-base)] dark:border-card-border"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Actualizar
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-primary hover:bg-primary/10"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: "En camino",      value: kpis.enCurso,          color: "text-[var(--data-success-500)]",    icon: Truck },
          { label: "Por preparar",   value: kpis.confirmados,       color: "text-[var(--data-warning-500)]",   icon: Package },
          { label: "Entregados hoy", value: kpis.entregadosHoy,    color: "text-[var(--data-success-500)]", icon: CheckCircle },
          { label: "Cancelados",     value: kpis.cancelados,        color: "text-[var(--data-error-500)]",     icon: AlertCircle },
          {
            label: "Tiempo prom.",
            value: kpis.tiempoPromedio !== null ? `${kpis.tiempoPromedio}min` : "—",
            color: "text-primary",
            icon: Clock,
          },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-3 text-center">
            <k.icon className={cn("h-4 w-4 mx-auto mb-1", k.color)} />
            <p className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-secondary)] dark:text-muted">{k.label}</p>
            <p className={cn("text-xl font-extrabold", k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Búsqueda */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm"
            placeholder="Buscar pedido, cliente, dirección…"
          />
        </div>

        {/* Filtro por estado */}
        <div className="flex items-center gap-1 flex-wrap">
          <Filter className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
          {[
            { key: "active",    label: "Activos" },
            { key: "all",       label: "Todos" },
            { key: "confirmado",label: "Confirmado" },
            { key: "en_camino", label: "En camino" },
            { key: "entregado", label: "Entregado" },
            { key: "cancelado", label: "Cancelado" },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilterStatus(f.key)}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-bold transition-colors",
                filterStatus === f.key
                  ? "bg-primary text-white"
                  : "bg-gray-100 dark:bg-surface text-[var(--text-secondary)] dark:text-muted"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Filtro por repartidor */}
        {riders.length > 0 && (
          <select
            value={filterRider}
            onChange={e => setFilterRider(e.target.value)}
            className="px-3 py-2 rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-xs font-semibold text-[var(--text-primary)] dark:text-foreground"
          >
            <option value="all">Todos los repartidores</option>
            {riders.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        )}
      </div>

      {/* Estado de carga / error */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-[var(--text-tertiary)]">
          <RefreshCw className="h-6 w-6 animate-spin mr-2" /> Cargando pedidos…
        </div>
      )}

      {error && !loading && (
        <div className="flex items-center gap-2 text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-red-950/20 rounded-xl px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          <button onClick={fetchOrders} className="ml-auto font-bold underline text-xs">Reintentar</button>
        </div>
      )}

      {/* Lista de pedidos */}
      {!loading && !error && (
        <>
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-[var(--text-tertiary)]">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No hay pedidos con ese filtro</p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              <div className="space-y-3">
                {filtered.map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onUpdateStatus={handleUpdateStatus}
                    updating={updatingId === order.id}
                  />
                ))}
              </div>
            </AnimatePresence>
          )}

          <p className="text-center text-[length:var(--ts-xs)] text-[var(--text-tertiary)] pt-1">
            {filtered.length} pedido{filtered.length !== 1 ? "s" : ""} mostrado{filtered.length !== 1 ? "s" : ""}
          </p>
        </>
      )}
    </div>
  );
}
