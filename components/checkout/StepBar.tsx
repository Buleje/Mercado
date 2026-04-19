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
    <div className="flex items-center gap-1 sm:gap-2 px-6 py-3 border-b border-gray-200/60 dark:border-gray-800/60 bg-gray-50/50 dark:bg-gray-950/50 shrink-0">
      {STEPS.map(({ id, label, num }, idx) => {
        const isActive = current === id;
        const isDone = currentIdx > idx;
        return (
          <Fragment key={id}>
            {idx > 0 && (
              <div
                className={cn(
                  "flex-1 h-0.5 rounded-full transition-colors",
                  isDone ? "bg-primary" : "bg-gray-200 dark:bg-gray-700"
                )}
              />
            )}
            <div
              className={cn(
                "flex items-center gap-1.5 transition-colors",
                isActive
                  ? "text-primary"
                  : isDone
                    ? "text-primary/70"
                    : "text-gray-400 dark:text-gray-500"
              )}
            >
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-[length:var(--ts-2xs)] font-black transition-all",
                  isActive
                    ? "bg-primary text-white shadow-md shadow-primary/30 scale-105"
                    : isDone
                      ? "bg-primary/20 text-primary"
                      : "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500"
                )}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : num}
              </div>
              <span
                className={cn(
                  "text-[length:var(--ts-2xs)] font-semibold hidden sm:inline",
                  isActive ? "font-bold" : ""
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
