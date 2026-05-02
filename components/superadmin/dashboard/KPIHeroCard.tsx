"use client";

/**
 * KPIHeroCard — versión expandida del StatCard del DS para los 4 KPIs principales
 * del dashboard del superadmin. Aporta:
 *   - Paleta diferenciada por tono (teal / sky / amber / purple)
 *   - Tipografía hero más grande (text-4xl) y kicker en mayúsculas
 *   - Icono con fondo tonal + ring sutil
 *   - Sparkline coloreado al tono
 *   - Gradient soft de background
 *   - Trend pill con bg, no solo color de texto
 */

import { useId, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, ArrowDownRight, Minus } from "@buleje/design-system/icons";

export type KPITone = "teal" | "sky" | "amber" | "purple" | "rose";

interface ToneStyle {
  text: string; // valor principal
  bg: string; // gradient soft
  iconBg: string;
  iconColor: string;
  ring: string;
  spark: string;
  pillBg: string;
  pillText: string;
}

const TONES: Record<KPITone, ToneStyle> = {
  teal: {
    text: "var(--brand-primary, #00B4A6)",
    bg: "linear-gradient(135deg, rgba(0,180,166,0.10) 0%, transparent 60%)",
    iconBg: "rgba(0,180,166,0.12)",
    iconColor: "#00998d",
    ring: "rgba(0,180,166,0.35)",
    spark: "#00B4A6",
    pillBg: "rgba(0,180,166,0.10)",
    pillText: "#00998d",
  },
  sky: {
    text: "#0284c7",
    bg: "linear-gradient(135deg, rgba(14,165,233,0.10) 0%, transparent 60%)",
    iconBg: "rgba(14,165,233,0.12)",
    iconColor: "#0369a1",
    ring: "rgba(14,165,233,0.35)",
    spark: "#0ea5e9",
    pillBg: "rgba(14,165,233,0.10)",
    pillText: "#0369a1",
  },
  amber: {
    text: "#b45309",
    bg: "linear-gradient(135deg, rgba(245,158,11,0.10) 0%, transparent 60%)",
    iconBg: "rgba(245,158,11,0.14)",
    iconColor: "#b45309",
    ring: "rgba(245,158,11,0.35)",
    spark: "#f59e0b",
    pillBg: "rgba(245,158,11,0.12)",
    pillText: "#92400e",
  },
  purple: {
    text: "#7c3aed",
    bg: "linear-gradient(135deg, rgba(139,92,246,0.10) 0%, transparent 60%)",
    iconBg: "rgba(139,92,246,0.12)",
    iconColor: "#6d28d9",
    ring: "rgba(139,92,246,0.35)",
    spark: "#8b5cf6",
    pillBg: "rgba(139,92,246,0.10)",
    pillText: "#6d28d9",
  },
  rose: {
    text: "#be123c",
    bg: "linear-gradient(135deg, rgba(244,63,94,0.10) 0%, transparent 60%)",
    iconBg: "rgba(244,63,94,0.12)",
    iconColor: "#be123c",
    ring: "rgba(244,63,94,0.35)",
    spark: "#f43f5e",
    pillBg: "rgba(244,63,94,0.10)",
    pillText: "#be123c",
  },
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

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  // useId() siempre llamado antes del early return — Rules of Hooks. ID
  // estable cliente/servidor → sin hydration mismatch en React 19 SSR.
  const reactId = useId();
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 100;
  const h = 32;
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
      style={{ height: 32 }}
      aria-hidden
    >
      <defs>
        <linearGradient id={lineId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon
        fill={`url(#${lineId})`}
        points={`0,${h} ${pts.join(" ")} ${w},${h}`}
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        fill="none"
        stroke={color}
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
  const t = TONES[tone];
  const trend =
    typeof delta === "number" ? (delta > 0 ? "up" : delta < 0 ? "down" : "flat") : "flat";
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  const deltaColor =
    trend === "up"
      ? "var(--data-success, #10b981)"
      : trend === "down"
        ? "var(--data-error, #ef4444)"
        : "var(--text-tertiary)";
  const deltaBg =
    trend === "up"
      ? "rgba(16,185,129,0.10)"
      : trend === "down"
        ? "rgba(239,68,68,0.10)"
        : "var(--surface-sunken)";

  return (
    <div
      className="relative overflow-hidden rounded-2xl border bg-[var(--surface-raised)] p-5 sm:p-6 transition-all hover:shadow-lg hover:-translate-y-0.5 group"
      style={{
        borderColor: "var(--rule-base)",
        backgroundImage: t.bg,
      }}
    >
      {/* Decorative corner ring */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full opacity-40 transition-opacity group-hover:opacity-60"
        style={{ background: `radial-gradient(circle, ${t.ring} 0%, transparent 70%)` }}
      />

      {/* Header: label + icon */}
      <div className="relative flex items-start justify-between gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <p className="text-[length:var(--ts-2xs,0.75rem)] font-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
            {label}
          </p>
        </div>
        <div
          className="shrink-0 rounded-xl p-2.5 ring-1 transition-transform group-hover:scale-110"
          style={{
            backgroundColor: t.iconBg,
            color: t.iconColor,
            boxShadow: `inset 0 0 0 1px ${t.ring}`,
          }}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      </div>

      {/* Value (hero) */}
      <div
        className="relative text-[length:clamp(1.75rem,2.5vw,2.5rem)] font-black tabular-nums leading-[1.05] tracking-tight"
        style={{ color: t.text }}
      >
        {value}
      </div>

      {subValue !== undefined && (
        <p className="relative mt-1.5 text-[length:var(--ts-sm)] font-semibold text-[var(--text-secondary)]">
          {subValue}
        </p>
      )}

      {/* Delta pill */}
      {(typeof delta === "number" || deltaLabel) && (
        <div className="relative mt-4 flex items-center gap-2">
          {typeof delta === "number" && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--ts-xs)] font-extrabold tabular-nums"
              style={{ backgroundColor: deltaBg, color: deltaColor }}
            >
              <TrendIcon className="h-3.5 w-3.5" aria-hidden />
              {delta > 0 ? "+" : ""}
              {delta.toFixed(1)}%
            </span>
          )}
          {deltaLabel && (
            <span className="text-[length:var(--ts-xs)] font-medium text-[var(--text-tertiary)]">
              {deltaLabel}
            </span>
          )}
        </div>
      )}

      {/* Sparkline */}
      {sparkline && sparkline.length >= 2 && (
        <MiniSparkline data={sparkline} color={t.spark} />
      )}
    </div>
  );
}
