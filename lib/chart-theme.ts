/**
 * lib/chart-theme.ts
 *
 * Centralized color palette for all Recharts / analytics charts.
 * Import from here instead of hardcoding hex values in components.
 *
 * Uses CSS custom properties for theme-aware colors (primary/dark/light)
 * and static hex values for the categorical palette.
 */

// ── Semantic colors (tied to CSS theme variables) ───────────────────────────
export const CHART_PRIMARY = "var(--color-primary)";
export const CHART_PRIMARY_DARK = "var(--color-primary-dark)";
export const CHART_PRIMARY_LIGHT = "var(--color-primary-light)";

// ── Semantic: positive / negative / neutral ─────────────────────────────────
export const CHART_POSITIVE = "var(--color-primary)";
export const CHART_NEGATIVE = "#e63946";
export const CHART_WARNING = "#f97316";
export const CHART_NEUTRAL = "#3b82f6";

// ── Categorical palette (for pie charts, stacked bars, multi-series) ────────
export const CHART_PALETTE = [
  "var(--color-primary)", // green / brand
  "#f97316",              // orange
  "#3b82f6",              // blue
  "#8b5cf6",              // purple
  "#ec4899",              // pink
  "#14C2C2",              // teal
  "#f59e0b",              // amber
  "#6366f1",              // indigo
  "#10b981",              // emerald
  "#ef4444",              // red
] as const;

// ── Payment method colors ───────────────────────────────────────────────────
export const PAYMENT_COLORS: Record<string, string> = {
  efectivo: "var(--color-primary)",
  yape: "#3b82f6",
  plin: "#8b5cf6",
  tarjeta: "#f97316",
  transferencia: "#14C2C2",
};

// ── BCG / quadrant matrix colors ────────────────────────────────────────────
export const QUADRANT_COLORS = {
  star: "var(--color-primary)",
  cash: "#f97316",
  question: "#3b82f6",
  dog: "#ef4444",
} as const;

// ── Aging buckets (fiado, receivables) ──────────────────────────────────────
export const AGING_COLORS = {
  current: "var(--color-primary)",
  warning: "#f97316",
  overdue: "#ef4444",
  critical: "#e63946",
} as const;
