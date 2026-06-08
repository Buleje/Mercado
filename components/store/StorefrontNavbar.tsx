"use client";

/**
 * StorefrontNavbar — barra superior de la TIENDA INDIVIDUAL (subdominio / `/t/<slug>`).
 *
 * Brandon 2026-06-07/08: SOLO dos enlaces (Inicio + Catálogo) + un buscador
 * + carrito. Cero links/buscador/sub-nav del marketplace. Es el ÚNICO nav de
 * la tienda — se usa tanto en el catálogo (vía `(store)` layout) como en la
 * landing `/t/<slug>`.
 *
 * Dos modos según el contexto:
 *  - **Chrome `(store)`** (catálogo, subdominio): props por defecto → enlaces
 *    relativos (`/`, `/tienda`) y carrito VIVO (`useCart` + abre el drawer).
 *  - **Landing `/t/<slug>`** (fuera del chrome `(store)`, sin CartProvider):
 *    se pasan `homeHref`/`catalogHref`/`searchHref` tenant-aware y un `cartHref`
 *    → el carrito se vuelve un enlace al catálogo (no usa el CartProvider).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, ShoppingCart } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useCart } from "@/contexts/cart-context";

interface StorefrontNavbarProps {
  name: string;
  logo?: string | null;
  /** Inicio de la tienda. Default `/` (subdominio/cookie). Landing → `/t/<slug>`. */
  homeHref?: string;
  /** Catálogo. Default `/tienda`. Landing → `/t/<slug>/tienda`. */
  catalogHref?: string;
  /** Buscador (lleva al catálogo). Default `/tienda#productos`. */
  searchHref?: string;
  /**
   * Si se pasa, el carrito se renderiza como ENLACE a esta URL sin usar el
   * CartProvider — para páginas fuera del chrome `(store)` (ej. la landing
   * `/t/<slug>`, que no monta StoreProviders). Si se omite → carrito vivo.
   */
  cartHref?: string;
}

export default function StorefrontNavbar({
  name,
  logo,
  homeHref = "/",
  catalogHref = "/tienda",
  searchHref = "/tienda#productos",
  cartHref,
}: StorefrontNavbarProps) {
  const initial = (name?.trim()?.charAt(0) || "T").toUpperCase();
  const pathname = usePathname() ?? "";
  // Activo en catálogo: cubre tanto `/tienda` como `/t/<slug>/tienda`.
  const onCatalog = pathname.includes("/tienda");

  const linkCls = (active: boolean) =>
    cn(
      "relative inline-flex items-center whitespace-nowrap px-2 py-1.5 text-sm font-bold transition-colors",
      active
        ? "text-[var(--text-primary)] after:absolute after:inset-x-2 after:-bottom-px after:h-[2px] after:bg-[var(--accent)]"
        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
    );

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)]">
      <div className="mx-auto flex h-14 md:h-16 max-w-[1280px] items-center gap-2 sm:gap-3 px-4 sm:px-6 lg:px-8">
        {/* Logo de la tienda → inicio */}
        <Link href={homeHref} aria-label={`${name} — inicio`} className="flex shrink-0 items-center gap-2">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--surface-sunken)] text-sm font-black text-[var(--text-secondary)]">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- avatar simple
              <img src={logo} alt="" className="h-full w-full object-cover" loading="eager" />
            ) : (
              initial
            )}
          </span>
          <span className="hidden max-w-[160px] truncate text-base font-extrabold tracking-tight text-[var(--text-primary)] md:inline">
            {name}
          </span>
        </Link>

        {/* Los DOS únicos enlaces: Inicio + Catálogo */}
        <nav aria-label="Navegación de la tienda" className="flex shrink-0 items-center gap-0.5">
          <Link href={homeHref} aria-current={!onCatalog ? "page" : undefined} className={linkCls(!onCatalog)}>
            Inicio
          </Link>
          <Link href={catalogHref} aria-current={onCatalog ? "page" : undefined} className={linkCls(onCatalog)}>
            Catálogo
          </Link>
        </nav>

        {/* Buscador de la tienda — barra estilo input que lleva al catálogo
            (donde vive el buscador real). */}
        <Link
          href={searchHref}
          aria-label="Buscar productos en la tienda"
          className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-[var(--text-tertiary)] transition-colors hover:border-[var(--text-primary)]/30"
        >
          <Search className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
          <span className="truncate text-sm font-medium">Buscar productos…</span>
        </Link>

        {/* Carrito — vivo (drawer) dentro del chrome (store); enlace al catálogo
            en la landing (donde no hay CartProvider). */}
        {cartHref ? (
          <Link
            href={cartHref}
            aria-label="Ver carrito en el catálogo"
            className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <ShoppingCart className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </Link>
        ) : (
          <LiveCartButton />
        )}
      </div>
    </header>
  );
}

/**
 * Botón de carrito VIVO — aislado en su propio componente para que `useCart`
 * (que exige CartProvider) solo se llame cuando realmente montamos el carrito
 * vivo. En la landing no se renderiza → no se necesita el provider.
 */
function LiveCartButton() {
  const { items, open: openCart } = useCart();
  const count = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <button
      type="button"
      onClick={openCart}
      aria-label={`Carrito — ${count} ${count === 1 ? "producto" : "productos"}`}
      className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      <ShoppingCart className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[length:var(--ts-2xs)] font-black tabular-nums text-white ring-2 ring-[var(--surface-raised)]">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
