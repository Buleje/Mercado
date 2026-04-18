"use client";

import { ArrowUpRight, ArrowDownRight } from "lucide-react";

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  trend?: "up" | "down" | "neutral";
}

export function StatCard({ icon, label, value, sub, trend }: StatCardProps) {
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/20 text-primary">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-[var(--text-tertiary)] font-medium">{label}</p>
        <p className="text-lg font-extrabold text-[var(--text-primary)] leading-tight mt-0.5">{value}</p>
        {sub && (
          <p
            className={`text-[length:var(--ts-2xs)] font-semibold mt-0.5 flex items-center gap-0.5 ${
              trend === "up"
                ? "text-[var(--data-success)] dark:text-[var(--data-success)]"
                : trend === "down"
                  ? "text-[var(--data-error)] dark:text-[var(--data-error)]"
                  : "text-gray-400"
            }`}
          >
            {trend === "up" && <ArrowUpRight className="w-3 h-3" />}
            {trend === "down" && <ArrowDownRight className="w-3 h-3" />}
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}
