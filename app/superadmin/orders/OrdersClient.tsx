"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ShoppingBag,
  Search,
  RefreshCw,
  Filter,
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
} from "@buleje/design-system/icons";
import { AdminTabShell } from "../_components/_shared";
import { PaymentProofViewer } from "@/components/admin/PaymentProofViewer";

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

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

export function OrdersClient() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [tenantFilter, setTenantFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<OrderRow | null>(null);

  // FIX 2026-05-06: load() lee filtros vía ref para que el polling no
  // capture closures stale (search desactualizado en interval).
  const filtersRef = useRef({ statusFilter, tenantFilter, search });
  filtersRef.current = { statusFilter, tenantFilter, search };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
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
      if (!r.ok) throw new Error(String(r.status));
      const json = (await r.json()) as { orders: OrderRow[] };
      setOrders(json.orders);
    } catch (err) {
      setError(`No se pudieron cargar los pedidos (${String(err)})`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [statusFilter, tenantFilter, load]);

  // Search debounced: refresh when text settles, no closure stale.
  useEffect(() => {
    const t = setTimeout(() => void load(), 350);
    return () => clearTimeout(t);
  }, [search, load]);

  const tenantOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of orders) {
      if (o.tenant?.slug) map.set(o.tenant.slug, o.tenant.name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [orders]);

  const filtered = useMemo(() => {
    if (!search.trim()) return orders;
    const q = search.trim().toLowerCase();
    return orders.filter(
      (o) =>
        o.id.toLowerCase().includes(q) ||
        o.customer.name.toLowerCase().includes(q) ||
        (o.customer.phone ?? "").includes(q) ||
        o.tenant.name.toLowerCase().includes(q),
    );
  }, [orders, search]);

  // KPI counters por estado
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
      // Brandon mayo 2026 v7: solo `entregado` cuenta como revenue. Pedidos
      // en pendiente/confirmado/preparando/en_camino aún pueden cancelarse.
      if (o.status === "entregado") totalRev += o.total;
    }
    return { grouped, totalRev };
  }, [orders]);

  return (
    <AdminTabShell
      title="Pedidos del marketplace"
      kicker="Plataforma · Operaciones"
      description="Vista cross-tenant de todos los pedidos. Aplicá filtros por tienda, estado o término de búsqueda para diagnosticar problemas."
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
      {/* KPIs — Brandon 2026-05-21 audit fix #11: cuando loading=true muestra
          "—" placeholder en vez de "0" (que hacía pensar al user que no hay
          pedidos). Igual patrón que tenants page. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-5">
        <KpiCard
          label="Pendientes"
          value={loading ? "—" : kpis.grouped.pendiente}
          tone="var(--data-warning-500)"
          icon={Clock}
        />
        <KpiCard
          label="Confirmados"
          value={loading ? "—" : kpis.grouped.confirmado}
          tone="var(--data-info-500)"
          icon={CheckCircle2}
        />
        <KpiCard
          label="Preparando"
          value={loading ? "—" : kpis.grouped.preparando}
          tone="var(--accent)"
          icon={Sparkles}
        />
        <KpiCard
          label="En camino"
          value={loading ? "—" : kpis.grouped.en_camino}
          tone="var(--accent)"
          icon={Truck}
        />
        <KpiCard
          label="Entregados"
          value={loading ? "—" : kpis.grouped.entregado}
          tone="var(--data-success-500)"
          icon={CheckCircle2}
        />
        <KpiCard
          label="GMV total"
          value={loading ? "—" : `S/${Number(kpis.totalRev).toFixed(0)}`}
          tone="var(--accent)"
          icon={CreditCard}
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-5">
        <div className="flex-1 min-w-[240px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)] pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente, ID, teléfono o tienda…"
            className="w-full h-12 pl-10 pr-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
        <select
          value={tenantFilter}
          onChange={(e) => setTenantFilter(e.target.value)}
          className="h-12 px-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-primary)] text-sm cursor-pointer focus:outline-none focus:border-[var(--accent)]"
        >
          <option value="all">Todas las tiendas</option>
          {tenantOptions.map(([slug, name]) => (
            <option key={slug} value={slug}>
              {name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void load()}
          className="h-12 px-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)] text-sm font-semibold hover:bg-[var(--surface-sunken)] flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
        </button>
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
              className={`shrink-0 px-4 h-10 rounded-full text-sm font-semibold border-2 transition-colors ${
                active
                  ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                  : "bg-[var(--surface-canvas)] border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Lista */}
      {error && (
        <div className="rounded-2xl border-2 border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 p-4 text-sm text-[var(--data-error-700)] mb-4">
          {error}
        </div>
      )}

      {loading && orders.length === 0 ? (
        <SkeletonRows />
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((o) => (
            <OrderCard key={o.id} order={o} onOpen={() => setSelected(o)} />
          ))}
        </div>
      )}

      {selected && <OrderDetailDrawer order={selected} onClose={() => setSelected(null)} />}
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

function OrderCard({ order, onOpen }: { order: OrderRow; onOpen: () => void }) {
  const meta = STATUS_META[order.status];
  const Icon = meta.icon;
  const itemCount = order.items.reduce((acc, it) => acc + it.quantity, 0);
  const previewItems = order.items.slice(0, 3);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-[var(--rule-strong)] hover:shadow-[var(--shadow-md)] transition-all overflow-hidden"
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
                  <img src={it.image} alt={it.name} className="w-full h-full object-cover" />
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
          <p className="text-[length:var(--ts-2xs)] uppercase tracking-wider text-[var(--text-tertiary)]">Total</p>
          <p className="text-lg font-extrabold text-[var(--text-primary)] tabular-nums">
            S/{Number(order.total).toFixed(2)}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)]">
          Ver detalle <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </button>
  );
}

function OrderDetailDrawer({ order, onClose }: { order: OrderRow; onClose: () => void }) {
  const meta = STATUS_META[order.status];
  const Icon = meta.icon;
  // PERF (audit React Compiler 2026-05-12): cache-buster fijo al mount del drawer
  // via useState lazy init (pure capture de Date.now()). Sigue forzando refresh
  // del panel admin del tenant porque el modal se monta cada vez que se abre.
  const [cacheBust] = useState(() => Date.now());
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
            <p className="text-xs text-[var(--text-tertiary)] font-mono">
              #{order.id.slice(-12)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-canvas)]"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
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
              <p className="text-lg font-extrabold tabular-nums">S/{Number(order.total).toFixed(2)}</p>
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
                <p className="text-sm text-[var(--text-secondary)] flex items-center gap-2">
                  <Phone className="w-4 h-4 text-[var(--text-tertiary)]" />
                  <a href={`tel:${order.customer.phone}`} className="hover:underline">
                    {order.customer.phone}
                  </a>
                </p>
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
                      <img src={it.image} alt={it.name} className="w-full h-full object-cover" />
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
              <Field label="Creado" value={new Date(order.createdAt).toLocaleString("es-PE")} />
              {order.notes && <Field label="Notas" value={order.notes} />}
            </dl>
          </section>

          {/* Comprobante de pago (Yape/Plin/Transfer). Retorna null si la
              Order es efectivo o no tiene PaymentApproval. */}
          <PaymentProofViewer
            orderId={order.id}
            isCash={order.paymentMethod === "efectivo"}
          />

          {/* CTA → entrar al admin del tenant */}
          <a
            href={`/t/${order.tenant.slug}/admin?tab=pedidos&_fresh=${cacheBust}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center px-5 py-3 rounded-2xl bg-[var(--accent-600,var(--accent))] text-white text-sm font-bold hover:bg-[var(--accent-600)] transition-colors"
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

function EmptyState() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-12 text-center">
      <ShoppingBag className="w-10 h-10 mx-auto text-[var(--text-tertiary)] mb-3" />
      <p className="text-base font-bold text-[var(--text-primary)]">Sin pedidos</p>
      <p className="text-sm text-[var(--text-tertiary)] mt-1">
        No hay pedidos que cumplan con los filtros actuales.
      </p>
    </div>
  );
}
