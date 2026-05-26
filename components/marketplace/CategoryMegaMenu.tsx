"use client";

/**
 * CategoryMegaMenu.tsx — Mega-panel de categorías con íconos + tiendas destacadas.
 *
 * Diseño (v4 2026-05-26, Brandon: "mega-panel con íconos"):
 *   - Panel ancho anclado al trigger del sub-nav.
 *   - Grid de CATEGORÍAS como tiles con ícono Lucide + label + nº subcategorías.
 *   - Sección "Tiendas destacadas" — rail de logos (fetch lazy on-open).
 *   - Accesos rápidos (Ofertas / Más vendidos / Nuevos / Delivery gratis).
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
  Bike,
  ShoppingBasket,
  Beef,
  Apple,
  Wine,
  Milk,
  Croissant,
  Pill,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { CATEGORIAS } from "@/lib/constants/marketplace-categories";

export type CategoryMegaMenuProps = {
  open: boolean;
  onClose: () => void;
};

const CATEGORY_SLUGS = Object.keys(CATEGORIAS);

// Ícono Lucide por slug de categoría (fallback Store).
const CATEGORY_ICON: Record<string, LucideIcon> = {
  "limpieza-hogar": Sparkles,
  abarrotes: ShoppingBasket,
  carnes: Beef,
  "frutas-verduras": Apple,
  bebidas: Wine,
  lacteos: Milk,
  panaderia: Croissant,
  farmacia: Pill,
};

// Accesos rápidos del menú.
const QUICK_LINKS: Array<{ href: string; label: string; Icon: LucideIcon }> = [
  { href: "/marketplace/ofertas", label: "Ofertas", Icon: Tag },
  { href: "/marketplace/explorar?sort=best-sellers", label: "Más vendidos", Icon: TrendingUp },
  { href: "/marketplace/explorar?sort=newest", label: "Nuevos", Icon: Sparkles },
  { href: "/marketplace/explorar?delivery=free", label: "Delivery gratis", Icon: Bike },
];

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
      {/* Overlay transparente — captura clicks fuera (sin dim). */}
      <div
        aria-hidden
        className="fixed inset-0 z-40 animate-[fadeIn_.2s_ease-out]"
        onClick={onClose}
      />

      {/* Panel anclado al trigger (top-full del wrapper sticky). */}
      <div
        ref={panelRef}
        role="menu"
        aria-label="Categorías del marketplace"
        className={cn(
          "absolute top-full left-0 mt-1 z-50",
          "w-[min(1100px,calc(100vw-2rem))]",
          "bg-[var(--surface-canvas)] rounded-3xl overflow-hidden",
          "border border-[var(--rule-soft)]",
          "shadow-[0_24px_80px_-20px_rgba(0,0,0,0.30)]",
          "animate-[scaleIn_.22s_ease-out]",
        )}
      >
        <div className="p-6 sm:p-8">
          {/* Header */}
          <div className="flex items-baseline justify-between gap-4 mb-5">
            <h2 className="text-lg sm:text-xl font-black tracking-[-0.02em] text-[var(--text-primary)]">
              Explorá por{" "}
              <span className="italic font-serif text-[var(--accent)]">categoría</span>
            </h2>
            <Link
              href="/marketplace/explorar"
              role="menuitem"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] px-4 h-9 text-xs font-bold text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors shrink-0"
            >
              Ver todo el catálogo
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </Link>
          </div>

          {/* Grid de categorías con íconos */}
          <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            {CATEGORY_SLUGS.map((slug, idx) => {
              const cat = CATEGORIAS[slug];
              const Icon = CATEGORY_ICON[slug] ?? Store;
              return (
                <li key={slug}>
                  <Link
                    href={`/marketplace/categoria/${slug}`}
                    role="menuitem"
                    onClick={onClose}
                    style={{ animationDelay: `${idx * 25}ms` }}
                    className="group flex items-center gap-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 sm:p-3.5 hover:border-[var(--accent)] hover:-translate-y-0.5 hover:shadow-lg transition-all animate-[fadeIn_.25s_ease-out] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                  >
                    <span className="inline-flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] shrink-0 group-hover:scale-110 transition-transform">
                      <Icon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2} aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-extrabold tracking-tight text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors line-clamp-1">
                        {cat.label}
                      </span>
                      <span className="block text-[11px] font-medium text-[var(--text-tertiary)] line-clamp-1">
                        {cat.subCategorias.length} subcategorías
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Tiendas destacadas — rail de logos */}
          <div className="mt-6 pt-5 border-t border-[var(--rule-soft)]">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
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
              // Skeleton mientras carga
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
                      <span className="relative h-14 w-14 rounded-2xl overflow-hidden bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] group-hover:border-[var(--accent)] group-hover:scale-105 transition-all shadow-sm">
                        {s.logo ? (
                          <Image
                            src={s.logo}
                            alt=""
                            fill
                            sizes="56px"
                            className="object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark,var(--accent))] text-white font-black text-xl">
                            {s.name.trim().charAt(0).toUpperCase()}
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors line-clamp-2 leading-tight">
                        {s.name}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Accesos rápidos */}
          <div className="mt-5 pt-5 border-t border-[var(--rule-soft)] flex flex-wrap gap-2">
            {QUICK_LINKS.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                role="menuitem"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 h-9 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
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
