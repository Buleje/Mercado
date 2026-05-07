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

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Package,
  Heart,
  Tag,
  MapPin,
  Truck,
  Clock,
  CheckCircle2,
  ArrowRight,
} from "@buleje/design-system/icons";
import { useCustomer } from "@/contexts/customer-context";
import { useWishlist } from "@/hooks/use-wishlist";
import { useCustomerOrders } from "@/hooks/use-customer-orders";
import { LastOrderBanner } from "@/components/marketplace/mi-cuenta/LastOrderBanner";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type OrderStatus = "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado";

interface StatCard {
  label: string;
  value: string;
  href: string;
  description: string;
  Icon: React.ElementType;
  hasData: boolean;
}

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
  const { items: wishlistItems } = useWishlist();
  // Sprint 7: singleton compartido — un solo fetch para mi-cuenta + LastOrderBanner
  const { orders, loading: ordersLoading } = useCustomerOrders();
  const [couponsCount, setCouponsCount] = useState<number | null>(null);

  const favoritesCount = wishlistItems.length;
  const addressesCount = customer?.locations?.length ?? 0;
  const phone = customer?.phone;
  const ordersCount = ordersLoading ? null : orders.length;
  const activeOrder = orders.find((o) => ACTIVE_STATUSES.includes(o.status));

  // ── Cupones (localStorage) ────────────────────────────────────────────────

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("marketplace-coupons:v1");
      if (!raw) {
        setCouponsCount(0);
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      setCouponsCount(Array.isArray(parsed) ? parsed.length : 0);
    } catch {
      setCouponsCount(0);
    }
  }, []);

  // ── Stat cards ────────────────────────────────────────────────────────────

  const formatCount = (n: number | null): string => (n === null ? "..." : String(n));

  const stats: StatCard[] = [
    {
      label: "Pedidos",
      value: formatCount(ordersCount),
      href: "/marketplace/mi-cuenta/pedidos",
      description:
        ordersCount === null
          ? "Cargando..."
          : ordersCount > 0
            ? "Ver tu historial"
            : phone
              ? "Aún sin pedidos"
              : "Identifícate para ver",
      Icon: Package,
      hasData: (ordersCount ?? 0) > 0,
    },
    {
      label: "Favoritos",
      value: String(favoritesCount),
      href: "/marketplace/mi-cuenta/favoritos",
      description: favoritesCount > 0 ? "Ver guardados" : "Aún sin guardados",
      Icon: Heart,
      hasData: favoritesCount > 0,
    },
    {
      label: "Cupones",
      value: formatCount(couponsCount),
      href: "/marketplace/mi-cuenta/cupones",
      description:
        couponsCount === null
          ? "Cargando..."
          : couponsCount > 0
            ? "Ver disponibles"
            : "Sin cupones por ahora",
      Icon: Tag,
      hasData: (couponsCount ?? 0) > 0,
    },
    {
      label: "Direcciones",
      value: String(addressesCount),
      href: "/marketplace/mi-cuenta/direcciones",
      description: addressesCount > 0 ? "Gestionar" : "Agregar una dirección",
      Icon: MapPin,
      hasData: addressesCount > 0,
    },
  ];

  return (
    <div>
      {/* ── Hero greeting ─────────────────────────────────────────────────── */}
      <section className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
          {getGreeting()}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
          {customer?.name ? `Hola, ${customer.name.split(" ")[0]}` : "Bienvenido"}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {phone
            ? "Tu marketplace, tus pedidos y tus tiendas favoritas."
            : "Identifícate para guardar tu carrito, ver tus pedidos y aprovechar cupones."}
        </p>
      </section>

      {/* ── Active order tracker (MK-27) ──────────────────────────────────── */}
      {activeOrder && (() => {
        const meta = getStatusMeta(activeOrder.status);
        const ActiveIcon = meta.Icon;
        return (
          <Link
            href="/marketplace/mi-cuenta/pedidos"
            aria-label={`Pedido ${meta.label.toLowerCase()} — ver detalles`}
            className={cn(
              "mb-4 flex items-start gap-3 rounded-xl border p-4 transition-colors hover:border-[var(--accent)]/40",
              meta.bg,
              "border-[var(--rule-soft)]",
            )}
          >
            <div className={cn("rounded-lg p-2", meta.color, "bg-white/60 dark:bg-black/20")}>
              <ActiveIcon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className={cn("text-xs font-bold uppercase tracking-wider", meta.color)}>
                  Pedido {meta.label.toLowerCase()}
                </p>
                <ArrowRight className={cn("h-4 w-4", meta.color)} strokeWidth={2} aria-hidden />
              </div>
              <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                {activeOrder.itemsCount === 1
                  ? "1 producto"
                  : `${activeOrder.itemsCount} productos`}{" "}
                · S/ {Number(activeOrder.total).toFixed(2)}
              </p>
              {/* Progress bar */}
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/60 dark:bg-black/20">
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

      {/* ── Stat cards con iconos ─────────────────────────────────────────── */}
      <h2 className="mb-3 text-base font-semibold text-[var(--text-primary)]">
        Resumen
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => {
          const StatIcon = stat.Icon;
          return (
            <Link
              key={stat.href}
              href={stat.href}
              className={cn(
                "group flex flex-col rounded-xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-sm",
                stat.hasData
                  ? "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/40"
                  : "border-dashed border-[var(--rule-soft)] bg-[var(--surface-canvas)] hover:border-[var(--rule-base)]",
              )}
            >
              <div
                className={cn(
                  "mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg",
                  stat.hasData
                    ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
                )}
              >
                <StatIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </div>
              <p className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">
                {stat.value}
              </p>
              <p className="mt-0.5 text-sm font-medium text-[var(--text-secondary)]">
                {stat.label}
              </p>
              <p className="mt-1 text-xs text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]">
                {stat.description}
              </p>
            </Link>
          );
        })}
      </div>

      {/* ── Datos de contacto ─────────────────────────────────────────────── */}
      {customer && (
        <div className="mt-6 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
            Datos de contacto
          </h3>
          <dl className="space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="w-24 text-[var(--text-tertiary)]">Nombre</dt>
              <dd className="text-[var(--text-primary)]">{customer.name}</dd>
            </div>
            {customer.phone && (
              <div className="flex gap-2">
                <dt className="w-24 text-[var(--text-tertiary)]">Teléfono</dt>
                <dd className="text-[var(--text-primary)]">{customer.phone}</dd>
              </div>
            )}
            {customer.location && (
              <div className="flex gap-2">
                <dt className="w-24 text-[var(--text-tertiary)]">Dirección</dt>
                <dd className="text-[var(--text-primary)]">{customer.location}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}
