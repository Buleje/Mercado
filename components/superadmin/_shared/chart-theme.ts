// SuperAdmin chart theme constants — no "use client" needed

export const SA_COLORS = {
  primary:   "#00B4A6",
  secondary: "#2dd4bf",
  accent:    "#f4a261",
  danger:    "#ef4444",
  warning:   "#f59e0b",
  success:   "#22c55e",
  muted:     "#6b7280",
} as const;

export const PLAN_COLORS = {
  free:       "#6b7280",
  pro:        "#00B4A6",
  business:   "#7c3aed",
  enterprise: "#d97706",
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
  primary:    "#00B4A6",
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
