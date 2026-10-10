"use client";

/**
 * AdminBreadcrumb — la ruta hasta donde estás, en una línea.
 *
 * Reemplaza al patrón de DOS títulos apilados (el del hub y el del sub-módulo
 * diciendo casi lo mismo, uno debajo del otro): el hub pasa a ser una miga y el
 * único título de la pantalla es el del módulo que estás viendo.
 *
 * En angosto la ruta se recorta desde la IZQUIERDA, no desde la derecha: el
 * último tramo —dónde estás— es el que no se puede perder. Por eso la fila se
 * desliza y va anclada al final, y el "Admin" inicial se esconde primero.
 */

import { ChevronRight, Home } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

interface AdminBreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export default function AdminBreadcrumb({ items, className }: AdminBreadcrumbProps) {
  return (
    <nav
      aria-label="Ruta de navegación"
      className={cn(
        "@container flex items-center gap-1 overflow-x-auto whitespace-nowrap text-xs text-[var(--text-tertiary)] scrollbar-none",
        className,
      )}
      style={{ scrollbarWidth: "none" }}
    >
      {/* El origen es lo prescindible cuando falta lugar. */}
      <span className="hidden shrink-0 items-center gap-1 @min-[26rem]:inline-flex">
        <Home className="h-3 w-3 shrink-0" aria-hidden />
        <ChevronRight className="h-3 w-3 shrink-0 opacity-40" aria-hidden />
        <span className="font-medium text-[var(--text-secondary)]">Admin</span>
      </span>
      {items.map((item, idx) => {
        const ultimo = idx === items.length - 1;
        return (
          <span key={`${item.label}-${idx}`} className="flex shrink-0 items-center gap-1">
            {/* El separador del primer tramo sólo hace falta si se ve "Admin". */}
            <ChevronRight className={cn("h-3 w-3 shrink-0 opacity-40", idx === 0 && "hidden @min-[26rem]:block")} aria-hidden />
            {item.onClick && !ultimo ? (
              <button
                type="button"
                onClick={item.onClick}
                className="rounded font-medium transition-colors hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              >
                {item.label}
              </button>
            ) : (
              <span
                aria-current={ultimo ? "page" : undefined}
                className={cn(ultimo ? "font-semibold text-[var(--text-primary)]" : "font-medium")}
              >
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
