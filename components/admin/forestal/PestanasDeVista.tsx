"use client";

/**
 * PestanasDeVista — el 2.º nivel de un libro forestal (plan «panel unificado»,
 * regla R4: en los libros el riel de la cabina es el 1.º nivel y la pestaña
 * interna, el 2.º; no hay un 3.º).
 *
 * Es la misma pieza que las secciones de Saldos (`saldos/Pestanas`: tablist
 * completo, flechas, Inicio/Fin y foco itinerante), con la altura del panel
 * (48 px, decisión de Brandon del 2026-10-09) y el ícono de cada pestaña. El
 * qué-hace-cada-una va en el `title`, como en el riel: no ocupa pantalla.
 */

import type { ReactNode } from "react";
import type { LucideIcon } from "@buleje/design-system/icons";
import Pestanas from "./saldos/Pestanas";

export interface PestanaDeVista<T extends string> {
  id: T;
  label: string;
  icon?: LucideIcon;
  hint?: string;
}

export default function PestanasDeVista<T extends string>({
  prefijo,
  etiqueta,
  items,
  activa,
  onCambiar,
  children,
}: {
  /** Prefijo de los ids del tablist (`ctp-tablero` → `ctp-tablero-tab-margen`). */
  prefijo: string;
  /** El nombre del grupo para el lector de pantalla. */
  etiqueta: string;
  items: readonly PestanaDeVista<T>[];
  activa: T;
  onCambiar: (id: T) => void;
  children: ReactNode;
}) {
  const idTab = (id: T) => `${prefijo}-tab-${id}`;
  const idPanel = (id: T) => `${prefijo}-panel-${id}`;
  return (
    <div className="space-y-4">
      {items.length > 1 && (
        <Pestanas
          items={items.map((p) => ({
            id: p.id,
            contenido: (
              <span title={p.hint} className="inline-flex items-center justify-center gap-2">
                {p.icon && <p.icon className="h-4 w-4 shrink-0 max-sm:hidden" aria-hidden />}
                {p.label}
              </span>
            ),
          }))}
          activa={activa}
          onCambiar={onCambiar}
          etiqueta={etiqueta}
          idTab={idTab}
          idPanel={idPanel}
          className="flex flex-wrap gap-1 rounded-xl bg-[var(--surface-sunken)] p-1"
          claseBoton={(sel) =>
            `min-h-12 flex-1 basis-auto rounded-lg px-3 text-sm sm:px-4 font-semibold leading-tight transition-colors duration-[var(--dur-fast)] ${
              sel
                ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]/60 hover:text-[var(--text-primary)]"
            }`
          }
        />
      )}
      <div
        role={items.length > 1 ? "tabpanel" : undefined}
        id={items.length > 1 ? idPanel(activa) : undefined}
        aria-labelledby={items.length > 1 ? idTab(activa) : undefined}
      >
        {children}
      </div>
    </div>
  );
}
