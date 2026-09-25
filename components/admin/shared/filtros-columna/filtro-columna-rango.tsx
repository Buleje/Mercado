"use client";

/**
 * FiltroColumnaRango — «mayor que», «entre X e Y» en la cabecera de una
 * columna NUMÉRICA o de FECHA — el otro autofiltro de Excel (Brandon,
 * 2026-09-03). Generalización de `FiltroColumnaRango` del Libro CTP: acá no
 * hay m³ ni rendimiento, sólo dos topes opcionales sobre cualquier número o
 * cualquier fecha ISO `YYYY-MM-DD` (comparan igual de bien con `<`/`>`).
 *
 * Un tope vacío no filtra ese lado: «≥ 0.5» se escribe llenando sólo el
 * primero. `esFecha` cambia el `<input>` a `type="date"` y el resumen a
 * dd/mm — el resto de la mecánica (popover, chip, quitar) es la misma.
 */

import { ChevronDown, X } from "@buleje/design-system/icons";
import type { Rango } from "@/lib/admin/filtros-columna";
import { rangoActivo } from "@/lib/admin/filtros-columna";
import { SUMMARY_CABECERA, usePopoverCabecera } from "./use-popover-cabecera";

/** dd/mm, en UTC — una fecha date-only nunca se lee con la hora local (el
 *  off-by-one de Lima: a las 20:00 el UTC ya es mañana). */
const formatearFechaCorta = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
};

export interface FiltroColumnaRangoProps {
  label: string;
  /** m³, %, S/ — se dice al lado de cada input y en el resumen. Ignorado si `esFecha`. */
  unidad?: string;
  paso?: number;
  /** `true` = columna de fecha: inputs `type="date"`, resumen dd/mm. */
  esFecha?: boolean;
  valor: Rango<number> | Rango<string> | undefined;
  onChange: (r: Rango<number> | Rango<string>) => void;
  placeholder?: string;
  className?: string;
}

export function FiltroColumnaRango({
  label,
  unidad,
  paso = 0.1,
  esFecha = false,
  valor,
  onChange,
  placeholder = "Todos",
  className = "",
}: FiltroColumnaRangoProps) {
  const { ref, alAbrir, estilo } = usePopoverCabecera(170, 240);
  const min = valor?.min ?? null;
  const max = valor?.max ?? null;
  const activo = rangoActivo(valor);
  const formatear = (v: string | number) => (esFecha ? formatearFechaCorta(String(v)) : String(v));
  const resumen = !activo
    ? placeholder
    : min != null && max != null
      ? `${formatear(min)} – ${formatear(max)}`
      : min != null
        ? `≥ ${formatear(min)}`
        : `≤ ${formatear(max as string | number)}`;
  // Un input vacío es `null` (sin tope), no 0 ni "": «≥ 0» dejaría afuera lo
  // negativo y, peor, se leería como un filtro puesto cuando sólo se borró.
  const leer = (v: string): number | string | null => {
    if (v.trim() === "") return null;
    return esFecha ? v : Number(v);
  };
  const campo =
    "h-10 w-24 rounded-lg border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
  return (
    <details
      ref={ref}
      onToggle={alAbrir}
      className={`mt-1.5 block font-normal normal-case tracking-normal ${className}`}
    >
      <summary
        role="button"
        aria-label={`Filtrar ${label} por rango`}
        className={`${SUMMARY_CABECERA} ${activo ? "border-[var(--accent)] bg-primary/10" : "border-[var(--rule-base)]"}`}
      >
        <span className="truncate tabular-nums">{resumen}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 ${activo ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]"}`}
          aria-hidden
        />
      </summary>
      <div
        style={estilo}
        className={`z-50 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 shadow-[var(--shadow-lg)] ${
          esFecha ? "w-64" : "w-60"
        }`}
      >
        <p className="mb-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          {label} {unidad && !esFecha ? `(${unidad})` : ""}
        </p>
        <div className="flex items-center gap-2">
          <input
            type={esFecha ? "date" : "number"}
            inputMode={esFecha ? undefined : "decimal"}
            step={esFecha ? undefined : paso}
            value={min ?? ""}
            onChange={(e) => onChange({ min: leer(e.target.value), max } as Rango<never>)}
            placeholder="desde"
            aria-label={`${label} desde`}
            className={esFecha ? `${campo} w-28` : campo}
          />
          <span className="text-sm text-[var(--text-tertiary)]">–</span>
          <input
            type={esFecha ? "date" : "number"}
            inputMode={esFecha ? undefined : "decimal"}
            step={esFecha ? undefined : paso}
            value={max ?? ""}
            onChange={(e) => onChange({ min, max: leer(e.target.value) } as Rango<never>)}
            placeholder="hasta"
            aria-label={`${label} hasta`}
            className={esFecha ? `${campo} w-28` : campo}
          />
        </div>
        {activo && (
          <button
            type="button"
            onClick={() => onChange({ min: null, max: null })}
            className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X className="h-3.5 w-3.5" aria-hidden /> Quitar el rango
          </button>
        )}
      </div>
    </details>
  );
}
