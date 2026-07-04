"use client";

/**
 * SpendHealthBanner — la salud del GASTO en una línea (complementa el PnlHero,
 * que mira la utilidad). Sintetiza datos que ya existen pero no se ven en el
 * Resumen: variación vs el mes pasado, cuánto del gasto es fijo (recurrente) vs
 * puntual, y qué % del tope estás usando. Solo lee y muestra — no calcula dinero
 * nuevo. Brandon 2026-07-04.
 */

import { Activity, TrendingUp, TrendingDown, Minus } from "@buleje/design-system/icons";
import { fmtPen } from "./gastos-helpers";

export function SpendHealthBanner({
  runRatePen,
  prevRunRatePen,
  recurringMonthlyPen,
  budgetPen,
}: {
  runRatePen: number;
  prevRunRatePen: number;
  recurringMonthlyPen: number;
  budgetPen: number | null;
}) {
  const delta = prevRunRatePen > 0 ? ((runRatePen - prevRunRatePen) / prevRunRatePen) * 100 : null;
  const fixedPct = runRatePen > 0 ? Math.round((recurringMonthlyPen / runRatePen) * 100) : null;
  const usagePct = budgetPen && budgetPen > 0 ? Math.round((runRatePen / budgetPen) * 100) : null;

  // Tono del "vs mes pasado": subir el gasto es malo (rojo), bajar es bueno.
  const trendUp = delta !== null && delta > 0.5;
  const trendDown = delta !== null && delta < -0.5;
  const TrendIcon = trendUp ? TrendingUp : trendDown ? TrendingDown : Minus;
  const trendColor = trendUp
    ? "var(--data-error-600,#dc2626)"
    : trendDown
      ? "var(--data-success-600,#059669)"
      : "var(--text-tertiary)";
  const trendText =
    delta === null
      ? "sin mes previo para comparar"
      : `${trendUp ? "subió" : trendDown ? "bajó" : "estable"} ${Math.abs(delta).toFixed(0)}% vs el mes pasado`;

  // Estado del tope.
  const usageColor =
    usagePct === null
      ? "var(--text-tertiary)"
      : usagePct >= 100
        ? "var(--data-error-600,#dc2626)"
        : usagePct >= 80
          ? "var(--data-warning-600,#d97706)"
          : "var(--data-success-600,#059669)";

  return (
    <section className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Narrativa: cuánto y hacia dónde */}
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-sunken)] text-[var(--accent)]">
            <Activity className="h-5 w-5" strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[var(--text-primary)]">Salud del gasto</p>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
              Gastás <span className="font-bold text-[var(--text-primary)]">{fmtPen(runRatePen)}</span>/mes ·{" "}
              <span className="inline-flex items-center gap-1 font-bold" style={{ color: trendColor }}>
                <TrendIcon className="h-3.5 w-3.5" aria-hidden />
                {trendText}
              </span>
              {fixedPct !== null && (
                <>
                  {" · "}
                  <span className="font-bold text-[var(--text-primary)]">{fixedPct}%</span> fijo (recurrente)
                </>
              )}
            </p>
          </div>
        </div>

        {/* Uso del tope — de un vistazo */}
        <div className="sm:w-52 sm:shrink-0">
          {usagePct === null ? (
            <p className="text-sm text-[var(--text-tertiary)]">
              Definí un <span className="font-bold text-[var(--text-secondary)]">tope mensual</span> abajo para
              recibir alertas.
            </p>
          ) : (
            <>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Uso del tope
                </span>
                <span className="text-sm font-extrabold tabular-nums" style={{ color: usageColor }}>
                  {usagePct}%
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-[var(--rule-base)]">
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{ width: `${Math.min(100, usagePct)}%`, background: usageColor }}
                />
              </div>
              <p className="mt-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                {fmtPen(runRatePen)} de {fmtPen(budgetPen!)}
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
