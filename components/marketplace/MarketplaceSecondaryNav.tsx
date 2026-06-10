"use client";

/**
 * MarketplaceSecondaryNav.tsx — Barra secundaria debajo del header principal.
 *
 * Desktop: trigger "Categoria" (hover/click → CategoryMegaMenu) + links rápidos.
 * Mobile: oculta la barra. El acceso a categorías va por el drawer del navbar.
 *
 * Sticky a top-16 (altura del MarketplaceNavbar) con z-40.
 * Holded style: sin colores variados, sin sombra, texto sm, hover underline accent.
 */

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  LayoutGrid,
  Banknote,
  Sparkles,
  Flame,
  MapPin,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import CategoryMegaMenu from "@/components/marketplace/CategoryMegaMenu";
import { FreeShippingIndicator } from "@/components/marketplace/MarketplaceFreeShippingBar";

// ── Filtros rápidos de la barra secundaria ───────────────────────────────────
// REGLA "sin repetir": acá NO van "Ofertas" ni "Tiendas" — ambos ya son links
// del nav principal (PRIMARY_LINKS en MarketplaceNavbar). El sub-nav es
// complementario: el mega-menú de Categorías + atajos de filtrado del catálogo
// que el nav no ofrece. Brandon 2026-05-30.
type QuickLink = {
  label: string;
  href: string;
  icon: LucideIcon;
  matchPrefix?: string;
};

// Atajos de filtrado del catálogo de la home. Apuntan a /?sort=X#catalogo: el
// CatalogUrlSync aplica el orden + baja a #catalogo. Antes iban a /explorar, que
// redirigía a la home BOTANDO el filtro (Brandon 2026-06-08, fix opción A).
// Sin matchPrefix: usePathname() no ve el ?query, así que nunca matcheaban; son
// filtros transitorios, no una página destino → no se resaltan.
const QUICK_LINKS: readonly QuickLink[] = [
  {
    label: "Nuevos",
    href: "/?sort=newest#catalogo",
    icon: Sparkles,
  },
  {
    label: "Más vendidos",
    href: "/?sort=popular#catalogo",
    icon: Flame,
  },
  {
    label: "Mejor precio",
    href: "/?sort=price_asc#catalogo",
    icon: Banknote,
  },
  {
    label: "Cerca de mí",
    href: "/tiendas?zone=true",
    icon: MapPin,
    matchPrefix: "/tiendas",
  },
] as const;

// ── Componente ───────────────────────────────────────────────────────────────
export default function MarketplaceSecondaryNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hoverCloseTimer = useRef<number | null>(null);
  const pathname = usePathname();

  const openMenu = useCallback(() => {
    if (hoverCloseTimer.current !== null) {
      window.clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
    setMenuOpen(true);
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Cierre con delay al salir del grupo trigger+menu — evita cierres falsos
  // cuando el mouse pasa por el gap entre trigger y panel.
  const scheduleClose = useCallback(() => {
    if (hoverCloseTimer.current !== null) return;
    hoverCloseTimer.current = window.setTimeout(() => {
      setMenuOpen(false);
      hoverCloseTimer.current = null;
    }, 250);
  }, []);

  const cancelScheduledClose = useCallback(() => {
    if (hoverCloseTimer.current !== null) {
      window.clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
  }, []);

  const isQuickLinkActive = (link: QuickLink) => {
    if (!pathname) return false;
    if (link.matchPrefix) return pathname.startsWith(link.matchPrefix);
    return false;
  };

  return (
    // Desktop: mega-menú de categorías + accesos rápidos. FIJO (Brandon
    // 2026-06-07): sin auto-hide al scrollear — permanece pegado bajo el nav.
    // Mismo surface que el navbar (raised) para que lean como un bloque
    // unificado; separación interna con un hairline soft.
    // El sticky bar es `w-full` y `position: sticky` (containing block para el
    // panel absolute) → el mega-menú full-width se ancla a SUS bordes = bordes
    // del viewport. Por eso el render del panel se movió aquí, fuera del wrapper
    // angosto del trigger (Brandon 2026-06-10).
    <div className="hidden md:block w-full border-b border-[var(--rule-soft)] bg-[var(--surface-raised)] sticky top-16 z-40">
      <div className="relative w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-5 h-12">
          {/* ── Trigger "Categorías" — pill primario con hover intent ──────── */}
          <div
            className="shrink-0"
            onMouseEnter={openMenu}
            onMouseLeave={scheduleClose}
          >
            <button
              ref={triggerRef}
              type="button"
              aria-haspopup="true"
              aria-expanded={menuOpen}
              aria-controls="category-mega-menu"
              onClick={() => setMenuOpen((o) => !o)}
              onFocus={openMenu}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3.5 h-9 text-sm font-bold tracking-tight transition-colors",
                menuOpen
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface-canvas)] text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]",
              )}
            >
              <LayoutGrid className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              Categorías
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform duration-150",
                  menuOpen && "rotate-180",
                )}
                strokeWidth={2}
                aria-hidden="true"
              />
            </button>
          </div>

          {/* Separador vertical sutil */}
          <div
            className="h-5 w-px bg-[var(--rule-base)] shrink-0"
            aria-hidden="true"
          />

          {/* ── Filtros rápidos (icono + label, sin repetir el nav) ── */}
          <nav
            aria-label="Filtros rápidos del marketplace"
            className="flex items-center gap-1 flex-1 min-w-0"
          >
            {QUICK_LINKS.map((link) => {
              const active = isQuickLinkActive(link);
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 h-9 text-sm transition-colors",
                    active
                      ? "font-bold text-[var(--accent)] bg-[var(--accent)]/10"
                      : "font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
                  )}
                >
                  <Icon
                    className="h-4 w-4 shrink-0"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* ── Indicador de envio gratis (solo si hay items en carrito) ── */}
          <div className="ml-auto shrink-0">
            <FreeShippingIndicator />
          </div>
        </div>
      </div>

      {/* Mega-menú FULL-WIDTH — hermano del contenedor con padding, hijo directo
          del sticky bar (su containing block). Así el panel `absolute left-0
          right-0` abarca el 100% del ancho del viewport. El MouseEnter del panel
          cancela el cierre programado para no cerrarse al moverse trigger→panel. */}
      <div
        id="category-mega-menu"
        onMouseEnter={cancelScheduledClose}
        onMouseLeave={scheduleClose}
      >
        <CategoryMegaMenu open={menuOpen} onClose={closeMenu} />
      </div>
    </div>
  );
}
