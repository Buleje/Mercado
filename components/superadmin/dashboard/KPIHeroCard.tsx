"use client";

/**
 * KPIHeroCard — KPI hero canónico del dashboard superadmin.
 *
 * Rediseño 2026-05-11 — alineado al patrón del proyecto:
 *  - Sin gradients ni decorative corner blurs coloridos
 *  - Value siempre `text-primary` (no más teal/sky/amber/purple saturados)
 *  - Icon badge tone-aware en `bg-[tone]/10 text-[tone]`
 *  - Sparkline en color `--accent` único
 *  - Delta pill tone-semantic (success/danger/neutral)
 *  - Tipografía `font-display extrabold tracking-tight`
 *  - Hover lift consistente con otros KPIs del proyecto
 */

import { useId, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, ArrowDownRight, Minus } from "@buleje/design-system/icons";

export type KPITone = "teal" | "sky" | "amber" | "purple" | "rose";

// Mapeo de tone (legacy prop) → solo afecta el icon badge.
// El value, sparkline y resto se mantienen en tokens neutrales canónicos.
const ICON_BG: Record<KPITone, string> = {
  teal: "bg-[var(--accent)]/10 text-[var(--accent)]",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  purple: "bg-violet-100 text-[var(--accent)] dark:bg-violet-950/40 dark:text-[var(--accent)]",
  rose: "bg-rose-100 text-[var(--accent)] dark:bg-rose-900/50 dark:text-[var(--accent)]",
};

interface Props {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone: KPITone;
  delta?: number | null;
  deltaLabel?: string;
  subValue?: ReactNode;
  sparkline?: number[];
}

function MiniSparkline({ data }: { data: number[] }) {
  const reactId = useId();
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 100;
  const h = 28;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const lineId = `spark-${reactId.replace(/:/g, "")}`;
  return (
    <svg
      className="mt-3 w-full"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ height: 28 }}
      aria-hidden
    >
      <defs>
        <linearGradient id={lineId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.25} />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon
        fill={`url(#${lineId})`}
        points={`0,${h} ${pts.join(" ")} ${w},${h}`}
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts.join(" ")}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function KPIHeroCard({
  label,
  value,
  icon: Icon,
  tone,
  delta,
  deltaLabel,
  subValue,
  sparkline,
}: Props) {
  const iconBg = ICON_BG[tone] ?? ICON_BG.teal;
  const trend =
    typeof delta === "number" ? (delta > 0 ? "up" : delta < 0 ? "down" : "flat") : "flat";
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  const deltaCls =
    trend === "up"
      ? "border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5 text-[var(--data-success-500)]"
      : trend === "down"
        ? "border-rose-300/60 bg-rose-50/60 text-[var(--accent)] dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-[var(--accent)]"
        : "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-tertiary)]";

  return (
    <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 transition hover:-translate-y-0.5 hover:shadow-md">
      {/* Header: icon badge + label */}
      <div className="flex items-center gap-2.5">
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </span>
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-tight">
          {label}
        </p>
      </div>

      {/* Value */}
      <p className="mt-3 font-display text-3xl font-extrabold tabular-nums tracking-tight text-[var(--text-primary)] leading-none">
        {value}
      </p>

      {subValue !== undefined && (
        <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">{subValue}</p>
      )}

      {/* Delta pill canónico (semántico, no decorativo) */}
      {(typeof delta === "number" || deltaLabel) && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {typeof delta === "number" && (
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider tabular-nums ${deltaCls}`}
            >
              <TrendIcon className="h-3 w-3" strokeWidth={2.5} aria-hidden />
              {delta > 0 ? "+" : ""}
              {delta.toFixed(1)}%
            </span>
          )}
          {deltaLabel && (
            <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">{deltaLabel}</span>
          )}
        </div>
      )}

      {/* Sparkline */}
      {sparkline && sparkline.length >= 2 && <MiniSparkline data={sparkline} />}
    </div>
  );
}
