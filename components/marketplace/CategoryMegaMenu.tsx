"use client";

/**
 * CategoryMegaMenu.tsx — Mega-panel de categorías del sub-nav.
 *
 * Diseño v5 2026-06-07 (Brandon: "minimalista, sólido, sin bordes sombreados"):
 *   - Solo categorías REALES con ≥1 producto publicado
 *     (/api/marketplace/product-categories) → si una categoría no tiene
 *     productos, NO aparece. Cero categorías decorativas.
 *   - Tiles sólidos (surface-sunken), sin border-2 ni shadow; hover = accent-soft.
 *   - Panel con borde hairline + sombra mínima (lo justo para un dropdown).
 *   - Sección "Tiendas destacadas" + accesos rápidos (limpios, sin sombras).
 *
 * A11y: Esc cierra, click fuera cierra, scroll>40px cierra.
 * Iconos: SIEMPRE desde @buleje/design-system/icons (ADR-075).
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Sparkles,
  Store,
  Tag,
  TrendingUp,
  Banknote,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { getProductCategoryIcon } from "@/components/marketplace/_category-icons";
import { cachedJson } from "@/lib/client-cache-fetch";

export type CategoryMegaMenuProps = {
  open: boolean;
  onClose: () => void;
};

interface RealCategory {
  id: string;
  count: number;
}

/** "pollo-brasa" → "Pollo brasa" · "bebidas" → "Bebidas" */
function prettyLabel(id: string): string {
  const spaced = id.replace(/[-_]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// Accesos rápidos del menú. Apuntan al catálogo de la home con ?sort (el
// CatalogUrlSync lo aplica + baja a #catalogo). Antes iban a /explorar, que
// redirigía a la home BOTANDO el filtro (Brandon 2026-06-08, fix opción A).
const QUICK_LINKS = [
  { href: "/marketplace/ofertas", label: "Ofertas", Icon: Tag },
  { href: "/?sort=popular#catalogo", label: "Más vendidos", Icon: TrendingUp },
  { href: "/?sort=newest#catalogo", label: "Nuevos", Icon: Sparkles },
  { href: "/?sort=price_asc#catalogo", label: "Mejor precio", Icon: Banknote },
] as const;

type FeaturedStore = {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  category?: string;
};

export default function CategoryMegaMenu({ open, onClose }: CategoryMegaMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [stores, setStores] = useState<FeaturedStore[] | null>(null);
  const [categories, setCategories] = useState<RealCategory[] | null>(null);

  // Esc cierra
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Click fuera cierra
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const id = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", handler);
    };
  }, [open, onClose]);

  // Scroll>40px cierra (evita "menu en el aire" cuando el sub-nav se oculta).
  useEffect(() => {
    if (!open) return;
    const startY = window.scrollY;
    const onScroll = () => {
      if (Math.abs(window.scrollY - startY) > 40) onClose();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [open, onClose]);

  // Fetch lazy de categorías REALES (con productos) — solo la 1ª vez que abre.
  useEffect(() => {
    if (!open || categories !== null) return;
    let alive = true;
    cachedJson<{ categories?: RealCategory[] }>(
      "/api/marketplace/product-categories",
      300_000,
    )
      .then((d) => {
        if (!alive) return;
        setCategories((d?.categories ?? []).filter((c) => c.id && c.count > 0));
      })
      .catch(() => {
        if (alive) setCategories([]);
      });
    return () => {
      alive = false;
    };
  }, [open, categories]);

  // Fetch lazy de tiendas destacadas — solo la primera vez que abre.
  useEffect(() => {
    if (!open || stores !== null) return;
    let alive = true;
    fetch("/api/marketplace/featured-stores?limit=8&productsPerStore=0")
      .then((r) => (r.ok ? r.json() : { stores: [] }))
      .then((data: { stores?: FeaturedStore[] }) => {
        if (alive) setStores(data.stores ?? []);
      })
      .catch(() => {
        if (alive) setStores([]);
      });
    return () => {
      alive = false;
    };
  }, [open, stores]);

  if (!open) return null;

  return (
    <>
      {/* Brandon 2026-06-08: overlay `fixed inset-0` REMOVIDO. Era hijo del
          wrapper que tiene onMouseLeave y, al cubrir TODA la pantalla, el mouse
          nunca "salía" del wrapper → el menú jamás se cerraba al alejarse (había
          que clickear afuera). El click-fuera ya lo cubre el listener `mousedown`
          (panelRef) de arriba, así que el overlay sobraba y rompía el hover-out. */}

      {/* Panel FULL-WIDTH (Brandon 2026-06-10): abarca el 100% del ancho del
          viewport (edge-to-edge), altura auto según contenido. Anclado a la
          barra secundaria sticky (su padre con position) vía left-0 right-0.
          El FONDO va de borde a borde; el CONTENIDO se centra con max-w para
          alinear con el resto de la página. */}
      <div
        ref={panelRef}
        role="menu"
        aria-label="Categorías del marketplace"
        className={cn(
          "absolute top-full left-0 right-0 z-50 origin-top",
          "bg-[var(--surface-canvas)] overflow-hidden",
          "border-b border-[var(--rule-base)]",
          "shadow-[0_18px_32px_-20px_rgba(0,0,0,0.22)]",
          "animate-[scaleIn_.18s_ease-out]",
        )}
      >
        <div className="mx-auto max-w-[1760px] px-4 sm:px-6 lg:px-8 py-6 sm:py-7">
          {/* Header */}
          <div className="flex items-baseline justify-between gap-4 mb-4">
            <h2 className="text-lg font-black tracking-[-0.02em] text-[var(--text-primary)]">
              Explora por categoría
            </h2>
            <Link
              href="/#catalogo"
              role="menuitem"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] px-4 h-9 text-xs font-bold text-[var(--accent)] hover:bg-[var(--surface-raised)] transition-colors shrink-0"
            >
              Ver todo el catálogo
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </Link>
          </div>

          {/* Grid de categorías REALES — tiles sólidos, sin bordes ni sombras */}
          {categories === null ? (
            // Skeleton mientras carga
            <ul className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <li key={i} aria-hidden>
                  <div className="h-[68px] rounded-xl bg-[var(--surface-sunken)] animate-pulse" />
                </li>
              ))}
            </ul>
          ) : categories.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)] py-2">
              Pronto vas a ver categorías con productos aquí.
            </p>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2.5">
              {categories.map((cat) => {
                const Icon = getProductCategoryIcon(cat.id.toLowerCase());
                return (
                  <li key={cat.id}>
                    <Link
                      href={`/marketplace/buscar?cat=${encodeURIComponent(cat.id)}`}
                      role="menuitem"
                      onClick={onClose}
                      className="group flex items-center gap-3 bg-[var(--surface-sunken)] p-3 transition-colors hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                    >
                      <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--surface-raised)] text-[var(--accent)] shrink-0 transition-colors group-hover:bg-[var(--surface-canvas)]">
                        <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-extrabold tracking-tight text-[var(--text-primary)] line-clamp-1">
                          {prettyLabel(cat.id)}
                        </span>
                        <span className="block text-[11px] font-semibold text-[var(--text-tertiary)] tabular-nums">
                          {cat.count} {cat.count === 1 ? "producto" : "productos"}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Tiendas destacadas — rail de logos */}
          <div className="mt-6 pt-5 border-t border-[var(--rule-soft)]">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                <Store className="h-3.5 w-3.5" aria-hidden />
                Tiendas destacadas
              </p>
              <Link
                href="/tiendas"
                role="menuitem"
                onClick={onClose}
                className="inline-flex items-center gap-1 text-xs font-bold text-[var(--accent)] hover:gap-1.5 transition-all"
              >
                Ver todas
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              </Link>
            </div>

            {stores === null ? (
              <div className="flex gap-3 overflow-hidden">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="shrink-0 flex flex-col items-center gap-2 w-[88px]"
                    aria-hidden
                  >
                    <div className="h-14 w-14 rounded-2xl bg-[var(--surface-sunken)] animate-pulse" />
                    <div className="h-2.5 w-14 rounded-full bg-[var(--surface-sunken)] animate-pulse" />
                  </div>
                ))}
              </div>
            ) : stores.length === 0 ? (
              <p className="text-sm text-[var(--text-tertiary)] py-2">
                Pronto vas a ver las tiendas destacadas aquí.
              </p>
            ) : (
              <ul className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {stores.map((s) => (
                  <li key={s.id} className="shrink-0">
                    <Link
                      href={`/marketplace/${s.slug}`}
                      role="menuitem"
                      onClick={onClose}
                      className="group flex flex-col items-center gap-2 w-[88px] text-center"
                    >
                      <span className="relative h-14 w-14 rounded-2xl overflow-hidden bg-[var(--surface-sunken)] transition-transform group-hover:scale-105">
                        {s.logo ? (
                          <Image
                            src={s.logo}
                            alt=""
                            fill
                            sizes="56px"
                            className="object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center bg-[var(--accent)] text-white font-black text-xl">
                            {s.name.trim().charAt(0).toUpperCase()}
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] font-bold text-[var(--text-primary)] transition-colors line-clamp-2 leading-tight">
                        {s.name}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Accesos rápidos — pills sólidas, sin bordes */}
          <div className="mt-5 pt-5 border-t border-[var(--rule-soft)] flex flex-wrap gap-2">
            {QUICK_LINKS.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                role="menuitem"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] px-3.5 h-9 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors"
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
