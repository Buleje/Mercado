"use client";

/**
 * OperationsTab — Centro de operaciones del marketplace.
 *
 * Muestra pedidos en vivo con indicador de demora vs SLA, badges de peligro,
 * y botón WhatsApp directo al owner del negocio para escalar cuando una
 * tienda no responde a tiempo. Auto-refresh cada 30s.
 */

import { useEffect, useState, useMemo, useCallback } from "react";
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
} from "@buleje/design-system/icons";
import { StatCard } from "./StatCard";

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

const DANGER_DOT: Record<DangerLevel, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  danger: "bg-rose-500 animate-pulse",
};

const DANGER_BG: Record<DangerLevel, string> = {
  ok: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900",
  warn: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900",
  danger: "bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-900",
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

/**
 * Genera el link wa.me con plantilla específica según el contexto:
 *  - status `pendiente` + crítico: pedido sin aceptar → urgir confirmación
 *  - status `confirmado` + crítico: cocina sin avance → preguntar si necesitan delivery
 *  - status `en_camino` + crítico: repartidor extraviado → confirmar entrega
 *  - warn (no crítico): aviso temprano
 *  - sin order context: WA general (botón en cabecera de tienda)
 */
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

export function OperationsTab() {
  const [orders, setOrders] = useState<OpsOrder[] | null>(null);
  const [tenants, setTenants] = useState<OpsTenantAgg[]>([]);
  const [stats, setStats] = useState<OpsStats | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [hours, setHours] = useState<number>(24);
  const [filter, setFilter] = useState<"all" | "open" | "delayed" | "danger">("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [zoneFilter, setZoneFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Pedidos atendidos (vistos) — persistente en localStorage por sesión
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

  const markAttended = useCallback((id: string) => {
    setAttended((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(
          "buleje:ops:attended",
          JSON.stringify([...next]),
        );
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
    if (!autoRefresh) return;
    const id = setInterval(() => void load(true), REFRESH_MS);
    return () => clearInterval(id);
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

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<Package className="h-5 w-5 text-[var(--accent)]" />}
          label="Pedidos abiertos"
          value={stats?.openOrders ?? "—"}
          sub={stats ? `de ${stats.totalOrders} en ventana` : undefined}
        />
        <StatCard
          icon={<Clock className="h-5 w-5 text-amber-600" />}
          label="Demorados"
          value={stats?.delayedOrders ?? "—"}
          sub="vs SLA por estado"
          trend={stats && stats.delayedOrders > 0 ? "down" : "neutral"}
        />
        <StatCard
          icon={<AlertTriangle className="h-5 w-5 text-rose-600" />}
          label="Críticos"
          value={stats?.dangerOrders ?? "—"}
          sub="2x SLA vencido"
          trend={stats && stats.dangerOrders > 0 ? "down" : "neutral"}
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Tiendas afectadas"
          value={stats?.storesAffected ?? "—"}
          sub="con al menos 1 demora"
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-1">
          {(
            [
              { k: "all", label: "Todos" },
              { k: "open", label: "Abiertos" },
              { k: "delayed", label: "Demorados" },
              { k: "danger", label: "Críticos" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.k}
              type="button"
              onClick={() => setFilter(opt.k)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                filter === opt.k
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <select
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          aria-label="Ventana de tiempo"
          className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-semibold"
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
          className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-semibold capitalize"
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
            className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-semibold"
          >
            <option value="all">Todas las zonas</option>
            {zoneOptions.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        )}

        <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="h-4 w-4"
          />
          Auto-refresh 30s
        </label>

        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refrescar
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Tiendas con problemas */}
      {tenants.length > 0 && filter !== "all" && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
            Tiendas con demoras
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {tenants
              .filter((t) => t.delayed > 0)
              .slice(0, 9)
              .map((t) => {
                const wa = whatsappOps({
                  phone: t.ownerPhone,
                  tenantName: t.tenantName,
                });
                return (
                  <div
                    key={t.tenantId}
                    className={`rounded-lg border p-3 ${
                      t.danger > 0
                        ? "border-rose-300 bg-rose-50 dark:bg-rose-950/30"
                        : "border-amber-300 bg-amber-50 dark:bg-amber-950/30"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate">{t.storeName}</p>
                        <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                          {t.delayed} demorados
                          {t.danger > 0 && ` · ${t.danger} críticos`}
                        </p>
                      </div>
                      {wa && (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600"
                          aria-label={`WhatsApp ${t.tenantName}`}
                        >
                          <MessageCircle className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Loading */}
      {!orders && !error && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-xl bg-[var(--surface-sunken)] animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Lista de pedidos */}
      {orders && (
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="rounded-xl border border-dashed border-[var(--rule-soft)] py-10 text-center text-sm text-[var(--text-tertiary)]">
              <Activity className="h-6 w-6 mx-auto mb-2 opacity-50" />
              {filter === "danger"
                ? "Sin pedidos críticos. Las operaciones están en orden."
                : filter === "delayed"
                ? "Sin demoras. Excelente ritmo."
                : "Sin pedidos en esta ventana."}
            </div>
          )}
          {filtered.map((o) => {
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
              <div
                key={o.id}
                className={`rounded-xl border overflow-hidden transition-colors ${DANGER_BG[o.dangerLevel]} ${
                  isAttended ? "opacity-60" : ""
                }`}
              >
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
                  className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.02] cursor-pointer"
                >
                  {/* Estado dot */}
                  <div className="shrink-0">
                    <div className="h-3 w-3 rounded-full" aria-hidden>
                      <span className={`block h-3 w-3 rounded-full ${DANGER_DOT[o.dangerLevel]}`} />
                    </div>
                  </div>

                  {/* Info principal — cliente más prominente */}
                  <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[2fr_1.2fr_1fr_auto] gap-3 items-center">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                        {o.customerName || "Cliente sin nombre"}
                      </p>
                      <p className="text-xs text-[var(--text-tertiary)] truncate">
                        de <span className="font-bold">{o.storeName}</span> · #{o.id.slice(0, 8)} · {o.itemCount} items
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                        {STATUS_LABEL[o.status] ?? o.status}
                      </p>
                      <p
                        className={`text-sm font-bold tabular-nums ${
                          o.dangerLevel === "danger"
                            ? "text-rose-700"
                            : o.dangerLevel === "warn"
                              ? "text-amber-700"
                              : "text-[var(--text-primary)]"
                        }`}
                      >
                        {o.isOpen
                          ? `Esperando hace ${fmtMinutes(o.minutesElapsed)}`
                          : fmtMinutes(o.minutesElapsed)}
                        {o.isOpen && (
                          <span className="text-xs font-normal text-[var(--text-tertiary)] ml-1">
                            / SLA {fmtMinutes(o.slaMinutes)}
                          </span>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                        Total
                      </p>
                      <p className="text-sm font-bold tabular-nums">
                        {fmtCurrency(o.total)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {o.dangerLevel === "danger" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500 text-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                          <AlertTriangle className="h-3 w-3" />
                          Crítico
                        </span>
                      )}
                      {o.dangerLevel === "warn" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 text-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                          <Clock className="h-3 w-3" />
                          Demora
                        </span>
                      )}
                      {wa && (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600"
                          aria-label="WhatsApp al negocio"
                        >
                          <MessageCircle className="h-4 w-4" />
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
                        className={`inline-flex items-center justify-center h-8 w-8 rounded-lg transition-colors ${
                          isAttended
                            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                            : "bg-[var(--surface-canvas)] text-[var(--text-tertiary)] hover:text-[var(--accent)] border border-[var(--rule-base)]"
                        }`}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                      <ChevronDown
                        className={`h-4 w-4 text-[var(--text-tertiary)] transition-transform ${
                          isExp ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  </div>
                </div>

                {/* Detalle */}
                {isExp && (
                  <div className="border-t border-current/10 bg-white/40 dark:bg-black/20 px-4 py-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <p className="font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                          Cliente
                        </p>
                        <p>{o.customerName}</p>
                        {o.customerPhone && (
                          <a
                            href={`tel:${o.customerPhone}`}
                            className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline mt-0.5"
                          >
                            <Phone className="h-3 w-3" />
                            {o.customerPhone}
                          </a>
                        )}
                        {o.customerLocation && (
                          <p className="mt-1 text-[var(--text-secondary)]">
                            {o.customerLocation}
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                          Pago
                        </p>
                        <p className="capitalize">{o.paymentMethod ?? "—"}</p>
                        <p className="mt-1 text-[var(--text-secondary)]">
                          Creado: {new Date(o.createdAt).toLocaleString("es-PE")}
                        </p>
                      </div>
                      <div>
                        <p className="font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                          Acciones
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {o.tenantSlug && (
                            <a
                              href={`/superadmin/tenants/${o.tenantSlug}`}
                              className="inline-flex items-center gap-1 rounded-md border border-current/20 px-2 py-1 hover:bg-white/30"
                            >
                              Ver tenant
                            </a>
                          )}
                          {o.storeSlug && (
                            <a
                              href={`/tienda/${o.storeSlug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-md border border-current/20 px-2 py-1 hover:bg-white/30"
                            >
                              Ver tienda
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
