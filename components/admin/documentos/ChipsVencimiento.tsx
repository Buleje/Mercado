"use client";

/**
 * Chips de la vista «Vencimientos»: Todos · Ya vencidos · Por vencer. Esa vista
 * mezcla lo que ya venció con lo que vence en 30 días; los avisos de arriba
 * (rojo y coral) llevan directo a cada mitad.
 */

import { cn } from "@/lib/utils";

export type SoloVencimiento = "todos" | "vencidos" | "porVencer";

interface Props {
  valor: SoloVencimiento;
  onCambiar: (v: SoloVencimiento) => void;
  /** Cuántos hay de cada uno en la lista cargada. */
  cuentas: { todos: number; vencidos: number; porVencer: number };
}

const OPCIONES: { id: SoloVencimiento; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "vencidos", label: "Ya vencidos" },
  { id: "porVencer", label: "Por vencer" },
];

const ACTIVO: Record<SoloVencimiento, string> = {
  todos: "bg-primary text-white",
  vencidos: "bg-[var(--data-error-50)] text-[var(--data-error-ink)] ring-2 ring-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/15",
  porVencer: "bg-[var(--data-warning-50)] text-[var(--data-warning-ink)] ring-2 ring-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/15",
};

export default function ChipsVencimiento({ valor, onCambiar, cuentas }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Qué vencimientos ver">
      <span className="text-sm font-bold text-[var(--text-tertiary)]">Mostrar</span>
      {OPCIONES.map((o) => {
        const activo = valor === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onCambiar(o.id)}
            aria-pressed={activo}
            className={cn(
              "inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-bold transition-colors",
              activo ? ACTIVO[o.id] : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-primary",
            )}
          >
            {o.label}
            <span className="tabular-nums opacity-70">{cuentas[o.id]}</span>
          </button>
        );
      })}
    </div>
  );
}
