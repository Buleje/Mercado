"use client";

import { Fragment } from "react";
import { Check } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export type Step = "cuenta" | "datos" | "pago" | "confirmar" | "exito";

/**
 * Pasos visibles en el indicador (excluye "cuenta" = pre-step de búsqueda
 * por teléfono y "exito" = post-step de éxito). Replica el patrón de
 * MarketplaceCheckoutModal: 3 circulitos con número + label + línea de
 * progreso que se llena.
 */
export const STEPS: { id: Step; label: string; num: number }[] = [
  { id: "datos", label: "Datos", num: 1 },
  { id: "pago", label: "Pago", num: 2 },
  { id: "confirmar", label: "Confirmar", num: 3 },
];

export function StepBar({ current }: { current: Step }) {
  // Se oculta en pre-step y en success screen.
  if (current === "cuenta" || current === "exito") return null;

  const stepIds = STEPS.map((s) => s.id);
  const currentIdx = stepIds.indexOf(current);

  return (
    <div className="flex items-center gap-2 sm:gap-3 px-6 py-4 border-b border-[var(--rule-soft)] bg-gradient-to-b from-[color-mix(in_oklch,var(--color-primary,#00B4A6)_4%,transparent)] to-transparent shrink-0">
      {STEPS.map(({ id, label, num }, idx) => {
        const isActive = current === id;
        const isDone = currentIdx > idx;
        return (
          <Fragment key={id}>
            {idx > 0 && (
              <div
                className={cn(
                  "flex-1 h-1 rounded-full transition-all duration-300",
                  isDone
                    ? "bg-[var(--color-primary,#00B4A6)]"
                    : "bg-[var(--rule-base)]"
                )}
              />
            )}
            <div
              className={cn(
                "flex items-center gap-2 transition-colors",
                isActive
                  ? "text-[var(--color-primary,#00B4A6)]"
                  : isDone
                    ? "text-[var(--color-primary,#00B4A6)]/70"
                    : "text-muted"
              )}
            >
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold transition-all duration-300",
                  isActive
                    ? "bg-[var(--color-primary,#00B4A6)] text-white shadow-lg shadow-[var(--color-primary,#00B4A6)]/35 scale-110 ring-4 ring-[var(--color-primary,#00B4A6)]/15"
                    : isDone
                      ? "bg-[var(--color-primary,#00B4A6)]/15 text-[var(--color-primary,#00B4A6)]"
                      : "bg-[var(--surface-sunken)] text-muted border-2 border-[var(--rule-soft)]"
                )}
              >
                {isDone ? <Check className="h-4 w-4" strokeWidth={3} /> : num}
              </div>
              <span
                className={cn(
                  "text-xs font-bold uppercase tracking-wider hidden sm:inline transition-colors",
                  isActive ? "font-extrabold" : ""
                )}
              >
                {label}
              </span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
