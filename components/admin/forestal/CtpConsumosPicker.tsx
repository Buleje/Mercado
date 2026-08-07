"use client";

/**
 * CtpConsumosPicker — lista de ingresos consumidos en un alta de Producción
 * del Libro CTP (ADR-134). Una corrida de aserradero real mezcla varias guías;
 * cada fila es un consumo (ingreso elegido + m³ atribuidos) que el backend
 * valida contra I1 (Σ atribuido ≤ declarado) e I2 (nada consume más de lo
 * disponible) al guardar. Hoy lo usa el editor de atribución
 * (`CtpAtribucionEditor`); nació dentro del alta vieja, que ya no existe.
 */

import { AlertTriangle, Trash2 } from "@buleje/design-system/icons";
import { Field, I } from "./ctp-shared";

export interface ConsumoRow {
  woodEntryId: string;
  code: string | null;
  species: string | null;
  /** m³ sin consumir de ESTA guía al momento de elegirla (otras líneas ya restadas). */
  disponible: number;
  /** S/ por m³ — null si la factura del ingreso todavía no llegó. */
  costoUnitario: number | null;
  moneda: string;
  /** Valor del input, como string controlado. */
  volumeM3: string;
}

interface Props {
  consumos: ConsumoRow[];
  onChangeVolume: (woodEntryId: string, value: string) => void;
  onRemove: (woodEntryId: string) => void;
  totalAtribuido: number;
  volumeDeclared: number;
  costoProceso: string;
  onCostoProcesoChange: (value: string) => void;
  producedQty: number;
  producedUnitLabel: string;
}

/** Σ m³ atribuidos — single source para el auto-completado del volumen declarado. */
export function sumConsumos(consumos: ConsumoRow[]): number {
  return Math.round(consumos.reduce((acc, c) => acc + (Number(c.volumeM3) || 0), 0) * 10000) / 10000;
}

type CostoEstimado =
  | { kind: "sin_factura"; code: string }
  | { kind: "moneda_mixta" }
  | { kind: "ok"; total: number; porUnidad: number | null; moneda: string };

/** Nunca devuelve 0 cuando falta un dato: fingir margen 100% sería peor que no mostrar nada. */
function estimarCosto(consumos: ConsumoRow[], costoProceso: string, producedQty: number): CostoEstimado | null {
  if (consumos.length === 0) return null;
  const sinFactura = consumos.find((c) => c.costoUnitario == null);
  if (sinFactura) return { kind: "sin_factura", code: sinFactura.code ?? sinFactura.woodEntryId };
  const monedas = new Set(consumos.map((c) => c.moneda));
  if (monedas.size > 1) return { kind: "moneda_mixta" };
  const materiaPrima = consumos.reduce((acc, c) => acc + Number(c.costoUnitario) * (Number(c.volumeM3) || 0), 0);
  const total = materiaPrima + (Number(costoProceso) || 0);
  return { kind: "ok", total, porUnidad: producedQty > 0 ? total / producedQty : null, moneda: consumos[0].moneda };
}

export default function CtpConsumosPicker({
  consumos, onChangeVolume, onRemove, totalAtribuido, volumeDeclared, costoProceso, onCostoProcesoChange, producedQty, producedUnitLabel,
}: Props) {
  const sobreAtribuido = consumos.length > 0 && Math.round((totalAtribuido - volumeDeclared) * 10000) / 10000 > 0;
  const costo = estimarCosto(consumos, costoProceso, producedQty);

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
        <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Ingresos consumidos</span>

        {consumos.length === 0 ? (
          <p className="rounded-lg bg-[var(--surface-sunken)] px-3 py-3 text-center text-xs text-[var(--text-tertiary)]">Elegí uno o más ingresos en el buscador de arriba.</p>
        ) : (
          <ul className="space-y-1.5">
            {consumos.map((c) => {
              const overDisponible = Number(c.volumeM3) > c.disponible + 1e-9;
              return (
                <li key={c.woodEntryId} className="flex items-center gap-2 rounded-lg border border-[var(--rule-soft)] px-2.5 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-mono text-sm font-bold text-[var(--text-primary)]">{c.code ?? "—"}</span>
                      {c.species && <span className="truncate text-xs text-[var(--text-secondary)]">{c.species}</span>}
                    </div>
                    <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">disp. {Number(c.disponible).toFixed(4)} m³</span>
                  </div>
                  <input
                    type="number" step="0.0001" min="0" max={c.disponible}
                    value={c.volumeM3}
                    onChange={(e) => onChangeVolume(c.woodEntryId, e.target.value)}
                    className={`h-9 w-28 shrink-0 rounded-lg border bg-[var(--surface-raised)] px-2 text-right font-mono text-sm tabular-nums text-[var(--text-primary)] outline-none transition-colors focus:ring-1 ${overDisponible ? "border-[var(--data-error-500)] focus:border-[var(--data-error-600)] focus:ring-[var(--data-error-600)]/20" : "border-[var(--rule-base)] focus:border-[var(--data-success-600)] focus:ring-[var(--data-success-600)]/20"}`}
                  />
                  <button type="button" onClick={() => onRemove(c.woodEntryId)} aria-label={`Quitar ${c.code ?? "guía"}`} className="shrink-0 rounded-lg p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-700)]">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {consumos.some((c) => Number(c.volumeM3) > c.disponible + 1e-9) && (
          <p className="flex items-center gap-1.5 rounded-lg border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-2.5 py-1.5 text-xs font-semibold text-[var(--data-error-700)]">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Alguna guía pide más de lo disponible.
          </p>
        )}

        {consumos.length > 0 && (
          <div className="flex items-center justify-between border-t border-[var(--rule-soft)] pt-2 text-xs">
            <span className="text-[var(--text-tertiary)]">Total atribuido</span>
            <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">{totalAtribuido.toFixed(4)} m³</span>
          </div>
        )}
        {sobreAtribuido && (
          <p className="flex items-center gap-1.5 rounded-lg border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-2.5 py-1.5 text-xs font-semibold text-[var(--data-error-700)]">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> El total atribuido ({totalAtribuido.toFixed(4)} m³) supera el volumen declarado ({volumeDeclared.toFixed(4)} m³).
          </p>
        )}
      </div>

      <Field label="Costo de proceso (S/)" hint="Aserrío, secado, mano de obra — opcional">
        <input type="number" step="0.01" min="0" value={costoProceso} onChange={(e) => onCostoProcesoChange(e.target.value)} placeholder="0.00" className={`${I} font-mono tabular-nums`} />
      </Field>

      {costo && (
        <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-3 text-sm">
          {costo.kind === "sin_factura" ? (
            <p className="flex items-center gap-1.5 font-semibold text-[var(--data-warning-700)]"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Falta la factura de la guía <span className="font-mono">{costo.code}</span>: no se puede estimar el costo.</p>
          ) : costo.kind === "moneda_mixta" ? (
            <p className="flex items-center gap-1.5 font-semibold text-[var(--data-warning-700)]"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Las guías elegidas tienen monedas distintas: no se puede sumar el costo.</p>
          ) : (
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-[var(--text-secondary)]">Costo estimado</span>
              <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">{costo.moneda} {Number(costo.total).toFixed(2)}</span>
              {costo.porUnidad != null && (
                <span className="w-full text-right text-xs text-[var(--text-tertiary)]">{costo.moneda} {Number(costo.porUnidad).toFixed(2)} / {producedUnitLabel}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
