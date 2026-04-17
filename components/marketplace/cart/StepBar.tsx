"use client";

import React from "react";

interface StepBarProps {
  step: "datos" | "pago" | "confirmacion";
}

const STEPS = [
  { key: "datos", label: "Datos", num: 1 },
  { key: "pago", label: "Pago", num: 2 },
  { key: "confirmacion", label: "Confirmar", num: 3 },
] as const;

export function StepBar({ step }: StepBarProps) {
  const steps = ["datos", "pago", "confirmacion"] as const;
  const currentIdx = steps.indexOf(step);

  return (
    <div className="px-5 py-3 border-b border-gray-200/60 dark:border-gray-800/60 bg-gray-50/50 dark:bg-gray-900/50">
      <div className="flex items-center gap-2">
        {STEPS.map(({ key, label, num }, idx) => {
          const isActive = step === key;
          const isDone = currentIdx > idx;
          return (
            <React.Fragment key={key}>
              {idx > 0 && (
                <div className={`flex-1 h-0.5 rounded-full ${isDone ? "bg-primary" : "bg-gray-200 dark:bg-gray-700"}`} />
              )}
              <div className={`flex items-center gap-1.5 ${isActive ? "text-primary" : isDone ? "text-primary/70" : "text-gray-400 dark:text-gray-500"}`}>
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black ${
                  isActive ? "bg-primary text-white" : isDone ? "bg-primary/20 text-primary" : "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500"
                }`}>
                  {isDone ? "✓" : num}
                </div>
                <span className="text-[10px] font-semibold hidden sm:inline">{label}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
