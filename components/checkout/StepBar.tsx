"use client";

import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type Step = "cuenta" | "datos" | "pago" | "exito";

export const STEPS: { id: Step; label: string }[] = [
  { id: "cuenta", label: "Tu cuenta" },
  { id: "datos", label: "Tus datos" },
  { id: "pago", label: "Pago" },
];

export function StepBar({ current }: { current: Step }) {
  const idx = STEPS.findIndex((s) => s.id === current);
  return (
    <div className="flex items-center gap-0 px-8 py-4 bg-gray-50 dark:bg-card border-b dark:border-card-border">
      {STEPS.map((s, i) => (
        <div key={s.id} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center">
            <div className={cn(
              "h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold transition-all",
              i < idx ? "bg-primary text-white" :
              i === idx ? "bg-primary text-white ring-4 ring-primary/20" :
              "bg-gray-200 text-gray-400"
            )}>
              {i < idx ? <CheckCircle2 className="h-5 w-5" /> : i + 1}
            </div>
            <span className={cn("text-xs font-semibold mt-1.5 whitespace-nowrap",
              i <= idx ? "text-primary" : "text-gray-400"
            )}>{s.label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={cn("h-0.5 flex-1 mx-3 mb-5 transition-colors",
              i < idx ? "bg-primary" : "bg-gray-200"
            )} />
          )}
        </div>
      ))}
    </div>
  );
}
