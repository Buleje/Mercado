"use client";

/**
 * FiltroColumnaMulti — el autofiltro con casillas, dentro de la cabecera de su
 * columna (Brandon, 2026-09-03, multi-selección 2026-09-10).
 *
 * Generalización de `FiltroColumna` del Libro CTP (`ctp-filtros-panel.tsx`):
 * misma mecánica (popover medido, casillas con peso, «Limpiar»), sin nada de
 * forestal. OR adentro de la columna, AND entre columnas — el comportamiento
 * del autofiltro de Excel. Cada opción muestra su peso (o su cantidad de
 * líneas) porque se elige por peso, no por nombre, y una opción que trae cero
 * es una trampa.
 */

import { ChevronDown, X } from "@buleje/design-system/icons";
import type { FacetaOpcion } from "@/lib/admin/filtros-columna";
import { SUMMARY_CABECERA, usePopoverCabecera } from "./use-popover-cabecera";

/** Qué dice el disparador sin abrirlo: el valor cuando es uno, cuántos cuando
 *  son varios — tres especies no entran sin romper el ancho de la columna. */
function rotuloDeFiltro(
  elegidos: readonly string[],
  placeholder: string,
  etiqueta?: (v: string) => string,
): string {
  if (elegidos.length === 0) return placeholder;
  if (elegidos.length === 1) return etiqueta ? etiqueta(elegidos[0]) : elegidos[0];
  return `${elegidos.length} elegidos`;
}

export interface FiltroColumnaMultiProps {
  label: string;
  value: readonly string[] | undefined;
  options: readonly FacetaOpcion[];
  etiqueta?: (v: string) => string;
  onChange: (v: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function FiltroColumnaMulti({
  label,
  value,
  options,
  etiqueta,
  onChange,
  placeholder = "Todos",
  className = "",
}: FiltroColumnaMultiProps) {
  const { ref, alAbrir, estilo } = usePopoverCabecera(288);
  const elegidos = value ? [...value].filter(Boolean) : [];
  const vacio = options.length === 0;
  return (
    <details
      ref={ref}
      onToggle={alAbrir}
      className={`mt-1.5 block font-normal normal-case tracking-normal ${className}`}
    >
      <summary
        role="button"
        aria-label={`Filtrar por ${label}${elegidos.length > 0 ? `: ${elegidos.join(", ")}` : ""}`}
        title={elegidos.length > 0 ? elegidos.join(" · ") : `Filtrar por ${label}`}
        className={`${SUMMARY_CABECERA} ${vacio ? "pointer-events-none opacity-50" : ""} ${
          elegidos.length > 0 ? "border-[var(--accent)] bg-primary/10" : "border-[var(--rule-base)]"
        }`}
      >
        <span className="truncate">{vacio ? "—" : rotuloDeFiltro(elegidos, placeholder, etiqueta)}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 ${elegidos.length > 0 ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]"}`}
          aria-hidden
        />
      </summary>
      <div
        role="group"
        aria-label={`Valores de ${label}`}
        style={estilo}
        className="z-50 max-h-72 w-64 overflow-y-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--shadow-lg)]"
      >
        {options.length === 0 && <p className="px-2 py-1.5 text-sm text-[var(--text-tertiary)]">Sin valores</p>}
        {elegidos.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="mb-1 flex w-full items-center gap-1 rounded-lg px-2 py-1 text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <X className="h-3 w-3" aria-hidden />
            Limpiar ({elegidos.length})
          </button>
        )}
        {options.map((o) => {
          const marcado = elegidos.includes(o.value);
          const texto = etiqueta ? etiqueta(o.value) : o.value;
          // Cuántas líneas Y cuánto pesan (m³, soles…) — el Libro CTP ya
          // mostraba las dos cifras juntas («12 · 340.50»): el conteo solo no
          // dice si esas doce líneas son un tronco o un aserradero entero.
          const peso = o.peso != null ? `${o.count} · ${Number(o.peso).toFixed(2)}` : String(o.count);
          return (
            <label
              key={o.value}
              className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-[var(--surface-sunken)] ${
                marcado ? "bg-primary/10 font-bold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
              }`}
            >
              <input
                type="checkbox"
                checked={marcado}
                aria-label={`${label}: ${texto}`}
                onChange={() =>
                  onChange(marcado ? elegidos.filter((x) => x !== o.value) : [...elegidos, o.value])
                }
                className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
              />
              <span className="min-w-0 flex-1 truncate" title={texto}>
                {texto}
              </span>
              {/* `font-mono` es un no-op en el panel (--font-geist-mono nunca se
                  define, memoria `font-mono-no-existe-en-el-panel`): sólo
                  `tabular-nums`, que sí alinea los dígitos en la sans. */}
              <span className="shrink-0 text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-tertiary)]">
                {peso}
              </span>
            </label>
          );
        })}
      </div>
    </details>
  );
}
