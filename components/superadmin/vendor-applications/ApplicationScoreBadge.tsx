"use client";

import { CheckCircle2, XCircle, AlertTriangle } from "@buleje/design-system/icons";
import type { ApplicationScore, ApplicationTier } from "@/lib/marketplace/application-score";

const TIER: Record<ApplicationTier, { label: string; cls: string }> = {
  listo: {
    label: "Listo",
    cls: "text-[var(--data-success-700,#047857)] bg-[var(--data-success-50,#ecfdf5)] border-[var(--data-success-500)]/40 dark:bg-[var(--data-success-500)]/15",
  },
  revisar: {
    label: "Revisar",
    cls: "text-[var(--data-warning-700,#b45309)] bg-[var(--data-warning-50,#fffbeb)] border-[var(--data-warning-500)]/40 dark:bg-[var(--data-warning-500)]/15",
  },
  incompleto: {
    label: "Incompleto",
    cls: "text-[var(--data-error-700,#b91c1c)] bg-[var(--data-error-50,#fef2f2)] border-[var(--data-error-500)]/40 dark:bg-[var(--data-error-500)]/15",
  },
};

/** Chip compacto de triage para la lista de solicitudes. */
export function ApplicationScoreBadge({ score }: { score: ApplicationScore }) {
  const t = TIER[score.tier];
  return (
    <span
      title={`Score de triage: ${score.score}/100`}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider shrink-0 ${t.cls}`}
    >
      {t.label} · {score.score}
    </span>
  );
}

/** Desglose completo (checks + flags) para el drawer de detalle. */
export function ApplicationScoreBreakdown({ score }: { score: ApplicationScore }) {
  const t = TIER[score.tier];
  return (
    <div className="rounded-xl border border-[var(--rule-base)] p-3.5">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-extrabold text-[var(--text-primary)]">Triage de revisión</h4>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-extrabold ${t.cls}`}>
          {t.label} · {score.score}/100
        </span>
      </div>

      <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {score.checks.map((c) => (
          <li key={c.key} className="flex items-center gap-1.5 text-sm">
            {c.ok ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--data-success-500)]" />
            ) : (
              <XCircle className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
            )}
            <span className={c.ok ? "text-[var(--text-secondary)]" : "text-[var(--text-tertiary)] line-through"}>
              {c.label}
            </span>
            <span className="ml-auto text-xs tabular-nums text-[var(--text-tertiary)]">+{c.points}</span>
          </li>
        ))}
      </ul>

      {score.riskFlags.length > 0 && (
        <div className="mt-3 rounded-lg bg-[var(--data-error-50,#fef2f2)] dark:bg-[var(--data-error-500)]/10 p-2.5">
          <p className="flex items-center gap-1.5 text-xs font-extrabold text-[var(--data-error-700,#b91c1c)]">
            <AlertTriangle className="h-3.5 w-3.5" /> Señales para revisar
          </p>
          <ul className="mt-1 space-y-0.5">
            {score.riskFlags.map((f) => (
              <li key={f} className="text-xs text-[var(--text-secondary)]">• {f}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
