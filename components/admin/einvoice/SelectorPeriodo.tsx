"use client";

/** El período de Comprobantes (F36/F38): un select que comparten la lista, sus indicadores, el Excel y la Conciliación. */
import { PERIODOS, esPeriodo, type PeriodoClave } from "@/lib/comprobantes/periodo";
import { cn } from "@/lib/utils";

export const CLASE_SELECT =
  "h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

export function SelectorPeriodo({ valor, onCambiar, className, qa }: { valor: PeriodoClave; onCambiar: (p: PeriodoClave) => void; className?: string; qa?: string }) {
  return (
    <label className={cn("inline-flex items-center", className)}>
      <span className="sr-only">Período</span>
      <select
        value={valor}
        data-qa={qa ?? "selector-periodo"}
        onChange={(e) => esPeriodo(e.target.value) && onCambiar(e.target.value)}
        className={CLASE_SELECT}
      >
        {PERIODOS.map((p) => (
          <option key={p.clave} value={p.clave}>
            {p.rotulo}
          </option>
        ))}
      </select>
    </label>
  );
}
