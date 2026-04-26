import Link from "next/link";
import { ChevronRight } from "@buleje/design-system/icons";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

/**
 * Breadcrumbs — navegación visual de migas de pan.
 *
 * Acepta un array de items en orden: Inicio → ... → página actual.
 * El último item se renderiza como página actual (aria-current + peso semibold).
 * Mobile: scroll horizontal para pantallas estrechas.
 */
export default function Breadcrumbs({ items }: BreadcrumbsProps) {
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="bg-[var(--surface-canvas)] border-b border-[var(--rule-base)]"
    >
      <ol className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-2 flex items-center gap-1 overflow-x-auto whitespace-nowrap scrollbar-none text-sm text-[var(--text-tertiary)]">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={index} className="inline-flex items-center gap-1 min-w-0">
              {index > 0 && (
                <ChevronRight
                  className="h-3 w-3 flex-shrink-0 text-[var(--text-tertiary)]"
                  aria-hidden="true"
                />
              )}
              {isLast || !item.href ? (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={
                    isLast
                      ? "font-semibold text-[var(--text-primary)] truncate max-w-[160px] sm:max-w-xs"
                      : "truncate max-w-[120px] sm:max-w-xs"
                  }
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="hover:text-[var(--text-primary)] transition-colors truncate max-w-[120px] sm:max-w-xs"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
