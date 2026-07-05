"use client";

/**
 * MarketplaceSecondaryNav.tsx — Barra secundaria debajo del header principal.
 *
 * Desktop: chips de CATEGORÍAS reales (las más populares, según lo que más se
 * compra) + trigger "Categorías" (hover/click → CategoryMegaMenu con TODAS).
 * Brandon 2026-06-13: se quitaron los atajos Nuevos/Más vendidos/Mejor precio/
 * Cerca de mí — en su lugar van categorías del gusto del usuario (top por
 * popularidad), que filtran el catálogo de la home.
 * Mobile: oculta la barra. El acceso a categorías va por el drawer del navbar.
 *
 * Sticky a top-16 (altura del MarketplaceNavbar) con z-40.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, LayoutGrid } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { cachedJson } from "@/lib/client-cache-fetch";
import CategoryMegaMenu from "@/components/marketplace/CategoryMegaMenu";
import { FreeShippingIndicator } from "@/components/marketplace/MarketplaceFreeShippingBar";
import { useHideOnScroll } from "@/hooks/use-hide-on-scroll";

// Cantidad de categorías inline en el sub-nav (el resto vive en el mega-menú
// "Categorías"). Vienen ordenadas por popularidad (lo que más se compra) desde
// el endpoint. Personalización per-usuario = pendiente (ver nota abajo).
const INLINE_CATEGORY_COUNT = 8;

interface RealCategory {
  id: string;
  count: number;
}

/** "pollo-brasa" → "Pollo brasa" · "bebidas" → "Bebidas" */
function prettyCategoryLabel(id: string): string {
  const spaced = id.replace(/[-_]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// ── Componente ───────────────────────────────────────────────────────────────
export default function MarketplaceSecondaryNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hoverCloseTimer = useRef<number | null>(null);
  // Se oculta/aparece en sincronía con el navbar (mismo hook de dirección).
  const hidden = useHideOnScroll();

  // Categorías reales del catálogo, por POPULARIDAD (lo que más se compra), que
  // ya es una señal de "lo que le interesa a la mayoría". Mismo endpoint que el
  // mega-menú (cacheado 5min). Solo con ≥1 producto.
  //
  // NOTA (Brandon 2026-06-13): la personalización per-usuario (afinidad por
  // historial) quedó PENDIENTE — los endpoints de recomendación existentes son
  // per-tienda (/personalized exige tenant de tienda) o session-gated (/for-me
  // exige cookie buleje-customer-sess, que el customer localStorage no tiene).
  // Hace falta un endpoint marketplace-wide de afinidad por categoría. Por ahora:
  // orden por popularidad (degradación honesta, sin fetch roto).
  const [categories, setCategories] = useState<RealCategory[]>([]);
  useEffect(() => {
    let cancelled = false;
    cachedJson<{ categories?: RealCategory[] }>(
      "/api/marketplace/product-categories",
      300_000,
    )
      .then((d) => {
        if (cancelled || !d) return;
        const real = (d.categories ?? []).filter((c) => c.id && c.count > 0);
        setCategories(real.slice(0, INLINE_CATEGORY_COUNT));
      })
      .catch(() => {/* no crítico: la barra queda solo con el mega-menú */});
    return () => { cancelled = true; };
  }, []);

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

  return (
    // Desktop: mega-menú de categorías + accesos rápidos. FIJO (Brandon
    // 2026-06-07): sin auto-hide al scrollear — permanece pegado bajo el nav.
    // Mismo surface que el navbar (raised) para que lean como un bloque
    // unificado; separación interna con un hairline soft.
    // El sticky bar es `w-full` y `position: sticky` (containing block para el
    // panel absolute) → el mega-menú full-width se ancla a SUS bordes = bordes
    // del viewport. Por eso el render del panel se movió aquí, fuera del wrapper
    // angosto del trigger (Brandon 2026-06-10).
    // Responsive (Brandon 2026-06-10): de tablet (md) hacia arriba. En móvil
    // (<md) la sub-nav de categorías de PRODUCTO la aporta MarketplaceCategoriesBar
    // (no duplicar). Acá los filtros scrollean en horizontal si no caben en
    // tablet; "Categorías" queda SIEMPRE fijo a la derecha.
    <div
      style={{
        transform: hidden ? "translateY(-8rem)" : "translateY(0)",
        opacity: hidden ? 0 : 1,
        transition:
          "transform 0.7s cubic-bezier(0.65, 0, 0.35, 1), opacity 0.45s ease",
        willChange: "transform, opacity",
      }}
      className="hidden md:block w-full border-b border-[var(--rule-soft)] bg-[var(--surface-raised)] sticky top-16 z-40"
    >
      {/* Brandon 2026-06-14: contenido centrado al MISMO ancho que el catálogo
          y las secciones (max-w-[1760px]) para que nav, sub-nav y contenido
          queden alineados. El mega-menú full-width es hermano (queda full). */}
      <div className="relative mx-auto w-full max-w-[1760px] px-4 sm:px-6 lg:px-8">
        {/* Brandon 2026-06-25: sub-nav CLARO (revertido del oscuro). Fila de
            contenido sin `dark` → chips/trigger usan tokens light del DS. */}
        <div className="flex items-center gap-2 lg:gap-4 h-9">
          {/* ── Chips de CATEGORÍAS populares — scrolleables si no caben.
               Filtran el catálogo de la home vía /?category=<id>#catalogo
               (CatalogUrlSync aplica el filtro y baja a #catalogo). ── */}
          <nav
            aria-label="Categorías populares"
            className="flex items-center gap-0.5 sm:gap-1 min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {/* Solo TEXTO (sin iconos) — Brandon 2026-06-13. */}
            {categories.map((cat) => (
              <Link
                key={cat.id}
                href={`/?category=${encodeURIComponent(cat.id)}#catalogo`}
                className="shrink-0 whitespace-nowrap inline-flex items-center border-b-2 border-transparent px-2 sm:px-2.5 h-7 text-[13px] sm:text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
              >
                {prettyCategoryLabel(cat.id)}
              </Link>
            ))}
          </nav>

          {/* ── Separación sutil entre chips y el mega-menú "Categorías". ── */}
          <div
            className="h-5 w-px bg-[var(--rule-soft)] shrink-0"
            aria-hidden="true"
          />

          {/* ── Trigger "Categorías" — SIEMPRE fijo a la derecha (shrink-0). ── */}
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
              aria-label="Ver todas las categorías"
              onClick={() => setMenuOpen((o) => !o)}
              onFocus={openMenu}
              className={cn(
                "inline-flex items-center gap-1.5 sm:gap-2 rounded-full px-3 sm:px-3.5 h-7 text-[13px] sm:text-sm font-bold tracking-tight transition-colors",
                menuOpen
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface-canvas)] text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]",
              )}
            >
              {/* Brandon 2026-07-05 (audit navegación): "Categorías" → "Ver todas".
                  Los chips de la izquierda YA son categorías; un botón también
                  rotulado "Categorías" al lado se leía redundante. "Ver todas"
                  deja claro que abre el listado completo. */}
              <LayoutGrid className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
              <span className="hidden sm:inline">Ver todas</span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 transition-transform duration-150",
                  menuOpen && "rotate-180",
                )}
                strokeWidth={2}
                aria-hidden="true"
              />
            </button>
          </div>

          {/* ── Envío gratis — solo desktop (ahorra espacio en móvil/tablet).
               Brandon 2026-07-05 (audit navegación): divisor propio + `pl-1`
               para que se lea como un módulo aparte y no apretado contra el
               botón de categorías (antes se veía exprimido al extremo). ── */}
          <div
            className="hidden lg:block h-5 w-px bg-[var(--rule-soft)] shrink-0"
            aria-hidden="true"
          />
          <div className="hidden lg:block shrink-0 pl-1">
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
