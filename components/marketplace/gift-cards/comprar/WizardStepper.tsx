"use client";

import { Check } from "@buleje/design-system/icons";

type Props = {
  currentStep: 1 | 2 | 3 | 4;
  stepTitles?: string[];
};

const DEFAULT_STEPS = ["Monto", "Destinatario", "Dedicatoria", "Pago"];

export default function WizardStepper({ currentStep, stepTitles = DEFAULT_STEPS }: Props) {
  return (
    <nav aria-label="Progreso" className="mx-auto w-full max-w-3xl">
      <ol className="flex items-center gap-0">
        {stepTitles.map((title, idx) => {
          const stepNum = idx + 1;
          const isDone = stepNum < currentStep;
          const isCurrent = stepNum === currentStep;
          const isLast = idx === stepTitles.length - 1;

          return (
            <li key={title} className="flex flex-1 items-center">
              <div className="flex flex-col items-center">
                <span
                  aria-current={isCurrent ? "step" : undefined}
                  className={[
                    "inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold transition-colors",
                    isDone
                      ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                      : isCurrent
                        ? "border-gray-900 bg-white text-gray-900 dark:border-white dark:bg-gray-900 dark:text-white"
                        : "border-gray-200 bg-white text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-600",
                  ].join(" ")}
                >
                  {isDone ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : stepNum}
                </span>
                <span
                  className={[
                    "mt-1.5 text-[length:var(--ts-2xs)] font-semibold uppercase tracking-wide",
                    isCurrent || isDone
                      ? "text-gray-900 dark:text-white"
                      : "text-gray-400 dark:text-gray-600",
                  ].join(" ")}
                >
                  {title}
                </span>
              </div>
              {!isLast && (
                <div
                  className={[
                    "mx-2 h-px flex-1 transition-colors",
                    isDone ? "bg-gray-900 dark:bg-white" : "bg-[var(--rule-soft)] dark:bg-gray-700",
                  ].join(" ")}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
