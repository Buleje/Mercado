"use client";

import React from "react";
import { cn } from "@/lib/utils";

const DAILY_TASKS = [
  "Revisar stock bajo",
  "Cobrar fiados vencidos",
  "Verificar caja",
  "Revisar pedidos pendientes",
  "Contactar proveedores",
];

export default function DailyChecklist() {
  const todayKey = `daily-checklist-${new Date().toISOString().slice(0, 10)}`;
  const [checked, setChecked] = React.useState<boolean[]>(() => {
    try {
      const raw = localStorage.getItem(todayKey);
      if (raw) return JSON.parse(raw);
    } catch {
      /* noop */
    }
    return DAILY_TASKS.map(() => false);
  });

  const toggle = (idx: number) => {
    setChecked((prev) => {
      const next = [...prev];
      next[idx] = !next[idx];
      try {
        localStorage.setItem(todayKey, JSON.stringify(next));
      } catch {
        /* noop */
      }
      return next;
    });
  };

  const completadas = checked.filter(Boolean).length;
  const total = DAILY_TASKS.length;
  const allDone = completadas === total;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
          Checklist del dia
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {completadas} de {total} completadas
          </span>
          {allDone && (
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold">
              Dia productivo!
            </span>
          )}
        </div>
      </div>
      {/* Progress bar */}
      <div className="relative h-2 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden mb-3">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            allDone ? "bg-emerald-500" : "bg-primary"
          )}
          style={{ width: `${(completadas / total) * 100}%` }}
        />
      </div>
      <div className="space-y-1.5">
        {DAILY_TASKS.map((task, i) => (
          <button
            key={i}
            onClick={() => toggle(i)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors",
              checked[i]
                ? "bg-emerald-50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-400"
                : "hover:bg-gray-50 dark:hover:bg-white/5 text-gray-700 dark:text-gray-300"
            )}
          >
            <span
              className={cn(
                "h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 text-xs transition-colors",
                checked[i]
                  ? "bg-emerald-500 border-emerald-500 text-white"
                  : "border-gray-300 dark:border-gray-600"
              )}
            >
              {checked[i] && "\u2713"}
            </span>
            <span className={checked[i] ? "line-through" : ""}>{task}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
