"use client";

/**
 * BillingExecutiveSummary — el TL;DR del billing: un veredicto de salud + los
 * números clave de un vistazo, arriba de los KPIs. Usa EXACTAMENTE las mismas
 * fuentes que el resto de la página (dunning.totalAtRiskPEN y el movimiento de
 * MRR) para no contradecir al panel de abajo. Solo lee/deriva. Brandon 2026-07-04.
 */

import { CheckCircle, AlertTriangle, Wallet, TrendingUp, TrendingDown } from "@buleje/design-system/icons";
import type { Dunning, MrrMovement } from "./DunningPanel";

interface Counts { total: number; paid: number; trial: number; canceled: number; free: number }

const fmtPEN = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 }).format(n);

export function BillingExecutiveSummary({
  mrrPEN,
  counts,
  dunning,
  movement,
}: {
  mrrPEN: number;
  counts: Counts;
  dunning: Dunning;
  movement: MrrMovement;
}) {
  const mrrAtRisk = dunning.totalAtRiskPEN;
  const riskRatio = mrrPEN > 0 ? mrrAtRisk / mrrPEN : 0;
  const net = movement.netNewMRRPEN;

  const health =
    counts.paid === 0 || riskRatio >= 0.15 ? "attention"
    : mrrAtRisk > 0 || net < 0 ? "watch"
    : "healthy";

  const meta = {
    healthy: { label: "Billing sano", color: "var(--data-success-700,#047857)", Icon: CheckCircle, border: "var(--data-success-500)" },
    watch: { label: "Vigilá el riesgo", color: "var(--data-warning-700,#b45309)", Icon: AlertTriangle, border: "var(--data-warning-500)" },
    attention: { label: "Requiere atención", color: "var(--data-error-700,#b91c1c)", Icon: AlertTriangle, border: "var(--data-error-500)" },
  }[health];

  return (
    <section
      className="flex flex-col gap-3 rounded-2xl border-2 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5"
      style={{ borderColor: meta.border, background: "var(--surface-raised)" }}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ background: "var(--surface-sunken)", color: meta.color }}
        >
          <meta.Icon className="h-6 w-6" strokeWidth={2} aria-hidden />
        </span>
        <div className="sm:min-w-[9rem]">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Salud del billing
          </p>
          <p className="text-base font-extrabold" style={{ color: meta.color }}>
            {meta.label}
          </p>
        </div>
      </div>

      <p className="text-sm text-[var(--text-secondary)] sm:border-l sm:border-[var(--rule-soft)] sm:pl-4">
        <span className="inline-flex items-center gap-1 font-bold text-[var(--text-primary)]">
          <Wallet className="h-4 w-4 text-[var(--accent)]" aria-hidden /> MRR {fmtPEN(mrrPEN)}
        </span>
        {net !== 0 && (
          <>
            {" "}
            <span
              className="inline-flex items-center gap-0.5 font-bold"
              style={{ color: net > 0 ? "var(--data-success-700,#047857)" : "var(--data-error-700,#b91c1c)" }}
            >
              {net > 0 ? <TrendingUp className="h-3.5 w-3.5" aria-hidden /> : <TrendingDown className="h-3.5 w-3.5" aria-hidden />}
              {net > 0 ? "+" : "−"}{fmtPEN(Math.abs(net))} neto
            </span>
          </>
        )}
        {" · "}
        <span className="font-bold text-[var(--text-primary)]">{counts.paid}</span> de {counts.total} pagando
        {counts.trial > 0 && (
          <> · <span className="font-bold text-[var(--text-primary)]">{counts.trial}</span> en trial</>
        )}
        {mrrAtRisk > 0 && (
          <>
            {" · "}
            <span className="font-bold" style={{ color: meta.color }}>
              {fmtPEN(mrrAtRisk)}/mes en riesgo
            </span>
          </>
        )}
      </p>
    </section>
  );
}
