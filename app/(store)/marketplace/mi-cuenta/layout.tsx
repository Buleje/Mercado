"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  User,
  Package,
  Heart,
  Tag,
  MapPin,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { useCustomer } from "@/contexts/customer-context";
import { useWishlist } from "@/hooks/use-wishlist";
import { useCustomerOrders } from "@/hooks/use-customer-orders";
import { cn } from "@/lib/utils";

// ── Secciones (cards de navegación) ─────────────────────────────────────────────
// Brandon 2026-05-31: antes era una fila de chips con overflow-x-auto → scroll
// lateral en mobile. Ahora grid 2-col de cards (todo a la vista) con contador.
// `countKey` mapea al número que muestra cada card (Perfil no lleva contador).

type CountKey = "orders" | "favorites" | "coupons" | "addresses";

const TABS: ReadonlyArray<{ label: string; href: string; Icon: LucideIcon; countKey?: CountKey }> = [
  { label: "Perfil",      href: "/marketplace/mi-cuenta",             Icon: User    },
  { label: "Pedidos",     href: "/marketplace/mi-cuenta/pedidos",     Icon: Package, countKey: "orders"    },
  { label: "Favoritos",   href: "/marketplace/mi-cuenta/favoritos",   Icon: Heart,   countKey: "favorites" },
  { label: "Cupones",     href: "/marketplace/mi-cuenta/cupones",     Icon: Tag,     countKey: "coupons"   },
  { label: "Direcciones", href: "/marketplace/mi-cuenta/direcciones", Icon: MapPin,  countKey: "addresses" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default function MiCuentaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { customer } = useCustomer();
  const router = useRouter();
  const pathname = usePathname();

  // ── Contadores por sección (reusan hooks deduplicados) ──────────────────────
  const { items: wishlistItems } = useWishlist();
  const { orders, loading: ordersLoading } = useCustomerOrders();
  const [couponsCount, setCouponsCount] = useState<number | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("marketplace-coupons:v1");
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      setCouponsCount(Array.isArray(parsed) ? parsed.length : 0);
    } catch {
      setCouponsCount(0);
    }
  }, []);
  const counts: Record<CountKey, number | null> = {
    orders: ordersLoading ? null : orders.length,
    favorites: wishlistItems.length,
    coupons: couponsCount,
    addresses: customer?.locations?.length ?? 0,
  };

  // Auth guard: sin customer → redirigir al marketplace
  useEffect(() => {
    if (customer === null) {
      router.replace("/marketplace");
    }
  }, [customer, router]);

  if (!customer) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-[var(--text-tertiary)]">Redirigiendo...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      {/* ── Hero card — avatar grande + datos clave ──────────────────────── */}
      <section className="border-b border-[var(--rule-base)] bg-linear-to-b from-[var(--accent-soft)]/40 to-transparent">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
          <div className="flex items-center gap-4 sm:gap-5">
            {/* Avatar circular con iniciales — color de marca */}
            <div className="relative shrink-0">
              <div className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-linear-to-br from-[var(--accent)] to-[var(--accent-600,var(--accent))] text-white text-2xl sm:text-3xl font-black shadow-lg shadow-[var(--accent)]/30 ring-4 ring-[var(--surface-canvas)]">
                {getInitials(customer.name)}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                Mi cuenta
              </p>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] truncate">
                {customer.name}
              </h1>
              {customer.phone && (
                <p className="mt-1 text-sm text-[var(--text-secondary)] font-medium">
                  {customer.phone}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Secciones — grid 2-col de cards (todo a la vista, sin scroll lateral).
            Direcciones ocupa la fila completa (cierra el 2-2-1). En desktop, 5
            columnas. Cada card: ícono + label + contador + estado activo. ──── */}
      <div className="mx-auto max-w-4xl px-4 pt-4 sm:px-6">
        <nav
          aria-label="Secciones de mi cuenta"
          className="grid grid-cols-2 gap-2.5 sm:grid-cols-5"
        >
          {TABS.map((tab, i) => {
            const isActive =
              tab.href === "/marketplace/mi-cuenta"
                ? pathname === "/marketplace/mi-cuenta"
                : pathname.startsWith(tab.href);
            const Icon = tab.Icon;
            const count = tab.countKey ? counts[tab.countKey] : null;
            const isLast = i === TABS.length - 1; // Direcciones → fila completa en mobile

            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-3 rounded-2xl border-2 px-3.5 h-16 transition-all active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:flex-col sm:h-auto sm:gap-1.5 sm:py-3 sm:text-center",
                  isLast && "col-span-2 sm:col-span-1",
                  isActive
                    ? "border-[var(--accent)] bg-primary/10/60 shadow-sm"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/50 hover:bg-primary/10/20",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                    isActive
                      ? "bg-[var(--accent-600,var(--accent))] text-white"
                      : "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]",
                  )}
                >
                  <Icon className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
                </span>
                <span className="min-w-0 flex-1 sm:flex-none">
                  <span
                    className={cn(
                      "block truncate text-sm font-extrabold",
                      isActive ? "text-[var(--accent)]" : "text-[var(--text-primary)]",
                    )}
                  >
                    {tab.label}
                  </span>
                  {count != null && (
                    <span className="block text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] tabular-nums">
                      {count} {count === 1 ? "ítem" : "ítems"}
                    </span>
                  )}
                </span>
                {/* Badge de contador (>0) — solo mobile, a la derecha */}
                {count != null && count > 0 && (
                  <span className="ml-auto inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[length:var(--ts-2xs)] font-black tabular-nums text-white sm:hidden">
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* ── Page content ─────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-8">{children}</div>
    </div>
  );
}
