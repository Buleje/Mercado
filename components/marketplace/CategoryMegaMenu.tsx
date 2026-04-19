"use client";

/**
 * CategoryMegaMenu.tsx — Mega menu de categorías estilo Amazon.
 *
 * Layout:
 *  - Desktop: panel flotante 2 columnas (sidebar izq + subcategorías der)
 *  - Mobile: fallback a link directo a /marketplace/explorar
 *
 * Datos: CATEGORIAS de lib/db/marketplace-catalog.db.ts (canónico).
 * Accesibilidad: role="menu", flechas ↑↓ en sidebar, Esc cierra.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { CATEGORIAS, type CategoriaDef } from "@/lib/db/marketplace-catalog.db";

// ── Tipo exportado para el trigger ──────────────────────────────────────────
export type CategoryMegaMenuProps = {
  /** Controlado externamente: ¿está abierto? */
  open: boolean;
  /** Callback para cerrar */
  onClose: () => void;
};

// Orden estable de categorías para el sidebar
const CATEGORY_SLUGS = Object.keys(CATEGORIAS) as Array<keyof typeof CATEGORIAS>;

// ── Componente ───────────────────────────────────────────────────────────────
export default function CategoryMegaMenu({ open, onClose }: CategoryMegaMenuProps) {
  const [activeSlug, setActiveSlug] = useState<string>(CATEGORY_SLUGS[0]);
  const menuRef = useRef<HTMLDivElement>(null);
  const sidebarItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const activeCategory: CategoriaDef | undefined = CATEGORIAS[activeSlug];

  // ── Cerrar con Esc ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // ── Click fuera cierra ───────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // pequeño delay para no capturar el click que abrió el menu
    const id = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", handler);
    };
  }, [open, onClose]);

  // ── Navegación con flechas en sidebar ───────────────────────────────────
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
    <div
      ref={menuRef}
      role="menu"
      aria-label="Categorias del marketplace"
      className={cn(
        "absolute left-0 top-full z-50 mt-1",
        "w-[680px] max-w-[calc(100vw-2rem)]",
        "bg-[var(--surface-canvas)] dark:bg-[var(--surface-canvas)]",
        "border border-[var(--rule-soft)]",
        "rounded-lg overflow-hidden",
        // sin shadow exagerada — estilo Holded
        "shadow-[0_4px_16px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.3)]",
        "animate-in fade-in slide-in-from-top-2 duration-150",
      )}
    >
      <div className="flex min-h-[320px]">
        {/* ── Sidebar izquierdo — lista de categorías principales ── */}
        <nav
          aria-label="Categorias principales"
          className="w-56 shrink-0 border-r border-[var(--rule-soft)] bg-gray-50 dark:bg-gray-900/50 py-2"
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
                  "flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors",
                  isActive
                    ? "bg-white dark:bg-gray-800 text-[var(--accent)] font-semibold"
                    : "text-[var(--text-primary)] hover:bg-white dark:hover:bg-gray-800 font-medium",
                )}
              >
                <span>{cat.label}</span>
                {isActive && (
                  <ChevronRight
                    className="h-3.5 w-3.5 text-[var(--accent)] shrink-0"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}

          {/* Separador + Ver todo */}
          <div className="mx-3 my-2 border-t border-[var(--rule-soft)]" />
          <Link
            href="/marketplace/explorar"
            role="menuitem"
            onClick={onClose}
            className="flex w-full items-center px-4 py-2.5 text-sm font-medium text-[var(--accent)] hover:bg-white dark:hover:bg-gray-800 transition-colors"
          >
            Ver todo el catalogo
          </Link>
        </nav>

        {/* ── Área derecha — subcategorías de la categoría activa ── */}
        <div className="flex-1 p-5">
          {activeCategory && (
            <>
              {/* Encabezado de sección */}
              <div className="mb-4">
                <Link
                  href={`/marketplace/categoria/${activeSlug}`}
                  onClick={onClose}
                  className="text-base font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors"
                >
                  {activeCategory.label}
                </Link>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-2">
                  {activeCategory.subtitle}
                </p>
              </div>

              {/* Grid de subcategorías */}
              <ul
                aria-label={`Subcategorias de ${activeCategory.label}`}
                className="grid grid-cols-2 gap-1"
              >
                {activeCategory.subCategorias.map((sub) => {
                  const subSlug = sub.toLowerCase().replace(/\s+/g, "-");
                  return (
                    <li key={sub}>
                      <Link
                        href={`/marketplace/explorar?categoria=${activeSlug}&sub=${subSlug}`}
                        role="menuitem"
                        onClick={onClose}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
                          "text-[var(--text-primary)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]",
                          "transition-colors",
                        )}
                      >
                        <span
                          className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--rule-mid)] shrink-0"
                          aria-hidden="true"
                        />
                        {sub}
                      </Link>
                    </li>
                  );
                })}
              </ul>

              {/* CTA secundario */}
              <div className="mt-4 pt-3 border-t border-[var(--rule-soft)]">
                <Link
                  href={`/marketplace/categoria/${activeSlug}`}
                  role="menuitem"
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)] hover:underline"
                >
                  Ver todo en {activeCategory.label}
                  <ChevronRight className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
