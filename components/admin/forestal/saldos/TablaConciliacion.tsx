"use client";

/**
 * Conciliación del período: apertura + movimientos = final (ADR-139 rollforward).
 *
 * Dos cosas que le faltaban y que un fiscalizador pide en el primer minuto:
 *
 *  · **La fila de totales.** Una tabla de conciliación sin suma obliga a hacerla
 *    a mano para comprobar que cierra, que es justo lo que la tabla existe para
 *    demostrar.
 *  · **El kardex de la especie.** El movimiento fila por fila ya existía en el
 *    sistema (`CtpKardexModal`) pero desde acá no había forma de abrirlo: la
 *    conciliación decía «consumiste 5.13 m³» y no había cómo ver de dónde.
 *
 * Y el verde del ingreso pasa a `--data-success-600` con variante dark: el 700
 * sobre superficie oscura quedaba casi negro y la columna no se leía.
 */

import { CardTitle, DataTable } from "@buleje/design-system";
import { History } from "@buleje/design-system/icons";
import { Th, n2 } from "../ctp-section-shared";
import type { Concil } from "@/hooks/use-ctp-saldos";

const FUENTE: Record<Concil["fuenteApertura"], (label: string | null) => string> = {
  cierre: (label) => `(del cierre de ${label ?? "el período anterior"})`,
  calculada: () => "(acumulada al inicio)",
  sin_apertura: () => "(sin cierre previo)",
};

export default function TablaConciliacion({
  concil,
  onKardex,
}: {
  concil: Concil;
  /** Abre el movimiento fila por fila de una especie. */
  onKardex?: (especie: string) => void;
}) {
  const filas = concil.materiaPrima;
  if (filas.length === 0) return null;

  const total = filas.reduce(
    (a, s) => ({
      apertura: a.apertura + s.apertura,
      ingreso: a.ingreso + s.ingreso,
      consumido: a.consumido + s.consumido,
      final: a.final + s.final,
    }),
    { apertura: 0, ingreso: 0, consumido: 0, final: 0 },
  );

  return (
    <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="border-b-2 border-[var(--rule-base)] px-4 py-3">
        <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
          Conciliación del período · apertura → cierre
        </CardTitle>
        <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
          Existencia de apertura {FUENTE[concil.fuenteApertura](concil.aperturaLabel)} + movimientos del período =
          existencia final. Así el saldo cuadra con el stock heredado.
        </p>
      </div>
      <DataTable className="w-full text-sm">
        <thead className="bg-[var(--surface-sunken)] text-left">
          <tr>
            <Th>Especie</Th>
            <Th className="text-right">Apertura (m³)</Th>
            <Th className="text-right">+ Ingreso</Th>
            <Th className="text-right">− Consumido</Th>
            <Th className="text-right">= Final (m³)</Th>
            {onKardex && <Th className="text-right">&nbsp;</Th>}
          </tr>
        </thead>
        <tbody>
          {filas.map((s) => (
            <tr key={s.especie} className="border-t border-[var(--rule-soft)]">
              <td className="px-4 py-2 text-[var(--text-primary)]">
                {s.especie}
                {s.cites && (
                  <span className="ml-2 rounded-full bg-[var(--data-info-500)]/15 px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-info-700)] dark:text-[var(--data-info-500)]">
                    CITES
                  </span>
                )}
              </td>
              <td className="px-4 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">{n2(s.apertura)}</td>
              <td className="px-4 py-2 text-right font-mono tabular-nums text-[var(--data-success-600)] dark:text-[var(--data-success-500)]">
                {n2(s.ingreso)}
              </td>
              <td className="px-4 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">{n2(s.consumido)}</td>
              <td
                className={`px-4 py-2 text-right font-mono font-bold tabular-nums ${
                  s.negativa ? "text-[var(--data-error-600)] dark:text-[var(--data-error-500)]" : "text-[var(--text-primary)]"
                }`}
              >
                {n2(s.final)}
              </td>
              {onKardex && (
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onKardex(s.especie)}
                    className="inline-flex items-center gap-1 rounded-lg border-2 border-[var(--rule-base)] px-2 py-1 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:bg-primary/10 hover:text-[var(--text-primary)]"
                    title={`Movimiento de ${s.especie}, fila por fila`}
                  >
                    <History className="h-3.5 w-3.5" aria-hidden /> Kardex
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        {/* El total es la prueba de que la conciliación cierra: sin él hay que
            sumar cinco columnas a mano para creerle a la tabla. */}
        <tfoot className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] font-bold">
          <tr>
            <td className="px-4 py-2.5 text-[var(--text-primary)]">Total · {filas.length} especies</td>
            <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[var(--text-primary)]">{n2(total.apertura)}</td>
            <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[var(--data-success-600)] dark:text-[var(--data-success-500)]">
              {n2(total.ingreso)}
            </td>
            <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[var(--text-primary)]">{n2(total.consumido)}</td>
            <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[var(--text-primary)]">{n2(total.final)}</td>
            {onKardex && <td />}
          </tr>
        </tfoot>
      </DataTable>
    </div>
  );
}
