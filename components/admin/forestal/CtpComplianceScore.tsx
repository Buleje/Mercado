"use client";

/**
 * El puntaje del Chequeo del período: el gauge firma y el desglose transparente
 * de cómo se compone. Sale de CtpCompliancePanel (que pasaba de 600 líneas) para
 * ir DENTRO del panel plegable «Indicadores» (Brandon 05-10).
 */

import { Gauge } from "@buleje/design-system/icons";
import { BulejeGaugeChart } from "@/components/ui-system/charts";
import type { CtpComplianceData } from "@/hooks/use-ctp-compliance";
import { ctpComplianceBreakdown, ctpComplianceTone, type CtpComplianceTone } from "@/lib/forestal/ctp-compliance";

export const TONE_LABEL: Record<CtpComplianceTone, string> = {
  success: "Cumplimiento en orden",
  warning: "Hay puntos que revisar",
  error: "Requiere atención antes de cerrar",
};

/** Color del arco del gauge por tono (tokens del DS). */
export const GAUGE_COLOR: Record<CtpComplianceTone, string> = {
  success: "var(--data-success-500)",
  warning: "var(--data-warning-500)",
  error: "var(--data-error-500)",
};

export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export default function CtpComplianceScore({ data }: { data: CtpComplianceData }) {
  const tone = ctpComplianceTone(data.score);
  const breakdown = ctpComplianceBreakdown(data.counts);
  const totalRestado = breakdown.reduce((a, d) => a + d.puntos, 0);
  return (
    <div className="grid gap-4 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-6">
      <div className="flex justify-center">
        <BulejeGaugeChart value={data.score} max={100} size={190} color={GAUGE_COLOR[tone]} sublabel="de 100" label={TONE_LABEL[tone]} />
      </div>
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Gauge className="h-4 w-4 text-[var(--text-tertiary)]" />
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            Cómo se compone · 100 {totalRestado > 0 ? `− ${totalRestado} deducidos` : "· sin deducciones"}
          </p>
        </div>
        <ul className="space-y-1.5">
          {breakdown.map((d) => (
            <li key={d.key} className="text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${d.puntos > 0 ? "bg-[var(--data-error-500)]" : "bg-[var(--data-success-500)]"}`} aria-hidden="true" />
                  <span className="truncate text-[var(--text-secondary)]">{d.label}</span>
                </span>
                {d.puntos > 0 ? (
                  <span className="shrink-0 font-mono font-bold tabular-nums text-[var(--data-error-700)]">
                    −{d.puntos} pts <span className="text-[length:var(--ts-2xs)] font-normal text-[var(--text-tertiary)]">({d.casos}{d.topeAlcanzado ? "+" : ""} {plural(d.casos, "caso", "casos")})</span>
                  </span>
                ) : (
                  <span className="shrink-0 text-xs font-bold text-[var(--data-success-700)]">sin restar</span>
                )}
              </div>
              {/* Qué hacer para recuperarlos: el label solo diagnostica, y un
                  diagnóstico sin acción se mira una vez y se deja de mirar. */}
              {d.puntos > 0 && (
                <p className="ml-4 mt-0.5 text-[length:var(--ts-2xs)] leading-snug text-[var(--text-tertiary)]">{d.accion}</p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
