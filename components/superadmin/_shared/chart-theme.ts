// SuperAdmin chart theme constants — no "use client" needed

export const SA_COLORS = {
  primary:   "var(--accent)",
  secondary: "var(--accent-600)",
  accent:    "#f4a261",
  danger:    "var(--data-error-500)",
  warning:   "var(--data-warning-500)",
  success:   "var(--data-success-500)",
  muted:     "var(--text-tertiary)",
} as const;

export const PLAN_COLORS = {
  free:       "var(--text-tertiary)",
  pro:        "var(--accent)",
  business:   "#7c3aed",
  enterprise: "var(--accent-600)",
} as const;

export const CHART_DARK = {
  bg:   "#111827",
  grid: "#1f2937",
  text: "#9ca3af",
} as const;

export const CHART_LIGHT = {
  bg:   "#ffffff",
  grid: "#e5e7eb",
  text: "#6b7280",
} as const;

// Legacy aliases (keep for backward-compat)
export const SA_CHART_COLORS = {
  free:       PLAN_COLORS.free,
  pro:        PLAN_COLORS.pro,
  business:   PLAN_COLORS.business,
  enterprise: PLAN_COLORS.enterprise,
  primary:    "var(--accent)",
  secondary:  SA_COLORS.accent,
  success:    SA_COLORS.success,
  warning:    SA_COLORS.warning,
  danger:     SA_COLORS.danger,
  muted:      "#94a3b8",
} as const;

export const SA_CHART_THEME = {
  backgroundColor: "transparent",
  textColor:    CHART_DARK.text,
  gridColor:    CHART_DARK.grid,
  tooltipBg:    CHART_DARK.bg,
  tooltipBorder: "#374151",
} as const;
