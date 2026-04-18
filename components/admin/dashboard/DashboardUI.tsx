"use client";
import { CardTitle } from "@buleje/design-system";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { ArrowUp, ArrowDown } from "@buleje/design-system/icons";
import { cn, formatCurrency } from "@/lib/utils";

// Helpers

/* BentoGrid layout for expandAll mode — 8pt spacing via gap-6 (no gap-5) */
export function BentoGrid({ active, children }: { active: boolean; children: React.ReactNode }) {
  if (active) return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 items-start">
      {children}
    </div>
  );
  return <>{children}</>;
}

/**
 * Sparkline — color strictly semantic (success / danger / neutral / accent).
 *
 * ADR-074 Phase 2: eliminamos el colorMap con hex inline. El prop `tone`
 * es semantico, no decorativo.
 */
export function Sparkline({ data, tone = "accent" }: { data: number[]; tone?: "success" | "danger" | "neutral" | "accent" }) {
  if (data.length === 0) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data
    .map((val, i) => {
      const x = (i / (data.length - 1)) * 80;
      const y = 24 - ((val - min) / range) * 20;
      return `${x},${y}`;
    })
    .join(" ");

  const stroke = {
    success: "var(--data-success)",
    danger: "var(--data-error)",
    neutral: "var(--text-tertiary)",
    accent: "var(--accent)",
  }[tone];

  return (
    <svg width="80" height="24" className="opacity-70">
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* AA4: Animated count-up hook */
export function useCountUp(target: string, duration = 600) {
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);
  useEffect(() => {
    if (prevRef.current === target) return;
    prevRef.current = target;
    const numMatch = target.match(/([\d,.]+)/);
    if (!numMatch) {
      const rafId = requestAnimationFrame(() => setDisplay(target));
      return () => cancelAnimationFrame(rafId);
    }
    const endVal = parseFloat(numMatch[1].replace(/,/g, ""));
    if (isNaN(endVal)) {
      const rafId = requestAnimationFrame(() => setDisplay(target));
      return () => cancelAnimationFrame(rafId);
    }
    const prefix = target.slice(0, numMatch.index!);
    const suffix = target.slice(numMatch.index! + numMatch[1].length);
    const hasDecimal = numMatch[1].includes(".");
    const start = performance.now();
    let rafId: number;
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = eased * endVal;
      setDisplay(`${prefix}${hasDecimal ? current.toFixed(2) : Math.round(current).toLocaleString()}${suffix}`);
      if (progress < 1) rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [target, duration]);
  return display;
}

/**
 * Kpi (legacy helper) — DEPRECATED. Usar `UnifiedKPITile` directamente.
 *
 * Mantenido aqui para no romper consumers en masa, pero ahora todo sale
 * via tokens. El prop `accent` se ignora si no es un className valido,
 * pero se mapea a `tone` semantico para el sparkline.
 *
 * @deprecated Use `UnifiedKPITile` (shared/UnifiedKPITile.tsx) instead.
 */
export function Kpi({
  label,
  value,
  icon: Icon,
  accent: _accent,
  delta,
  sparklineData,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
  delta?: number | null;
  sparklineData?: number[];
}) {
  const animatedValue = useCountUp(value);
  const up = delta != null ? delta >= 0 : null;
  return (
    <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-soft)] px-3 sm:px-4 py-3 sm:py-4 hover:border-[var(--rule-base)] transition-all relative overflow-hidden">
      {delta != null && Math.abs(delta) >= 10 && (
        <div
          className={cn(
            "absolute top-0 left-0 right-0 h-1",
            delta >= 0 ? "bg-[var(--data-success)]" : "bg-[var(--data-error)]",
          )}
        />
      )}
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2 truncate">
        {label}
      </p>
      <div className="flex items-end justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <p className="text-base sm:text-xl font-bold text-[var(--text-primary)] tabular-nums leading-none">
            {animatedValue}
          </p>
          {delta != null && (
            <div
              className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-bold tabular-nums",
                delta >= 0
                  ? "bg-[color-mix(in_oklch,var(--data-success)_12%,transparent)] text-[var(--data-success)]"
                  : "bg-[color-mix(in_oklch,var(--data-error)_12%,transparent)] text-[var(--data-error)]",
              )}
            >
              {delta >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {Math.abs(delta).toFixed(1)}%
            </div>
          )}
          {sparklineData && sparklineData.length > 0 && (
            <div className="mt-1">
              <Sparkline data={sparklineData} tone={up === true ? "success" : up === false ? "danger" : "accent"} />
            </div>
          )}
        </div>
        <Icon className="h-4 w-4 shrink-0 mb-0.5 text-[var(--text-primary)]" />
      </div>
    </div>
  );
}

export function Card({
  title,
  icon: Icon,
  children,
  action,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-soft)] p-4">
      <div className="flex items-center justify-between mb-4">
        <CardTitle className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          <Icon className="h-3 w-3 text-[var(--text-tertiary)]" />
          {title}
        </CardTitle>
        {action}
      </div>
      {children}
    </div>
  );
}

/**
 * DBadge — DEPRECATED. Usar `StatusBadge` de shared/StatusBadge.tsx.
 *
 * Mantiene la misma API pero mapea cada color a la variante semantica
 * canonica. Consumers viejos siguen funcionando.
 *
 * @deprecated Prefiera `StatusBadge variant="success|warning|error|info|neutral"`.
 */
export function DBadge({ children, color }: { children: React.ReactNode; color: "green" | "red" | "amber" | "blue" | "purple" | "gray" }) {
  const variantMap: Record<typeof color, string> = {
    green: "bg-[color-mix(in_oklch,var(--data-success)_12%,transparent)] text-[var(--data-success)]",
    red: "bg-[color-mix(in_oklch,var(--data-error)_12%,transparent)] text-[var(--data-error)]",
    amber: "bg-[color-mix(in_oklch,var(--data-warning)_12%,transparent)] text-[var(--data-warning)]",
    blue: "bg-[color-mix(in_oklch,var(--data-info)_12%,transparent)] text-[var(--data-info)]",
    purple: "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
    gray: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  };
  return <span className={cn("inline-flex px-1.5 py-0.5 rounded text-xs font-semibold", variantMap[color])}>{children}</span>;
}

export function FlowRow({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "success" | "danger" | "warning" | "neutral" | "accent";
}) {
  const toneClass = {
    success: "text-[var(--data-success)]",
    danger: "text-[var(--data-error)]",
    warning: "text-[var(--data-warning)]",
    neutral: "text-[var(--text-secondary)]",
    accent: "text-[var(--accent)]",
  }[tone];
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-[var(--text-secondary)]">{label}</span>
      <span className={cn("text-xs font-semibold tabular-nums", toneClass)}>{value}</span>
    </div>
  );
}

export function Empty({ text = "Sin datos en este periodo" }: { text?: string }) {
  return <div className="py-8 text-center text-xs text-[var(--text-tertiary)]">{text}</div>;
}

/* V1: Elapsed timer — colores semanticos via tokens */
export function ElapsedTimer({ createdAt }: { createdAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  const mins = Math.floor((now - new Date(createdAt).getTime()) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const colorToken =
    mins > 60
      ? "text-[var(--data-error)]"
      : mins > 30
        ? "text-[var(--data-warning)]"
        : "text-[var(--data-success)]";
  return (
    <div className={cn("text-[length:var(--ts-2xs)] font-bold mt-0.5", colorToken)}>
      ⏱ {h > 0 ? `${h}h ${m}m` : `${m}m`}
    </div>
  );
}

export function Donut({ data, total, size = 96 }: { data: { total: number; color: string }[]; total: number; size?: number }) {
  const segments = useMemo(() => {
    const pcts = data.map((p) => (total > 0 ? (p.total / total) * 100 : 0));
    const cumulative = pcts.reduce<number[]>((acc, pct) => [...acc, (acc[acc.length - 1] ?? 0) + pct], []);
    return data.map((p, i) => `${p.color} ${cumulative[i - 1] ?? 0}% ${cumulative[i]}%`);
  }, [data, total]);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="w-full h-full rounded-full" style={{ background: `conic-gradient(${segments.join(", ")})` }} />
      <div
        className="absolute rounded-full bg-[var(--surface-raised)] flex items-center justify-center"
        style={{ inset: size * 0.2 }}
      >
        <span className="text-xs font-bold text-[var(--text-primary)]">{formatCurrency(total)}</span>
      </div>
    </div>
  );
}
