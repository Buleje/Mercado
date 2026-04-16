"use client";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { cn, formatCurrency} from "@/lib/utils";

// Helpers

/* BentoGrid layout for expandAll mode */
export function BentoGrid({ active, children }: { active: boolean; children: React.ReactNode }) {
  if (active) return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5 items-start">
      {children}
    </div>
  );
  return <>{children}</>;
}

/* Sparkline component for KPI cards */
export function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length === 0) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * 80;
    const y = 24 - ((val - min) / range) * 20;
    return `${x},${y}`;
  }).join(' ');
  
  // Infer color value from Tailwind class
  const colorMap: Record<string, string> = {
    "emerald-500": "#10b981",
    "violet-500": "#8b5cf6",
    "indigo-500": "#00B4A6",
    "cyan-500": "#06b6d4",
    "amber-500": "#f59e0b",
    "red-500": "#ef4444",
  };
  const strokeColor = colorMap[color] || "#00B4A6";
  
  return (
    <svg width="80" height="24" className="opacity-60">
      <polyline
        points={points}
        fill="none"
        stroke={strokeColor}
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

export function Kpi({ label, value, icon: Icon, accent, delta, sparklineData }: { label: string; value: string; icon: React.ComponentType<{className?:string}>; accent: string; delta?: number | null; sparklineData?: number[] }) {
  const animatedValue = useCountUp(value);
  return (
    <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border px-2 sm:px-4 py-2 sm:py-3.5 hover:border-gray-200 dark:hover:border-gray-600 transition-all relative overflow-hidden">
      {/* Visual gradient indicator on top edge for significant changes */}
      {delta != null && Math.abs(delta) >= 10 && (
        <div className={cn("absolute top-0 left-0 right-0 h-1", delta >= 0 ? "bg-linear-to-r from-emerald-400 to-green-500" : "bg-linear-to-r from-red-400 to-red-500")} />
      )}
      <p className="text-xs font-medium text-gray-400 dark:text-muted mb-2.5 truncate">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <p className="text-base sm:text-xl font-bold text-gray-900 dark:text-foreground tabular-nums leading-none">{animatedValue}</p>
          {delta != null && (
            <div className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-bold", delta >= 0 ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400" : "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400")}>
              {delta >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {Math.abs(delta).toFixed(1)}%
            </div>
          )}
          {/* Sparkline */}
          {sparklineData && sparklineData.length > 0 && (
            <div className="mt-1">
              <Sparkline data={sparklineData} color={accent.replace("text-", "")} />
            </div>
          )}
        </div>
        <Icon className={cn("h-4 w-4 shrink-0 mb-0.5", accent)} />
      </div>
    </div>
  );
}

export function Card({ title, icon: Icon, children, action }: { title: string; icon: React.ComponentType<{className?:string}>; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-gray-400 dark:text-muted" style={{letterSpacing:"0.06em"}}>
          <Icon className="h-3 w-3 text-gray-300 dark:text-muted" />{title.toUpperCase()}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

export function DBadge({ children, color }: { children: React.ReactNode; color: "green"|"red"|"amber"|"blue"|"purple"|"gray" }) {
  const m: Record<string,string> = {
    green:"bg-emerald-50 text-emerald-600", red:"bg-red-50 text-red-600",
    amber:"bg-amber-50 text-amber-600", blue:"bg-emerald-50 text-emerald-600",
    purple:"bg-purple-50 text-purple-600", gray:"bg-gray-100 text-gray-500",
  };
  return <span className={cn("inline-flex px-1.5 py-0.5 rounded text-xs font-semibold",m[color])}>{children}</span>;
}

export function FlowRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500 dark:text-muted">{label}</span>
      <span className={cn("text-xs font-semibold", color)}>{value}</span>
    </div>
  );
}

export function Empty({ text = "Sin datos en este periodo" }: { text?: string }) {
  return <div className="py-8 text-center text-xs text-gray-300 dark:text-muted">{text}</div>;
}

/* V1: Elapsed timer component */
export function ElapsedTimer({ createdAt }: { createdAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  const mins = Math.floor((now - new Date(createdAt).getTime()) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const color = mins > 60 ? "text-red-500" : mins > 30 ? "text-amber-500" : "text-emerald-500";
  return (
    <div className={cn("text-[10px] font-bold mt-0.5", color)}>
      ⏱ {h > 0 ? `${h}h ${m}m` : `${m}m`}
    </div>
  );
}

export function Donut({ data, total, size = 96 }: { data: { total: number; color: string }[]; total: number; size?: number }) {
  const segments = useMemo(() => {
    const pcts = data.map(p => total > 0 ? (p.total / total) * 100 : 0);
    const cumulative = pcts.reduce<number[]>((acc, pct) => [...acc, (acc[acc.length - 1] ?? 0) + pct], []);
    return data.map((p, i) => `${p.color} ${cumulative[i - 1] ?? 0}% ${cumulative[i]}%`);
  }, [data, total]);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="w-full h-full rounded-full" style={{ background: `conic-gradient(${segments.join(", ")})` }} />
      <div className="absolute rounded-full bg-white dark:bg-card flex items-center justify-center" style={{ inset: size*0.2 }}>
        <span className="text-xs font-bold text-gray-600 dark:text-foreground">{formatCurrency(total)}</span>
      </div>
    </div>
  );
}
