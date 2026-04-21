"use client";

/**
 * CategoryMegaMenu.tsx — Mega menu "imponente" con dim overlay.
 *
 * Diseño:
 *   - Backdrop fixed con dim oscuro + blur para enfocar el menu
 *   - Panel centrado ancho (max-w-6xl) debajo del sub-nav
 *   - Izquierda: lista vertical de CATEGORÍAS en letra grande (sin subtítulos)
 *   - Derecha: SUBCATEGORÍAS como CÍRCULOS grandes al hover
 *   - Click en subcategoría → /marketplace/categoria/{catSlug}?q={subLabel}
 *
 * A11y: Esc cierra, click fuera cierra.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { CATEGORIAS, type CategoriaDef } from "@/lib/constants/marketplace-categories";

export type CategoryMegaMenuProps = {
  open: boolean;
  onClose: () => void;
};

const CATEGORY_SLUGS = Object.keys(CATEGORIAS) as Array<keyof typeof CATEGORIAS>;

// Inicial determinística para la burbuja del círculo
function getInitial(label: string): string {
  const clean = label.trim();
  return clean.charAt(0).toUpperCase() || "·";
}

export default function CategoryMegaMenu({ open, onClose }: CategoryMegaMenuProps) {
  const [activeSlug, setActiveSlug] = useState<string>(CATEGORY_SLUGS[0]);
  const panelRef = useRef<HTMLDivElement>(null);
  const sidebarItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const activeCategory: CategoriaDef | undefined = CATEGORIAS[activeSlug];

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

  // Cerrar al scrollear — evita el "descuadre" cuando el sub-nav se oculta.
  // Antes bloqueábamos body.overflow="hidden", pero eso saltaba la página al
  // top al abrir y al cerrar. Mejor: permitir scroll y cerrar si el user
  // scrolea más de 40px desde que abrió el menu.
  useEffect(() => {
    if (!open) return;
    const startY = window.scrollY;
    const onScroll = () => {
      if (Math.abs(window.scrollY - startY) > 40) {
        onClose();
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [open, onClose]);

  // Navegación con flechas
  const handleSidebarKeyDown = useCallback(
    (e: React.KeyboardEvent, slug: string) => {
      const idx = CATEGORY_SLUGS.indexOf(slug);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = CATEGORY_SLUGS[idx + 1];
        if (next) {
          setActiveSlug(next);
          sidebarItemRefs.current[next]?.focus();
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = CATEGORY_SLUGS[idx - 1];
        if (prev) {
          setActiveSlug(prev);
          sidebarItemRefs.current[prev]?.focus();
        }
      }
    },
    [],
  );

  if (!open) return null;

  return (
    <>
      {/* Overlay transparente — solo captura clicks fuera (sin dim oscuro).
          El user pidió quitar el oscurecido para no distraer del menu. */}
      <div
        aria-hidden
        className="fixed inset-0 z-40 animate-[fadeIn_.2s_ease-out]"
        onClick={onClose}
      />

      {/* ── Panel anclado al trigger — absolute top-full del wrapper.
         Como el wrapper vive dentro del sub-nav sticky, el panel sigue
         el mismo comportamiento sticky/hide-on-scroll del sub-nav
         (nunca queda "en el aire"). */}
      <div
        ref={panelRef}
        role="menu"
        aria-label="Categorías del marketplace"
        className={cn(
          "absolute top-full left-0 mt-1 z-50",
          "w-[min(1180px,calc(100vw-2rem))]",
          "bg-[var(--surface-canvas)] rounded-3xl overflow-hidden",
          "border border-[var(--rule-soft)]",
          "shadow-[0_24px_80px_-20px_rgba(0,0,0,0.35)]",
          "animate-[scaleIn_.25s_ease-out]",
        )}
      >
        <div className="grid grid-cols-[280px_1fr] min-h-[480px]">
          {/* ── Sidebar IZQ — categorías grandes sin texto explicativo ── */}
          <nav
            aria-label="Categorías principales"
            className="border-r border-[var(--rule-soft)] bg-[var(--surface-sunken)] py-3"
          >
            {CATEGORY_SLUGS.map((slug) => {
              const cat = CATEGORIAS[slug];
              const isActive = slug === activeSlug;
              return (
                <button
                  key={slug}
                  ref={(el) => {
                    sidebarItemRefs.current[slug] = el;
                  }}
                  role="menuitem"
                  aria-haspopup="true"
                  aria-expanded={isActive}
                  onMouseEnter={() => setActiveSlug(slug)}
                  onFocus={() => setActiveSlug(slug)}
                  onClick={() => setActiveSlug(slug)}
                  onKeyDown={(e) => handleSidebarKeyDown(e, slug)}
                  className={cn(
                    "relative flex w-full items-center justify-between px-6 py-3.5 text-left transition-all",
                    "text-base font-bold tracking-[-0.01em]",
                    isActive
                      ? "bg-[var(--surface-canvas)] text-[var(--accent)]"
                      : "text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]/70 hover:text-[var(--accent)]",
                  )}
                >
                  {/* Barra accent lateral cuando activa */}
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-[var(--accent)]"
                    />
                  )}
                  <span className="pl-2">{cat.label}</span>
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 shrink-0 transition-all",
                      isActive
                        ? "opacity-100 translate-x-0 text-[var(--accent)]"
                        : "opacity-40 -translate-x-1",
                    )}
                    strokeWidth={2.25}
                    aria-hidden
                  />
                </button>
              );
            })}

            <div className="mx-5 my-3 border-t border-[var(--rule-soft)]" />
            <Link
              href="/marketplace/explorar"
              role="menuitem"
              onClick={onClose}
              className="flex w-full items-center px-6 py-3 text-sm font-bold text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors"
            >
              Ver todo el catálogo
            </Link>
          </nav>

          {/* ── Área DER — subcategorías como CÍRCULOS grandes ─────────── */}
          <div className="p-8 sm:p-10">
            {activeCategory && (
              <>
                {/* Header minimal — solo título grande, sin subtítulo explicativo */}
                <div className="mb-8 flex items-baseline justify-between gap-4">
                  <h2 className="text-[clamp(1.75rem,3vw,2.5rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-none">
                    <span className="italic font-serif text-[var(--accent)]">
                      {activeCategory.label}
                    </span>
                  </h2>
                  <Link
                    href={`/marketplace/categoria/${activeSlug}`}
                    onClick={onClose}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] px-4 h-9 text-xs font-bold text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors shrink-0"
                  >
                    Ver todo
                    <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                  </Link>
                </div>

                {/* Grid de círculos — 4 columnas, cards grandes */}
                <ul
                  key={activeSlug}
                  aria-label={`Subcategorías de ${activeCategory.label}`}
                  className="grid grid-cols-3 sm:grid-cols-4 gap-x-5 gap-y-6 animate-[fadeIn_.2s_ease-out]"
                >
                  {activeCategory.subCategorias.map((sub, idx) => (
                    <li key={sub}>
                      <Link
                        href={`/marketplace/categoria/${activeSlug}?q=${encodeURIComponent(sub)}`}
                        role="menuitem"
                        onClick={onClose}
                        className="group flex flex-col items-center gap-3 text-center"
                        style={{ animationDelay: `${idx * 30}ms` }}
                      >
                        {/* CÍRCULO GRANDE con inicial + halo hover */}
                        <span
                          className={cn(
                            "relative inline-flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-full",
                            "bg-[var(--surface-sunken)] border-2 border-[var(--rule-soft)]",
                            "text-2xl sm:text-3xl font-black text-[var(--text-secondary)]",
                            "transition-all duration-300",
                            "group-hover:border-[var(--accent)] group-hover:bg-[var(--accent-soft)] group-hover:text-[var(--accent)]",
                            "group-hover:scale-110 group-hover:shadow-[0_12px_32px_-12px_var(--accent)]",
                          )}
                        >
                          {/* Halo pulse al hover */}
                          <span
                            aria-hidden
                            className="absolute inset-0 rounded-full border-2 border-[var(--accent)]/0 group-hover:border-[var(--accent)]/40 group-hover:scale-110 transition-all duration-500"
                          />
                          {getInitial(sub)}
                        </span>
                        <span className="text-xs sm:text-sm font-bold tracking-[-0.01em] text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors line-clamp-2">
                          {sub}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
