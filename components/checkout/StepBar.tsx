"use client";

import { Fragment } from "react";
import { Check, Phone } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export type Step = "cuenta" | "datos" | "pago" | "confirmar" | "exito";

/**
 * Pasos visibles en el indicador (excluye "exito" = pantalla de éxito).
 * "cuenta" es el paso 0: muestra icono Phone en lugar de número.
 * Cuando el usuario entra logueado y el step inicial ya es "datos",
 * "cuenta" aparece automáticamente como completado (currentIdx > 0).
 */
export const STEPS: { id: Step; label: string; num: number | null }[] = [
  { id: "cuenta",    label: "Tu número",  num: null },
  { id: "datos",     label: "Datos",      num: 1 },
  { id: "pago",      label: "Pago",       num: 2 },
  { id: "confirmar", label: "Confirmar",  num: 3 },
];

export function StepBar({ current }: { current: Step }) {
  // Ocultar solo en la pantalla de éxito.
  if (current === "exito") return null;

  const stepIds = STEPS.map((s) => s.id);
  const currentIdx = stepIds.indexOf(current);

  return (
    <div className="flex items-center gap-2 sm:gap-3 px-6 py-4 border-b border-[var(--rule-soft)] bg-gradient-to-b from-[color-mix(in_oklch,var(--color-primary,#00A0A0)_4%,transparent)] to-transparent shrink-0">
      {STEPS.map(({ id, label, num }, idx) => {
        const isActive = current === id;
        const isDone = currentIdx > idx;
        const isCuenta = id === "cuenta";
        return (
          <Fragment key={id}>
            {idx > 0 && (
              <div
                className={cn(
                  "flex-1 h-1 rounded-full transition-all duration-300",
                  isDone
                    ? "bg-[var(--color-primary,#00A0A0)]"
                    : "bg-[var(--rule-base)]"
                )}
              />
            )}
            <div
              className={cn(
                "flex items-center gap-2 transition-colors",
                isActive
                  ? "text-[var(--color-primary,#00A0A0)]"
                  : isDone
                    ? "text-[var(--color-primary,#00A0A0)]/70"
                    : "text-muted"
              )}
            >
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold transition-all duration-300",
                  isActive
                    ? "bg-[var(--color-primary,#00A0A0)] text-white shadow-lg shadow-[var(--color-primary,#00A0A0)]/35 scale-110 ring-4 ring-[var(--color-primary,#00A0A0)]/15"
                    : isDone
                      ? "bg-[var(--color-primary,#00A0A0)]/15 text-[var(--color-primary,#00A0A0)]"
                      : "bg-[var(--surface-sunken)] text-muted border-2 border-[var(--rule-soft)]"
                )}
              >
                {isDone ? (
                  <Check className="h-4 w-4" strokeWidth={3} />
                ) : isCuenta ? (
                  <Phone className="h-4 w-4" strokeWidth={2.5} />
                ) : (
                  num
                )}
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
