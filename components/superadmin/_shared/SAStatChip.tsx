"use client";

/**
 * components/superadmin/_shared/SAStatChip.tsx
 *
 * Audit P1 (2026-05-19): este componente reemplaza 3 clones byte-a-byte que
 * vivían en `app/superadmin/{activity,tenants,control-center}` con la misma
 * tabla TONE y la misma estructura. Una sola source of truth.
 *
 * Patrón canónico de KPI chip ejecutivo del superadmin:
 *   - 4 chips en grid (`grid-cols-2 sm:grid-cols-4 gap-3`)
 *   - Cada chip: icon 40×40 rounded-xl colorado + label + value + hint
 *   - 5 tonos: teal, violet, amber, sky, emerald
 *
 * Cuando necesites más capacidad (sparkline, delta vs anterior, sub-value),
 * usá `KPIHeroCard` (del /dashboard). SAStatChip es el default "compact".
 */

import type { LucideIcon } from "@buleje/design-system/icons";
import { cn } from "@buleje/design-system";

export type SAStatTone = "teal" | "violet" | "amber" | "sky" | "rose" | "emerald" | "slate";

const SA_STAT_TONES: Record<SAStatTone, { bg: string; text: string; border: string }> = {
  teal:    { bg: "bg-teal-500/10 dark:bg-teal-500/15",       text: "text-teal-700 dark:text-teal-300",       border: "border-teal-500/30" },
  violet:  { bg: "bg-violet-500/10 dark:bg-violet-500/15",   text: "text-violet-700 dark:text-violet-300",   border: "border-violet-500/30" },
  amber:   { bg: "bg-teal-500/10 dark:bg-teal-500/15",     text: "text-teal-700 dark:text-teal-300",     border: "border-teal-500/30" },
  sky:     { bg: "bg-sky-500/10 dark:bg-sky-500/15",         text: "text-sky-700 dark:text-sky-300",         border: "border-sky-500/30" },
  rose:    { bg: "bg-rose-500/10 dark:bg-rose-500/15",       text: "text-rose-700 dark:text-rose-300",       border: "border-rose-500/30" },
  emerald: { bg: "bg-emerald-500/10 dark:bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-500/30" },
  slate:   { bg: "bg-slate-500/10 dark:bg-slate-500/15",     text: "text-slate-700 dark:text-slate-300",     border: "border-slate-500/30" },
};

export interface SAStatChipProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  tone?: SAStatTone;
  className?: string;
}

export function SAStatChip({
  icon: Icon,
  label,
  value,
  hint,
  tone = "teal",
  className,
}: SAStatChipProps) {
  const t = SA_STAT_TONES[tone];
  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 flex items-start gap-3",
        className,
      )}
    >
      <div
        className={cn(
          "inline-flex h-10 w-10 items-center justify-center rounded-xl shrink-0 border",
          t.bg,
          t.text,
          t.border,
        )}
        aria-hidden
      >
        <Icon className="h-5 w-5" strokeWidth={2.25} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          {label}
        </p>
        <p className="mt-0.5 text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] tabular-nums leading-tight truncate">
          {value}
        </p>
        {hint && (
          <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)] truncate">{hint}</p>
        )}
      </div>
    </div>
  );
}
