"use client";

/**
 * TrendChart — barras de gasto mensual (6 meses) con tooltip de valor al hover,
 * línea punteada del tope mensual y label del máximo. Barras sobre el tope se
 * pintan en rojo. Sin dependencia de chart lib.
 */

import { useState } from "react";
import { fmtPen, fmtPenShort } from "./gastos-helpers";

export function TrendChart({
  trend,
  budgetPen,
}: {
  trend: { label: string; totalPen: number; real: boolean }[];
  budgetPen: number | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (trend.length === 0) {
    return <p className="text-sm text-[var(--text-tertiary)]">Sin datos de tendencia.</p>;
  }

  const max = Math.max(1, ...trend.map((t) => t.totalPen), budgetPen ?? 0);
  const budgetPct = budgetPen && budgetPen > 0 ? (budgetPen / max) * 100 : null;
  const anyReal = trend.some((t) => t.real);

  return (
    <div>
      <div className="relative flex h-32 items-end justify-between gap-1.5">
        {/* Línea de tope */}
        {budgetPct !== null && (
          <div
            className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-[var(--data-error-500,#ef4444)]"
            style={{ bottom: `${budgetPct}%` }}
          >
            <span className="absolute -top-4 right-0 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-600,#dc2626)]">
              tope {fmtPenShort(budgetPen!)}
            </span>
          </div>
        )}
        {trend.map((t, i) => {
          const over = budgetPen !== null && budgetPen > 0 && t.totalPen > budgetPen;
          return (
            <div
              key={i}
              className="flex flex-1 flex-col items-center gap-1"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div className="relative flex w-full flex-1 items-end">
                {hover === i && (
                  <div className="absolute -top-7 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--text-primary)] px-2 py-1 text-[length:var(--ts-2xs)] font-bold text-[var(--surface-1)] shadow">
                    {fmtPen(t.totalPen)}{!t.real && " · est."}
                  </div>
                )}
                <div
                  className={`w-full rounded-t transition-opacity ${
                    over ? "bg-[var(--data-error-500,#ef4444)]" : "bg-[var(--accent)]"
                  } ${!t.real ? "opacity-40" : hover === i ? "opacity-100" : "opacity-90"}`}
                  style={{ height: `${Math.max(4, (t.totalPen / max) * 100)}%` }}
                />
              </div>
              <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{t.label}</span>
            </div>
          );
        })}
      </div>
      {anyReal && (
        <div className="mt-2 flex items-center gap-3 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-sm bg-[var(--accent)]" /> cierre real
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-sm bg-[var(--accent)] opacity-40" /> estimado / en curso
          </span>
        </div>
      )}
    </div>
  );
}
