"use client";

import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type Step = "cuenta" | "datos" | "pago" | "exito";

export const STEPS: { id: Step; label: string; mobileLabel: string }[] = [
  { id: "cuenta", label: "Tu cuenta", mobileLabel: "1" },
  { id: "datos", label: "Tus datos", mobileLabel: "2" },
  { id: "pago", label: "Pago", mobileLabel: "3" },
];

export function StepBar({ current }: { current: Step }) {
  const idx = current === "exito" ? STEPS.length : STEPS.findIndex((s) => s.id === current);
  const progressPct = current === "exito" ? 100 : idx > 0 ? (idx / (STEPS.length - 1)) * 100 : 0;

  return (
    <div className="relative bg-gray-50 dark:bg-card border-b dark:border-card-border px-6 sm:px-8 pt-4 pb-5">
      {/* Mejora 17: Barra de progreso animada de fondo */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200 dark:bg-gray-700">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="flex items-center gap-0">
        {STEPS.map((s, i) => {
          const isCompleted = i < idx;
          const isCurrent = i === idx;
          return (
            <div key={s.id} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div className={cn(
                  "h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300",
                  isCompleted ? "bg-primary text-white scale-90" :
                  isCurrent ? "bg-primary text-white ring-4 ring-primary/20 scale-105" :
                  "bg-gray-200 dark:bg-gray-600 text-gray-400 dark:text-gray-500"
                )}>
                  {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : i + 1}
                </div>
                {/* Desktop: full label, Mobile: short number */}
                <span className={cn(
                  "text-xs font-semibold mt-1.5 whitespace-nowrap hidden sm:block transition-colors",
                  isCurrent ? "text-primary font-bold" :
                  isCompleted ? "text-primary" : "text-gray-400"
                )}>{s.label}</span>
                <span className={cn(
                  "text-[10px] font-bold mt-1 sm:hidden transition-colors",
                  isCurrent ? "text-primary" :
                  isCompleted ? "text-primary" : "text-gray-400"
                )}>{s.mobileLabel}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className="relative flex-1 mx-3 mb-5 h-0.5 bg-gray-200 dark:bg-gray-600 overflow-hidden">
                  <div
                    className={cn(
                      "absolute inset-y-0 left-0 bg-primary transition-all duration-500 ease-out",
                      isCompleted ? "w-full" : "w-0"
                    )}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
