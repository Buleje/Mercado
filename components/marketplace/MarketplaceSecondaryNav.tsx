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
import { ChevronDown } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import CategoryMegaMenu from "@/components/marketplace/CategoryMegaMenu";
import { FreeShippingIndicator } from "@/components/marketplace/MarketplaceFreeShippingBar";
import { useNavScrollHide } from "@/hooks/use-nav-scroll-hide";

// ── Links rápidos de la barra secundaria ────────────────────────────────────
type QuickLink = {
  label: string;
  href: string;
  matchPrefix?: string;
};

const QUICK_LINKS: readonly QuickLink[] = [
  {
    label: "Delivery gratis",
    href: "/marketplace/explorar?delivery=free",
    matchPrefix: "/marketplace/explorar?delivery=free",
  },
  {
    label: "Ofertas",
    href: "/marketplace/ofertas",
    matchPrefix: "/marketplace/ofertas",
  },
  {
    label: "Tiendas",
    href: "/tiendas",
    matchPrefix: "/tiendas",
  },
  {
    label: "Nuevos",
    href: "/marketplace/explorar?sort=newest",
    matchPrefix: "/marketplace/explorar?sort=newest",
  },
  {
    label: "Más vendidos",
    href: "/marketplace/explorar?sort=best-sellers",
    matchPrefix: "/marketplace/explorar?sort=best-sellers",
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
    // Oculta en mobile — acceso a categorías via drawer del MarketplaceNavbar
    <div
      className={cn(
        "nav-smooth-transition hidden md:block w-full border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] sticky top-16 z-40",
        navVisible ? "translate-y-0 opacity-100" : "-translate-y-[200%] opacity-0 pointer-events-none",
      )}
    >
      <div className="relative mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-7 h-12">
          {/* ── Grupo trigger + menu con hover intent ─────────────────── */}
          <div
            className="relative"
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
                "inline-flex items-center gap-1.5 text-[15px] font-bold transition-colors h-12",
                "border-b-[3px]",
                menuOpen
                  ? "text-[var(--accent)] border-[var(--accent)]"
                  : "text-[var(--text-primary)] border-transparent hover:text-[var(--accent)] hover:border-[var(--accent)]",
              )}
            >
              Categoria
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
            className="h-4 w-px bg-[var(--rule-soft)] shrink-0"
            aria-hidden="true"
          />

          {/* ── Quick links ── */}
          <nav aria-label="Accesos rapidos del marketplace" className="flex items-center gap-5 flex-1 min-w-0">
            {QUICK_LINKS.map((link) => {
              const active = isQuickLinkActive(link);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "text-[15px] transition-colors h-12 inline-flex items-center border-b-[3px] px-1",
                    active
                      ? "font-bold text-[var(--accent)] border-[var(--accent)]"
                      : "font-semibold text-[var(--text-primary)] border-transparent hover:text-[var(--accent)] hover:border-[var(--accent)]",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* ── Indicador de envio gratis (solo si hay items en carrito) ── */}
          <div className="ml-auto">
            <FreeShippingIndicator />
          </div>
        </div>
      </div>
    </div>
  );
}
