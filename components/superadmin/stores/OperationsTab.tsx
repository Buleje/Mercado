"use client";

/**
 * OperationsTab — Centro de operaciones del marketplace.
 *
 * Rediseño 2026-05-11 — más operacional y visual:
 *  - Hero con stats y indicador de auto-refresh live
 *  - Toolbar agrupado: filter chips + selects + auto-refresh + refresh
 *  - Tiendas problemáticas como cards con CTAs claras
 *  - Order rows con border-l tone-aware (visual hit por severidad)
 *  - Cronómetro grande SLA-aware en cada row
 *  - Expanded detail con tokens DS canónicos
 */

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Package,
  RefreshCw,
  MessageCircle,
  Phone,
  ChevronDown,
  TrendingUp,
  Timer,
  MapPin,
  ExternalLink,
  Store as StoreIcon,
  type LucideIcon,
} from "@buleje/design-system/icons";

type DangerLevel = "ok" | "warn" | "danger";

interface OpsOrder {
  id: string;
  tenantId: string;
  tenantSlug: string | null;
  tenantName: string;
  tenantPlan?: string;
  tenantZone?: string | null;
  ownerPhone: string | null;
  storeName: string;
  storeSlug: string | null;
  customerName: string;
  customerPhone: string | null;
  customerLocation: string;
  paymentMethod: string | null;
  total: number;
  status: string;
  deliveryStatus: string | null;
  isOpen: boolean;
  itemCount: number;
  minutesElapsed: number;
  slaMinutes: number;
  overrun: number;
  dangerLevel: DangerLevel;
  estimatedDeliveryAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface OpsTenantAgg {
  tenantId: string;
  tenantSlug: string | null;
  tenantName: string;
  ownerPhone: string | null;
  storeName: string;
  storeSlug: string | null;
  total: number;
  open: number;
  delayed: number;
  danger: number;
  ordersCount: number;
}

interface OpsStats {
  totalOrders: number;
  openOrders: number;
  delayedOrders: number;
  dangerOrders: number;
  totalRevenue: number;
  storesAffected: number;
}

const REFRESH_MS = 30_000;

const DANGER_META: Record<
  DangerLevel,
  {
    label: string;
    pill: string;
    dot: string;
    border: string;
    valueColor: string;
    iconBg: string;
    icon: LucideIcon;
  }
> = {
  ok: {
    label: "Al día",
    pill: "border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5 text-[var(--data-success-500)]",
    dot: "bg-[var(--data-success-500)]",
    border: "border-l-[var(--data-success-500)]/60",
    valueColor: "text-[var(--text-primary)]",
    iconBg: "bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]",
    icon: CheckCircle2,
  },
  warn: {
    label: "Demora",
    pill: "border-amber-300/60 bg-amber-50/60 text-amber-700 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300",
    dot: "bg-amber-500",
    border: "border-l-amber-500/60",
    valueColor: "text-amber-700 dark:text-amber-300",
    iconBg: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    icon: Clock,
  },
  danger: {
    label: "Crítico",
    pill: "border-rose-300/60 bg-rose-50/60 text-rose-700 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-300",
    dot: "bg-rose-500 animate-pulse",
    border: "border-l-rose-500",
    valueColor: "text-rose-700 dark:text-rose-300",
    iconBg: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
    icon: AlertTriangle,
  },
};

const STATUS_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  en_camino: "En camino",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(n);
}

function fmtMinutes(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h}h ${m}min`;
}

function whatsappOps(opts: {
  phone: string | null;
  tenantName: string;
  orderId?: string;
  minutesElapsed?: number;
  status?: string;
  dangerLevel?: DangerLevel;
}) {
  const { phone, tenantName, orderId, minutesElapsed, status, dangerLevel } = opts;
  if (!phone) return null;
  const clean = phone.replace(/[^0-9]/g, "");
  if (clean.length < 8) return null;
  const num = clean.startsWith("51") ? clean : `51${clean}`;

  let text: string;
  if (!orderId) {
    text = `Hola, te escribo desde Buleje sobre tu tienda *${tenantName}*. Vimos varios pedidos demorados, ¿necesitas soporte?`;
  } else {
    const idShort = orderId.slice(0, 8);
    const elapsed = fmtMinutes(minutesElapsed ?? 0);
    if (dangerLevel === "danger") {
      if (status === "pendiente") {
        text = `🚨 *Pedido crítico sin aceptar*\nTienda: *${tenantName}*\nPedido: #${idShort}\nLleva *${elapsed}* sin confirmación.\n\n¿Pueden aceptarlo ahora o lo cancelamos?`;
      } else if (status === "confirmado") {
        text = `🍳 *Pedido en cocina demorado*\nTienda: *${tenantName}*\nPedido: #${idShort}\nLleva *${elapsed}* desde la confirmación.\n\n¿Está listo? ¿Necesitan ayuda con el delivery?`;
      } else if (status === "en_camino") {
        text = `🛵 *Pedido en camino sin entregar*\nTienda: *${tenantName}*\nPedido: #${idShort}\nLleva *${elapsed}* en ruta.\n\n¿Pueden confirmar dónde está el repartidor?`;
      } else {
        text = `⚠️ Pedido crítico en *${tenantName}* (#${idShort}). Lleva ${elapsed}. ¿Pueden ayudarnos?`;
      }
    } else {
      text = `Hola, soy del soporte Buleje. Te aviso que el pedido #${idShort} en *${tenantName}* lleva ${elapsed} y se acerca al límite. ¿Todo bien por ahí?`;
    }
  }
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}

// ─── Component ────────────────────────────────────────────────────────

export function OperationsTab() {
  const [orders, setOrders] = useState<OpsOrder[] | null>(null);
  const [tenants, setTenants] = useState<OpsTenantAgg[]>([]);
  const [stats, setStats] = useState<OpsStats | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(REFRESH_MS / 1000);
  const [hours, setHours] = useState<number>(24);
  const [filter, setFilter] = useState<"all" | "open" | "delayed" | "danger">("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [zoneFilter, setZoneFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [attended, setAttended] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem("buleje:ops:attended");
      const arr = raw ? (JSON.parse(raw) as string[]) : [];
      return new Set(arr);
    } catch {
      return new Set();
    }
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const markAttended = useCallback((id: string) => {
    setAttended((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem("buleje:ops:attended", JSON.stringify([...next]));
      } catch {
        /* silent */
      }
      return next;
    });
  }, []);

  const load = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setOrders(null);
      setError("");
      try {
        const params = new URLSearchParams({ hours: String(hours) });
        const res = await fetch(`/api/superadmin/stores/operations?${params}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error();
        const json = (await res.json()) as {
          orders: OpsOrder[];
          tenants: OpsTenantAgg[];
          stats: OpsStats;
        };
        setOrders(json.orders);
        setTenants(json.tenants);
        setStats(json.stats);
      } catch {
        setError("Error cargando operaciones");
      } finally {
        setRefreshing(false);
      }
    },
    [hours],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setCountdown(REFRESH_MS / 1000);
      return;
    }
    setCountdown(REFRESH_MS / 1000);
    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          void load(true);
          return REFRESH_MS / 1000;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, load]);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    if (!orders) return [];
    let list = orders;
    if (filter === "open") list = list.filter((o) => o.isOpen);
    else if (filter === "delayed") list = list.filter((o) => o.dangerLevel !== "ok");
    else if (filter === "danger") list = list.filter((o) => o.dangerLevel === "danger");
    if (planFilter !== "all")
      list = list.filter((o) => (o.tenantPlan ?? "free") === planFilter);
    if (zoneFilter !== "all")
      list = list.filter((o) => (o.tenantZone ?? "") === zoneFilter);
    return list;
  }, [orders, filter, planFilter, zoneFilter]);

  const planOptions = useMemo(() => {
    if (!orders) return [];
    const set = new Set(orders.map((o) => o.tenantPlan ?? "free"));
    return Array.from(set).sort();
  }, [orders]);

  const zoneOptions = useMemo(() => {
    if (!orders) return [];
    const set = new Set(orders.map((o) => o.tenantZone).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [orders]);

  const filterCounts = useMemo(() => {
    if (!orders) return { all: 0, open: 0, delayed: 0, danger: 0 };
    return {
      all: orders.length,
      open: orders.filter((o) => o.isOpen).length,
      delayed: orders.filter((o) => o.dangerLevel !== "ok").length,
      danger: orders.filter((o) => o.dangerLevel === "danger").length,
    };
  }, [orders]);

  const problemTenants = tenants.filter((t) => t.delayed > 0);

  return (
    <div className="space-y-5">
      {/* ── Hero with live indicator ─────────────────────────── */}
      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3.5">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)]">
              <Activity className="h-6 w-6" strokeWidth={1.75} aria-hidden />
            </span>
            <div>
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)] inline-flex items-center gap-1.5">
                Marketplace · Operaciones
                {autoRefresh && (
                  <span className="inline-flex items-center gap-1 text-[var(--data-success-500)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--data-success-500)] animate-pulse" />
                    LIVE
                  </span>
                )}
              </p>
              <h2 className="font-display text-lg sm:text-xl font-extrabold tracking-tight text-[var(--text-primary)]">
                Pedidos en tiempo real
              </h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)] max-w-2xl">
                Monitoreá demoras vs SLA por estado. WhatsApp directo al dueño para escalar
                cuando una tienda no responde a tiempo.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`inline-flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-xs font-extrabold uppercase tracking-wider transition ${
                autoRefresh
                  ? "bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/20"
                  : "border border-[var(--rule-soft)] bg-[var(--surface-canvas)] text-[var(--text-secondary)] hover:border-[var(--accent)]/40"
              }`}
              title={autoRefresh ? "Detener auto-refresh" : "Activar auto-refresh 30s"}
            >
              <Timer className="h-3.5 w-3.5" strokeWidth={2.5} />
              {autoRefresh ? `Auto ${countdown}s` : "Auto off"}
            </button>
            <button
              type="button"
              onClick={() => {
                void load(true);
                setCountdown(REFRESH_MS / 1000);
              }}
              disabled={refreshing}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)] disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                strokeWidth={2.25}
              />
              Refrescar
            </button>
          </div>
        </div>
      </section>

      {/* ── KPI stats (clickables) ───────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={Package}
          label="Pedidos abiertos"
          value={stats?.openOrders ?? "—"}
          sub={stats ? `de ${stats.totalOrders} en ventana` : undefined}
          tone="accent"
          onClick={() => setFilter("open")}
          active={filter === "open"}
        />
        <KpiCard
          icon={Clock}
          label="Demorados"
          value={stats?.delayedOrders ?? "—"}
          sub="vs SLA por estado"
          tone="warning"
          onClick={() => setFilter("delayed")}
          active={filter === "delayed"}
        />
        <KpiCard
          icon={AlertTriangle}
          label="Críticos"
          value={stats?.dangerOrders ?? "—"}
          sub="2× SLA vencido"
          tone="danger"
          onClick={() => setFilter("danger")}
          active={filter === "danger"}
        />
        <KpiCard
          icon={TrendingUp}
          label="Tiendas afectadas"
          value={stats?.storesAffected ?? "—"}
          sub="con al menos 1 demora"
          tone="neutral"
        />
      </div>

      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3">
        <div className="flex gap-1 rounded-xl bg-[var(--surface-sunken)] p-1">
          {(
            [
              { k: "all", label: "Todos" },
              { k: "open", label: "Abiertos" },
              { k: "delayed", label: "Demorados" },
              { k: "danger", label: "Críticos" },
            ] as const
          ).map((opt) => {
            const isActive = filter === opt.k;
            const count = filterCounts[opt.k];
            return (
              <button
                key={opt.k}
                type="button"
                onClick={() => setFilter(opt.k)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  isActive
                    ? "bg-[var(--surface-raised)] text-[var(--accent)] shadow-sm"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {opt.label}
                {count > 0 && (
                  <span
                    className={`inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-extrabold tabular-nums ${
                      isActive
                        ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                        : opt.k === "danger"
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300"
                          : opt.k === "delayed"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                            : "bg-[var(--surface-canvas)] text-[var(--text-tertiary)]"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <select
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          aria-label="Ventana de tiempo"
          className="h-9 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 text-xs font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        >
          <option value={6}>Últimas 6 h</option>
          <option value={12}>Últimas 12 h</option>
          <option value={24}>Últimas 24 h</option>
          <option value={48}>Últimas 48 h</option>
          <option value={168}>Última semana</option>
        </select>

        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value)}
          aria-label="Filtrar por plan"
          className="h-9 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 text-xs font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] capitalize"
        >
          <option value="all">Todos los planes</option>
          {planOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        {zoneOptions.length > 0 && (
          <select
            value={zoneFilter}
            onChange={(e) => setZoneFilter(e.target.value)}
            aria-label="Filtrar por zona"
            className="h-9 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 text-xs font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          >
            <option value="all">Todas las zonas</option>
            {zoneOptions.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        )}

        {attended.size > 0 && (
          <span className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5 px-3 text-xs font-extrabold text-[var(--data-success-500)]">
            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} />
            {attended.size} atendidos
          </span>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-300/60 bg-rose-50/40 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Tiendas con problemas (solo si hay filtro o problemas) ── */}
      {problemTenants.length > 0 && (filter === "delayed" || filter === "danger") && (
        <section className="rounded-2xl border border-amber-300/60 bg-amber-50/30 overflow-hidden dark:border-amber-700/40 dark:bg-amber-950/20">
          <header className="flex items-center justify-between gap-3 border-b border-amber-200/60 dark:border-amber-700/40 px-5 py-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </span>
              <div>
                <h3 className="font-display text-sm font-extrabold tracking-tight text-amber-800 dark:text-amber-200">
                  Tiendas con problemas
                </h3>
                <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
                  {problemTenants.length} tiendas con al menos un pedido demorado
                </p>
              </div>
            </div>
          </header>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-3">
            {problemTenants.slice(0, 9).map((t) => {
              const wa = whatsappOps({
                phone: t.ownerPhone,
                tenantName: t.tenantName,
              });
              const isCritical = t.danger > 0;
              return (
                <div
                  key={t.tenantId}
                  className={`flex items-center gap-2 rounded-xl border bg-[var(--surface-raised)] px-3 py-2.5 ${
                    isCritical
                      ? "border-rose-300/60 dark:border-rose-700/40"
                      : "border-amber-300/40 dark:border-amber-700/30"
                  }`}
                >
                  <span
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      isCritical
                        ? "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                    }`}
                  >
                    <StoreIcon className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-[var(--text-primary)] truncate leading-tight">
                      {t.storeName}
                    </p>
                    <p className="text-xs text-[var(--text-tertiary)] truncate leading-tight">
                      {t.delayed} demorados
                      {t.danger > 0 && (
                        <span className="text-rose-600 dark:text-rose-400 font-bold">
                          {" · "}
                          {t.danger} críticos
                        </span>
                      )}
                    </p>
                  </div>
                  {wa && (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--data-success-500)] text-white transition hover:brightness-110"
                      aria-label={`WhatsApp ${t.tenantName}`}
                      title={`WhatsApp al dueño de ${t.tenantName}`}
                    >
                      <MessageCircle className="h-4 w-4" strokeWidth={2.25} />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Loading ──────────────────────────────────────────── */}
      {!orders && !error && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] animate-pulse"
            />
          ))}
        </div>
      )}

      {/* ── Empty ────────────────────────────────────────────── */}
      {orders && filtered.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-canvas)] py-12 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--data-success-500)]/10 mb-3">
            <CheckCircle2
              className="h-6 w-6 text-[var(--data-success-500)]"
              strokeWidth={1.75}
              aria-hidden
            />
          </div>
          <p className="font-display text-base font-extrabold text-[var(--text-primary)]">
            {filter === "danger"
              ? "Sin pedidos críticos"
              : filter === "delayed"
                ? "Sin demoras detectadas"
                : "Sin pedidos en esta ventana"}
          </p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            {filter === "danger" || filter === "delayed"
              ? "Las operaciones están en orden ✓"
              : "Ampliá la ventana de tiempo arriba."}
          </p>
        </div>
      )}

      {/* ── Order list ───────────────────────────────────────── */}
      {orders && filtered.length > 0 && (
        <div className="space-y-2.5">
          {filtered.map((o) => {
            const meta = DANGER_META[o.dangerLevel];
            const StatusIcon = meta.icon;
            const isExp = expanded.has(o.id);
            const isAttended = attended.has(o.id);
            const wa = whatsappOps({
              phone: o.ownerPhone,
              tenantName: o.tenantName,
              orderId: o.id,
              minutesElapsed: o.minutesElapsed,
              status: o.status,
              dangerLevel: o.dangerLevel,
            });
            return (
              <article
                key={o.id}
                className={`rounded-2xl border bg-[var(--surface-raised)] overflow-hidden transition border-l-4 ${
                  meta.border
                } ${
                  isAttended
                    ? "border-[var(--data-success-500)]/30 opacity-65"
                    : isExp
                      ? "border-[var(--accent)]/40 shadow-md"
                      : "border-[var(--rule-soft)] hover:border-[var(--accent)]/30"
                }`}
              >
                {/* Summary row */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExp}
                  onClick={() => toggleExpand(o.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleExpand(o.id);
                    }
                  }}
                  className="w-full text-left transition hover:bg-[var(--surface-sunken)]/30 cursor-pointer"
                >
                  <div className="flex items-center gap-4 px-4 py-3">
                    {/* Status icon */}
                    <span
                      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${meta.iconBg}`}
                    >
                      <StatusIcon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                    </span>

                    {/* Customer + store + meta */}
                    <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[2fr_1.2fr_1fr] gap-3 items-center">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-sm text-[var(--text-primary)] truncate">
                            {o.customerName || "Cliente sin nombre"}
                          </p>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${meta.pill}`}
                          >
                            <span className={`h-1 w-1 rounded-full ${meta.dot}`} />
                            {meta.label}
                          </span>
                          {isAttended && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[var(--data-success-500)]">
                              <CheckCircle2 className="h-2.5 w-2.5" strokeWidth={3} />
                              Atendido
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-[var(--text-tertiary)] truncate">
                          de <span className="font-bold text-[var(--text-secondary)]">{o.storeName}</span>{" "}
                          · <span className="font-mono">#{o.id.slice(0, 8)}</span> · {o.itemCount} items
                        </p>
                      </div>

                      {/* Chronometer / SLA */}
                      <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                          {STATUS_LABEL[o.status] ?? o.status}
                        </p>
                        <p className={`font-display text-lg font-extrabold tabular-nums leading-tight ${meta.valueColor}`}>
                          {fmtMinutes(o.minutesElapsed)}
                        </p>
                        {o.isOpen && (
                          <p className="text-[10px] text-[var(--text-tertiary)] leading-none">
                            SLA: {fmtMinutes(o.slaMinutes)}
                            {o.overrun > 0 && (
                              <span className={`font-bold ml-1 ${meta.valueColor}`}>
                                · +{fmtMinutes(o.overrun)}
                              </span>
                            )}
                          </p>
                        )}
                      </div>

                      <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                          Total
                        </p>
                        <p className="font-display text-lg font-extrabold tabular-nums text-[var(--text-primary)] leading-tight">
                          {fmtCurrency(o.total)}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {wa && (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className={`inline-flex h-9 items-center gap-1 rounded-xl px-3 text-xs font-extrabold uppercase tracking-wider transition ${
                            o.dangerLevel === "danger"
                              ? "bg-rose-600 text-white shadow-md shadow-rose-600/20 hover:brightness-110"
                              : "border border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5 text-[var(--data-success-500)] hover:bg-[var(--data-success-500)]/10"
                          }`}
                          aria-label="WhatsApp al negocio"
                          title="Escalar por WhatsApp"
                        >
                          <MessageCircle className="h-3.5 w-3.5" strokeWidth={2.25} />
                          WA
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          markAttended(o.id);
                        }}
                        aria-pressed={isAttended}
                        title={isAttended ? "Marcar como pendiente" : "Marcar como atendido"}
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-xl transition ${
                          isAttended
                            ? "bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]"
                            : "border border-[var(--rule-soft)] bg-[var(--surface-canvas)] text-[var(--text-tertiary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
                        }`}
                      >
                        <CheckCircle2 className="h-4 w-4" strokeWidth={2.25} />
                      </button>
                      <ChevronDown
                        className={`h-5 w-5 text-[var(--text-tertiary)] transition-transform ${
                          isExp ? "rotate-180" : ""
                        }`}
                        strokeWidth={2}
                      />
                    </div>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExp && (
                  <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-canvas)]/40 p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <DetailBlock
                        icon={Phone}
                        title="Cliente"
                        items={[
                          { label: "Nombre", value: o.customerName },
                          o.customerPhone
                            ? {
                                label: "Teléfono",
                                value: o.customerPhone,
                                href: `tel:${o.customerPhone}`,
                              }
                            : null,
                          o.customerLocation
                            ? { label: "Ubicación", value: o.customerLocation, icon: MapPin }
                            : null,
                        ]}
                      />
                      <DetailBlock
                        icon={Package}
                        title="Pago"
                        items={[
                          {
                            label: "Método",
                            value: o.paymentMethod ?? "—",
                            capitalize: true,
                          },
                          {
                            label: "Creado",
                            value: new Date(o.createdAt).toLocaleString("es-PE", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            }),
                          },
                          {
                            label: "Actualizado",
                            value: new Date(o.updatedAt).toLocaleString("es-PE", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            }),
                          },
                        ]}
                      />
                      <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-2 flex items-center gap-1.5">
                          <ExternalLink className="h-3 w-3" strokeWidth={2.25} />
                          Acciones
                        </p>
                        <div className="flex flex-col gap-1.5">
                          {o.tenantSlug && (
                            <a
                              href={`/superadmin/tenants/${o.tenantSlug}`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
                            >
                              <Activity className="h-3.5 w-3.5" strokeWidth={2.25} />
                              Ver tenant
                              <ExternalLink className="h-3 w-3 ml-auto opacity-60" />
                            </a>
                          )}
                          {o.storeSlug && (
                            <a
                              href={`/tienda/${o.storeSlug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
                            >
                              <StoreIcon className="h-3.5 w-3.5" strokeWidth={2.25} />
                              Ver tienda pública
                              <ExternalLink className="h-3 w-3 ml-auto opacity-60" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════ components ═══════════════════════════ */

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
  onClick,
  active,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  tone: "accent" | "warning" | "danger" | "neutral";
  onClick?: () => void;
  active?: boolean;
}) {
  const iconBg = {
    accent: "bg-[var(--accent)]/10 text-[var(--accent)]",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    danger: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
    neutral: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
  }[tone];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`text-left rounded-2xl border bg-[var(--surface-raised)] p-4 transition ${
        active
          ? "border-[var(--accent)]/40 shadow-md shadow-[var(--accent)]/10 ring-1 ring-[var(--accent)]/20"
          : "border-[var(--rule-soft)]"
      } ${onClick ? "hover:-translate-y-0.5 hover:shadow-md hover:border-[var(--accent)]/30" : ""}`}
    >
      <div className="flex items-center gap-2.5">
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </span>
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-tight">
          {label}
        </p>
      </div>
      <p className="mt-3 font-display text-2xl font-extrabold tabular-nums tracking-tight text-[var(--text-primary)]">
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-[var(--text-tertiary)]">{sub}</p>}
    </Tag>
  );
}

type DetailItem = {
  label: string;
  value: string;
  href?: string;
  icon?: LucideIcon;
  capitalize?: boolean;
} | null;

function DetailBlock({
  icon: HeaderIcon,
  title,
  items,
}: {
  icon: LucideIcon;
  title: string;
  items: DetailItem[];
}) {
  return (
    <div>
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-2 flex items-center gap-1.5">
        <HeaderIcon className="h-3 w-3" strokeWidth={2.25} />
        {title}
      </p>
      <dl className="space-y-1.5 text-xs">
        {items.filter(Boolean).map((it) => {
          const item = it as Exclude<DetailItem, null>;
          const ValIcon = item.icon;
          return (
            <div key={item.label} className="flex flex-col gap-0.5">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                {item.label}
              </dt>
              <dd className={`font-semibold text-[var(--text-primary)] ${item.capitalize ? "capitalize" : ""}`}>
                {item.href ? (
                  <a
                    href={item.href}
                    className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
                  >
                    {ValIcon && <ValIcon className="h-3 w-3" strokeWidth={2.25} />}
                    {item.value}
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    {ValIcon && (
                      <ValIcon
                        className="h-3 w-3 text-[var(--text-tertiary)]"
                        strokeWidth={2.25}
                      />
                    )}
                    {item.value}
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
