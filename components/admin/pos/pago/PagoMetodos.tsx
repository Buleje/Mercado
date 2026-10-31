"use client";

import { cn } from "@/lib/utils";
import { METHODS } from "@/components/admin/pos/pago/pago-shared";
import type { PagoModal } from "@/components/admin/pos/pago/usePagoModal";

/**
 * Los cinco métodos en UNA fila segmentada (ícono + nombre, 48 px). Antes eran
 * cinco tarjetas de 85 px de alto con un círculo por ícono: la fila más alta del
 * modal para una decisión de un toque.
 */
export default function PagoMetodos({ p }: { p: PagoModal }) {
  const { paymentLines, elegirMetodo } = p;
  const actual = paymentLines[0]?.method;
  return (
    <div
      role="group"
      aria-label="Método de pago"
      className="grid grid-cols-5 gap-1 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-1"
    >
      {METHODS.map((m) => {
        const elegido = actual === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => elegirMetodo(m.id)}
            aria-pressed={elegido}
            data-pago-metodo={m.id}
            className={cn(
              "flex h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-xs font-semibold transition-colors lg:flex-row lg:gap-2 lg:text-sm",
              "outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
              elegido
                ? m.id === "fiado"
                  ? "bg-[var(--data-warning-50)] text-[var(--data-warning-ink)] shadow-sm ring-1 ring-[var(--data-warning-500)]"
                  : "bg-[var(--surface-raised)] text-[var(--accent-ink)] shadow-sm ring-1 ring-primary/40"
                : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]",
            )}
          >
            <m.icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="max-w-full truncate">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
