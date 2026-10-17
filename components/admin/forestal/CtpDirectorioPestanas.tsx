"use client";

/**
 * Las pestañas del Directorio en UNA fila (compactación del libro, 17-10).
 *
 * Eran botones sueltos de borde grueso que a 1280 partían en dos filas. Ahora
 * es el tablist del libro (`saldos/Pestanas`: flechas, Inicio/Fin, foco
 * itinerante) sin íconos —todos eran el mismo muñequito— y con el conteo en
 * gris al lado del nombre. Si no entran (celular), la fila se desliza; no se
 * parte.
 *
 * La última es «Tu CTP»: la Ficha del CTP, los datos propios que llenan la guía.
 */

import type { ReactNode } from "react";
import { ROL_DESCRIPCION, ROL_PLURAL, ROLES_PARTE, type RolParte } from "@/lib/forestal/directorio";
import Pestanas from "./saldos/Pestanas";
import type { SubDirectorio } from "./ctp-vistas-fusionadas";

const ITEMS: readonly { id: SubDirectorio; label: string; hint: string }[] = [
  ...ROLES_PARTE.map((r: RolParte) => ({ id: r as SubDirectorio, label: ROL_PLURAL[r], hint: ROL_DESCRIPCION[r] })),
  { id: "vehiculos", label: "Vehículos", hint: "Las placas que ya viajaron" },
  {
    id: "tu-ctp",
    label: "Tu CTP",
    hint: "La Ficha del CTP: tu razón social, RUC, títulos y ubicación — encabezan el libro, la guía y el certificado",
  },
];

const idTab = (id: SubDirectorio) => `ctp-directorio-tab-${id}`;
const idPanel = (id: SubDirectorio) => `ctp-directorio-panel-${id}`;

export default function CtpDirectorioPestanas({
  activa,
  onCambiar,
  conteo,
  children,
}: {
  activa: SubDirectorio;
  onCambiar: (id: SubDirectorio) => void;
  /** Cuántos hay en cada pestaña; `null` = no se cuenta (Tu CTP). */
  conteo: (id: SubDirectorio) => number | null;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <Pestanas
        items={ITEMS.map((p) => {
          const n = conteo(p.id);
          return {
            id: p.id,
            contenido: (
              <span title={p.hint} className="inline-flex items-center gap-1.5">
                {p.label}
                {n != null && <span className="font-mono text-xs font-normal tabular-nums text-[var(--text-tertiary)]">{n}</span>}
              </span>
            ),
          };
        })}
        activa={activa}
        onCambiar={onCambiar}
        etiqueta="Pestañas del Directorio"
        idTab={idTab}
        idPanel={idPanel}
        className="flex gap-1 overflow-x-auto rounded-xl bg-[var(--surface-sunken)] p-1 [scrollbar-width:thin]"
        claseBoton={(sel) =>
          `min-h-12 shrink-0 grow basis-auto whitespace-nowrap rounded-lg px-3 text-sm font-semibold leading-tight transition-colors duration-[var(--dur-fast)] ${
            sel
              ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]/60 hover:text-[var(--text-primary)]"
          }`
        }
      />
      <div role="tabpanel" id={idPanel(activa)} aria-labelledby={idTab(activa)} className="space-y-3">
        {children}
      </div>
    </div>
  );
}
