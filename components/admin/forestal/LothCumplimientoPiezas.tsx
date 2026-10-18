"use client";

/**
 * Las piezas del «Chequeo del libro» (Cumplimiento del Libro TH): el puntaje,
 * el veredicto en una línea, la tarjeta de cada problema y lo que está en
 * orden. Salieron de `LothCompliancePanel` (17-10) cuando la vista se partió en
 * «Chequeo» y «Cerrar el mes»; las forma `LothCumplimientoChequeo`.
 *
 * El veredicto era una caja de 72 px (título + una línea de detalle) y debajo,
 * en otra fila, los tres contadores (bloqueos · advertencias · en orden) que
 * repetían ese detalle con otras palabras. Ahora es UNA línea: el veredicto,
 * los tres contadores y el ⓘ con la frase entera.
 */

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Gauge,
  ListChecks,
  ShieldAlert,
  ShieldCheck,
} from "@buleje/design-system/icons";
import { ErrorAlert, WarningAlert } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { BulejeGaugeChart } from "@/components/ui-system/charts";
import type { LothCheck, LothComplianceResult, LothComplianceTone, LothNavTarget } from "@/lib/forestal/loth-compliance";
import { Btn } from "./ctp-shared";

export const TONE_LABEL: Record<LothComplianceTone, string> = {
  success: "Libro al día",
  warning: "Hay puntos que revisar",
  error: "Requiere atención",
};
const GAUGE_COLOR: Record<LothComplianceTone, string> = {
  success: "var(--data-success-500)",
  warning: "var(--data-warning-500)",
  error: "var(--data-error-500)",
};
export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** El puntaje y cómo se compone: la tarjeta de «Indicadores». */
export function PuntajeLoth({ result }: { result: LothComplianceResult }) {
  const { breakdown, score, tone } = result;
  const totalRestado = breakdown.reduce((a, d) => a + d.puntos, 0);
  return (
    <div className="grid gap-4 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-6">
      <div className="flex justify-center">
        <BulejeGaugeChart value={score} max={100} size={190} color={GAUGE_COLOR[tone]} sublabel="de 100" label={TONE_LABEL[tone]} />
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
            <li key={d.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="inline-flex min-w-0 items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${d.puntos > 0 ? "bg-[var(--data-error-500)]" : "bg-[var(--data-success-500)]"}`} aria-hidden="true" />
                <span className="truncate text-[var(--text-secondary)]">{d.label}</span>
              </span>
              {d.puntos > 0 ? (
                <span className="shrink-0 font-mono font-bold tabular-nums text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                  −{d.puntos} pts <span className="text-[length:var(--ts-2xs)] font-normal text-[var(--text-tertiary)]">({d.casos} {plural(d.casos, "caso", "casos")})</span>
                </span>
              ) : (
                <span className="shrink-0 text-xs font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">sin restar</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const READINESS_META = {
  ready: { Icon: ShieldCheck, box: "border-[var(--data-success-500)]/30 bg-[var(--data-success-50)] dark:bg-[var(--data-success-500)]/10", text: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]", title: "El libro resiste una fiscalización" },
  warning: { Icon: AlertTriangle, box: "border-[var(--data-warning-500)]/30 bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/10", text: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]", title: "El libro está en pie, con advertencias" },
  error: { Icon: ShieldAlert, box: "border-[var(--data-error-500)]/30 bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10", text: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]", title: "Corrige antes de una fiscalización" },
} as const;

/** El veredicto en una línea: qué tan listo está, los tres contadores y el detalle en el ⓘ. */
export function ReadinessBanner({
  readiness,
  bloqueos,
  advertencias,
  enOrden,
  onNavigate,
}: {
  readiness: LothComplianceResult["readiness"];
  bloqueos: number;
  advertencias: number;
  enOrden: number;
  onNavigate: (t: LothNavTarget) => void;
}) {
  const m = READINESS_META[readiness];
  const detail =
    readiness === "error"
      ? `${bloqueos} ${plural(bloqueos, "bloqueo debe resolverse", "bloqueos deben resolverse")}${advertencias > 0 ? ` · ${advertencias} ${plural(advertencias, "advertencia", "advertencias")} por revisar` : ""}.`
      : readiness === "warning"
        ? `Sin bloqueos · ${advertencias} ${plural(advertencias, "advertencia por revisar", "advertencias por revisar")}.`
        : "Sin bloqueos ni advertencias — la cadena de custodia está completa.";
  return (
    <div data-veredicto={readiness} className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-1.5 ${m.box}`}>
      <span className="inline-flex min-w-0 items-center gap-2">
        <m.Icon className={`h-5 w-5 shrink-0 ${m.text}`} aria-hidden="true" />
        <strong className={`text-sm font-bold ${m.text}`}>{m.title}</strong>
        <InfoTip title={m.title} what={detail} />
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <TriageChip icon={ShieldAlert} count={bloqueos} label={plural(bloqueos, "bloqueo", "bloqueos")} tone="error" />
        <TriageChip icon={AlertTriangle} count={advertencias} label={plural(advertencias, "advertencia", "advertencias")} tone="warning" />
        <TriageChip icon={CheckCircle2} count={enOrden} label="en orden" tone="success" />
      </span>
      {readiness === "ready" && (
        <Btn variant="primary" size="sm" onClick={() => onNavigate("rentabilidad")} className="ml-auto shrink-0">
          <ShieldCheck className="h-4 w-4" /> Ver rentabilidad
        </Btn>
      )}
    </div>
  );
}

const TRIAGE_TONE = {
  error: { on: "bg-[var(--data-error-100)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]", off: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]" },
  warning: { on: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]", off: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]" },
  success: { on: "bg-[var(--data-success-100)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]", off: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]" },
} as const;

function TriageChip({ icon: Icon, count, label, tone }: { icon: typeof AlertCircle; count: number; label: string; tone: keyof typeof TRIAGE_TONE }) {
  const cls = count > 0 ? TRIAGE_TONE[tone].on : TRIAGE_TONE[tone].off;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-bold ${cls}`}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span className="tabular-nums">{count}</span> {label}
    </span>
  );
}

/** Un problema: qué hacer a la vista, el porqué (la norma, las guías) en el ⓘ. */
export function ProblemCard({ check, onNavigate }: { check: LothCheck; onNavigate: () => void }) {
  const AlertComp = check.severity === "error" ? ErrorAlert : WarningAlert;
  return (
    <AlertComp
      title={check.title}
      description={
        <>
          <strong>{check.action}</strong> <InfoTip title={check.title} ancho="w-80" what={check.description} />
        </>
      }
      action={
        <Btn variant="secondary" size="sm" onClick={onNavigate}>
          {check.navigateLabel}
        </Btn>
      }
    />
  );
}

/** Lo que está en orden, plegable (abierto de entrada, como antes). */
export function EnOrden({ checks }: { checks: LothCheck[] }) {
  if (checks.length === 0) return null;
  return (
    <details open className="group rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-4 py-3 hover:bg-[var(--surface-canvas)]">
        <span className="inline-flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-[var(--data-success-600)]" />
          <span className="text-sm font-bold text-[var(--text-primary)]">
            Verificaciones en orden <span className="text-[var(--text-tertiary)]">({checks.length})</span>
          </span>
        </span>
        <span className="text-xs font-bold text-[var(--text-tertiary)] group-open:hidden">Mostrar</span>
        <span className="hidden text-xs font-bold text-[var(--text-tertiary)] group-open:inline">Ocultar</span>
      </summary>
      <ul className="grid gap-x-6 gap-y-2.5 border-t border-[var(--rule-base)] px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
        {checks.map((c) => (
          <li key={c.key} className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--data-success-600)]" />
            <span className="text-[var(--text-secondary)]">{c.okTitle}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
