"use client";

/**
 * WizardStepNav — breadcrumb visual 1/5 + progress bar + labels.
 * Muestra el paso actual, permite navegar hacia atrás a pasos completados.
 */

import { Check } from "@buleje/design-system/icons";
import { cn } from "@buleje/design-system";

export interface WizardStep {
  n: 1 | 2 | 3 | 4 | 5;
  label: string;
  shortLabel: string;
}

export const WIZARD_STEPS: readonly WizardStep[] = [
  { n: 1, label: "Datos del negocio", shortLabel: "Negocio" },
  { n: 2, label: "Contacto", shortLabel: "Contacto" },
  { n: 3, label: "Verificación", shortLabel: "Verificar" },
  { n: 4, label: "Horarios y delivery", shortLabel: "Horarios" },
  { n: 5, label: "Plan", shortLabel: "Plan" },
] as const;

interface WizardStepNavProps {
  current: WizardStep["n"];
  highestCompleted: WizardStep["n"] | 0;
  onNavigate?: (step: WizardStep["n"]) => void;
}

export default function WizardStepNav({
  current,
  highestCompleted,
  onNavigate,
}: WizardStepNavProps) {
  const total = WIZARD_STEPS.length;
  const pct = Math.round(((current - 1) / (total - 1)) * 100);

  return (
    <nav aria-label="Pasos del registro" className="space-y-4">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
          Paso {current} de {total}
        </p>
        <p className="text-xs font-semibold tabular-nums text-[var(--text-secondary)]">
          {pct}% completo
        </p>
      </div>

      {/* Progress bar */}
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-[var(--text-primary)] transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Step list */}
      <ol className="grid grid-cols-5 gap-1">
        {WIZARD_STEPS.map((step) => {
          const isCurrent = step.n === current;
          const isDone = step.n <= highestCompleted && step.n < current;
          const isReachable = step.n <= highestCompleted + 1;
          const clickable = isReachable && onNavigate !== undefined && !isCurrent;

          const content = (
            <div
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg px-1 py-2 text-center transition-colors",
                clickable && "cursor-pointer hover:bg-[var(--surface-sunken)]",
                !isReachable && "opacity-40",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold tabular-nums",
                  isCurrent
                    ? "bg-[var(--text-primary)] text-[var(--surface-canvas)]"
                    : isDone
                      ? "bg-[var(--data-success)] text-white"
                      : "border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-tertiary)]",
                )}
                aria-hidden="true"
              >
                {isDone ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : step.n}
              </span>
              <span
                className={cn(
                  "hidden text-[10px] font-semibold leading-tight sm:block",
                  isCurrent
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-tertiary)]",
                )}
              >
                {step.shortLabel}
              </span>
            </div>
          );

          if (clickable) {
            return (
              <li key={step.n}>
                <button
                  type="button"
                  onClick={() => onNavigate?.(step.n)}
                  className="w-full"
                  aria-label={`Ir al paso ${step.n}: ${step.label}`}
                >
                  {content}
                </button>
              </li>
            );
          }

          return (
            <li key={step.n} aria-current={isCurrent ? "step" : undefined}>
              {content}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
