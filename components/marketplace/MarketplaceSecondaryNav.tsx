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
    label: "Mas vendidos",
    href: "/marketplace/explorar?sort=best-sellers",
    matchPrefix: "/marketplace/explorar?sort=best-sellers",
  },
] as const;

// ── Componente ───────────────────────────────────────────────────────────────
export default function MarketplaceSecondaryNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    triggerRef.current?.focus();
  }, []);

  const isQuickLinkActive = (link: QuickLink) => {
    if (!pathname) return false;
    if (link.matchPrefix) return pathname.startsWith(link.matchPrefix);
    return false;
  };

  return (
    // Oculta en mobile — acceso a categorías via drawer del MarketplaceNavbar
    <div className="hidden md:block w-full border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] sticky top-16 z-40">
      <div className="relative mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6 h-11">
          {/* ── Trigger "Categoria" con chevron ── */}
          <div className="relative">
            <button
              ref={triggerRef}
              type="button"
              aria-haspopup="true"
              aria-expanded={menuOpen}
              aria-controls="category-mega-menu"
              onMouseEnter={openMenu}
              onClick={() => setMenuOpen((o) => !o)}
              className={cn(
                "inline-flex items-center gap-1 text-sm font-semibold transition-colors h-11",
                "border-b-2",
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

            {/* El mega menu sale relativo a este wrapper */}
            <div id="category-mega-menu" onMouseLeave={closeMenu}>
              <CategoryMegaMenu open={menuOpen} onClose={closeMenu} />
            </div>
          </div>

          {/* Separador vertical sutil */}
          <div
            className="h-4 w-px bg-[var(--rule-soft)] shrink-0"
            aria-hidden="true"
          />

          {/* ── Quick links ── */}
          <nav aria-label="Accesos rapidos del marketplace" className="flex items-center gap-5">
            {QUICK_LINKS.map((link) => {
              const active = isQuickLinkActive(link);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "text-sm transition-colors h-11 inline-flex items-center border-b-2",
                    active
                      ? "font-semibold text-[var(--accent)] border-[var(--accent)]"
                      : "font-medium text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)] hover:border-[var(--rule-mid)]",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
}
