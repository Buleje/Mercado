"use client";

/**
 * /cuenta/pedidos — Lista de pedidos del cliente.
 *
 * Conecta a `GET /api/me/order-history` (requireCustomer + tenantId scope).
 * Chrome del layout (store): NO renderiza Header/Footer propios. Tabs de filtro,
 * resumen de gasto, miniaturas de productos y método de pago. Mini-tracker en
 * pedidos activos. Tokens DS (sin colores hardcodeados ni --accent-dark roto).
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Clock,
  CheckCircle2,
  Truck,
  XCircle,
  ChevronRight,
  ShoppingBag,
  Loader2,
  Package,
  Wallet,
  CreditCard,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import Breadcrumbs from "@/components/ui-system/Breadcrumbs";
import { OrderTrackingMini, type MiniStatus } from "@/components/customer/pedidos/OrderTrackingMini";
import { PedidoLlegando } from "@/components/ui-system/illustrations";

const CartSidebar = dynamic(() => import("@/components/CartSidebar"));

type UiStatus = "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado";

interface UiItem {
  name: string;
  image: string;
}

interface UiOrder {
  id: string;
  storeName: string;
  createdAt: string;
  total: number;
  status: UiStatus;
  items: UiItem[];
  itemCount: number;
  itemsPreview: string;
  paymentMethod: string | null;
  miniStatus?: MiniStatus;
  etaMinutes?: number;
}

interface ApiOrder {
  id: string;
  storeName?: string;
  status: UiStatus;
  total: number;
  paymentMethod: string | null;
  createdAt: string;
  updatedAt: string;
  notes: string | null;
  items: Array<{ name: string; price: number; quantity: number; unit: string; image: string; productId: number | null }>;
  itemCount: number;
  canCancel: boolean;
  canReorder: boolean;
}

const CARD =
  "rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]";

function statusToMiniStatus(status: UiStatus): MiniStatus | undefined {
  if (status === "confirmado") return "preparing";
  if (status === "en_camino") return "shipping";
  return undefined;
}

function buildItemsPreview(items: ApiOrder["items"]): string {
  const names = items.map((i) => i.name).filter(Boolean);
  if (!names.length) return "";
  const preview = names.slice(0, 3).join(", ");
  return names.length > 3 ? `${preview} +${names.length - 3} más` : preview;
}

const STATUS_META: Record<
  UiStatus,
  { label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; chip: string; dot: string }
> = {
  pendiente: {
    label: "Pendiente",
    icon: Clock,
    chip: "bg-[var(--data-warning-50)] text-[var(--data-warning-700)]",
    dot: "bg-[var(--data-warning-500)]",
  },
  confirmado: {
    label: "Confirmado",
    icon: CheckCircle2,
    chip: "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]",
    dot: "bg-[var(--accent)]",
  },
  en_camino: {
    label: "En camino",
    icon: Truck,
    chip: "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]",
    dot: "bg-[var(--accent)]",
  },
  entregado: {
    label: "Entregado",
    icon: CheckCircle2,
    chip: "bg-[var(--data-success-50)] text-[var(--data-success-700)]",
    dot: "bg-[var(--data-success-500)]",
  },
  cancelado: {
    label: "Cancelado",
    icon: XCircle,
    chip: "bg-[var(--data-error-50)] text-[var(--data-error-700)]",
    dot: "bg-[var(--data-error-500)]",
  },
};

const PAYMENT_LABEL: Record<string, string> = {
  yape: "Yape",
  plin: "Plin",
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  card: "Tarjeta",
  cash: "Efectivo",
};

function paymentLabel(pm: string | null): string | null {
  if (!pm) return null;
  return PAYMENT_LABEL[pm.toLowerCase()] ?? pm;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

const fmtSoles = (n: number) => `S/ ${n.toFixed(2)}`;

const TABS = [
  { key: "todos", label: "Todos" },
  { key: "curso", label: "En curso" },
  { key: "entregados", label: "Entregados" },
  { key: "cancelados", label: "Cancelados" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function matchesTab(status: UiStatus, tab: TabKey): boolean {
  if (tab === "todos") return true;
  if (tab === "curso") return status === "pendiente" || status === "confirmado" || status === "en_camino";
  if (tab === "entregados") return status === "entregado";
  return status === "cancelado";
}

function OrderCard({ order }: { order: UiOrder }) {
  const meta = STATUS_META[order.status];
  const hasMini =
    !!order.miniStatus && ["shipping", "preparing", "nearby"].includes(order.miniStatus);
  const thumbs = order.items.filter((i) => i.image).slice(0, 4);
  const extra = order.itemCount - thumbs.length;
  const pm = paymentLabel(order.paymentMethod);

  return (
    <li className="space-y-2">
      {hasMini && (
        <OrderTrackingMini
          orderId={order.id}
          status={order.miniStatus!}
          etaMinutes={order.etaMinutes}
          storeName={order.storeName}
        />
      )}
      <Link
        href={`/cuenta/pedidos/${encodeURIComponent(order.id)}/seguimiento`}
        className={`${CARD} block p-4 transition-all hover:-translate-y-0.5 hover:border-[var(--accent)]/30 sm:p-5`}
      >
        {/* Top: estado + tienda + fecha */}
        <div className="flex items-center gap-2">
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold", meta.chip)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
            {meta.label}
          </span>
          <span className="truncate text-sm font-bold text-[var(--text-secondary)]">{order.storeName}</span>
          <span className="ml-auto shrink-0 text-sm text-[var(--text-tertiary)]">{fmtDate(order.createdAt)}</span>
        </div>

        {/* Medio: miniaturas + detalle */}
        <div className="mt-3 flex items-center gap-3">
          {thumbs.length > 0 ? (
            <div className="flex shrink-0 -space-x-2">
              {thumbs.map((it, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={it.image}
                  alt={it.name}
                  loading="lazy"
                  className="h-11 w-11 rounded-xl border-2 border-[var(--surface-raised)] bg-[var(--surface-sunken)] object-cover"
                />
              ))}
              {extra > 0 && (
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border-2 border-[var(--surface-raised)] bg-[var(--surface-sunken)] text-xs font-bold text-[var(--text-secondary)]">
                  +{extra}
                </span>
              )}
            </div>
          ) : (
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
              <Package className="h-5 w-5" strokeWidth={2} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-extrabold text-[var(--text-primary)]">
              Pedido #{order.id.slice(-8).toUpperCase()}
            </p>
            <p className="truncate text-sm text-[var(--text-tertiary)]">
              {order.itemCount} {order.itemCount === 1 ? "producto" : "productos"}
              {order.itemsPreview ? ` · ${order.itemsPreview}` : ""}
            </p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" />
        </div>

        {/* Abajo: pago + total */}
        <div className="mt-3 flex items-center justify-between border-t border-[var(--rule-soft)] pt-3">
          {pm ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-secondary)]">
              {pm === "Tarjeta" ? <CreditCard className="h-4 w-4" strokeWidth={2} /> : <Wallet className="h-4 w-4" strokeWidth={2} />}
              {pm}
            </span>
          ) : (
            <span />
          )}
          <span className="text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{fmtSoles(order.total)}</span>
        </div>
      </Link>
    </li>
  );
}

export default function PedidosPage() {
  const [orders, setOrders] = useState<UiOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("todos");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/order-history?limit=50", { credentials: "include" })
      .then((r) => {
        // 204 (sin contenido) / 401 / 403 → invitado o sin pedidos: empty state limpio.
        if (r.status === 204 || r.status === 401 || r.status === 403) return { orders: [] };
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { orders?: ApiOrder[]; storeName?: string }) => {
        if (cancelled) return;
        const apiOrders = data.orders ?? [];
        const defaultStore = data.storeName ?? "Tienda";
        setOrders(
          apiOrders.map((o) => ({
            id: o.id,
            storeName: o.storeName ?? defaultStore,
            createdAt: o.createdAt,
            total: o.total,
            status: o.status,
            items: (o.items ?? []).map((i) => ({ name: i.name, image: i.image })),
            itemCount: o.itemCount ?? o.items?.length ?? 0,
            itemsPreview: buildItemsPreview(o.items ?? []),
            paymentMethod: o.paymentMethod,
            miniStatus: statusToMiniStatus(o.status),
          })),
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Error al cargar pedidos");
        setOrders([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isLoading = orders === null;
  const all = useMemo(() => orders ?? [], [orders]);

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { todos: all.length, curso: 0, entregados: 0, cancelados: 0 };
    for (const o of all) {
      if (matchesTab(o.status, "curso")) c.curso++;
      else if (o.status === "entregado") c.entregados++;
      else if (o.status === "cancelado") c.cancelados++;
    }
    return c;
  }, [all]);

  const totalSpent = useMemo(
    () => all.filter((o) => o.status === "entregado").reduce((s, o) => s + o.total, 0),
    [all],
  );

  const filtered = all.filter((o) => matchesTab(o.status, tab));

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      <BreadcrumbSchema
        visible={false}
        items={[
          { name: "Inicio", url: "https://www.buleje.pe/" },
          { name: "Mi cuenta", url: "https://www.buleje.pe/cuenta" },
          { name: "Pedidos", url: "https://www.buleje.pe/cuenta/pedidos" },
        ]}
      />

      {/* Breadcrumb */}
      <div className="border-b border-[var(--rule-soft)] bg-[var(--surface-raised)]">
        <div className="mx-auto max-w-4xl px-4 py-3 sm:px-6">
          <Breadcrumbs items={[{ label: "Mi cuenta", href: "/cuenta" }, { label: "Pedidos" }]} />
        </div>
      </div>

      <main id="main-content" className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
        {/* Encabezado + resumen */}
        <header>
          <h1 className="text-3xl font-extrabold tracking-[-0.02em] text-[var(--text-primary)] sm:text-4xl">
            Mis pedidos
          </h1>
          <p className="mt-2 text-base text-[var(--text-secondary)]">
            Revisa el estado de tus pedidos y haz seguimiento en tiempo real.
          </p>
          {!isLoading && !error && all.length > 0 && (
            <div className="mt-5 grid grid-cols-2 gap-3 sm:max-w-md">
              <div className={`${CARD} p-4`}>
                <p className="text-sm font-medium text-[var(--text-tertiary)]">Pedidos</p>
                <p className="mt-0.5 text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">{all.length}</p>
              </div>
              <div className={`${CARD} p-4`}>
                <p className="text-sm font-medium text-[var(--text-tertiary)]">Total gastado</p>
                <p className="mt-0.5 text-2xl font-extrabold tabular-nums text-[var(--accent)]">{fmtSoles(totalSpent)}</p>
              </div>
            </div>
          )}
        </header>

        {/* Tabs de filtro */}
        {!isLoading && !error && all.length > 0 && (
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrar pedidos">
            {TABS.map((t) => {
              const activeTab = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  id={`pedidos-tab-${t.key}`}
                  aria-selected={activeTab}
                  aria-controls="pedidos-tabpanel"
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "inline-flex h-10 items-center gap-2 rounded-2xl border-2 px-4 text-sm font-bold transition-colors",
                    activeTab
                      ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                      : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)]/40",
                  )}
                >
                  {t.label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-xs tabular-nums",
                      activeTab ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
                    )}
                  >
                    {counts[t.key]}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Contenido */}
        {isLoading ? (
          <section className={`${CARD} px-6 py-12 text-center`}>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-[var(--accent)]" />
            <p className="mt-3 text-base text-[var(--text-secondary)]">Cargando tus pedidos…</p>
          </section>
        ) : error ? (
          <section className="rounded-2xl border border-[var(--data-error-100)] bg-[var(--data-error-50)] px-6 py-8 text-center">
            <XCircle className="mx-auto h-8 w-8 text-[var(--data-error-500)]" />
            <p className="mt-3 text-base font-bold text-[var(--data-error-700)]">No pudimos cargar tus pedidos</p>
            <p className="mt-1 text-sm text-[var(--text-tertiary)]">{error}</p>
          </section>
        ) : all.length === 0 ? (
          <section className={`${CARD} px-6 py-12 text-center`}>
            <div className="flex justify-center text-[var(--text-tertiary)]" aria-hidden="true">
              <PedidoLlegando size={180} />
            </div>
            <p className="mt-4 text-lg font-extrabold tracking-[-0.01em] text-[var(--text-primary)]">
              Tu próximo pedido te espera
            </p>
            <p className="mx-auto mt-1 max-w-sm text-base leading-relaxed text-[var(--text-secondary)]">
              Realiza un pedido y podrás hacerle seguimiento en tiempo real desde aquí, con ETA y estado en cada paso.
            </p>
            <Link
              href="/tienda"
              className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-6 text-base font-bold text-white shadow-[var(--shadow-sm)] transition-transform hover:-translate-y-0.5"
            >
              <ShoppingBag className="h-5 w-5" strokeWidth={2.25} />
              Empieza a comprar
            </Link>
          </section>
        ) : filtered.length === 0 ? (
          <section id="pedidos-tabpanel" role="tabpanel" aria-labelledby={`pedidos-tab-${tab}`} className={`${CARD} px-6 py-10 text-center`}>
            <p className="text-base font-bold text-[var(--text-primary)]">Nada por aquí</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">No tienes pedidos en esta categoría.</p>
          </section>
        ) : (
          <ul id="pedidos-tabpanel" role="tabpanel" aria-labelledby={`pedidos-tab-${tab}`} className="space-y-3">
            {filtered.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))}
          </ul>
        )}
      </main>

      <CartSidebar />
    </div>
  );
}
