"use client";

/**
 * PnlHero — la pregunta de negocio en una tarjeta: ¿la plataforma gana o pierde?
 * Cruza ingresos (MRR) con el gasto real mensual → utilidad, margen, proyección
 * anual y tiendas que pagan necesarias para break-even. Brandon 2026-06-30.
 */

import { TrendingUp, TrendingDown, Target } from "@buleje/design-system/icons";
import { computePnl, fmtPen, fmtPenShort } from "./gastos-helpers";

export function PnlHero({
  mrrPen,
  runRatePen,
  payingTenants,
}: {
  mrrPen: number;
  runRatePen: number;
  payingTenants: number;
}) {
  const avgRevenue = payingTenants > 0 ? mrrPen / payingTenants : null;
  const pnl = computePnl(mrrPen, runRatePen, avgRevenue);
  const profitable = pnl.profitPen >= 0;
  const accent = profitable ? "var(--data-success-600,#059669)" : "var(--data-error-600,#dc2626)";

  // Barra ingresos vs gasto: ancho relativo al mayor de los dos.
  const scale = Math.max(mrrPen, runRatePen, 1);

  return (
    <section className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch lg:justify-between">
        {/* Veredicto */}
        <div className="min-w-0 lg:max-w-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Resultado de la plataforma / mes
          </p>
          <p className="mt-1 font-display text-4xl font-extrabold tabular-nums" style={{ color: accent }}>
            {profitable ? "+" : "−"}{fmtPen(Math.abs(pnl.profitPen))}
          </p>
          <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: accent }}>
            {profitable ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {pnl.marginPct === null
              ? "Sin ingresos aún"
              : `Margen ${pnl.marginPct.toFixed(0)}% · ${profitable ? "gana" : "pierde"} ${fmtPenShort(Math.abs(pnl.annualProfitPen))}/año`}
          </p>
        </div>

        {/* Ingresos vs gasto (barras comparativas) */}
        <div className="flex-1 space-y-3 lg:px-6">
          <Bar label="Ingresos (MRR)" value={mrrPen} scale={scale} color="var(--accent,#00a0a0)" />
          <Bar label="Gasto real / mes" value={runRatePen} scale={scale} color="var(--text-secondary)" />
        </div>

        {/* Break-even */}
        <div className="flex items-center gap-3 rounded-lg bg-[var(--surface-sunken)] px-4 py-3 lg:max-w-[200px]">
          <Target className="h-8 w-8 shrink-0 text-[var(--text-tertiary)]" strokeWidth={1.5} />
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Break-even</p>
            {pnl.breakEvenTenants === null ? (
              <p className="text-sm font-bold text-[var(--text-secondary)]">Falta dato de ticket</p>
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">
                <span className="font-display text-xl font-extrabold tabular-nums text-[var(--text-primary)]">
                  {pnl.breakEvenTenants}
                </span>{" "}
                tiendas que pagan cubren el gasto{" "}
                <span className="text-[var(--text-tertiary)]">(hoy {payingTenants})</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Bar({ label, value, scale, color }: { label: string; value: number; scale: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-[var(--text-secondary)]">{label}</span>
        <span className="tabular-nums text-sm font-extrabold text-[var(--text-primary)]">{fmtPen(value)}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[var(--rule-base)]">
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, (value / scale) * 100)}%`, background: color }} />
      </div>
    </div>
  );
}
