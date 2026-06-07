"use client";

/**
 * StorefrontNavbar — barra superior de la TIENDA INDIVIDUAL (subdominio / `/t/<slug>`).
 *
 * Brandon 2026-06-07: la tienda individual del comerciante NO usa el nav del
 * marketplace (buscador global, sub-nav de categorías, links a /tiendas ·
 * /marketplace). Esta barra es su propio mundo: logo + nombre de la tienda
 * (→ su catálogo), buscar en ESTA tienda y carrito. Cero links al marketplace.
 *
 * Carrito: usa el contexto LEGACY de la tienda individual (`useCart` + CartSidebar),
 * que es el que alimenta su catálogo (ProductCatalog) y el MobileBottomNav. NO el
 * carrito del marketplace (useMarketplaceCart) → así el contador coincide.
 *
 * Se monta SOLO cuando el layout detecta `isTenant`.
 */

import Link from "next/link";
import { Search, UserCircle, ShoppingCart } from "@buleje/design-system/icons";
import { useCart } from "@/contexts/cart-context";

export default function StorefrontNavbar({
  name,
  logo,
}: {
  name: string;
  logo?: string | null;
}) {
  const { items, open: openCart } = useCart();
  const count = items.reduce((s, i) => s + i.quantity, 0);
  const initial = (name?.trim()?.charAt(0) || "T").toUpperCase();

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)]">
      <div className="mx-auto flex h-14 md:h-16 max-w-[1280px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        {/* Identidad de la tienda → su catálogo */}
        <Link
          href="/tienda"
          aria-label={`${name} — inicio`}
          className="flex min-w-0 shrink items-center gap-2.5"
        >
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--surface-sunken)] text-sm font-black text-[var(--text-secondary)]">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- avatar simple, sin next/image overhead
              <img src={logo} alt="" className="h-full w-full object-cover" loading="eager" />
            ) : (
              initial
            )}
          </span>
          <span className="truncate text-base font-extrabold tracking-tight text-[var(--text-primary)]">
            {name}
          </span>
        </Link>

        <div className="flex-1" />

        {/* Buscar en ESTA tienda — salta al catálogo (que trae su propio buscador). */}
        <a
          href="#productos"
          aria-label="Buscar en la tienda"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          <Search className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </a>

        {/* Cuenta (en celular vive en el bottom-nav) */}
        <Link
          href="/cuenta"
          aria-label="Mi cuenta"
          className="hidden h-10 w-10 items-center justify-center rounded-full text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:inline-flex"
        >
          <UserCircle className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </Link>

        {/* Carrito — abre el CartSidebar legacy de la tienda (mismo cart del catálogo). */}
        <button
          type="button"
          onClick={openCart}
          aria-label={`Carrito — ${count} ${count === 1 ? "producto" : "productos"}`}
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          <ShoppingCart className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[length:var(--ts-2xs)] font-black tabular-nums text-white ring-2 ring-[var(--surface-raised)]">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
