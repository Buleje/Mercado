'use client';

/**
 * OnboardingProgressBar — barra de progreso compacta con labels.
 *
 * Audit P14: el diseño anterior (5 dots numerados sin labels) era
 * confuso. Ahora muestra el step actual con su label + un track delgado
 * con dots discretos.
 */

interface Props {
  currentStep: number;
  totalSteps?: number;
}

const STEP_LABELS = ["Marca", "Producto", "Cliente", "POS demo", "Listo"];

export default function OnboardingProgressBar({ currentStep, totalSteps = 5 }: Props) {
  const percentage = (currentStep / totalSteps) * 100;
  const currentLabel = STEP_LABELS[currentStep - 1] ?? "";

  return (
    <div className="w-full">
      {/* Step counter + label */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          Paso {currentStep} de {totalSteps}
        </span>
        <span className="text-sm font-semibold text-[var(--accent)]">
          {currentLabel}
        </span>
      </div>

      {/* Track con gradient progress */}
      <div className="relative h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)] ring-1 ring-inset ring-[var(--rule-base)]">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${percentage}%`,
            background: "linear-gradient(90deg, var(--accent) 0%, var(--accent-dark) 100%)",
            boxShadow: "0 0 12px -1px var(--accent-glow)",
          }}
        />
      </div>

      {/* Dots checkpoint sutiles */}
      <div className="flex items-center justify-between mt-2 px-0.5">
        {Array.from({ length: totalSteps }, (_, i) => {
          const step = i + 1;
          const reached = step <= currentStep;
          return (
            <span
              key={step}
              className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${
                reached
                  ? "bg-[var(--accent)] scale-110"
                  : "bg-[var(--rule-base)]"
              }`}
              aria-hidden
            />
          );
        })}
      </div>
    </div>
  );
}
