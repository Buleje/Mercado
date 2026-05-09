"use client";

import { cn } from "@/lib/utils";

export type PeriodId = "today" | "7d" | "30d" | "month";

const PERIODS: { id: PeriodId; label: string }[] = [
  { id: "today", label: "Hoy" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "month", label: "Este mes" },
];

interface PeriodSelectorProps {
  value: PeriodId;
  onChange: (id: PeriodId) => void;
  className?: string;
}

export default function PeriodSelector({ value, onChange, className }: PeriodSelectorProps) {
  return (
    <div className={cn("flex gap-1.5", className)}>
      {PERIODS.map(p => (
        <button
          key={p.id}
          onClick={() => onChange(p.id)}
          className={cn(
            "px-3 py-1 rounded-full text-xs font-medium transition-colors",
            value === p.id
              ? "bg-primary text-white"
              : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--rule-soft)] dark:bg-surface dark:text-[var(--text-tertiary)] dark:hover:bg-card-border",
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
