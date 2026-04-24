"use client";

/**
 * DeliveryProgressTracker — Timeline horizontal de pasos de pedido.
 *
 * Estados: recibido → preparando → en_camino → entregado.
 * Cada step puede tener timestamp + estado (idle/current/done).
 *
 * A11y: <ol> con role=progressbar + aria-valuenow + aria-label por step.
 *
 * Uso:
 *   <DeliveryProgressTracker
 *     currentStep="en_camino"
 *     steps={[
 *       { id: "recibido", label: "Pedido recibido", at: "14:23" },
 *       { id: "preparando", label: "Preparando", at: "14:28" },
 *       { id: "en_camino", label: "En camino", at: "14:45" },
 *       { id: "entregado", label: "Entregado" },
 *     ]}
 *   />
 */

import { Check } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface Step {
  id: string;
  label: string;
  /** Timestamp legible */
  at?: string;
  description?: string;
}

interface Props {
  steps: Step[];
  currentStep: string;
  /** Orientacion. Default "horizontal" */
  orientation?: "horizontal" | "vertical";
  className?: string;
}

export default function DeliveryProgressTracker({
  steps,
  currentStep,
  orientation = "horizontal",
  className,
}: Props) {
  const currentIdx = steps.findIndex((s) => s.id === currentStep);
  const progress = currentIdx >= 0 ? ((currentIdx + 1) / steps.length) * 100 : 0;

  if (orientation === "vertical") {
    return (
      <ol
        className={cn("flex flex-col relative", className)}
        role="progressbar"
        aria-valuenow={currentIdx + 1}
        aria-valuemin={1}
        aria-valuemax={steps.length}
        aria-label="Progreso del pedido"
      >
        {steps.map((step, i) => {
          const isDone = i < currentIdx;
          const isCurrent = i === currentIdx;
          return (
            <li key={step.id} className="flex gap-3 pb-4 last:pb-0 relative">
              {/* Connector vertical */}
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-3 top-7 bottom-0 w-0.5",
                    isDone ? "bg-[var(--accent)]" : "bg-[var(--rule-base)]",
                  )}
                />
              )}
              <div
                className={cn(
                  "relative shrink-0 h-6 w-6 rounded-full flex items-center justify-center",
                  isDone
                    ? "bg-[var(--accent)] text-[var(--surface-canvas)]"
                    : isCurrent
                    ? "bg-[var(--accent-soft)] border-2 border-[var(--accent)]"
                    : "bg-[var(--surface-sunken)] border border-[var(--rule-base)]",
                )}
              >
                {isDone ? (
                  <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                ) : isCurrent ? (
                  <span className="h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" />
                ) : (
                  <span className="h-1 w-1 rounded-full bg-[var(--text-tertiary)]" />
                )}
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={cn(
                      "text-sm font-bold",
                      isDone || isCurrent ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]",
                    )}
                  >
                    {step.label}
                  </p>
                  {step.at && (
                    <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] tabular-nums shrink-0">
                      {step.at}
                    </span>
                  )}
                </div>
                {step.description && (
                  <p className="text-xs text-[var(--text-secondary)] leading-snug mt-0.5">
                    {step.description}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    );
  }

  // Horizontal
  return (
    <div
      role="progressbar"
      aria-valuenow={currentIdx + 1}
      aria-valuemin={1}
      aria-valuemax={steps.length}
      aria-label="Progreso del pedido"
      className={cn("relative w-full", className)}
    >
      {/* Track base */}
      <div
        aria-hidden
        className="absolute left-0 right-0 top-3 h-0.5 bg-[var(--rule-base)] rounded-full"
        style={{ width: `calc(100% - ${100 / steps.length}%)`, marginInline: `${50 / steps.length}%` }}
      />
      {/* Track active */}
      <div
        aria-hidden
        className="absolute left-0 top-3 h-0.5 bg-[var(--accent)] rounded-full transition-[width] duration-500"
        style={{
          width: `calc(${progress}% - ${100 / steps.length}%)`,
          marginLeft: `${50 / steps.length}%`,
        }}
      />
      <ol className="flex items-start justify-between relative">
        {steps.map((step, i) => {
          const isDone = i < currentIdx;
          const isCurrent = i === currentIdx;
          return (
            <li key={step.id} className="flex flex-col items-center text-center flex-1 min-w-0">
              <div
                className={cn(
                  "relative z-10 h-6 w-6 rounded-full flex items-center justify-center mb-2",
                  isDone
                    ? "bg-[var(--accent)] text-[var(--surface-canvas)]"
                    : isCurrent
                    ? "bg-[var(--accent-soft)] border-2 border-[var(--accent)]"
                    : "bg-[var(--surface-raised)] border border-[var(--rule-base)]",
                )}
              >
                {isDone ? (
                  <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                ) : isCurrent ? (
                  <span className="h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" />
                ) : (
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--text-tertiary)]" />
                )}
              </div>
              <p
                className={cn(
                  "text-[length:var(--ts-2xs)] font-bold px-1 leading-tight",
                  isDone || isCurrent ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]",
                )}
              >
                {step.label}
              </p>
              {step.at && (
                <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] tabular-nums">
                  {step.at}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
