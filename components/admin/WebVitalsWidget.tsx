"use client";

import { useState, useEffect } from "react";
import { Activity } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface Metrics {
  lcp: number;
  cls: number;
  inp: number;
}

function getGrade(
  value: number,
  thresholds: [number, number]
): { label: string; color: string; bg: string } {
  if (value <= thresholds[0])
    return { label: "Bueno", color: "text-[var(--data-success-500)]", bg: "stroke-[var(--data-success-500)]" };
  if (value <= thresholds[1])
    return { label: "Regular", color: "text-[var(--data-warning-500)]", bg: "stroke-[var(--data-warning-500)]" };
  return { label: "Pobre", color: "text-[var(--data-error-500)]", bg: "stroke-[var(--data-error-500)]" };
}

function CircularGauge({
  value,
  label,
  unit,
  thresholds,
}: {
  value: number;
  label: string;
  unit: string;
  thresholds: [number, number];
}) {
  const grade = getGrade(value, thresholds);
  const maxVal = thresholds[1] * 1.5;
  const pct = Math.min(100, (value / maxVal) * 100);
  const circumference = 2 * Math.PI * 30;
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-20 h-20">
        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
          <circle
            cx="40"
            cy="40"
            r="30"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-gray-100 dark:text-zinc-700"
          />
          <circle
            cx="40"
            cy="40"
            r="30"
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            className={grade.bg}
            style={{
              strokeDasharray: circumference,
              strokeDashoffset,
              transition: "stroke-dashoffset 1s ease-out",
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-bold text-[var(--text-primary)] dark:text-zinc-100 tabular-nums">
            {value > 0 ? (value < 1 ? value.toFixed(3) : value < 100 ? value.toFixed(0) : value.toFixed(0)) : "-"}
          </span>
          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] uppercase">{unit}</span>
        </div>
      </div>
      <span className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-secondary)] dark:text-zinc-400">
        {label}
      </span>
      <span className={cn("text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded-full", grade.color, grade.color.replace("text-", "bg-").replace("-600", "-50"), "dark:" + grade.color.replace("text-", "bg-").replace("-600", "-900/20"))}>
        {grade.label}
      </span>
    </div>
  );
}

export default function WebVitalsWidget() {
  const [metrics, setMetrics] = useState<Metrics>({ lcp: 0, cls: 0, inp: 0 });

  useEffect(() => {
    // LCP
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length > 0) {
          const last = entries[entries.length - 1];
          setMetrics((m) => ({ ...m, lcp: last.startTime / 1000 }));
        }
      });
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
    } catch { /* not supported */ }

    // CLS
    try {
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (!(entry as any).hadRecentInput) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            clsValue += (entry as any).value ?? 0;
          }
        }
        setMetrics((m) => ({ ...m, cls: clsValue }));
      });
      clsObserver.observe({ type: "layout-shift", buffered: true });
    } catch { /* not supported */ }

    // INP (via event timing)
    try {
      let maxINP = 0;
      const inpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const duration = (entry as any).duration ?? 0;
          if (duration > maxINP) {
            maxINP = duration;
            setMetrics((m) => ({ ...m, inp: maxINP }));
          }
        }
      });
      inpObserver.observe({ type: "event", buffered: true });
    } catch { /* not supported */ }
  }, []);

  return (
    <div className="rounded-xl border border-[var(--rule-soft)] dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-[var(--text-primary)] dark:text-zinc-300">
          Core Web Vitals
        </span>
      </div>

      <div className="flex items-center justify-around gap-2">
        <CircularGauge
          value={metrics.lcp}
          label="LCP"
          unit="seg"
          thresholds={[2.5, 4]}
        />
        <CircularGauge
          value={metrics.cls}
          label="CLS"
          unit=""
          thresholds={[0.1, 0.25]}
        />
        <CircularGauge
          value={metrics.inp}
          label="INP"
          unit="ms"
          thresholds={[200, 500]}
        />
      </div>

      <p className="text-xs text-[var(--text-tertiary)] dark:text-zinc-500 text-center mt-3">
        Datos de tu navegador actual
      </p>
    </div>
  );
}
