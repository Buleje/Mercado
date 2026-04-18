/**
 * Editorial chart palette.
 * Monochrome + 1 accent.
 * Uso: import { CHART_PALETTE, CHART_GRID_STROKE } from "@/components/ui-system/charts/palette";
 */

export const CHART_PALETTE = {
  /** Primary series — darkest */
  primary: "var(--data-1, #0a0a0a)",
  /** Secondary series — dim */
  secondary: "var(--data-2, #525252)",
  /** Tertiary — muted */
  tertiary: "var(--data-3, #a3a3a3)",
  /** Quaternary — subtle */
  quaternary: "var(--data-4, #d4d4d4)",
  /** Accent — brand teal */
  accent: "var(--data-5, #00B4A6)",
  /** v4 — para dashboards con 8 categorias */
  info: "var(--data-6, #0ea5e9)",
  amber: "var(--data-7, #d97706)",
  purple: "var(--data-8, #8b5cf6)",

  success: "var(--data-success, #047857)",
  warning: "var(--data-warning, #b45309)",
  error: "var(--data-error, #b91c1c)",
} as const;

export const CHART_GRID_STROKE = "var(--rule-soft, #f5f5f5)";
export const CHART_AXIS_COLOR = "var(--text-tertiary, #a3a3a3)";
export const CHART_LABEL_COLOR = "var(--text-secondary, #525252)";

/** Standard font family and sizes for axis/tooltip */
export const CHART_FONT = {
  family: "var(--font-geist-sans), system-ui, sans-serif",
  axisSize: 10,
  labelSize: 11,
  tooltipSize: 12,
} as const;

/** Series palette ordered by visual priority */
export const SERIES_PALETTE = [
  CHART_PALETTE.primary,
  CHART_PALETTE.accent,
  CHART_PALETTE.secondary,
  CHART_PALETTE.tertiary,
  CHART_PALETTE.quaternary,
] as const;
