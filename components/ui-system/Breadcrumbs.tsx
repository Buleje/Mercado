"use client";

/**
 * Breadcrumbs — migas de pan canonicas para rutas del storefront.
 *
 * Uso:
 *   <Breadcrumbs items={[
 *     { label: "Mi cuenta", href: "/cuenta" },
 *     { label: "Suscripciones" },
 *   ]} />
 *
 * El primer item siempre es "/" (Inicio). Los intermedios reciben href.
 * El último item (pagina actual) no lleva href.
 */

import Link from "next/link";
import { ChevronRight, Home } from "@buleje/design-system/icons";
import { Caption } from "@buleje/design-system";
import { cn } from "@/lib/utils";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
  /** Oculta el item "Inicio" con el icono Home (default: false). */
  hideHome?: boolean;
}

export function Breadcrumbs({ items, className, hideHome = false }: BreadcrumbsProps) {
  return (
    <nav
      aria-label="Migas de pan"
      className={cn(
        "flex items-center gap-1.5 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]",
        className,
      )}
    >
      {!hideHome && (
        <>
          <Link
            href="/"
            className="inline-flex items-center gap-1 hover:text-[var(--text-secondary)] transition-colors"
            aria-label="Inicio"
          >
            <Home className="h-3.5 w-3.5" aria-hidden />
            <Caption className="hidden sm:inline text-[var(--text-tertiary)]">
              Inicio
            </Caption>
          </Link>
          {items.length > 0 && (
            <ChevronRight
              className="h-3 w-3 text-[var(--text-tertiary)]/60 shrink-0"
              aria-hidden
            />
          )}
        </>
      )}

      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <span key={`${item.label}-${idx}`} className="inline-flex items-center gap-1.5">
            {isLast || !item.href ? (
              <span
                aria-current={isLast ? "page" : undefined}
                className={cn(
                  "truncate max-w-[180px] sm:max-w-[260px]",
                  isLast
                    ? "font-semibold text-[var(--text-primary)]"
                    : "text-[var(--text-tertiary)]",
                )}
              >
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="truncate max-w-[180px] sm:max-w-[260px] hover:text-[var(--text-secondary)] transition-colors"
              >
                {item.label}
              </Link>
            )}
            {!isLast && (
              <ChevronRight
                className="h-3 w-3 text-[var(--text-tertiary)]/60 shrink-0"
                aria-hidden
              />
            )}
          </span>
        );
      })}
    </nav>
  );
}

export default Breadcrumbs;
