"use client";

/**
 * Los cuatro tramos de antigüedad, a escala.
 *
 * La tabla de abajo lista guía por guía; esto contesta antes la pregunta con la
 * que se entra al patio: cuánto de lo parado ya es viejo. Cuatro categorías no
 * justifican un gráfico con ejes: barras proporcionales con el número al lado,
 * que se leen igual sin color porque cada tramo dice su rango y su severidad.
 *
 * A 400 px la fila se parte en dos renglones sin cortar un número por la mitad
 * («20.50» arriba y «m³» abajo era lo que pasaba antes).
 */

import type { TramoAntiguedadGuia } from "@/lib/forestal/antiguedad-por-guia";
import { formatCurrency, formatNumber } from "@/lib/format";

/** El punto y la barra de cada tono: el color va acá, el texto dice el tramo. */
export const PUNTO_TRAMO: Record<"ok" | "warn" | "danger", string> = {
  ok: "bg-[var(--data-success-500)]",
  warn: "bg-[var(--data-warning-500)]",
  danger: "bg-[var(--data-error-500)]",
};

export default function AntiguedadTramos({
  tramos,
  totM3,
}: {
  tramos: readonly TramoAntiguedadGuia[];
  totM3: number;
}) {
  if (totM3 <= 0) return null;
  return (
    <ul
      className="space-y-3 border-b border-[var(--rule-soft)] px-4 py-3"
      aria-label="Volumen por tramo de días"
    >
      {tramos.map((t) => {
        const pct = (t.m3 / totM3) * 100;
        return (
          <li key={t.tramo}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
              <span className="inline-flex items-center gap-1.5 font-bold text-[var(--text-primary)]">
                <span className={`h-2 w-2 rounded-full ${PUNTO_TRAMO[t.tono]}`} aria-hidden />
                {t.label}
                <span className="font-normal text-[var(--text-secondary)]">· {t.severidad}</span>
              </span>
              <span className="text-[var(--text-tertiary)]">
                {t.guias} {t.guias === 1 ? "guía" : "guías"}
              </span>
              <span className="ml-auto flex flex-wrap items-baseline justify-end gap-x-3">
                <span className="whitespace-nowrap font-bold tabular-nums text-[var(--text-primary)]">
                  {formatNumber(t.m3, 3)} m³
                </span>
                <span className="w-12 whitespace-nowrap text-right tabular-nums text-[var(--text-tertiary)]">
                  {formatNumber(pct, 0)} %
                </span>
                <span className="whitespace-nowrap text-right tabular-nums text-[var(--text-secondary)]">
                  {t.valor != null
                    ? `${formatCurrency(t.valor)}${t.valorParcial ? "*" : ""}`
                    : "sin costo cargado"}
                </span>
              </span>
            </div>
            <div
              className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
              aria-hidden
            >
              <div
                className={`h-full rounded-full ${PUNTO_TRAMO[t.tono]}`}
                style={{ width: `${Math.max(pct > 0 ? 2 : 0, pct)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
