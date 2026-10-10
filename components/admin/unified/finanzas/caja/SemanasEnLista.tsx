"use client";

/**
 * Las 13 semanas en el celular: una línea por semana con su saldo final y, debajo,
 * sólo los conceptos que se mueven esa semana. La tabla de escritorio (9
 * conceptos × 13 semanas) se volvía 9 tarjetas de 13 renglones cada una —medido
 * a 400 px: 4 526 px de página— y para saber «¿cómo cierro la semana 5?» había
 * que juntar nueve tarjetas.
 *
 * No se suma nada: cada cifra es la del servidor.
 */

import { cn } from "@/lib/utils";
import { formatDateShort } from "@/lib/format";
import type { ProyeccionDeCaja } from "@/hooks/use-caja-del-negocio";
import { montoTexto } from "@/components/admin/unified/finanzas/resultado/fuentes";
import type { Fila } from "./ProyeccionSemanas";

export default function SemanasEnLista({ d, filas }: { d: ProyeccionDeCaja; filas: Fila[] }) {
  /* Los movimientos de la semana: todo menos los dos saldos, y sólo lo que no es cero. */
  const conceptos = filas.filter((f) => f.clave !== "openingBalance" && f.clave !== "closingBalance");
  return (
    <ol className="space-y-2 sm:hidden" aria-label="Las próximas 13 semanas">
      {d.weeks.map((w) => {
        const movs = conceptos
          .map((f) => ({ f, v: w[f.clave] }))
          .filter((x): x is { f: Fila; v: number } => typeof x.v === "number" && Number.isFinite(x.v) && x.v !== 0);
        const rojo = w.closingBalance < 0;
        return (
          <li
            key={w.weekNumber}
            className={cn(
              "rounded-xl border bg-[var(--surface-raised)] px-3 py-2",
              rojo ? "border-[var(--data-error-500)]" : "border-[var(--rule-base)]",
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                S{w.weekNumber} · {formatDateShort(w.weekStart)}
              </span>
              <span className={cn("text-sm font-bold tabular-nums", rojo ? "text-[var(--data-error-ink)]" : "text-[var(--text-primary)]")}>
                <span className="text-xs font-normal text-[var(--text-secondary)]">cierra en </span>
                {montoTexto(w.closingBalance)}
              </span>
            </div>
            {movs.length > 0 ? (
              <ul className="mt-1 space-y-0.5">
                {movs.map(({ f, v }) => (
                  <li key={f.clave} className="flex justify-between gap-3 text-xs text-[var(--text-secondary)]">
                    <span>
                      {f.signo} {f.label}
                    </span>
                    <span className="tabular-nums">{montoTexto(v)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">Sin movimientos</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
