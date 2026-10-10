"use client";

/**
 * Piezas de la Predicción de ventas: el contenedor de panel (cargando / error /
 * vacío), la tendencia, el chip de métrica y la tarjeta de precio sugerido.
 * Salieron de `ForecastingDashboard.tsx` sin cambios (ver `forecast-datos.ts`).
 */

import AdminCard from "@/components/admin/shared/AdminCard";
import { CardTitle } from "@buleje/design-system";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Package,
  Loader2,
  CheckCircle,
} from "@buleje/design-system/icons";
import { cn, formatCurrency } from "@/lib/utils";
import type { PriceSuggestion } from "./forecast-datos";

/**
 * Contenedor de panel reutilizable con estados loading / error / empty.
 */
interface PanelCardProps {
  icon: React.ReactNode;
  title: string;
  loading: boolean;
  error: string | null;
  isEmpty: boolean;
  emptyMsg: string;
  children?: React.ReactNode;
  headerExtra?: React.ReactNode;
}

export function PanelCard({
  icon,
  title,
  loading,
  error,
  isEmpty,
  emptyMsg,
  children,
  headerExtra,
}: PanelCardProps) {
  return (
    <AdminCard padding="md">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-[var(--rule-soft)]">
        <div className="flex items-center gap-2">
          <span className="text-primary">{icon}</span>
          <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
            {title}
          </CardTitle>
        </div>
        {headerExtra}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-10 gap-2 text-[var(--text-tertiary)]">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-xs">Calculando predicciones...</span>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex items-start gap-2 rounded-xl bg-[var(--data-error-50)] dark:bg-red-950/30 border border-[var(--data-error-500)]/40 p-3">
          <AlertTriangle className="w-4 h-4 text-[var(--data-error-500)] shrink-0 mt-0.5" />
          <p className="text-xs text-[var(--data-error-500)]">{error}</p>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && isEmpty && (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <Package className="w-7 h-7 text-[var(--text-tertiary)]/40" />
          <p className="text-xs text-[var(--text-tertiary)] text-center">{emptyMsg}</p>
        </div>
      )}

      {/* Contenido */}
      {!loading && !error && !isEmpty && children}
    </AdminCard>
  );
}

/**
 * Badge de tendencia (Panel A).
 */
export function TrendBadge({ trend }: { trend: "SUBIENDO" | "ESTABLE" | "BAJANDO" }) {
  const config = {
    SUBIENDO: {
      icon: <TrendingUp className="w-3.5 h-3.5" />,
      label: "Subiendo",
      cls: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:bg-primary/15 dark:text-[var(--data-success-500)]",
    },
    BAJANDO: {
      icon: <TrendingDown className="w-3.5 h-3.5" />,
      label: "Bajando",
      cls: "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-red-950/40 dark:text-[var(--data-error-500)]",
    },
    ESTABLE: {
      icon: <Minus className="w-3.5 h-3.5" />,
      label: "Estable",
      cls: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
    },
  } as const;

  const { icon, label, cls } = config[trend];

  return (
    <span className={cn("flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold shrink-0", cls)}>
      {icon}
      {label}
    </span>
  );
}

/**
 * Chip de métrica pequeña (Panel A).
 */
export function MetricChip({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl bg-[var(--surface-sunken)] p-2.5 text-center">
      <p className="text-xs text-[var(--text-secondary)] font-medium mb-0.5">{label}</p>
      <p className={cn(
        "text-sm font-extrabold",
        danger
          ? "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]"
          : "text-[var(--text-primary)] dark:text-[var(--text-primary)]",
      )}>
        {value}
      </p>
    </div>
  );
}

/**
 * Tarjeta de sugerencia de precio (Panel C).
 */
interface PriceCardProps {
  suggestion: PriceSuggestion;
  isApplied: boolean;
  isApplying: boolean;
  onAplicar: () => void;
  esBaja: boolean;
}

export function PriceCard({ suggestion: s, isApplied, isApplying, onAplicar, esBaja }: PriceCardProps) {
  const reasonConfig: Record<PriceSuggestion["reason"], { label: string; cls: string }> = {
    hot_item: {
      label: "Demanda alta",
      cls: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-amber-950/50 dark:text-[var(--data-warning-500)]",
    },
    slow_mover: {
      label: "Stock excesivo",
      cls: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:bg-primary/15 dark:text-[var(--data-success-500)]",
    },
    fefo_urgent: {
      label: "Vence pronto",
      cls: "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-red-950/50 dark:text-[var(--data-error-500)]",
    },
  };

  const { label: reasonLabel, cls: reasonCls } = reasonConfig[s.reason];
  const adjAbs = Math.abs(s.adjustmentPercent);

  return (
    <div className={cn(
      "rounded-xl border p-3.5 flex flex-col gap-3 transition-colors",
      isApplied
        ? "border-[var(--data-success-500)]/30 bg-primary/10 dark:border-[var(--data-success-500)]/30 dark:bg-primary/15"
        : "border-[var(--rule-soft)] bg-[var(--surface-sunken)]/40",
      s.reason === "fefo_urgent" && !isApplied
        ? "border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/50"
        : "",
    )}>
      {/* Nombre + badge de razón */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] leading-snug">
          {s.productName}
        </p>
        <span className={cn(
          "text-xs font-bold px-1.5 py-0.5 rounded-full shrink-0",
          reasonCls,
        )}>
          {reasonLabel}
        </span>
      </div>

      {/* Precios */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-[var(--text-tertiary)] line-through">
          {formatCurrency(s.currentPrice)}
        </span>
        <span className="text-[var(--text-tertiary)]">→</span>
        <span className={cn(
          "text-base font-extrabold",
          esBaja
            ? "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]"
            : "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
        )}>
          {formatCurrency(s.suggestedPrice)}
        </span>
        <span className={cn(
          "text-xs font-bold px-1.5 py-0.5 rounded-full",
          esBaja
            ? "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-red-950/40 dark:text-[var(--data-error-500)]"
            : "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:bg-primary/15 dark:text-[var(--data-success-500)]",
        )}>
          {esBaja ? "-" : "+"}{adjAbs}%
        </span>
      </div>

      {/* Detalle */}
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
        {s.detail}
      </p>

      {/* Stock */}
      <p className="text-xs text-[var(--text-tertiary)]">
        Stock actual: {s.currentStock} u.
      </p>

      {/* Botón Aplicar */}
      <button
        onClick={onAplicar}
        disabled={isApplied || isApplying}
        className={cn(
          "w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold",
          "transition-colors min-h-[44px]", // touch target
          isApplied
            ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:bg-primary/15 dark:text-[var(--data-success-500)] cursor-default"
            : "bg-primary hover:bg-primary-dark active:bg-primary-dark text-white",
          "disabled:opacity-60 disabled:cursor-not-allowed",
        )}
        aria-label={isApplied ? "Precio aplicado" : `Aplicar precio sugerido para ${s.productName}`}
      >
        {isApplying ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : isApplied ? (
          <>
            <CheckCircle className="w-3.5 h-3.5" />
            Aplicado
          </>
        ) : (
          "Aplicar precio"
        )}
      </button>
    </div>
  );
}
