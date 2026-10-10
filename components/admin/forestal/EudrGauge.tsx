"use client";

/**
 * EudrGauge — anillo de readiness EUDR (score 0-100). Single-source del gauge
 * que usan la Cabina EUDR del Libro TH (`LothEudrRail`) y el panel EUDR del CTP
 * (`CtpEudrPanel`). Puramente presentacional.
 */

const TONE_STROKE: Record<string, string> = {
  success: "var(--data-success-600)",
  warning: "var(--data-warning-500)",
  error: "var(--data-error-500)",
};

export default function EudrGauge({ value, tone, size = 64 }: { value: number; tone: "success" | "warning" | "error"; size?: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, value)) / 100) * c;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ height: size, width: size }}>
      <svg viewBox="0 0 64 64" className="-rotate-90" style={{ height: size, width: size }}>
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth="7" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={TONE_STROKE[tone] ?? "var(--brand-ink)"}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          className="transition-all duration-[var(--dur-slow)]"
        />
      </svg>
      <span className="absolute font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{value}</span>
    </div>
  );
}
