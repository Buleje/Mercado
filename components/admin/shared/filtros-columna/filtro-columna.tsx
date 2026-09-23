"use client";

/**
 * FiltroColumna — el autofiltro más liviano: un `<select>` nativo, UN valor.
 *
 * Para columnas donde casi nunca hace falta elegir dos cosas a la vez (Estado,
 * Rubro, Tipo de comprobante). Si la columna sí necesita «Tornillo Y Cachimbo»,
 * usar `FiltroColumnaMulti` — que es el otro autofiltro de Excel, con casillas.
 * No son dos versiones de lo mismo: un `<select>` no puede marcar dos opciones,
 * y forzar casillas donde un valor alcanza es un clic de más en cada fila.
 */

import type { FacetaOpcion } from "@/lib/admin/filtros-columna";

export interface FiltroColumnaProps {
  /** Cómo se llama la columna: arma el `aria-label` del control. */
  label: string;
  value: string | undefined;
  options: readonly FacetaOpcion[];
  /** Traduce el valor crudo a etiqueta legible. */
  etiqueta?: (v: string) => string;
  onChange: (v: string | undefined) => void;
  placeholder?: string;
  /** Hereda `normal-case tracking-normal` porque el `<thead>` va en versalitas. */
  className?: string;
}

export function FiltroColumna({
  label,
  value,
  options,
  etiqueta,
  onChange,
  placeholder = "Todos",
  className = "",
}: FiltroColumnaProps) {
  const vacio = options.length === 0;
  return (
    <select
      value={value ?? ""}
      disabled={vacio}
      onChange={(e) => onChange(e.target.value || undefined)}
      aria-label={`Filtrar por ${label}`}
      title={`Filtrar por ${label}`}
      className={`mt-1.5 block h-9 max-w-56 rounded-lg border-[1.5px] bg-[var(--surface-raised)] px-2 text-sm font-normal normal-case tracking-normal text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none disabled:opacity-50 ${
        value ? "border-[var(--accent)] bg-primary/10 font-bold" : "border-[var(--rule-base)]"
      } ${className}`}
    >
      <option value="">{vacio ? "—" : placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {(etiqueta ? etiqueta(o.value) : o.value)}
          {o.count != null ? ` (${o.peso ?? o.count})` : ""}
        </option>
      ))}
    </select>
  );
}
