"use client";

/**
 * CtpOrigenesPicker — lista de corridas de producción de las que sale un
 * despacho del Libro CTP (ADR-135). Espejo de CtpConsumosPicker del otro lado
 * de la cadena: cada fila es un origen (corrida elegida + cantidad atribuida)
 * que el backend valida contra I4 (Σ atribuido ≤ declarado) e I5 (nada sale
 * de una corrida por encima de lo que produjo) al guardar. Extraído de
 * CtpEntryForm para no pasar ~300 LOC.
 */

import { AlertTriangle, Trash2 } from "@buleje/design-system/icons";

export interface OrigenRow {
  produccionEntryId: string;
  code: string | null;
  species: string | null;
  /** Lo que le queda sin despachar a ESTA corrida al momento de elegirla (otras líneas ya restadas). */
  disponible: number;
  /** Valor del input, como string controlado. */
  quantity: string;
}

interface Props {
  origenes: OrigenRow[];
  onChangeQuantity: (produccionEntryId: string, value: string) => void;
  onRemove: (produccionEntryId: string) => void;
  totalAtribuido: number;
  quantityDeclared: number;
  /** Etiqueta de unidad de ESTE despacho (m³/Kg/pt/Unidad) — no siempre es m³ como en Producción. */
  unitLabel: string;
}

/** Σ cantidad atribuida — single source para el auto-completado de la cantidad declarada. */
export function sumOrigenes(origenes: OrigenRow[]): number {
  return Math.round(origenes.reduce((acc, o) => acc + (Number(o.quantity) || 0), 0) * 10000) / 10000;
}

export default function CtpOrigenesPicker({
  origenes, onChangeQuantity, onRemove, totalAtribuido, quantityDeclared, unitLabel,
}: Props) {
  const sobreAtribuido = origenes.length > 0 && Math.round((totalAtribuido - quantityDeclared) * 10000) / 10000 > 0;
  // Sólo se avisa si ya hay una cantidad declarada con qué comparar (si no, todo el mundo "queda incompleto").
  const faltante = !sobreAtribuido && quantityDeclared > 0 ? Math.round((quantityDeclared - totalAtribuido) * 10000) / 10000 : 0;

  return (
    <div className="space-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Sale de estas corridas</span>

      {origenes.length === 0 ? (
        <p className="rounded-lg bg-[var(--surface-sunken)] px-3 py-3 text-center text-xs text-[var(--text-tertiary)]">Elegí una o más corridas en el buscador de arriba.</p>
      ) : (
        <ul className="space-y-1.5">
          {origenes.map((o) => {
            const overDisponible = Number(o.quantity) > o.disponible + 1e-9;
            return (
              <li key={o.produccionEntryId} className="flex items-center gap-2 rounded-lg border border-[var(--rule-soft)] px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-mono text-sm font-bold text-[var(--text-primary)]">{o.code ?? "—"}</span>
                    {o.species && <span className="truncate text-xs text-[var(--text-secondary)]">{o.species}</span>}
                  </div>
                  <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">disp. {Number(o.disponible).toFixed(4)} {unitLabel}</span>
                </div>
                <input
                  type="number" step="0.0001" min="0" max={o.disponible}
                  value={o.quantity}
                  onChange={(e) => onChangeQuantity(o.produccionEntryId, e.target.value)}
                  className={`h-9 w-28 shrink-0 rounded-lg border bg-[var(--surface-raised)] px-2 text-right font-mono text-sm tabular-nums text-[var(--text-primary)] outline-none transition-colors focus:ring-1 ${overDisponible ? "border-[var(--data-error-500)] focus:border-[var(--data-error-600)] focus:ring-[var(--data-error-600)]/20" : "border-[var(--rule-base)] focus:border-[var(--data-success-600)] focus:ring-[var(--data-success-600)]/20"}`}
                />
                <button type="button" onClick={() => onRemove(o.produccionEntryId)} aria-label={`Quitar ${o.code ?? "corrida"}`} className="shrink-0 rounded-lg p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-700)]">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {origenes.some((o) => Number(o.quantity) > o.disponible + 1e-9) && (
        <p className="flex items-center gap-1.5 rounded-lg border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-2.5 py-1.5 text-xs font-semibold text-[var(--data-error-700)]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Alguna corrida pide más de lo disponible.
        </p>
      )}

      {origenes.length > 0 && (
        <div className="flex items-center justify-between border-t border-[var(--rule-soft)] pt-2 text-xs">
          <span className="text-[var(--text-tertiary)]">Total atribuido</span>
          <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">{totalAtribuido.toFixed(4)} {unitLabel}</span>
        </div>
      )}
      {sobreAtribuido && (
        <p className="flex items-center gap-1.5 rounded-lg border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-2.5 py-1.5 text-xs font-semibold text-[var(--data-error-700)]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> El total atribuido ({totalAtribuido.toFixed(4)} {unitLabel}) supera la cantidad declarada ({quantityDeclared.toFixed(4)} {unitLabel}).
        </p>
      )}
      {faltante > 0 && (
        <p className="flex items-center gap-1.5 rounded-lg border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-2.5 py-1.5 text-xs font-semibold text-[var(--data-warning-700)]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Quedan {faltante.toFixed(4)} {unitLabel} sin atribuir: la cadena de custodia de este despacho queda incompleta.
        </p>
      )}
    </div>
  );
}
