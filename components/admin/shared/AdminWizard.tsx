"use client";

/**
 * AdminWizard — formularios multi-step con progress bar.
 *
 * Estandariza el flujo "paso 1 → paso 2 → paso 3 → listo" para módulos
 * como "Nuevo cliente", "Nuevo préstamo", "Arqueo de caja". Antes cada
 * uno tenía su implementación custom.
 *
 * Uso:
 *   <AdminWizard
 *     steps={[
 *       { id: "datos", label: "Datos básicos", content: <StepDatos /> },
 *       { id: "config", label: "Configuración", content: <StepConfig />, canAdvance: () => form.name.length > 0 },
 *       { id: "confirm", label: "Confirmar", content: <StepConfirm /> },
 *     ]}
 *     onFinish={async () => { await save(); }}
 *   />
 */

import { useState, useCallback, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export interface WizardStep {
  id: string;
  label: string;
  description?: string;
  content: ReactNode;
  /** Bloquea avance si devuelve false. */
  canAdvance?: () => boolean | Promise<boolean>;
}

interface Props {
  steps: WizardStep[];
  onFinish: () => void | Promise<void>;
  onCancel?: () => void;
  /** Paso inicial. Default 0. */
  initialStep?: number;
  /** Label del botón final. Default "Finalizar". */
  finishLabel?: string;
  className?: string;
}

export function AdminWizard({
  steps,
  onFinish,
  onCancel,
  initialStep = 0,
  finishLabel = "Finalizar",
  className,
}: Props) {
  const [current, setCurrent] = useState(initialStep);
  const [finishing, setFinishing] = useState(false);

  const step = steps[current];
  const isFirst = current === 0;
  const isLast = current === steps.length - 1;

  const goNext = useCallback(async () => {
    if (step.canAdvance) {
      const ok = await step.canAdvance();
      if (!ok) return;
    }
    if (isLast) {
      setFinishing(true);
      try {
        await onFinish();
      } finally {
        setFinishing(false);
      }
    } else {
      setCurrent((c) => Math.min(c + 1, steps.length - 1));
    }
  }, [step, isLast, onFinish, steps.length]);

  const goBack = useCallback(() => {
    setCurrent((c) => Math.max(c - 1, 0));
  }, []);

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Progress stepper */}
      <div className="flex items-center gap-2 mb-6">
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <div key={s.id} className="flex items-center gap-2 flex-1 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className={cn(
                    "h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors shrink-0",
                    done
                      ? "bg-[var(--data-success-500)] text-white"
                      : active
                        ? "bg-[var(--accent-600,var(--accent))] text-white"
                        : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : i + 1}
                </div>
                <div className="min-w-0 hidden sm:block">
                  <p
                    className={cn(
                      "text-xs font-semibold truncate",
                      active ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]",
                    )}
                  >
                    {s.label}
                  </p>
                  {active && s.description && (
                    <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate">
                      {s.description}
                    </p>
                  )}
                </div>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 rounded-full transition-colors",
                    done ? "bg-[var(--data-success-500)]" : "bg-[var(--rule-soft)]",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Contenido del paso actual */}
      <div className="flex-1 min-h-0">
        <div key={step.id} className="animate-step-in">
          {step.content}
        </div>
      </div>

      {/* Navegación */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-[var(--rule-soft)]">
        <div>
          {onCancel && isFirst && (
            <button
              type="button"
              onClick={onCancel}
              disabled={finishing}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
            >
              Cancelar
            </button>
          )}
          {!isFirst && (
            <button
              type="button"
              onClick={goBack}
              disabled={finishing}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
              Atrás
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => void goNext()}
          disabled={finishing}
          className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[var(--accent-600,var(--accent))] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {isLast ? (finishing ? "Guardando..." : finishLabel) : "Siguiente"}
          {!isLast && <ChevronRight className="h-4 w-4" strokeWidth={2} />}
        </button>
      </div>

      <style jsx>{`
        @keyframes step-in {
          from {
            opacity: 0;
            transform: translateX(8px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .animate-step-in {
          animation: step-in 200ms ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-step-in {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

export default AdminWizard;
