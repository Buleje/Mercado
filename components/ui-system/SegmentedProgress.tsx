"use client";

/**
 * SegmentedProgress — Barra de progreso por pasos (checkout-style).
 *
 * Diferente a DeliveryProgressTracker (que es timeline de estados): este
 * es para un flujo lineal donde el user avanza paso a paso (datos →
 * entrega → pago → confirmacion).
 *
 * A11y: progressbar con aria-valuenow/valuemax + lista de pasos visibles
 * para lectores de pantalla.
 *
 * Uso:
 *   <SegmentedProgress
 *     steps={["Datos", "Entrega", "Pago", "Confirmar"]}
 *     currentStep={2}
 *   />
 */

import { Check } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface Props {
  steps: string[];
  /** Index del paso actual (0-based) */
  currentStep: number;
  /** Callback al clickear un step completado (para volver atras) */
  onStepClick?: (stepIndex: number) => void;
  /** Mostrar labels debajo. Default true */
  showLabels?: boolean;
  className?: string;
}

export default function SegmentedProgress({
  steps,
  currentStep,
  onStepClick,
  showLabels = true,
  className,
}: Props) {
  return (
    <div
      role="progressbar"
      aria-valuenow={currentStep + 1}
      aria-valuemin={1}
      aria-valuemax={steps.length}
      aria-label="Progreso del checkout"
      className={cn("w-full", className)}
    >
      <ol className="relative flex items-center justify-between">
        {/* Track base */}
        <div
          aria-hidden
          className="absolute left-0 right-0 top-3 h-0.5 bg-[var(--rule-base)]"
          style={{ marginInline: `${50 / steps.length}%`, width: `calc(100% - ${100 / steps.length}%)` }}
        />
        {/* Track active */}
        <div
          aria-hidden
          className="absolute left-0 top-3 h-0.5 bg-[var(--accent)] transition-[width] duration-500"
          style={{
            width:
              currentStep === 0
                ? `${50 / steps.length}%`
                : `calc(${(currentStep / (steps.length - 1)) * 100}% - ${100 / steps.length}%)`,
            marginLeft: `${50 / steps.length}%`,
          }}
        />

        {steps.map((step, i) => {
          const isDone = i < currentStep;
          const isCurrent = i === currentStep;
          const clickable = isDone && onStepClick;
          return (
            <li key={step} className="relative flex-1 flex flex-col items-center min-w-0">
              <button
                type="button"
                disabled={!clickable}
                onClick={clickable ? () => onStepClick(i) : undefined}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "relative z-10 h-6 w-6 rounded-full flex items-center justify-center transition-all",
                  isDone
                    ? "bg-[var(--accent)] text-[var(--surface-canvas)] hover:scale-110"
                    : isCurrent
                    ? "bg-[var(--surface-canvas)] border-2 border-[var(--accent)]"
                    : "bg-[var(--surface-raised)] border border-[var(--rule-base)]",
                  clickable ? "cursor-pointer" : "cursor-default",
                )}
                aria-label={`Paso ${i + 1}: ${step}${isDone ? " (completado)" : isCurrent ? " (actual)" : ""}`}
              >
                {isDone ? (
                  <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                ) : isCurrent ? (
                  <span className="h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" />
                ) : (
                  <span className="h-1 w-1 rounded-full bg-[var(--text-tertiary)]" />
                )}
              </button>
              {showLabels && (
                <p
                  className={cn(
                    "mt-2 text-[length:var(--ts-2xs)] font-bold text-center px-1 leading-tight",
                    isDone || isCurrent ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]",
                  )}
                >
                  {step}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
