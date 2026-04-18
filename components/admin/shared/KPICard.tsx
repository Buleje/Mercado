"use client";
import React from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface KPICardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  /**
   * Legacy prop — CSS color string para tenant branding dinamico (ej: tenant
   * setea `--tenant-accent` y lo pasa como `var(--tenant-accent)`). Si se
   * omite, el card usa `var(--accent)` del design system.
   *
   * @deprecated preferir `UnifiedKPITile` cuando no hay branding dinamico
   * (ADR-074 Phase 2).
   */
  color?: string;
  change?: number;
  subtitle?: string;
  alert?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * KPICard — variante con accent-bar izquierda + icon-chip suave.
 *
 * ADR-074 Phase 2:
 * - Default `color` → `var(--accent)` (antes era hex obligatorio).
 * - Alert mode → `var(--data-error)` (antes `#e63946` hardcoded).
 * - Icon chip → alpha via `color-mix` (antes `${color}15` concat string).
 * - Change deltas → tokens `--data-success` / `--data-error`.
 * - Surface → `bg-[var(--surface-raised)]` (antes `bg-white dark:bg-card`).
 *
 * Para KPIs sin tenant branding dinamico, usar `UnifiedKPITile` que tiene
 * intent semantico + sparkline auto-color.
 */
function KPICard({ label, value, icon: Icon, color, change, subtitle, alert, onClick, className }: KPICardProps) {
  const accentColor = alert ? "var(--data-error)" : (color ?? "var(--accent)");
  const accentSoft = `color-mix(in oklch, ${accentColor} 12%, transparent)`;

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter") onClick(); } : undefined}
      className={cn(
        "bg-[var(--surface-raised)] rounded-xl p-4 border-l-[3px] border border-[var(--rule-soft)] transition-all",
        onClick && "cursor-pointer hover:shadow-[var(--shadow-sm)]",
        className,
      )}
      style={{ borderLeftColor: accentColor }}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] font-medium truncate">
            {label}
          </p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <p className={cn(
              "text-2xl font-mono font-bold truncate",
              alert ? "text-[var(--data-error)]" : "text-[var(--text-primary)]",
            )}>
              {value}
            </p>
            {change != null && (
              <span className={cn(
                "text-xs font-medium shrink-0 tabular-nums",
                change >= 0 ? "text-[var(--data-success)]" : "text-[var(--data-error)]",
              )}>
                {change >= 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)}%
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
        <div
          className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: accentSoft }}
        >
          <Icon className="h-4 w-4" style={{ color: accentColor }} />
        </div>
      </div>
    </div>
  );
}

export default React.memo(KPICard);
