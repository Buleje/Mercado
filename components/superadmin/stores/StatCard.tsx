"use client";

import { ArrowUpRight, ArrowDownRight } from "@buleje/design-system/icons";

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  trend?: "up" | "down" | "neutral";
}

export function StatCard({ icon, label, value, sub, trend }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          {icon}
        </span>
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-tight">
          {label}
        </p>
      </div>
      <p className="mt-3 font-display text-2xl font-extrabold tabular-nums tracking-tight text-[var(--text-primary)]">
        {value}
      </p>
      {sub && (
        <p
          className={`mt-1 flex items-center gap-0.5 text-xs font-bold ${
            trend === "up"
              ? "text-[var(--data-success-500)]"
              : trend === "down"
                ? "text-rose-600 dark:text-rose-400"
                : "text-[var(--text-tertiary)]"
          }`}
        >
          {trend === "up" && <ArrowUpRight className="h-3 w-3" strokeWidth={2.25} />}
          {trend === "down" && <ArrowDownRight className="h-3 w-3" strokeWidth={2.25} />}
          {sub}
        </p>
      )}
    </div>
  );
}
