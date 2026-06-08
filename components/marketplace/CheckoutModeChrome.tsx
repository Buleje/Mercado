"use client";

/**
 * CheckoutModeChrome — "modo checkout" para el carrito (Brandon 2026-06-08).
 *
 * El carrito (/marketplace/carrito) es el primer paso de la compra. Para que el
 * usuario se concentre en continuar, ahí ocultamos el chrome del marketplace
 * (promo bar + navbar + secondary nav + footer + bottom nav) y mostramos solo
 * un header minimal (logo + compra segura). Misma idea que el layout del
 * /checkout, pero sin mover la URL.
 *
 * Client components (usan usePathname) montados dentro del (store) layout
 * (server) — mismo patrón que los Conditional* existentes.
 */

import { usePathname } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { ShieldCheck } from "@buleje/design-system/icons";

const CHECKOUT_MODE_PATHS = ["/marketplace/carrito"];

function isCheckoutMode(pathname: string): boolean {
  return CHECKOUT_MODE_PATHS.includes(pathname);
}

/** Oculta a sus hijos cuando estamos en una ruta "modo checkout" (carrito). */
export function HideInCheckoutMode({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  if (isCheckoutMode(pathname)) return null;
  return <>{children}</>;
}

/** Header minimal — SOLO en modo checkout. Logo (→ inicio) + sello de confianza. */
export function CheckoutModeBar() {
  const pathname = usePathname() ?? "";
  if (!isCheckoutMode(pathname)) return null;
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--surface-canvas)]/80">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
        <Link
          href="/"
          aria-label="Buleje — Ir al inicio"
          className="inline-flex items-center gap-2"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent)] text-white text-base font-black">
            B
          </span>
          <span className="text-lg font-black tracking-[-0.02em] text-[var(--text-primary)]">
            Buleje
          </span>
        </Link>
        <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] font-bold text-[var(--text-tertiary)]">
          <ShieldCheck className="h-4 w-4 text-[var(--accent)]" strokeWidth={2} aria-hidden />
          <span className="hidden sm:inline">Compra segura</span>
        </span>
      </div>
    </header>
  );
}
