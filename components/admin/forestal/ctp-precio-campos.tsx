"use client";

/**
 * Campos chicos del precio de un cliente (ADR-430): el precio con su «S/», el
 * rótulo asociado por `htmlFor` y el botón de quitar una fila. Aparte para que
 * el formulario y los vínculos de la ficha los compartan.
 */

import { useId, type ReactNode } from "react";
import { Trash2 } from "@buleje/design-system/icons";
import { I } from "./ctp-shared";

/** Un precio por pie con su «S/» delante. El `label` apunta al input: se lee «Precio… S/ 0.50». */
export function CampoPrecio({
  etiqueta,
  valor,
  onCambio,
  ayuda,
  nombre,
}: {
  etiqueta: string;
  valor: string;
  onCambio: (v: string) => void;
  ayuda?: string;
  /** Nombre accesible cuando la etiqueta visible es corta («Por pie») y se repite por fila. */
  nombre?: string;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label
        htmlFor={id}
        className="mb-1 block truncate text-sm font-medium text-[var(--text-primary)]"
      >
        {etiqueta}
      </label>
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-[var(--text-tertiary)]"
        >
          S/
        </span>
        <input
          id={id}
          inputMode="decimal"
          placeholder="0.50"
          aria-label={nombre}
          className={`${I} pl-9 tabular-nums`}
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
        />
      </div>
      {ayuda && (
        <span className="mt-1 block text-xs leading-snug text-[var(--text-tertiary)]">{ayuda}</span>
      )}
    </div>
  );
}

/**
 * Rótulo + control asociados por `htmlFor`, no envolviendo: un `<label>` que
 * envuelve un `<select>` le suma la opción elegida al nombre accesible («Especie
 * Elige…»). Se vio en el navegador: `getByLabel("Especie")` no lo encontraba.
 */
export function Rotulado({
  etiqueta,
  children,
  className = "min-w-0 flex-1",
}: {
  etiqueta: string;
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-[var(--text-primary)]">
        {etiqueta}
      </label>
      {children(id)}
    </div>
  );
}

export function QuitarFila({ etiqueta, onQuitar }: { etiqueta: string; onQuitar: () => void }) {
  return (
    <button
      type="button"
      onClick={onQuitar}
      aria-label={etiqueta}
      title={etiqueta}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[var(--text-tertiary)] transition-colors hover:bg-[var(--data-error-500)]/10 hover:text-[var(--data-error-700)] dark:hover:text-[var(--data-error-500)]"
    >
      <Trash2 className="h-4 w-4" aria-hidden />
    </button>
  );
}
