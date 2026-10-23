"use client";

/**
 * Las piezas del «Chequeo del período» (Cumplimiento): el veredicto de cierre,
 * los chips de triage, la tarjeta de un problema y la lista plegada de lo que
 * está en orden. Salieron de `CtpCompliancePanel` (compactación, 17-10).
 */

import { AlertCircle, AlertTriangle, CheckCircle2, ListChecks, Lock, ShieldAlert, ShieldCheck } from "@buleje/design-system/icons";
import { ErrorAlert, WarningAlert } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { plural } from "./CtpComplianceScore";
import { Btn } from "./ctp-shared";
import type { CheckDescriptor, Readiness } from "./ctp-cumplimiento-checks";
import Plegable from "@/components/admin/shared/Plegable";

const READINESS_META = {
  ready: {
    Icon: ShieldCheck,
    box: "border-[var(--data-success-500)]/30 bg-[var(--data-success-50)]",
    text: "text-[var(--data-success-700)]",
    title: "Listo para cerrar el período",
    boton: "Cerrar el mes",
  },
  warning: {
    Icon: AlertTriangle,
    box: "border-[var(--data-warning-500)]/30 bg-[var(--data-warning-50)]",
    text: "text-[var(--data-warning-700)]",
    title: "Puedes cerrar el período",
    boton: "Cerrar el mes",
  },
  error: {
    Icon: ShieldAlert,
    box: "border-[var(--data-error-500)]/30 bg-[var(--data-error-50)]",
    text: "text-[var(--data-error-700)]",
    title: "Aún no conviene cerrar",
    boton: "Ver qué impide cerrar",
  },
} as const;

/**
 * El veredicto. Su botón lleva a la pestaña hermana «Cerrar el mes» en los
 * tres estados (antes sólo «listo» tenía botón, y mandaba a Saldos): el
 * asistente de allá revisa el mes exacto y dice qué falta, paso por paso.
 */
export function ReadinessBanner({
  readiness,
  bloqueos,
  advertencias,
  periodLabel,
  onCerrar,
}: {
  readiness: Readiness;
  bloqueos: number;
  advertencias: number;
  periodLabel: string;
  onCerrar: () => void;
}) {
  const m = READINESS_META[readiness];
  const detail =
    readiness === "error"
      ? `${bloqueos} ${plural(bloqueos, "bloqueo debe resolverse", "bloqueos deben resolverse")} antes de cerrar${advertencias > 0 ? ` · ${advertencias} ${plural(advertencias, "advertencia", "advertencias")} por revisar` : ""}.`
      : readiness === "warning"
        ? `Sin bloqueos en ${periodLabel} · ${advertencias} ${plural(advertencias, "advertencia por revisar", "advertencias por revisar")}.`
        : `${periodLabel} sin bloqueos ni advertencias — el libro está al día.`;
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 p-4 ${m.box}`}>
      <div className="flex items-center gap-3">
        <m.Icon className={`h-6 w-6 shrink-0 ${m.text}`} />
        <div>
          <p className={`text-sm font-bold ${m.text}`}>{m.title}</p>
          <p className="text-xs text-[var(--text-secondary)]">{detail}</p>
        </div>
      </div>
      <Btn variant={readiness === "ready" ? "primary" : "secondary"} size="sm" onClick={onCerrar} className="shrink-0">
        <Lock className="h-4 w-4" aria-hidden /> {m.boton}
      </Btn>
    </div>
  );
}

const TRIAGE_TONE = {
  error: { on: "bg-[var(--data-error-100)] text-[var(--data-error-700)]", off: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]" },
  warning: { on: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]", off: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]" },
  success: { on: "bg-[var(--data-success-100)] text-[var(--data-success-700)]", off: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]" },
} as const;

function TriageChip({ icon: Icon, count, label, tone }: { icon: typeof AlertCircle; count: number; label: string; tone: keyof typeof TRIAGE_TONE }) {
  const cls = count > 0 ? TRIAGE_TONE[tone].on : TRIAGE_TONE[tone].off;
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold ${cls}`}>
      <Icon className="h-4 w-4" />
      <span className="tabular-nums">{count}</span> {label}
    </span>
  );
}

/** Triage: cuánto a corregir / revisar / en orden, de un vistazo. */
export function TriageChips({ bloqueos, advertencias, enOrden }: { bloqueos: number; advertencias: number; enOrden: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <TriageChip icon={ShieldAlert} count={bloqueos} label={plural(bloqueos, "bloqueo", "bloqueos")} tone="error" />
      <TriageChip icon={AlertTriangle} count={advertencias} label={plural(advertencias, "advertencia", "advertencias")} tone="warning" />
      <TriageChip icon={CheckCircle2} count={enOrden} label="en orden" tone="success" />
    </div>
  );
}

export function ProblemCard({ check, onNavigate }: { check: CheckDescriptor; onNavigate: () => void }) {
  const AlertComp = check.severity === "error" ? ErrorAlert : WarningAlert;
  return (
    <AlertComp
      icon={check.icon}
      title={check.title}
      /* A la vista, qué hay que hacer; el porqué (la norma, las GTF
         afectadas) en el ⓘ — Brandon 2026-09-24, «mucho texto». */
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

/** Lo que está en orden, plegable: una lista corta, no un muro de cajas verdes. */
export function EnOrden({ checks }: { checks: readonly CheckDescriptor[] }) {
  if (checks.length === 0) return null;
  return (
    <Plegable
      clave="ctp:cumplimiento:en-orden"
      abiertoAlInicio
      titulo={
        <span className="inline-flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-[var(--data-success-600)]" />
          <span>
            Verificaciones en orden <span className="text-[var(--text-tertiary)]">({checks.length})</span>
          </span>
        </span>
      }
    >
      <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {checks.map((c) => (
          <li key={c.key} className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--data-success-600)]" />
            <span className="text-[var(--text-secondary)]">{c.okTitle}</span>
          </li>
        ))}
      </ul>
    </Plegable>
  );
}
