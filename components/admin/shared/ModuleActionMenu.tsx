"use client";

/**
 * ModuleActionMenu — Dropdown editorial para agrupar acciones secundarias.
 *
 * Construido sobre @radix-ui/react-dropdown-menu (instalado en package.json):
 *   - Keyboard navigation automática (flechas arriba/abajo, Home/End, Enter, Esc)
 *   - Focus trap + return focus al trigger al cerrar
 *   - Portal: el menú se renderiza fuera del overflow del padre, nunca se corta
 *   - aria-* correcto (role, aria-haspopup, aria-expanded)
 *   - prefers-reduced-motion respetado
 *
 * Qué hace (Feynman): cuando un módulo tiene 6+ botones de acción
 * (Exportar, Duplicar, Archivar, Ver logs...), en vez de saturar el header
 * con todos, se muestra 1 solo botón que abre un menú limpio con las opciones.
 *
 * Uso:
 *   <ModuleActionMenu items={[
 *     { label: "Exportar CSV", icon: Download, onClick: handleExport },
 *     { label: "Duplicar", icon: Copy, onClick: handleDuplicate },
 *     { label: "Archivar", icon: Archive, onClick: handleArchive,
 *       destructive: true, dividerBefore: true },
 *   ]} />
 */

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
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
  align?: "start" | "end" | "center";
  className?: string;
}

export function ModuleActionMenu({
  items,
  label = "Más acciones",
  iconOnly = false,
  align = "end",
  className,
}: Props) {
  if (items.length === 0) return null;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={iconOnly ? label : undefined}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] transition-colors",
            "text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]",
            "data-[state=open]:bg-[var(--surface-sunken)] data-[state=open]:text-[var(--text-primary)]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
            iconOnly ? "h-9 w-9 justify-center" : "px-3 py-2",
            className,
          )}
        >
          {iconOnly ? (
            <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
          ) : (
            <>
              {label}
              <ChevronDown
                className="h-3.5 w-3.5 transition-transform data-[state=open]:rotate-180"
                strokeWidth={2}
              />
            </>
          )}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            "z-50 min-w-[220px] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] py-1.5 shadow-xl",
            "data-[state=open]:animate-module-menu-in",
          )}
        >
          {items.map((item, i) => {
            const Icon = item.icon;
            const inner = (
              <>
                {Icon && (
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      item.destructive
                        ? "text-[var(--data-error-500)]"
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
                        ? "text-[var(--data-error-500)]"
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

            const itemClass = cn(
              "group w-full flex items-center gap-2.5 px-3 py-2 text-left outline-none cursor-pointer",
              "data-[highlighted]:bg-[var(--surface-sunken)]",
              item.destructive && "data-[highlighted]:bg-[var(--data-error-50)]",
              item.disabled && "opacity-50 cursor-not-allowed data-[highlighted]:bg-transparent",
            );

            return (
              <div key={`${item.label}-${i}`}>
                {item.dividerBefore && (
                  <DropdownMenu.Separator className="my-1 h-px bg-[var(--rule-soft)]" />
                )}
                {item.href ? (
                  <DropdownMenu.Item asChild disabled={item.disabled}>
                    <a href={item.href} className={itemClass}>
                      {inner}
                    </a>
                  </DropdownMenu.Item>
                ) : (
                  <DropdownMenu.Item
                    onSelect={(e) => {
                      if (item.disabled) {
                        e.preventDefault();
                        return;
                      }
                      item.onClick?.();
                    }}
                    disabled={item.disabled}
                    className={itemClass}
                  >
                    {inner}
                  </DropdownMenu.Item>
                )}
              </div>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>

      <style jsx global>{`
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
        [data-radix-dropdown-menu-content][data-state="open"].animate-module-menu-in {
          animation: module-menu-in 140ms ease-out;
          transform-origin: top var(--radix-dropdown-menu-content-transform-origin);
        }
        @media (prefers-reduced-motion: reduce) {
          [data-radix-dropdown-menu-content].animate-module-menu-in {
            animation: none !important;
          }
        }
      `}</style>
    </DropdownMenu.Root>
  );
}

export default ModuleActionMenu;
