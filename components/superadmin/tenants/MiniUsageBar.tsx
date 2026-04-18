"use client";

interface MiniUsageBarProps {
  used: number;
  max: number;
  label: string;
}

export function MiniUsageBar({ used, max, label }: MiniUsageBarProps) {
  const unlimited = max === -1;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / max) * 100));
  const color = unlimited
    ? "bg-gray-400 dark:bg-gray-600"
    : pct >= 100
    ? "bg-[var(--data-error)]"
    : pct >= 80
    ? "bg-[var(--data-warning)]"
    : "bg-teal-500";

  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
        <span>{label}</span>
        <span className={pct >= 100 ? "text-[var(--data-error)]" : pct >= 80 ? "text-[var(--data-warning)]" : ""}>
          {unlimited ? "∞" : `${used}/${max}`}
        </span>
      </div>
      <div className="h-1 bg-[var(--surface-sunken)] rounded-full overflow-hidden w-24">
        {!unlimited && (
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
        )}
        {unlimited && (
          <div className="h-full bg-gray-300 dark:bg-gray-600 rounded-full w-full opacity-30" />
        )}
      </div>
    </div>
  );
}
