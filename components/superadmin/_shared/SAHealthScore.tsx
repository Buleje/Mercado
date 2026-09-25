"use client";

// SVG circle health score (0–100)
// Tokenizado al design-system — verde (data-success) en >=70,
// teal de marca (#0d9488) en 40–69, rojo (data-error) en <40.
// Brandon 2026-06-17: sin ámbar/naranja, el rango medio usa el teal oficial.

interface SAHealthScoreProps {
  score: number;
}

export default function SAHealthScore({ score }: SAHealthScoreProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  const strokeVar =
    clamped >= 70
      ? "var(--data-success)"
      : clamped >= 40
        ? "#0d9488"
        : "var(--data-error)";
  const textColor =
    clamped >= 70
      ? "text-[var(--data-success-500)]"
      : clamped >= 40
        ? "text-teal-500"
        : "text-[var(--data-error-500)]";

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
        {/* Track */}
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-[var(--rule-base)]"
        />
        {/* Progress */}
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke={strokeVar}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      {/* Number in center (absolute, rotation-corrected) */}
      <div className="-mt-[68px] flex items-center justify-center w-20 h-20 pointer-events-none">
        <span className={`text-xl font-bold tabular-nums ${textColor}`}>{clamped}</span>
      </div>
    </div>
  );
}
