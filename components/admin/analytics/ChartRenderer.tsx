"use client";

import { cn } from "@/lib/utils";

// ── Bar Chart ────────────────────────────────────────────────────────────────

interface BarItem {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  data: BarItem[];
  maxValue?: number;
  height?: number;
  horizontal?: boolean;
  showValues?: boolean;
  className?: string;
  formatValue?: (v: number) => string;
}

export function BarChart({
  data,
  maxValue,
  height = 160,
  horizontal = false,
  showValues = true,
  className,
  formatValue = (v) => String(v),
}: BarChartProps) {
  const max = maxValue ?? Math.max(...data.map((d) => d.value), 1);

  if (horizontal) {
    return (
      <div className={cn("space-y-2", className)}>
        {data.map((item, i) => {
          const pct = max > 0 ? (item.value / max) * 100 : 0;
          return (
            <div key={i} className="space-y-0.5">
              <div className="flex justify-between text-xs">
                <span className="text-gray-700 dark:text-foreground font-medium truncate">{item.label}</span>
                {showValues && <span className="text-gray-500 dark:text-muted font-bold shrink-0">{formatValue(item.value)}</span>}
              </div>
              <div className="h-2 bg-gray-100 dark:bg-accent rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-[var(--dur-slow)]"
                  style={{ width: `${pct}%`, backgroundColor: item.color ?? "#00B4A6" }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("flex items-end gap-1", className)} style={{ height }}>
      {data.map((item, i) => {
        const pct = max > 0 ? (item.value / max) * 100 : 0;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${item.label}: ${formatValue(item.value)}`}>
            {showValues && pct > 15 && (
              <span className="text-[length:var(--ts-2xs)] font-bold text-gray-500 dark:text-muted">{formatValue(item.value)}</span>
            )}
            <div
              className="w-full rounded-t transition-all duration-[var(--dur-slow)] min-h-[2px]"
              style={{ height: `${pct}%`, backgroundColor: item.color ?? "#00B4A6" }}
            />
            <span className="text-[length:var(--ts-2xs)] text-gray-400 dark:text-muted truncate max-w-full">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Donut Chart ──────────────────────────────────────────────────────────────

interface DonutItem {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: DonutItem[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
  className?: string;
}

export function DonutChart({
  data,
  size = 160,
  thickness = 24,
  centerLabel,
  centerValue,
  className,
}: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  const segments = data.reduce<Array<DonutItem & { pct: number; start: number }>>((acc, item) => {
    const pct = (item.value / total) * 100;
    const start = acc.length > 0 ? acc[acc.length - 1].start + acc[acc.length - 1].pct : 0;
    acc.push({ ...item, pct, start });
    return acc;
  }, []);

  const gradient = segments
    .map((s) => `${s.color} ${s.start}% ${s.start + s.pct}%`)
    .join(", ");

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <div
        className="w-full h-full rounded-full"
        style={{
          background: `conic-gradient(${gradient})`,
          mask: `radial-gradient(circle ${size / 2 - thickness}px at center, transparent 99%, black 100%)`,
          WebkitMask: `radial-gradient(circle ${size / 2 - thickness}px at center, transparent 99%, black 100%)`,
        }}
      />
      {(centerLabel || centerValue) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {centerValue && <span className="text-lg font-extrabold text-gray-900 dark:text-foreground">{centerValue}</span>}
          {centerLabel && <span className="text-[length:var(--ts-2xs)] text-gray-500 dark:text-muted">{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}

// ── Gauge Chart ──────────────────────────────────────────────────────────────

interface GaugeChartProps {
  value: number; // 0-100
  size?: number;
  label?: string;
  color?: string;
  className?: string;
}

export function GaugeChart({ value, size = 120, label, color, className }: GaugeChartProps) {
  const clampedValue = Math.max(0, Math.min(100, value));
  const autoColor = color ?? (clampedValue >= 70 ? "#00B4A6" : clampedValue >= 50 ? "#f97316" : "#dc2626");
  const rotation = (clampedValue / 100) * 180;

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div className="relative" style={{ width: size, height: size / 2 }}>
        {/* Background arc */}
        <div
          className="absolute inset-0 rounded-t-full border-[12px] border-b-0 border-[var(--rule-base)] dark:border-accent"
          style={{ width: size, height: size / 2 }}
        />
        {/* Value arc */}
        <div
          className="absolute inset-0 rounded-t-full border-[12px] border-b-0 origin-bottom"
          style={{
            width: size,
            height: size / 2,
            borderColor: autoColor,
            clipPath: `polygon(0 100%, 0 0, ${50 + (rotation / 180) * 50}% 0, 50% 100%)`,
          }}
        />
        {/* Center text */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
          <span className="text-xl font-extrabold" style={{ color: autoColor }}>{clampedValue}</span>
        </div>
      </div>
      {label && <span className="text-[length:var(--ts-2xs)] text-gray-500 dark:text-muted font-medium">{label}</span>}
    </div>
  );
}

// ── Sparkline ────────────────────────────────────────────────────────────────

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

export function Sparkline({ data, width = 100, height = 30, color = "#00B4A6", className }: SparklineProps) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={width} height={height} className={className} viewBox={`0 0 ${width} ${height}`}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Waterfall Chart ──────────────────────────────────────────────────────────

interface WaterfallItem {
  label: string;
  value: number;
  type: "start" | "increase" | "decrease" | "total";
}

interface WaterfallChartProps {
  data: WaterfallItem[];
  height?: number;
  className?: string;
  formatValue?: (v: number) => string;
}

export function WaterfallChart({ data, height = 200, className, formatValue = (v) => `S/${v.toFixed(0)}` }: WaterfallChartProps) {
  // Calculate running total and max for scaling
  let running = 0;
  const computed = data.map((item) => {
    const prev = running;
    if (item.type === "start" || item.type === "total") {
      running = item.value;
    } else if (item.type === "increase") {
      running += item.value;
    } else {
      running -= Math.abs(item.value);
    }
    return { ...item, prevRunning: prev, currentRunning: running };
  });

  const allValues = computed.flatMap((c) => [c.prevRunning, c.currentRunning]);
  const maxVal = Math.max(...allValues, 1);
  const minVal = Math.min(...allValues, 0);
  const range = maxVal - minVal || 1;

  const toY = (v: number) => ((maxVal - v) / range) * (height - 40);
  const _barWidth = `${100 / data.length}%`;

  return (
    <div className={cn("relative", className)} style={{ height }}>
      <div className="flex items-end h-full gap-1">
        {computed.map((item, i) => {
          const isPositive = item.type === "start" || item.type === "increase" || item.type === "total";
          const top = toY(Math.max(item.prevRunning, item.currentRunning));
          const bottom = toY(Math.min(item.prevRunning, item.currentRunning));
          const barHeight = Math.max(bottom - top, 4);
          const color = item.type === "total" ? "#2563eb" : isPositive ? "#00B4A6" : "#dc2626";

          return (
            <div key={i} className="flex-1 flex flex-col items-center relative" style={{ height: "100%" }}>
              <div
                className="w-full rounded-sm absolute"
                style={{
                  top: `${top}px`,
                  height: `${barHeight}px`,
                  backgroundColor: color,
                }}
              />
              <span
                className="absolute text-[length:var(--ts-2xs)] font-bold"
                style={{ top: `${top - 14}px`, color }}
              >
                {formatValue(item.value)}
              </span>
              <span className="absolute bottom-0 text-[length:var(--ts-2xs)] text-gray-400 dark:text-muted truncate max-w-full text-center">
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
