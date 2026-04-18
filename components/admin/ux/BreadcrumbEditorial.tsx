"use client";

import Link from "next/link";
import { ChevronRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * BreadcrumbEditorial — kicker-style breadcrumbs para admin.
 *
 * Patron editorial: uppercase tracking, separador con rule soft,
 * ultimo crumb sin link (current page).
 *
 * @example
 * <BreadcrumbEditorial
 *   items={[
 *     { label: "Inventario", href: "/admin/inventario" },
 *     { label: "Producto nuevo" },
 *   ]}
 * />
 *
 * Renderiza: ADMIN · INVENTARIO · PRODUCTO NUEVO
 */
interface Props {
  items: Crumb[];
  /** Si true, agrega "Admin" inicial. Default true. */
  rootLabel?: string | false;
  /** Href del root. Default "/admin". */
  rootHref?: string;
  className?: string;
}

export function BreadcrumbEditorial({
  items,
  rootLabel = "Admin",
  rootHref = "/admin",
  className,
}: Props) {
  const crumbs: Crumb[] = rootLabel
    ? [{ label: rootLabel, href: rootHref }, ...items]
    : items;

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex items-center gap-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)]",
        className,
      )}
    >
      {crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1;
        const classes = cn(
          isLast
            ? "text-[var(--text-primary)] cursor-default"
            : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors",
        );

        return (
          <span key={`${c.label}-${i}`} className="inline-flex items-center gap-2">
            {c.href && !isLast ? (
              <Link href={c.href} className={classes}>
                {c.label}
              </Link>
            ) : (
              <span className={classes}>{c.label}</span>
            )}
            {!isLast && (
              <ChevronRight
                className="h-3 w-3 text-[var(--text-tertiary)] opacity-60"
                strokeWidth={1.75}
                aria-hidden
              />
            )}
          </span>
        );
      })}
    </nav>
  );
}
