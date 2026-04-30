"use client";

/**
 * /cuenta/pedidos — Lista de pedidos del cliente.
 *
 * Conecta a `GET /api/me/order-history` (requireCustomer + tenantId scope).
 * Antes (P1 Bug Hunter Report 2026-04-30): usaba MOCK_ORDERS — el cliente
 * veía pedidos falsos en su historial.
 *
 * Muestra `OrderTrackingMini` (widget compacto) en los pedidos activos.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Clock, CheckCircle2, Truck, XCircle, ChevronRight, ArrowLeft,
  ShoppingBag, Loader2,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import Header from "@/components/Header";
import AnnouncementBar from "@/components/AnnouncementBar";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import { OrderTrackingMini, type MiniStatus } from "@/components/customer/pedidos/OrderTrackingMini";
import { PedidoLlegando } from "@/components/ui-system/illustrations";

const CartSidebar = dynamic(() => import("@/components/CartSidebar"));
const MobileBottomNav = dynamic(() => import("@/components/MobileBottomNav"));

type UiStatus = "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado";

interface UiOrder {
  id: string;
  storeName: string;
  createdAt: string;
  total: number;
  status: UiStatus;
  itemsPreview: string;
  miniStatus?: MiniStatus;
  etaMinutes?: number;
}

interface ApiOrder {
  id: string;
  status: UiStatus;
  total: number;
  paymentMethod: string | null;
  createdAt: string;
  updatedAt: string;
  notes: string | null;
  items: Array<{
    name: string;
    price: number;
    quantity: number;
    unit: string;
    image: string;
    productId: number | null;
  }>;
  itemCount: number;
  canCancel: boolean;
  canReorder: boolean;
}

// ── Mapeo status → mini-tracker (los activos muestran widget de progreso) ──
function statusToMiniStatus(status: UiStatus): MiniStatus | undefined {
  switch (status) {
    case "confirmado": return "preparing";
    case "en_camino":  return "shipping";
    default:           return undefined;
  }
}

function buildItemsPreview(items: ApiOrder["items"]): string {
  if (!items.length) return "";
  const names = items.map((i) => i.name).filter(Boolean);
  const preview = names.slice(0, 3).join(", ");
  return names.length > 3 ? `${preview} +${names.length - 3} más` : preview;
}

const STATUS_META: Record<
  UiStatus,
  {
    label: string;
    icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
    tone: string;
    dot: string;
  }
> = {
  pendiente: {
    label: "Pendiente",
    icon: Clock,
    tone: "text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-300",
    dot: "bg-amber-400",
  },
  confirmado: {
    label: "Confirmado",
    icon: CheckCircle2,
    tone: "text-foreground bg-gray-100 dark:bg-surface",
    dot: "bg-foreground",
  },
  en_camino: {
    label: "En camino",
    icon: Truck,
    tone: "text-primary bg-primary/10",
    dot: "bg-primary",
  },
  entregado: {
    label: "Entregado",
    icon: CheckCircle2,
    tone: "text-teal-700 bg-teal-50 dark:bg-teal-900/20 dark:text-teal-300",
    dot: "bg-teal-400",
  },
  cancelado: {
    label: "Cancelado",
    icon: XCircle,
    tone: "text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-300",
    dot: "bg-red-400",
  },
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function fmtSoles(n: number): string {
  return `S/${n.toFixed(2)}`;
}

function OrderListCard({ order }: { order: UiOrder }) {
  const meta = STATUS_META[order.status];
  const Icon = meta.icon;
  const isActive = order.status === "en_camino" || order.status === "confirmado" || order.status === "pendiente";
  const hasMini =
    !!order.miniStatus &&
    (order.miniStatus === "shipping" || order.miniStatus === "preparing" || order.miniStatus === "nearby");

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
        className={cn(
          "block rounded-xl border bg-white dark:bg-card p-4 transition-colors",
          isActive
            ? "border-gray-100 dark:border-card-border hover:border-gray-200 dark:hover:border-card-border/80"
            : "border-gray-100 dark:border-card-border hover:border-gray-200",
        )}
      >
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "h-10 w-10 rounded-xl inline-flex items-center justify-center shrink-0",
              meta.tone,
            )}
            aria-hidden
          >
            <Icon className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full",
                  meta.tone,
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                {meta.label}
              </span>
              <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-muted truncate">
                {order.storeName}
              </span>
            </div>
            <p className="text-sm font-semibold text-foreground truncate mt-0.5">
              #{order.id.slice(-8).toUpperCase()}
            </p>
            <p className="text-[length:var(--ts-2xs)] text-muted truncate">
              {order.itemsPreview}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-sm font-extrabold text-foreground tabular-nums">
              {fmtSoles(order.total)}
            </span>
            <span className="text-[length:var(--ts-2xs)] text-muted">{fmtDate(order.createdAt)}</span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted shrink-0" />
        </div>
      </Link>
    </li>
  );
}

export default function PedidosPage() {
  const [orders, setOrders] = useState<UiOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/order-history?limit=50", { credentials: "include" })
      .then((r) => {
        if (r.status === 401 || r.status === 403) {
          // Sesión expirada o anon → mostrar empty state legítimo
          return { orders: [] };
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { orders?: ApiOrder[] }) => {
        if (cancelled) return;
        const apiOrders = data.orders ?? [];
        const mapped: UiOrder[] = apiOrders.map((o) => ({
          id: o.id,
          storeName: "Buleje",
          createdAt: o.createdAt,
          total: o.total,
          status: o.status,
          itemsPreview: buildItemsPreview(o.items),
          miniStatus: statusToMiniStatus(o.status),
        }));
        setOrders(mapped);
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
  const active = (orders ?? []).filter(
    (o) => o.status !== "entregado" && o.status !== "cancelado",
  );
  const past = (orders ?? []).filter(
    (o) => o.status === "entregado" || o.status === "cancelado",
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background">
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: "https://www.buleje.pe/" },
          { name: "Mi cuenta", url: "https://www.buleje.pe/cuenta" },
          { name: "Pedidos", url: "https://www.buleje.pe/cuenta/pedidos" },
        ]}
      />
      <AnnouncementBar />
      <Header />

      <main
        id="main-content"
        className="max-w-4xl mx-auto px-4 sm:px-6 pt-32 sm:pt-36 pb-28 space-y-8"
      >
        <div>
          <Link
            href="/cuenta"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver a mi cuenta
          </Link>
          <div className="mt-4">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-muted">
              Historial
            </span>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mt-1">
              Mis pedidos
            </h1>
            <p className="mt-2 text-sm text-muted">
              Revisa el estado de tus pedidos y haz seguimiento en tiempo real.
            </p>
          </div>
        </div>

        {isLoading ? (
          <section className="rounded-2xl border border-gray-100 dark:border-card-border bg-white dark:bg-card px-6 py-12 text-center">
            <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
            <p className="mt-3 text-sm text-muted">Cargando tus pedidos…</p>
          </section>
        ) : error ? (
          <section className="rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50/40 dark:bg-red-900/10 px-6 py-8 text-center">
            <XCircle className="h-8 w-8 mx-auto text-red-500" />
            <p className="mt-3 text-sm font-semibold text-red-700 dark:text-red-300">
              No pudimos cargar tus pedidos
            </p>
            <p className="mt-1 text-xs text-muted">{error}</p>
          </section>
        ) : active.length > 0 ? (
          <section aria-labelledby="active-orders-heading">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-muted">
                  En curso
                </span>
                <h2
                  id="active-orders-heading"
                  className="text-base font-extrabold tracking-tight text-foreground mt-0.5"
                >
                  {active.length} {active.length === 1 ? "pedido" : "pedidos"} activos
                </h2>
              </div>
            </div>
            <ul className="space-y-3">
              {active.map((o) => (
                <OrderListCard key={o.id} order={o} />
              ))}
            </ul>
          </section>
        ) : (
          <section className="rounded-2xl border border-gray-100 dark:border-card-border bg-white dark:bg-card px-6 py-12 text-center">
            <div className="flex justify-center text-muted" aria-hidden="true">
              <PedidoLlegando size={180} />
            </div>
            <p className="mt-4 text-base font-extrabold text-foreground tracking-tight">
              Tu próximo pedido te espera
            </p>
            <p className="mt-1 text-sm text-muted max-w-sm mx-auto leading-relaxed">
              Realizá un pedido y podrás hacerle seguimiento en tiempo real desde
              aquí — con ETA y estado en cada paso.
            </p>
            <Link
              href="/tienda"
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-xs font-bold text-background hover:opacity-90 transition-opacity"
            >
              <ShoppingBag className="h-3.5 w-3.5" strokeWidth={1.75} />
              Empieza a comprar
            </Link>
          </section>
        )}

        {!isLoading && !error && past.length > 0 && (
          <section aria-labelledby="past-orders-heading">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-muted">
                  Historial
                </span>
                <h2
                  id="past-orders-heading"
                  className="text-base font-extrabold tracking-tight text-foreground mt-0.5"
                >
                  Anteriores
                </h2>
              </div>
            </div>
            <ul className="space-y-3">
              {past.map((o) => (
                <OrderListCard key={o.id} order={o} />
              ))}
            </ul>
          </section>
        )}
      </main>

      <CartSidebar />
      <MobileBottomNav />
    </div>
  );
}
