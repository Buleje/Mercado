"use client";

/**
 * Mi-cuenta dashboard — vista de bienvenida con bloques útiles.
 *
 * MK-27 — Sprint 3 marketplace blueprint:
 *   - Hero greeting personalizado (nombre + saludo por hora)
 *   - Pedido en curso destacado (status pendiente/confirmado/en_camino)
 *   - LastOrderBanner para repetir el último pedido
 *   - 4 stat cards con iconos (Pedidos / Favoritos / Cupones / Direcciones)
 *   - Datos de contacto al final
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  MapPin,
  Truck,
  Clock,
  CheckCircle2,
  ArrowRight,
  User,
  Phone,
} from "@buleje/design-system/icons";
import { useCustomer } from "@/contexts/customer-context";
import { useCustomerOrders } from "@/hooks/use-customer-orders";
import { cn } from "@/lib/utils";

// LastOrderBanner: below-the-fold + hace su propio fetch (deduped por el
// singleton de useCustomerOrders) → lazy para no engordar el bundle inicial.
const LastOrderBanner = dynamic(
  () =>
    import("@/components/marketplace/mi-cuenta/LastOrderBanner").then(
      (m) => m.LastOrderBanner,
    ),
);

// ── Types ─────────────────────────────────────────────────────────────────────

type OrderStatus = "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

function getStatusMeta(status: OrderStatus): {
  label: string;
  Icon: React.ElementType;
  color: string;
  bg: string;
  pct: number;
} {
  switch (status) {
    case "pendiente":
      return {
        label: "Pendiente",
        Icon: Clock,
        color: "text-[var(--data-warning-700)] dark:text-amber-400",
        bg: "bg-amber-50 dark:bg-amber-950/30",
        pct: 25,
      };
    case "confirmado":
      return {
        label: "Confirmado",
        Icon: CheckCircle2,
        color: "text-blue-700 dark:text-blue-400",
        bg: "bg-blue-50 dark:bg-blue-950/30",
        pct: 50,
      };
    case "en_camino":
      return {
        label: "En camino",
        Icon: Truck,
        color: "text-[var(--accent)] dark:text-purple-400",
        bg: "bg-purple-50 dark:bg-purple-950/30",
        pct: 80,
      };
    default:
      return {
        label: "Pendiente",
        Icon: Clock,
        color: "text-[var(--data-warning-700)] dark:text-amber-400",
        bg: "bg-amber-50 dark:bg-amber-950/30",
        pct: 25,
      };
  }
}

const ACTIVE_STATUSES: OrderStatus[] = ["pendiente", "confirmado", "en_camino"];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MiCuentaPage() {
  const { customer } = useCustomer();
  // Singleton compartido — un solo fetch para mi-cuenta + LastOrderBanner.
  // (Los contadores por sección viven ahora en el nav del layout.)
  const { orders } = useCustomerOrders();

  const phone = customer?.phone;
  const activeOrder = orders.find((o) => ACTIVE_STATUSES.includes(o.status));

  return (
    <div className="space-y-6">
      {/* ── Saludo personalizado — complementa el hero del layout ───────── */}
      <section>
        <p className="text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          {getGreeting()}
        </p>
        <p className="mt-1 text-base text-[var(--text-secondary)] leading-relaxed">
          {phone
            ? "Acá tenes todo lo tuyo: pedidos, favoritos y direcciones guardadas."
            : "Identifícate para guardar tu carrito, ver tus pedidos y aprovechar cupones."}
        </p>
      </section>

      {/* ── Active order tracker — banner editorial destacado ─────────────── */}
      {activeOrder && (() => {
        const meta = getStatusMeta(activeOrder.status);
        const ActiveIcon = meta.Icon;
        return (
          <Link
            href="/marketplace/mi-cuenta/pedidos"
            aria-label={`Pedido ${meta.label.toLowerCase()} — ver detalles`}
            className={cn(
              "group flex items-start gap-4 rounded-2xl border-2 p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg",
              meta.bg,
              "border-[var(--rule-base)] hover:border-[var(--accent)]",
            )}
          >
            <div className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm",
              meta.color,
              "bg-white/80 dark:bg-black/30",
            )}>
              <ActiveIcon className="h-6 w-6" strokeWidth={2} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className={cn("text-[length:var(--ts-xs)] font-extrabold uppercase tracking-[var(--ls-wider)]", meta.color)}>
                  Pedido {meta.label.toLowerCase()}
                </p>
                <ArrowRight
                  className={cn("h-4 w-4 transition-transform group-hover:translate-x-0.5", meta.color)}
                  strokeWidth={2.5}
                  aria-hidden
                />
              </div>
              <p className="mt-1 text-base font-bold text-[var(--text-primary)]">
                {activeOrder.itemsCount === 1
                  ? "1 producto"
                  : `${activeOrder.itemsCount} productos`}{" "}
                · <span className="tabular-nums">S/ {Number(activeOrder.total).toFixed(2)}</span>
              </p>
              {/* Progress bar */}
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/60 dark:bg-black/30">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    activeOrder.status === "pendiente" && "bg-[var(--data-warning-500)]",
                    activeOrder.status === "confirmado" && "bg-blue-500",
                    activeOrder.status === "en_camino" && "bg-purple-500",
                  )}
                  style={{ width: `${meta.pct}%` }}
                />
              </div>
            </div>
          </Link>
        );
      })()}

      {/* ── LastOrderBanner — repetir último pedido ───────────────────────── */}
      <LastOrderBanner />

      {/* ── Datos de contacto — card editorial con iconos ──────────────────── */}
      {customer && (
        <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
                Tus datos
              </p>
              <h3 className="text-lg font-extrabold text-[var(--text-primary)] leading-snug">
                Información de contacto
              </h3>
            </div>
            <Link
              href="/marketplace/mi-cuenta/direcciones"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 h-9 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            >
              Editar
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            </Link>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-start gap-3 rounded-xl bg-[var(--surface-sunken)]/60 p-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                <User className="h-4 w-4" strokeWidth={2} aria-hidden />
              </span>
              <div className="min-w-0">
                <dt className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  Nombre
                </dt>
                <dd className="text-sm font-bold text-[var(--text-primary)] truncate">
                  {customer.name}
                </dd>
              </div>
            </div>
            {customer.phone && (
              <div className="flex items-start gap-3 rounded-xl bg-[var(--surface-sunken)]/60 p-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                  <Phone className="h-4 w-4" strokeWidth={2} aria-hidden />
                </span>
                <div className="min-w-0">
                  <dt className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                    Teléfono
                  </dt>
                  <dd className="text-sm font-bold text-[var(--text-primary)] tabular-nums truncate">
                    {customer.phone}
                  </dd>
                </div>
              </div>
            )}
            {customer.location && (
              <div className="sm:col-span-2 flex items-start gap-3 rounded-xl bg-[var(--surface-sunken)]/60 p-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                  <MapPin className="h-4 w-4" strokeWidth={2} aria-hidden />
                </span>
                <div className="min-w-0">
                  <dt className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                    Dirección
                  </dt>
                  <dd className="text-sm font-bold text-[var(--text-primary)]">
                    {customer.location}
                  </dd>
                </div>
              </div>
            )}
          </dl>
        </section>
      )}
    </div>
  );
}
