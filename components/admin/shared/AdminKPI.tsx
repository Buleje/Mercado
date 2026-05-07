"use client";

import React from "react";
import { cn } from "@/lib/utils";
import AdminCard from "./AdminCard";

interface AdminKPIProps {
  label: string;
  value: string | number;
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  iconColor?: string;
  trend?: { value: number; label?: string };
  loading?: boolean;
}

function AdminKPI({ label, value, icon: Icon, iconColor = "#6b7280", trend, loading = false }: AdminKPIProps) {
  return (
    <AdminCard padding="md">
      <div className="flex flex-col gap-2">
        {Icon && (
          <div
            className="h-6 w-6 flex items-center justify-center"
          >
            <Icon className="h-6 w-6" style={{ color: iconColor }} />
          </div>
        )}

        <p className="text-xs text-[var(--text-secondary)] dark:text-zinc-400 font-medium">
          {label}
        </p>

        {loading ? (
          <div className="space-y-2">
            <div className="h-8 w-24 bg-gray-100 dark:bg-zinc-800 rounded animate-pulse" />
            <div className="h-4 w-16 bg-gray-100 dark:bg-zinc-800 rounded animate-pulse" />
          </div>
        ) : (
          <>
            <p className="text-2xl font-bold text-[var(--text-primary)]">
              {value}
            </p>

            {trend != null && (
              <div className="flex items-center gap-1">
                <span
                  className={cn(
                    "text-xs font-medium inline-flex items-center gap-0.5",
                    trend.value >= 0 ? "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" : "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",
                  )}
                >
                  {trend.value >= 0 ? "↑" : "↓"} {Math.abs(trend.value).toFixed(1)}%
                </span>
                {trend.label && (
                  <span className="text-xs text-[var(--text-tertiary)] dark:text-zinc-500">
                    {trend.label}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AdminCard>
  );
}

export default React.memo(AdminKPI);
