"use client";

/**
 * Observaciones del plan: contador de caracteres (máx. 1000, el mismo tope del
 * servidor) y frases rápidas que se agregan en su propio renglón. Una frase que
 * ya está, o que no entra, apaga su chip en vez de cortar el texto.
 */

import { Plus } from "@buleje/design-system/icons";
import { FRASES_OBSERVACION, MAX_OBSERVACIONES, agregarFrase } from "@/lib/forestal/loth-plan-costeo";
import { cls } from "./loth-plan-ui";

const ID = "plan-costeo-notas";

export default function LothPlanCosteoNotas({ notas, onNotas }: { notas: string; onNotas: (v: string) => void }) {
  const cerca = notas.length > MAX_OBSERVACIONES * 0.9;
  return (
    <div className="col-span-2 lg:col-span-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor={ID} className="text-xs font-medium text-[var(--text-secondary)]">
          Observaciones
        </label>
        <span
          className={`text-xs tabular-nums ${cerca ? "font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-tertiary)]"}`}
        >
          {notas.length}/{MAX_OBSERVACIONES}
        </span>
      </div>
      <textarea
        id={ID}
        value={notas}
        onChange={(e) => onNotas(e.target.value)}
        rows={3}
        maxLength={MAX_OBSERVACIONES}
        placeholder="Lo que haya que recordar de este documento"
        className={`${cls} h-auto py-2`}
      />
      <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Frases rápidas">
        {FRASES_OBSERVACION.map((frase) => {
          const nuevo = agregarFrase(notas, frase);
          const yaEsta = notas.includes(frase);
          return (
            <button
              key={frase}
              type="button"
              disabled={nuevo == null}
              onClick={() => nuevo != null && onNotas(nuevo)}
              title={yaEsta ? "Ya está en las observaciones" : nuevo == null ? "No entra en el máximo de caracteres" : undefined}
              className="inline-flex min-h-8 items-center gap-1 rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:cursor-default disabled:opacity-50 disabled:hover:border-[var(--rule-base)]"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              {frase}
            </button>
          );
        })}
      </div>
    </div>
  );
}
