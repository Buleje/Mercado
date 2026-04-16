"use client";
import React from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface KPICardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string; // hex color eg "var(--color-primary)"
  change?: number; // percentage change eg 12.5 or -3.2
  subtitle?: string;
  alert?: boolean; // red styling when true
  onClick?: () => void;
  className?: string;
}

function KPICard({ label, value, icon: Icon, color, change, subtitle, alert, onClick, className }: KPICardProps) {
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter") onClick(); } : undefined}
      className={cn(
        "bg-white dark:bg-card rounded-xl  p-4 border-l-[3px] border border-gray-100 dark:border-card-border transition-all",
        onClick && "cursor-pointer hover:shadow-sm hover:scale-[1.02]",
        className,
      )}
      style={{ borderLeftColor: alert ? "#e63946" : color }}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium truncate">
            {label}
          </p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <p className={cn(
              "text-2xl font-mono font-bold truncate",
              alert ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white",
            )}>
              {value}
            </p>
            {change != null && (
              <span className={cn(
                "text-xs font-medium shrink-0",
                change >= 0 ? "text-emerald-600" : "text-red-500",
              )}>
                {change >= 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)}%
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
        <div
          className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${alert ? "#e63946" : color}15` }}
        >
          <Icon className="h-4 w-4" style={{ color: alert ? "#e63946" : color }} />
        </div>
      </div>
    </div>
  );
}

export default React.memo(KPICard);
