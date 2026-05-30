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
  Truck,
  Sparkles,
  Flame,
  MapPin,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import CategoryMegaMenu from "@/components/marketplace/CategoryMegaMenu";
import { FreeShippingIndicator } from "@/components/marketplace/MarketplaceFreeShippingBar";
import { useNavScrollHide } from "@/hooks/use-nav-scroll-hide";

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

const QUICK_LINKS: readonly QuickLink[] = [
  {
    label: "Delivery gratis",
    href: "/marketplace/explorar?delivery=free",
    icon: Truck,
    matchPrefix: "/marketplace/explorar?delivery=free",
  },
  {
    label: "Nuevos",
    href: "/marketplace/explorar?sort=newest",
    icon: Sparkles,
    matchPrefix: "/marketplace/explorar?sort=newest",
  },
  {
    label: "Más vendidos",
    href: "/marketplace/explorar?sort=best-sellers",
    icon: Flame,
    matchPrefix: "/marketplace/explorar?sort=best-sellers",
  },
  {
    label: "Cerca de mí",
    href: "/tiendas?zone=true",
    icon: MapPin,
    matchPrefix: "/tiendas?zone=true",
  },
] as const;

// ── Componente ───────────────────────────────────────────────────────────────
export default function MarketplaceSecondaryNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hoverCloseTimer = useRef<number | null>(null);
  const pathname = usePathname();
  const navVisible = useNavScrollHide(80);

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
    // Desktop: mega-menú de categorías + accesos rápidos
    <div
      className={cn(
        "nav-smooth-transition hidden md:block w-full border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] sticky top-16 z-40",
        navVisible ? "translate-y-0 opacity-100" : "-translate-y-[200%] opacity-0 pointer-events-none",
      )}
    >
      <div className="relative mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-5 h-12">
          {/* ── Trigger "Categorías" — pill primario con hover intent ──────── */}
          <div
            className="relative shrink-0"
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
                "inline-flex items-center gap-2 rounded-full border px-3.5 h-9 text-sm font-bold tracking-tight transition-colors",
                menuOpen
                  ? "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)]"
                  : "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)]",
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

            {/* Mega menu anclado a este wrapper — el MouseEnter del panel
                cancela el cierre programado para que no se cierre al moverse
                entre trigger y panel. */}
            <div
              id="category-mega-menu"
              onMouseEnter={cancelScheduledClose}
              onMouseLeave={scheduleClose}
            >
              <CategoryMegaMenu open={menuOpen} onClose={closeMenu} />
            </div>
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
                      : "font-semibold text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--surface-canvas)]",
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
    </div>
  );
}
