"use client";

/**
 * Los avisos del plan: lo que obliga a hacer algo HOY.
 *
 * Van arriba y FUERA de las pestañas (como en Saldos del Libro CTP): un aviso
 * escondido detrás de una pestaña es un aviso que nadie ve.
 *
 *   · el censo vino cortado → todo lo que se calcula sobre él es parcial;
 *   · una especie censada que NO figura en la resolución (tala no autorizada);
 *   · una especie con más árboles censados que los autorizados.
 *
 * Cuando todo cuadra queda una sola línea, sin caja: «todo en regla» no es un
 * aviso y no debe pesar como uno.
 */

import { AlertTriangle, Ban, CheckCircle2 } from "@buleje/design-system/icons";
import type { ControlRow } from "./loth-plan-shared";

export default function LothPlanAvisos({ rows, onResolver, truncado }: {
  rows: ControlRow[];
  onResolver?: (especie: string) => void;
  /** El censo tiene `total` árboles y se cargaron `cargados`. */
  truncado?: { total: number; cargados: number } | null;
}) {
  const hasCenso = rows.some((r) => r.censadoCount > 0);
  const noAut = rows.filter((r) => r.flags.includes("no_autorizada"));
  const excArb = rows.filter((r) => r.flags.includes("exceso_arboles"));
  const todoBien = hasCenso && noAut.length === 0 && excArb.length === 0;
  if (!truncado && !hasCenso) return null;

  return (
    <div className="space-y-2">
      {/* ⛔ Antes que cualquier otro número: si el censo vino cortado, TODO lo
          que sigue —aprovechables, volumen sobre DMC, intensidad por
          hectárea, el cuadre por especie— está calculado sobre una parte. Un
          POA equivocado que se ve completo es peor que uno que falta. */}
      {truncado && (
        <p className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            El censo tiene {truncado.total.toLocaleString("es-PE")} árboles y se cargaron {truncado.cargados.toLocaleString("es-PE")}.
            Todo el Plan Operativo está calculado sobre esos {truncado.cargados.toLocaleString("es-PE")}: no lo uses para declarar
            hasta filtrar por parcela o estado.
          </span>
        </p>
      )}

      {todoBien && (
        <p className="flex items-center gap-2 text-sm font-medium text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          Todo el censo corresponde a especies autorizadas en el plan.
        </p>
      )}

      {noAut.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]">
          <Ban className="h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 grow basis-[20rem]">
            <span className="font-bold">Especie(s) censada(s) fuera del plan aprobado: </span>
            {noAut.map((r) => r.species).join(", ")}.{" "}
            <span className="font-medium">Talar o movilizar una especie no autorizada es infracción — corrige el plan o el censo antes de emitir GTF.</span>
          </p>
          {/* El aviso trae el camino: antes decía qué estaba mal y había que
              salir a buscar dónde se arregla. */}
          <span className="flex shrink-0 flex-wrap gap-1.5">
            {noAut.map((r) => (
              <button
                key={r.species}
                type="button"
                onClick={() => onResolver?.(r.species)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--data-error-700)] px-3 text-xs font-bold text-white transition-opacity hover:opacity-90"
              >
                Resolver {r.species}
              </button>
            ))}
          </span>
        </div>
      )}

      {excArb.map((r) => (
        <div key={r.species} className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-500)]/60 bg-[var(--data-warning-100)] px-4 py-3 text-sm text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div><span className="font-bold">{r.species}:</span> censados {r.censadoCount} árboles &gt; {r.autorizadoArboles} autorizados en la resolución.</div>
        </div>
      ))}
    </div>
  );
}
