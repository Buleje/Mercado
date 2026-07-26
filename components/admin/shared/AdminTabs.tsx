"use client";

/**
 * AdminTabs — wrapper sobre @radix-ui/react-tabs con estilos editoriales.
 *
 * Por qué: muchos módulos tienen tabs internos (pestañas dentro de un tab)
 * y cada módulo implementa su propio switcher — inconsistente. Este
 * componente estandariza el look: underline animado bajo el tab activo,
 * keyboard nav (flechas), ARIA correcto (role="tab", aria-selected, tabpanel).
 *
 * Uso:
 *   <AdminTabs
 *     value={current}
 *     onValueChange={setCurrent}
 *     items={[
 *       { value: "activos", label: "Activos", count: 128 },
 *       { value: "pausados", label: "Pausados", count: 3 },
 *       { value: "todos", label: "Todos" },
 *     ]}
 *   >
 *     {({ value }) => (
 *       <>
 *         {value === "activos" && <ActivosView />}
 *         {value === "pausados" && <PausadosView />}
 *         {value === "todos" && <TodosView />}
 *       </>
 *     )}
 *   </AdminTabs>
 *
 * O con <AdminTabs.Content value="..."> tradicional:
 *   <AdminTabs items={...} value={...} onValueChange={...}>
 *     <AdminTabs.Content value="activos"><ActivosView /></AdminTabs.Content>
 *     <AdminTabs.Content value="pausados"><PausadosView /></AdminTabs.Content>
 *   </AdminTabs>
 */

import * as Tabs from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface AdminTabItem {
  value: string;
  label: string;
  /** Badge numérico a la derecha (ej: cantidad de items). */
  count?: number;
  /** Deshabilita el tab. */
  disabled?: boolean;
}

interface Props {
  items: AdminTabItem[];
  value: string;
  onValueChange: (value: string) => void;
  /** Children puede ser ReactNode estándar o render prop. */
  children?: ReactNode | ((ctx: { value: string }) => ReactNode);
  /** Variante visual. Default: "underline" (editorial). */
  variant?: "underline" | "pills";
  /** Clase extra en el contenedor raíz. */
  className?: string;
  /** Clase extra en la lista de tabs. */
  listClassName?: string;
}

export function AdminTabs({
  items,
  value,
  onValueChange,
  children,
  variant = "underline",
  className,
  listClassName,
}: Props) {
  return (
    <Tabs.Root value={value} onValueChange={onValueChange} className={className}>
      <Tabs.List
        className={cn(
          variant === "underline"
            ? "flex items-center gap-0 border-b border-[var(--rule-soft)] overflow-x-auto scrollbar-hide"
            : "inline-flex items-center gap-0.5 bg-[var(--surface-sunken)] rounded-lg p-0.5",
          listClassName,
        )}
        aria-label="Pestañas del módulo"
      >
        {items.map((item) => (
          <Tabs.Trigger
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            className={cn(
              "group inline-flex items-center gap-2 font-medium outline-none whitespace-nowrap transition-colors",
              "focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-0 rounded-t",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              variant === "underline"
                ? [
                    "px-4 py-2.5 text-sm text-[var(--text-tertiary)] relative",
                    "hover:text-[var(--text-secondary)]",
                    "data-[state=active]:text-[var(--text-primary)] data-[state=active]:font-semibold",
                    "after:absolute after:left-3 after:right-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-[var(--accent)] after:scale-x-0 after:origin-left after:transition-transform",
                    "data-[state=active]:after:scale-x-100",
                  ]
                : [
                    "px-3 py-1.5 text-xs rounded-md text-[var(--text-secondary)]",
                    "hover:text-[var(--text-primary)]",
                    "data-[state=active]:bg-[var(--surface-canvas)] data-[state=active]:text-[var(--text-primary)] data-[state=active]:font-semibold",
                  ],
            )}
          >
            {item.label}
            {typeof item.count === "number" && (
              <span
                className={cn(
                  "inline-flex items-center justify-center h-4 min-w-4 rounded-full px-1.5 text-[length:var(--ts-2xs)] font-bold tabular-nums transition-colors",
                  variant === "underline"
                    ? "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] group-data-[state=active]:bg-primary/10 group-data-[state=active]:text-[var(--accent)]"
                    : "bg-[var(--surface-raised)] text-[var(--text-tertiary)]",
                )}
              >
                {item.count}
              </span>
            )}
          </Tabs.Trigger>
        ))}
      </Tabs.List>

      <div className="mt-4">
        {typeof children === "function"
          ? children({ value })
          : children}
      </div>
    </Tabs.Root>
  );
}

AdminTabs.Content = function AdminTabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Tabs.Content value={value} className={cn("outline-none", className)}>
      {children}
    </Tabs.Content>
  );
};

export default AdminTabs;
