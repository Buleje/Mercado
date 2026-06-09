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
import type { ReactNode } from "react";
import CheckoutTopBar from "@/components/marketplace/checkout/CheckoutTopBar";

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

/**
 * Header del carrito en modo checkout — MISMA barra que /checkout (logo wordmark
 * + stepper + trust badge), con el stepper en el paso "carrito". Unifica la barra
 * de arriba entre carrito y finalizar. Brandon 2026-06-08.
 */
export function CheckoutModeBar() {
  const pathname = usePathname() ?? "";
  if (!isCheckoutMode(pathname)) return null;
  return <CheckoutTopBar current="carrito" />;
}
