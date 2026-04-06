"use client";

// SVG circle health score (0–100)
// Color: >=70 green, 40–69 yellow, <40 red

interface SAHealthScoreProps {
  score: number;
}

export default function SAHealthScore({ score }: SAHealthScoreProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  const color =
    clamped >= 70 ? "#22c55e" : clamped >= 40 ? "#f59e0b" : "#ef4444";

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
          className="text-gray-200 dark:text-gray-700"
        />
        {/* Progress */}
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      {/* Number in center (absolute, rotation-corrected) */}
      <div className="-mt-[68px] flex items-center justify-center w-20 h-20 pointer-events-none">
        <span className="text-xl font-bold text-gray-900 dark:text-white">{clamped}</span>
      </div>
    </div>
  );
}
