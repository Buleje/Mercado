"use client";

/**
 * ModuleActionMenu — Dropdown editorial para agrupar acciones secundarias.
 *
 * Qué hace (Feynman): cuando un módulo tiene muchos botones (ej. "Exportar",
 * "Duplicar", "Archivar", "Ver logs"...), en vez de saturar el header con
 * 6 botones uno al lado del otro, mostramos solo 1 botón "Más acciones"
 * que abre un menú limpio con todas las opciones.
 *
 * Usa los hooks del navegador para posicionamiento y cierre con ESC / click
 * fuera. Sin librerías externas (evita @radix-ui menu si no está instalado).
 *
 * Uso:
 *   <ModuleActionMenu
 *     label="Más acciones"
 *     items={[
 *       { label: "Exportar CSV", icon: Download, onClick: handleExport },
 *       { label: "Duplicar", icon: Copy, onClick: handleDuplicate },
 *       { label: "Archivar", icon: Archive, onClick: handleArchive, destructive: true },
 *     ]}
 *   />
 */

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, ChevronDown } from "@buleje/design-system/icons";
import type { LucideIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export interface ModuleActionItem {
  label: string;
  icon?: LucideIcon;
  onClick?: () => void;
  href?: string;
  /** Marca el item en rojo (acciones destructivas) */
  destructive?: boolean;
  /** Deshabilita el item (opacidad + sin click) */
  disabled?: boolean;
  /** Separador visual arriba de este item */
  dividerBefore?: boolean;
  /** Descripción pequeña debajo del label */
  description?: string;
}

interface Props {
  items: ModuleActionItem[];
  /** Label del botón trigger. Default: "Más acciones". */
  label?: string;
  /** Si true, usa `MoreHorizontal` en vez de `label + chevron`. */
  iconOnly?: boolean;
  /** Alineación del menú desplegado. Default: "end". */
  align?: "start" | "end";
  className?: string;
}

export function ModuleActionMenu({
  items,
  label = "Más acciones",
  iconOnly = false,
  align = "end",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={rootRef} className={cn("relative inline-block", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={iconOnly ? label : undefined}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] transition-colors",
          "text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]",
          iconOnly ? "h-9 w-9 justify-center" : "px-3 py-2",
        )}
      >
        {iconOnly ? (
          <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
        ) : (
          <>
            {label}
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                open && "rotate-180",
              )}
              strokeWidth={2}
            />
          </>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            "absolute top-full mt-2 z-50 min-w-[220px] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] py-1.5 shadow-xl",
            "animate-module-menu-in",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map((item, i) => {
            const Icon = item.icon;
            const content = (
              <>
                {Icon && (
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      item.destructive
                        ? "text-[var(--data-error)]"
                        : "text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]",
                    )}
                    strokeWidth={1.75}
                    aria-hidden
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      "text-sm font-medium truncate",
                      item.destructive
                        ? "text-[var(--data-error)]"
                        : "text-[var(--text-primary)]",
                    )}
                  >
                    {item.label}
                  </div>
                  {item.description && (
                    <div className="text-xs text-[var(--text-tertiary)] mt-0.5 truncate">
                      {item.description}
                    </div>
                  )}
                </div>
              </>
            );

            const cls = cn(
              "group w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors",
              item.disabled
                ? "opacity-50 cursor-not-allowed"
                : item.destructive
                  ? "hover:bg-[var(--data-error-50)]"
                  : "hover:bg-[var(--surface-sunken)]",
            );

            const handleClick = () => {
              if (item.disabled) return;
              setOpen(false);
              item.onClick?.();
            };

            return (
              <div key={`${item.label}-${i}`}>
                {item.dividerBefore && (
                  <div className="my-1 border-t border-[var(--rule-soft)]" aria-hidden />
                )}
                {item.href ? (
                  <a
                    href={item.href}
                    className={cls}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                  >
                    {content}
                  </a>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleClick}
                    disabled={item.disabled}
                    className={cls}
                  >
                    {content}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        @keyframes module-menu-in {
          from {
            opacity: 0;
            transform: translateY(-4px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-module-menu-in {
          animation: module-menu-in 140ms ease-out;
          transform-origin: top ${align === "end" ? "right" : "left"};
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-module-menu-in {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

export default ModuleActionMenu;
