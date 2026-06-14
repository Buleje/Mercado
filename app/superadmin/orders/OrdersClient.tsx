"use client";

/**
 * OrdersClient — Vista cross-tenant de pedidos del marketplace.
 *
 * Mejoras 2026-05-24:
 *  - Auto-refresh 30s OPT-IN (antes era constante — drenaba recursos)
 *  - Toast inline (sustituye error block)
 *  - CSV export
 *  - Sort selector (recientes / antiguas / monto)
 *  - SLA badge en pendientes (verde<30min, ámbar<2h, rojo>2h)
 *  - Copy clipboard en phone + order id
 *  - Keyboard: / busca · R recarga · Esc cierra drawer/limpia
 *  - Drawer: Esc cierra, tap target close h-11
 *  - Tonos rose-700/dark:rose-300 correctos (sustituye var(--data-error-700))
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ShoppingBag,
  Search,
  RefreshCw,
  Phone,
  MapPin,
  Clock,
  Package,
  Store,
  CheckCircle2,
  Truck,
  XCircle,
  ChevronRight,
  X,
  CreditCard,
  Sparkles,
  Download,
  Copy,
  AlertTriangle,
  List,
  LayoutGrid,
  MessageCircle,
  ExternalLink,
  BarChart3,
  CheckSquare,
  Square,
  Users,
  TrendingUp,
} from "@buleje/design-system/icons";
import { AdminTabShell } from "../_components/_shared";
import { PaymentProofViewer } from "@/components/admin/PaymentProofViewer";
import { buildWaLink } from "@/lib/wa-number";
import { cn } from "@/lib/utils";

type OrderStatus = "pendiente" | "confirmado" | "preparando" | "en_camino" | "entregado" | "cancelado";

interface OrderItem {
  id: number;
  name: string;
  quantity: number;
  unit: string;
  price: number;
  image: string;
}

interface OrderRow {
  id: string;
  tenant: { name: string; slug: string; logoUrl: string | null };
  customer: {
    name: string;
    phone: string | null;
    location: string;
    reference: string;
  };
  total: number;
  status: OrderStatus;
  paymentMethod: string | null;
  source: string;
  notes: string | null;
  riderName: string | null;
  deliveryStatus: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}

type ToastTone = "success" | "error" | "info";
type Toast = { id: number; text: string; tone: ToastTone };
type SortKey = "recent" | "oldest" | "total_desc" | "total_asc";
type ViewMode = "compact" | "comfort";

const STATUS_META: Record<OrderStatus, { label: string; tone: string; icon: typeof CheckCircle2 }> = {
  pendiente: { label: "Pendiente", tone: "var(--data-warning-500)", icon: Clock },
  confirmado: { label: "Confirmado", tone: "var(--data-info-500)", icon: CheckCircle2 },
  preparando: { label: "Preparando", tone: "var(--accent)", icon: Sparkles },
  en_camino: { label: "En camino", tone: "var(--accent)", icon: Truck },
  entregado: { label: "Entregado", tone: "var(--data-success-500)", icon: CheckCircle2 },
  cancelado: { label: "Cancelado", tone: "var(--data-error-500)", icon: XCircle },
};

const STATUS_FILTERS: Array<{ key: OrderStatus | "all"; label: string }> = [
  { key: "all", label: "Todos" },
  { key: "pendiente", label: "Pendientes" },
  { key: "confirmado", label: "Confirmados" },
  { key: "preparando", label: "Preparando" },
  { key: "en_camino", label: "En camino" },
  { key: "entregado", label: "Entregados" },
  { key: "cancelado", label: "Cancelados" },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

function slaInfoForOrder(iso: string): {
  label: string;
  tone: "good" | "warn" | "bad";
  minutes: number;
} {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  let label: string;
  if (minutes < 1) label = "ahora";
  else if (minutes < 60) label = `${minutes}m`;
  else if (minutes < 24 * 60) label = `${Math.floor(minutes / 60)}h`;
  else label = `${Math.floor(minutes / (24 * 60))}d`;
  const tone: "good" | "warn" | "bad" =
    minutes >= 120 ? "bad" : minutes >= 30 ? "warn" : "good";
  return { label, tone, minutes };
}

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportOrdersCSV(rows: OrderRow[]) {
  const headers = [
    "ID",
    "Tenant",
    "Cliente",
    "Telefono",
    "Direccion",
    "Total",
    "Status",
    "Pago",
    "Source",
    "Repartidor",
    "Items",
    "Creado",
  ];
  const data = rows.map((o) => [
    o.id,
    o.tenant.name,
    o.customer.name,
    o.customer.phone ?? "",
    o.customer.location,
    o.total,
    o.status,
    o.paymentMethod ?? "",
    o.source,
    o.riderName ?? "",
    o.items.length,
    o.createdAt,
  ]);
  const csv =
    "﻿" +
    [headers, ...data].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `superadmin_orders_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Link wa.me al cliente, normalizando móviles PE (9 díg → +51). */
function customerWaLink(phone: string | null | undefined, message?: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  const e164 = digits.length === 9 && digits.startsWith("9") ? `51${digits}` : digits;
  return buildWaLink(e164, message);
}

const SLA_CLS: Record<"good" | "warn" | "bad", string> = {
  good: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  warn: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  bad: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[90] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            "pointer-events-auto rounded-xl px-4 py-2.5 text-sm font-bold shadow-lg backdrop-blur",
            t.tone === "success" && "bg-emerald-600 text-white",
            t.tone === "error" && "bg-rose-600 text-white",
            t.tone === "info" && "bg-slate-800 text-white",
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function OrdersClient() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [tenantFilter, setTenantFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [selected, setSelected] = useState<OrderRow | null>(null);
  // Densidad: compacto (default — ver más en menos espacio) vs cómodo (cards).
  const [viewMode, setViewMode] = useState<ViewMode>("compact");
  const [slaBrokenOnly, setSlaBrokenOnly] = useState(false); // filtro rápido SLA roto
  const [showAnalytics, setShowAnalytics] = useState(false); // panel de analítica
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set()); // selección masiva

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("sa-orders-view") : null;
    if (saved === "compact" || saved === "comfort") setViewMode(saved);
  }, []);
  const changeViewMode = useCallback((m: ViewMode) => {
    setViewMode(m);
    try { window.localStorage.setItem("sa-orders-view", m); } catch { /* SSR/quota */ }
  }, []);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(1);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const pushToast = useCallback((text: string, tone: ToastTone = "info") => {
    const id = toastIdRef.current++;
    setToasts((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  // Filters ref para que el polling no capture closures stale
  const filtersRef = useRef({ statusFilter, tenantFilter, search });
  filtersRef.current = { statusFilter, tenantFilter, search };

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setRefreshing(true);
      try {
        const { statusFilter: s, tenantFilter: t, search: q } = filtersRef.current;
        const sp = new URLSearchParams();
        if (s !== "all") sp.set("status", s);
        if (t !== "all") sp.set("tenant", t);
        if (q.trim()) sp.set("q", q.trim());
        sp.set("limit", "100");
        const r = await fetch(`/api/superadmin/orders?${sp.toString()}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as { orders: OrderRow[] };
        setOrders(json.orders);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        pushToast(`No se pudieron cargar los pedidos: ${msg}`, "error");
      } finally {
        if (!silent) setLoading(false);
        setRefreshing(false);
      }
    },
    [pushToast],
  );

  useEffect(() => {
    void load();
  }, [statusFilter, tenantFilter, load]);

  // Search debounced
  useEffect(() => {
    const t = setTimeout(() => void load(), 350);
    return () => clearTimeout(t);
  }, [search, load]);

  // Auto-refresh OPT-IN cada 30s
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => void load(true), 30_000);
    return () => clearInterval(t);
  }, [autoRefresh, load]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const inField = tag === "input" || tag === "textarea" || tag === "select";
      if (e.key === "Escape") {
        if (selected) {
          setSelected(null);
          return;
        }
        if (!inField && (search || statusFilter !== "all" || tenantFilter !== "all")) {
          setSearch("");
          setStatusFilter("all");
          setTenantFilter("all");
        }
        return;
      }
      if (inField) return;
      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        void load();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected, search, statusFilter, tenantFilter, load]);

  const copy = useCallback(
    async (text: string, label: string) => {
      try {
        await navigator.clipboard.writeText(text);
        pushToast(`${label} copiado`, "success");
      } catch {
        pushToast("No se pudo copiar", "error");
      }
    },
    [pushToast],
  );

  const tenantOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of orders) {
      if (o.tenant?.slug) map.set(o.tenant.slug, o.tenant.name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [orders]);

  const filtered = useMemo(() => {
    let result = orders;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (o) =>
          o.id.toLowerCase().includes(q) ||
          o.customer.name.toLowerCase().includes(q) ||
          (o.customer.phone ?? "").includes(q) ||
          o.tenant.name.toLowerCase().includes(q),
      );
    }
    // Sort
    const sorted = [...result];
    switch (sort) {
      case "recent":
        sorted.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        break;
      case "oldest":
        sorted.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        break;
      case "total_desc":
        sorted.sort((a, b) => b.total - a.total);
        break;
      case "total_asc":
        sorted.sort((a, b) => a.total - b.total);
        break;
    }
    return sorted;
  }, [orders, search, sort]);

  const kpis = useMemo(() => {
    const grouped: Record<OrderStatus, number> = {
      pendiente: 0,
      confirmado: 0,
      preparando: 0,
      en_camino: 0,
      entregado: 0,
      cancelado: 0,
    };
    let totalRev = 0;
    for (const o of orders) {
      grouped[o.status] = (grouped[o.status] ?? 0) + 1;
      if (o.status === "entregado") totalRev += o.total;
    }
    return { grouped, totalRev };
  }, [orders]);

  // SLA roto: pendientes >2h sin atender (tone "bad").
  const slaBrokenIds = useMemo(() => {
    const s = new Set<string>();
    for (const o of orders) {
      if (o.status === "pendiente" && slaInfoForOrder(o.createdAt).tone === "bad") s.add(o.id);
    }
    return s;
  }, [orders]);

  // Aplica el filtro rápido "SLA roto" sobre la lista ya filtrada/ordenada.
  const visible = useMemo(
    () => (slaBrokenOnly ? filtered.filter((o) => slaBrokenIds.has(o.id)) : filtered),
    [filtered, slaBrokenOnly, slaBrokenIds],
  );

  // Analítica (sobre la muestra cargada): ticket promedio, cancelación, por día, top tiendas.
  const analytics = useMemo(() => {
    const n = orders.length;
    const sumAll = orders.reduce((s, o) => s + o.total, 0);
    const avgTicket = n ? sumAll / n : 0;
    const cancelled = orders.filter((o) => o.status === "cancelado").length;
    const cancelRate = n ? Math.round((cancelled / n) * 100) : 0;
    // Pedidos por día (últimos 7).
    const byDay: { label: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("es-PE", { weekday: "short" });
      const count = orders.filter((o) => o.createdAt?.slice(0, 10) === key).length;
      byDay.push({ label, count });
    }
    // Top tiendas por GMV.
    const byTenant = new Map<string, { name: string; gmv: number; count: number }>();
    for (const o of orders) {
      const cur = byTenant.get(o.tenant.slug) ?? { name: o.tenant.name, gmv: 0, count: 0 };
      cur.gmv += o.total; cur.count += 1;
      byTenant.set(o.tenant.slug, cur);
    }
    const topTenants = [...byTenant.values()].sort((a, b) => b.gmv - a.gmv).slice(0, 5);
    return { avgTicket, cancelRate, byDay, topTenants, n };
  }, [orders]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  const copySelectedPhones = useCallback(() => {
    const phones = [...new Set(orders.filter((o) => selectedIds.has(o.id) && o.customer.phone).map((o) => o.customer.phone!))];
    if (!phones.length) { pushToast("Ningún seleccionado tiene teléfono", "info"); return; }
    void copy(phones.join(", "), `${phones.length} teléfono(s)`);
  }, [orders, selectedIds, copy, pushToast]);

  return (
    <AdminTabShell
      title="Pedidos del marketplace"
      kicker="Plataforma · Operaciones"
      description="Vista cross-tenant de todos los pedidos. Filtros por tienda, estado o búsqueda."
      icon={ShoppingBag}
      stats={
        <>
          <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 py-2 min-w-[88px]">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
              Pendientes
            </p>
            <p className="font-display text-xl font-extrabold tabular-nums tracking-tight mt-1 leading-none text-amber-600 dark:text-amber-400">
              {kpis.grouped.pendiente}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 py-2 min-w-[88px]">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
              GMV
            </p>
            <p className="font-display text-xl font-extrabold tabular-nums tracking-tight mt-1 leading-none text-[var(--accent)]">
              S/{Number(kpis.totalRev).toFixed(0)}
            </p>
          </div>
        </>
      }
    >
      <Toasts toasts={toasts} />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-5">
        <KpiCard label="Pendientes" value={loading ? "—" : kpis.grouped.pendiente} tone="var(--data-warning-500)" icon={Clock} />
        <KpiCard label="Confirmados" value={loading ? "—" : kpis.grouped.confirmado} tone="var(--data-info-500)" icon={CheckCircle2} />
        <KpiCard label="Preparando" value={loading ? "—" : kpis.grouped.preparando} tone="var(--accent)" icon={Sparkles} />
        <KpiCard label="En camino" value={loading ? "—" : kpis.grouped.en_camino} tone="var(--accent)" icon={Truck} />
        <KpiCard label="Entregados" value={loading ? "—" : kpis.grouped.entregado} tone="var(--data-success-500)" icon={CheckCircle2} />
        <KpiCard label="GMV total" value={loading ? "—" : `S/${Number(kpis.totalRev).toFixed(0)}`} tone="var(--accent)" icon={CreditCard} />
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => void load()}
          disabled={refreshing}
          title="Recargar (R)"
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)] transition disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} aria-hidden />
          Recargar
        </button>
        <label className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] cursor-pointer hover:border-[var(--accent)]/40">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Auto 30s
        </label>
        {/* Densidad de vista */}
        <div className="inline-flex h-11 items-center rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-1" role="group" aria-label="Densidad de vista">
          <button
            type="button"
            onClick={() => changeViewMode("compact")}
            aria-pressed={viewMode === "compact"}
            title="Vista compacta (más pedidos en pantalla)"
            className={cn(
              "inline-flex h-full items-center gap-1.5 rounded-lg px-2.5 text-sm font-bold transition-colors",
              viewMode === "compact" ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            <List className="h-4 w-4" aria-hidden /> Compacto
          </button>
          <button
            type="button"
            onClick={() => changeViewMode("comfort")}
            aria-pressed={viewMode === "comfort"}
            title="Vista cómoda (tarjetas con detalle)"
            className={cn(
              "inline-flex h-full items-center gap-1.5 rounded-lg px-2.5 text-sm font-bold transition-colors",
              viewMode === "comfort" ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            <LayoutGrid className="h-4 w-4" aria-hidden /> Cómodo
          </button>
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Ordenar por"
          className="h-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] cursor-pointer focus:outline-none focus:border-[var(--accent)]"
        >
          <option value="recent">Recientes primero</option>
          <option value="oldest">Antiguas primero</option>
          <option value="total_desc">Mayor monto</option>
          <option value="total_asc">Menor monto</option>
        </select>
        <button
          onClick={() => exportOrdersCSV(visible)}
          disabled={visible.length === 0}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)] transition disabled:opacity-50"
        >
          <Download className="h-4 w-4" aria-hidden />
          CSV ({visible.length})
        </button>
        <button
          type="button"
          onClick={() => setShowAnalytics((v) => !v)}
          aria-pressed={showAnalytics}
          className={cn(
            "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 px-3.5 text-sm font-bold transition",
            showAnalytics
              ? "border-[var(--accent)] bg-[var(--accent)] text-white"
              : "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)]",
          )}
        >
          <BarChart3 className="h-4 w-4" aria-hidden />
          Analítica
        </button>
        <span className="ml-auto text-xs text-[var(--text-tertiary)]">
          Atajos:{" "}
          <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] font-mono border border-[var(--rule-soft)]">/</kbd>{" "}
          buscar ·{" "}
          <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] font-mono border border-[var(--rule-soft)]">R</kbd>{" "}
          recargar
        </span>
      </div>

      {/* Filtros search + tenant */}
      <div className="flex flex-wrap gap-2 mb-5">
        <div className="flex-1 min-w-[240px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)] pointer-events-none" />
          <input
            ref={searchInputRef}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente, ID, teléfono o tienda…"
            aria-label="Buscar pedidos"
            className="w-full h-12 pl-10 pr-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
        <select
          value={tenantFilter}
          onChange={(e) => setTenantFilter(e.target.value)}
          aria-label="Filtrar por tienda"
          className="h-12 px-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-primary)] text-sm cursor-pointer focus:outline-none focus:border-[var(--accent)]"
        >
          <option value="all">Todas las tiendas</option>
          {tenantOptions.map(([slug, name]) => (
            <option key={slug} value={slug}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {/* Status pills */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-3 -mx-1 px-1">
        {STATUS_FILTERS.map((f) => {
          const active = statusFilter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatusFilter(f.key)}
              aria-pressed={active}
              className={cn(
                "shrink-0 px-4 h-11 rounded-full text-sm font-semibold border-2 transition-colors",
                active
                  ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                  : "bg-[var(--surface-canvas)] border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]",
              )}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Banner SLA en vivo */}
      {slaBrokenIds.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/10 px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-300 shrink-0" aria-hidden />
          <p className="text-sm font-bold text-rose-700 dark:text-rose-300">
            {slaBrokenIds.size} {slaBrokenIds.size === 1 ? "pedido pendiente" : "pedidos pendientes"} &gt;2h sin atender
          </p>
          <button
            type="button"
            onClick={() => setSlaBrokenOnly((v) => !v)}
            aria-pressed={slaBrokenOnly}
            className={cn(
              "ml-auto inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-bold transition",
              slaBrokenOnly
                ? "bg-rose-600 text-white"
                : "bg-white dark:bg-transparent border border-rose-300 dark:border-rose-500/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/15",
            )}
          >
            <Clock className="h-4 w-4" aria-hidden />
            {slaBrokenOnly ? "Ver todos" : "Ver solo SLA roto"}
          </button>
        </div>
      )}

      {/* Panel de analítica (sobre la muestra cargada) */}
      {showAnalytics && <AnalyticsPanel data={analytics} />}

      {/* Lista */}
      {loading && orders.length === 0 ? (
        <SkeletonRows />
      ) : visible.length === 0 ? (
        <EmptyState
          isFiltered={!!search || statusFilter !== "all" || tenantFilter !== "all" || slaBrokenOnly}
          onClear={() => {
            setSearch("");
            setStatusFilter("all");
            setTenantFilter("all");
            setSlaBrokenOnly(false);
          }}
        />
      ) : viewMode === "compact" ? (
        <div className="overflow-hidden rounded-2xl border border-[var(--rule-base)] divide-y divide-[var(--rule-base)]">
          {visible.map((o) => (
            <OrderRowCompact
              key={o.id}
              order={o}
              onOpen={() => setSelected(o)}
              selected={selectedIds.has(o.id)}
              onToggleSelect={() => toggleSelect(o.id)}
              slaBroken={slaBrokenIds.has(o.id)}
              onCopy={copy}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {visible.map((o) => (
            <OrderCard key={o.id} order={o} onOpen={() => setSelected(o)} onCopy={copy} />
          ))}
        </div>
      )}

      {/* Barra de acciones masivas */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2 rounded-2xl border-2 border-[var(--accent)] bg-[var(--surface-raised)] px-3 py-2 shadow-[var(--shadow-2xl)]">
          <span className="px-1 text-sm font-bold text-[var(--text-primary)] tabular-nums">{selectedIds.size} seleccionado{selectedIds.size === 1 ? "" : "s"}</span>
          <button
            onClick={() => exportOrdersCSV(orders.filter((o) => selectedIds.has(o.id)))}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3 text-sm font-bold text-white hover:brightness-110"
          >
            <Download className="h-4 w-4" /> CSV selección
          </button>
          <button
            onClick={copySelectedPhones}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40"
          >
            <Copy className="h-4 w-4" /> Copiar teléfonos
          </button>
          <button
            onClick={clearSelection}
            aria-label="Limpiar selección"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {selected && (
        <OrderDetailDrawer
          order={selected}
          onClose={() => setSelected(null)}
          onCopy={copy}
        />
      )}
    </AdminTabShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  tone: string;
  icon: typeof Clock;
}) {
  return (
    <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center gap-2.5">
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl shrink-0"
          style={{
            background: `color-mix(in oklch, ${tone} 12%, transparent)`,
            color: tone,
          }}
        >
          <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </span>
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-tight">
          {label}
        </p>
      </div>
      <p className="mt-2.5 font-display text-2xl font-extrabold tabular-nums tracking-tight text-[var(--text-primary)]">
        {value}
      </p>
    </div>
  );
}

function OrderCard({ order, onOpen, onCopy }: { order: OrderRow; onOpen: () => void; onCopy: (text: string, label: string) => void }) {
  const meta = STATUS_META[order.status];
  const Icon = meta.icon;
  const itemCount = order.items.reduce((acc, it) => acc + it.quantity, 0);
  const previewItems = order.items.slice(0, 3);
  const isPending = order.status === "pendiente";
  const sla = isPending ? slaInfoForOrder(order.createdAt) : null;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="cursor-pointer text-left rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-[var(--rule-strong)] hover:shadow-[var(--shadow-md)] transition-all overflow-hidden"
    >
      {/* Top: tienda + status */}
      <div className="px-4 py-3 flex items-center gap-3 border-b border-[var(--rule-base)] bg-[var(--surface-sunken)]">
        {order.tenant.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- logos son URLs externas/blob
          <img
            src={order.tenant.logoUrl}
            alt={order.tenant.name}
            className="w-9 h-9 rounded-lg object-cover border border-[var(--rule-base)] bg-[var(--surface-canvas)]"
          />
        ) : (
          <div className="w-9 h-9 rounded-lg bg-[var(--surface-canvas)] border border-[var(--rule-base)] flex items-center justify-center text-xs font-bold text-[var(--text-primary)]">
            {order.tenant.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[var(--text-primary)] truncate flex items-center gap-2">
            <Store className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
            {order.tenant.name}
          </p>
          <p className="text-xs text-[var(--text-tertiary)] tabular-nums">
            #{order.id.slice(-8)} · {timeAgo(order.createdAt)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold"
            style={{
              background: `color-mix(in oklch, ${meta.tone} 14%, transparent)`,
              color: meta.tone,
            }}
          >
            <Icon className="w-3 h-3" strokeWidth={2.5} />
            {meta.label}
          </span>
          {sla && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider",
                SLA_CLS[sla.tone],
              )}
              title={`Pendiente hace ${sla.minutes} min`}
            >
              <Clock className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
              {sla.label}
            </span>
          )}
        </div>
      </div>

      {/* Body: cliente + items */}
      <div className="p-4 space-y-3">
        <div>
          <p className="text-base font-bold text-[var(--text-primary)] truncate">
            {order.customer.name}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-tertiary)] mt-0.5">
            {order.customer.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="w-3 h-3" /> {order.customer.phone}
              </span>
            )}
            {order.customer.location && (
              <span className="inline-flex items-center gap-1 truncate max-w-[220px]">
                <MapPin className="w-3 h-3" /> {order.customer.location}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            {previewItems.map((it) => (
              <div
                key={it.id}
                className="w-9 h-9 rounded-lg border-2 border-[var(--surface-canvas)] bg-[var(--surface-sunken)] overflow-hidden shrink-0"
                title={`${it.quantity}× ${it.name}`}
              >
                {it.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.image} alt={it.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[var(--text-tertiary)]">
                    <Package className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            ))}
            {order.items.length > 3 && (
              <div className="w-9 h-9 rounded-lg border-2 border-[var(--surface-canvas)] bg-[var(--surface-sunken)] flex items-center justify-center text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">
                +{order.items.length - 3}
              </div>
            )}
          </div>
          <p className="text-xs text-[var(--text-tertiary)]">
            {itemCount} {itemCount === 1 ? "item" : "items"} · {order.items.length}{" "}
            {order.items.length === 1 ? "producto" : "productos"}
          </p>
        </div>
      </div>

      {/* Footer: total */}
      <div className="px-4 py-3 border-t border-[var(--rule-base)] flex items-center justify-between">
        <div>
          <p className="text-[length:var(--ts-2xs)] uppercase tracking-wider text-[var(--text-tertiary)]">
            Total
          </p>
          <p className="text-lg font-extrabold text-[var(--text-primary)] tabular-nums">
            S/{Number(order.total).toFixed(2)}
          </p>
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <RowActions order={order} onCopy={onCopy} />
          <span className="ml-1 inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)]">
            Ver detalle <ChevronRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </div>
  );
}

function OrderRowCompact({
  order,
  onOpen,
  selected,
  onToggleSelect,
  slaBroken,
  onCopy,
}: {
  order: OrderRow;
  onOpen: () => void;
  selected: boolean;
  onToggleSelect: () => void;
  slaBroken: boolean;
  onCopy: (text: string, label: string) => void;
}) {
  const meta = STATUS_META[order.status];
  const Icon = meta.icon;
  const itemCount = order.items.reduce((acc, it) => acc + it.quantity, 0);
  const isPending = order.status === "pendiente";
  const sla = isPending ? slaInfoForOrder(order.createdAt) : null;
  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className={cn(
        "group w-full text-left flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors",
        slaBroken ? "bg-rose-50/60 dark:bg-rose-500/10 border-l-4 border-rose-500" : "bg-[var(--surface-canvas)] hover:bg-[var(--surface-sunken)]",
        selected && "bg-[var(--accent)]/10",
      )}
    >
      {/* Checkbox selección */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
        aria-label={selected ? "Deseleccionar" : "Seleccionar"}
        aria-pressed={selected}
        className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--accent)]"
      >
        {selected ? <CheckSquare className="h-4 w-4 text-[var(--accent)]" /> : <Square className="h-4 w-4" />}
      </button>

      {/* Tienda */}
      {order.tenant.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- logos externos/blob
        <img src={order.tenant.logoUrl} alt={order.tenant.name} className="w-8 h-8 rounded-lg object-cover border border-[var(--rule-base)] shrink-0" />
      ) : (
        <div className="w-8 h-8 rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-base)] flex items-center justify-center text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] shrink-0">
          {order.tenant.name.slice(0, 2).toUpperCase()}
        </div>
      )}

      {/* ID + tienda + cliente */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-[var(--text-primary)] truncate">
          {order.customer.name}
          <span className="ml-2 font-mono text-xs font-normal text-[var(--text-tertiary)] tabular-nums">#{order.id.slice(-6)}</span>
        </p>
        <p className="text-xs text-[var(--text-tertiary)] truncate flex items-center gap-1">
          <Store className="w-3 h-3 shrink-0" /> {order.tenant.name}
          {order.customer.location && <span className="hidden sm:inline truncate">· {order.customer.location}</span>}
        </p>
      </div>

      {/* Acciones inline (aparecen en hover) */}
      <div className="hidden md:flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <RowActions order={order} onCopy={onCopy} />
      </div>

      {/* Status + SLA */}
      <div className="hidden sm:flex items-center gap-1.5 shrink-0">
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
          style={{ background: `color-mix(in oklch, ${meta.tone} 14%, transparent)`, color: meta.tone }}
        >
          <Icon className="w-3 h-3" strokeWidth={2.5} />
          {meta.label}
        </span>
        {sla && (
          <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-extrabold tabular-nums", SLA_CLS[sla.tone])} title={`Pendiente hace ${sla.minutes} min`}>
            <Clock className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />{sla.label}
          </span>
        )}
      </div>

      {/* Items */}
      <span className="hidden md:inline-flex items-center gap-1 text-xs text-[var(--text-tertiary)] tabular-nums shrink-0 w-14 justify-end">
        <Package className="w-3 h-3" />{itemCount}
      </span>

      {/* Tiempo */}
      <span className="hidden lg:inline text-xs text-[var(--text-tertiary)] tabular-nums shrink-0 w-16 text-right">{timeAgo(order.createdAt)}</span>

      {/* Total */}
      <span className="text-sm font-extrabold text-[var(--text-primary)] tabular-nums shrink-0 w-20 text-right">
        S/{Number(order.total).toFixed(2)}
      </span>

      <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)] group-hover:text-[var(--accent)] shrink-0" />
    </div>
  );
}

/** Acciones rápidas sin abrir el drawer: WhatsApp, llamar, copiar, abrir panel del tenant. */
function RowActions({ order, onCopy }: { order: OrderRow; onCopy: (text: string, label: string) => void }) {
  const wa = customerWaLink(order.customer.phone, `Hola ${order.customer.name}, te escribo por tu pedido #${order.id.slice(-6)}.`);
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const btn = "inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-canvas)] hover:text-[var(--accent)]";
  return (
    <>
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" onClick={stop} className={btn} title="WhatsApp al cliente" aria-label="WhatsApp al cliente">
          <MessageCircle className="h-4 w-4" />
        </a>
      )}
      {order.customer.phone && (
        <a href={`tel:${order.customer.phone}`} onClick={stop} className={btn} title="Llamar" aria-label="Llamar">
          <Phone className="h-4 w-4" />
        </a>
      )}
      {order.customer.phone && (
        <button type="button" onClick={(e) => { stop(e); onCopy(order.customer.phone!, "Teléfono"); }} className={btn} title="Copiar teléfono" aria-label="Copiar teléfono">
          <Copy className="h-4 w-4" />
        </button>
      )}
      <a href={`/t/${order.tenant.slug}/admin?tab=pedidos`} target="_blank" rel="noopener noreferrer" onClick={stop} className={btn} title={`Abrir panel de ${order.tenant.name}`} aria-label="Abrir panel del tenant">
        <ExternalLink className="h-4 w-4" />
      </a>
    </>
  );
}

function OrderDetailDrawer({
  order,
  onClose,
  onCopy,
}: {
  order: OrderRow;
  onClose: () => void;
  onCopy: (text: string, label: string) => void;
}) {
  const meta = STATUS_META[order.status];
  const Icon = meta.icon;
  const [cacheBust] = useState(() => Date.now());

  // Bloqueo scroll body
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <aside className="absolute right-0 top-0 h-full w-full sm:w-[480px] bg-[var(--surface-canvas)] border-l border-[var(--rule-base)] shadow-[var(--shadow-2xl)] flex flex-col animate-in slide-in-from-right duration-[var(--dur-fast)]">
        {/* Header */}
        <header className="px-5 py-4 border-b border-[var(--rule-base)] flex items-center gap-3 shrink-0 bg-[var(--surface-sunken)]">
          {order.tenant.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={order.tenant.logoUrl}
              alt={order.tenant.name}
              className="w-12 h-12 rounded-xl object-cover border border-[var(--rule-base)] bg-[var(--surface-canvas)]"
            />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-[var(--surface-canvas)] border border-[var(--rule-base)] flex items-center justify-center text-base font-bold text-[var(--text-primary)]">
              {order.tenant.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-[var(--text-primary)] truncate">
              {order.tenant.name}
            </p>
            <div className="flex items-center gap-1">
              <p className="text-xs text-[var(--text-tertiary)] font-mono truncate">
                #{order.id.slice(-12)}
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCopy(order.id, "Order ID");
                }}
                aria-label="Copiar Order ID"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--surface-canvas)] shrink-0"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-canvas)] shrink-0"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Status banner */}
          <div
            className="rounded-2xl p-4 flex items-center gap-3"
            style={{
              background: `color-mix(in oklch, ${meta.tone} 12%, transparent)`,
              color: meta.tone,
            }}
          >
            <Icon className="w-6 h-6" />
            <div>
              <p className="text-xs uppercase tracking-wider opacity-80">Estado actual</p>
              <p className="text-base font-extrabold">{meta.label}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-xs uppercase tracking-wider opacity-80">Total</p>
              <p className="text-lg font-extrabold tabular-nums">
                S/{Number(order.total).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Cliente */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-bold mb-2">
              Cliente
            </h3>
            <div className="rounded-2xl border-2 border-[var(--rule-base)] p-4 space-y-2">
              <p className="text-base font-bold text-[var(--text-primary)]">
                {order.customer.name}
              </p>
              {order.customer.phone && (
                <div className="flex items-center justify-between gap-2 text-sm text-[var(--text-secondary)]">
                  <a
                    href={`tel:${order.customer.phone}`}
                    className="flex items-center gap-2 hover:underline"
                  >
                    <Phone className="w-4 h-4 text-[var(--text-tertiary)]" />
                    {order.customer.phone}
                  </a>
                  <button
                    onClick={() => onCopy(order.customer.phone!, "Teléfono")}
                    aria-label="Copiar teléfono"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--surface-sunken)]"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              {order.customer.location && (
                <p className="text-sm text-[var(--text-secondary)] flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-[var(--text-tertiary)] mt-0.5 shrink-0" />
                  <span>{order.customer.location}</span>
                </p>
              )}
              {order.customer.reference && (
                <p className="text-xs text-[var(--text-tertiary)] pl-6">
                  Referencia: {order.customer.reference}
                </p>
              )}
            </div>
          </section>

          {/* Items */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-bold mb-2 flex items-center justify-between">
              <span>Items del pedido</span>
              <span className="text-[var(--text-secondary)] font-bold normal-case tracking-normal">
                {order.items.length} {order.items.length === 1 ? "producto" : "productos"}
              </span>
            </h3>
            <ul className="space-y-2">
              {order.items.map((it) => (
                <li
                  key={it.id}
                  className="rounded-2xl border-2 border-[var(--rule-base)] p-3 flex items-center gap-3"
                >
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-[var(--surface-sunken)] shrink-0 border border-[var(--rule-soft)]">
                    {it.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.image} alt={it.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[var(--text-tertiary)]">
                        <Package className="w-5 h-5" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[var(--text-primary)] line-clamp-2">
                      {it.name}
                    </p>
                    <p className="text-xs text-[var(--text-tertiary)]">
                      {it.quantity} × S/{Number(it.price).toFixed(2)}
                      {it.unit ? ` · ${it.unit}` : ""}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-[var(--text-primary)] tabular-nums shrink-0">
                    S/{(it.quantity * it.price).toFixed(2)}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {/* Logística + pago */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-bold mb-2">
              Detalle
            </h3>
            <dl className="rounded-2xl border-2 border-[var(--rule-base)] p-4 space-y-2 text-sm">
              <Field label="Origen" value={order.source ?? "—"} />
              <Field label="Pago" value={order.paymentMethod ?? "—"} />
              <Field label="Repartidor" value={order.riderName ?? "Sin asignar"} />
              <Field label="Estado entrega" value={order.deliveryStatus ?? "—"} />
              <Field
                label="Creado"
                value={
                  order.createdAt
                    ? new Date(order.createdAt).toLocaleString("es-PE")
                    : "—"
                }
              />
              {order.notes && <Field label="Notas" value={order.notes} />}
            </dl>
          </section>

          {/* Comprobante de pago */}
          <PaymentProofViewer
            orderId={order.id}
            isCash={order.paymentMethod === "efectivo"}
          />

          {/* CTA */}
          <a
            href={`/t/${order.tenant.slug}/admin?tab=pedidos&_fresh=${cacheBust}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center h-12 leading-[3rem] rounded-2xl bg-[var(--accent-600,var(--accent))] text-white text-sm font-bold hover:brightness-110 transition"
          >
            Abrir panel admin de {order.tenant.name}
          </a>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <dt className="text-[var(--text-tertiary)] shrink-0">{label}</dt>
      <dd className="text-[var(--text-primary)] font-semibold text-right">{value}</dd>
    </div>
  );
}

function AnalyticsPanel({
  data,
}: {
  data: {
    avgTicket: number;
    cancelRate: number;
    byDay: { label: string; count: number }[];
    topTenants: { name: string; gmv: number; count: number }[];
    n: number;
  };
}) {
  const maxDay = Math.max(1, ...data.byDay.map((d) => d.count));
  const maxGmv = Math.max(1, ...data.topTenants.map((t) => t.gmv));
  return (
    <div className="mb-5 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="h-4 w-4 text-[var(--accent)]" />
        <h3 className="text-sm font-bold text-[var(--text-primary)]">Analítica</h3>
        <span className="text-xs text-[var(--text-tertiary)]">muestra de {data.n} pedidos cargados</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Métricas */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Ticket prom.</p>
            <p className="mt-1 font-display text-xl font-extrabold tabular-nums text-[var(--text-primary)]">S/{data.avgTicket.toFixed(0)}</p>
          </div>
          <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Cancelación</p>
            <p className={cn("mt-1 font-display text-xl font-extrabold tabular-nums", data.cancelRate >= 15 ? "text-rose-600 dark:text-rose-400" : "text-[var(--text-primary)]")}>{data.cancelRate}%</p>
          </div>
        </div>
        {/* Pedidos por día */}
        <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3">
          <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">Pedidos · últimos 7 días</p>
          <div className="flex items-end justify-between gap-1 h-16">
            {data.byDay.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 justify-end">
                <div className="w-full rounded-t bg-[var(--accent)]" style={{ height: `${(d.count / maxDay) * 100}%`, minHeight: d.count > 0 ? 3 : 0 }} title={`${d.count} pedidos`} />
                <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{d.label}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Top tiendas por GMV */}
        <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3">
          <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-2 flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Top tiendas · GMV</p>
          {data.topTenants.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)]">Sin datos</p>
          ) : (
            <ul className="space-y-1.5">
              {data.topTenants.map((t) => (
                <li key={t.name} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[var(--text-secondary)] font-semibold">{t.name}</span>
                    <span className="tabular-nums font-bold text-[var(--text-primary)] shrink-0">S/{t.gmv.toFixed(0)}</span>
                  </div>
                  <div className="mt-0.5 h-1.5 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
                    <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(t.gmv / maxGmv) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4 h-44 animate-pulse"
        />
      ))}
    </div>
  );
}

function EmptyState({
  isFiltered,
  onClear,
}: {
  isFiltered: boolean;
  onClear: () => void;
}) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-12 text-center">
      <ShoppingBag className="w-10 h-10 mx-auto text-[var(--text-tertiary)] mb-3" />
      <p className="text-base font-bold text-[var(--text-primary)]">
        {isFiltered ? "Sin pedidos que coincidan" : "Sin pedidos"}
      </p>
      <p className="text-sm text-[var(--text-tertiary)] mt-1">
        {isFiltered
          ? "Ajustá los filtros o la búsqueda."
          : "Cuando los clientes hagan pedidos, aparecerán aquí."}
      </p>
      {isFiltered && (
        <button
          onClick={onClear}
          className="mt-4 h-10 px-4 rounded-xl text-sm font-bold text-[var(--accent)] hover:bg-[var(--accent)]/10"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}
