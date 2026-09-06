/**
 * Editorial chart palette.
 * Monochrome + 1 accent.
 * Uso: import { CHART_PALETTE, CHART_GRID_STROKE } from "@/components/ui-system/charts/palette";
 */

/**
 * CHART_PALETTE
 *
 * Cada tono lee primero una CSS var "scoped" (`--section-*`) que permite
 * a un <DashboardSection> overridear el color de su chart interno SIN
 * modificar el token global. Si el scope no esta definido, cae al token
 * normal del design-system (`--data-*`) y finalmente a un hex fallback.
 *
 * Esto permite la rotacion de colores por posicion en el grid sin tocar
 * cada archivo de charts (ver SECTION_PALETTE en DraggableSections).
 */
export const CHART_PALETTE = {
  /** Primary series — darkest */
  primary: "var(--section-primary, var(--data-1, #0a0a0a))",
  /** Secondary series — dim */
  secondary: "var(--section-secondary, var(--data-2, #525252))",
  /** Tertiary — muted */
  tertiary: "var(--section-tertiary, var(--data-3, #a3a3a3))",
  /** Quaternary — subtle */
  quaternary: "var(--data-4, #d4d4d4)",
  /** Accent — brand teal */
  accent: "var(--section-accent, var(--data-5, var(--accent)))",
  /** v4 — para dashboards con 8 categorias */
  info: "var(--section-info, var(--data-6, #0ea5e9))",
  amber: "var(--section-amber, var(--data-7, #f0503f))",
  purple: "var(--section-purple, var(--data-8, #8b5cf6))",

  success: "var(--data-success, #047857)",
  warning: "var(--data-warning, #c93b2c)",
  error: "var(--data-error, #b91c1c)",
} as const;

export const CHART_GRID_STROKE = "var(--rule-soft, #f5f5f5)";
// 2026-04-24: axis color subido de tertiary (#a3a3a3 — muy pale) a secondary
// (#525252) para que los labels de ejes tengan contraste aceptable. Con
// axisSize 13 + fontWeight 600 + secondary color los ticks son legibles.
export const CHART_AXIS_COLOR = "var(--text-secondary, #525252)";
export const CHART_LABEL_COLOR = "var(--text-primary, #0a0a0a)";

/** Standard font family and sizes for axis/tooltip
 *
 * 2026-04-24: subido axis 10→13, label 11→14, tooltip 12→14. El texto en 10px
 * era ilegible en desktop normal y especialmente en laptops 1366px. Los nuevos
 * valores siguen aptos para mini-charts (sparklines) que no usan estas
 * constantes — ellos pintan sin ejes. */
export const CHART_FONT = {
  family: "var(--font-geist-sans), system-ui, sans-serif",
  axisSize: 14,
  labelSize: 15,
  tooltipSize: 14,
} as const;

/** Series palette ordered by visual priority */
export const SERIES_PALETTE = [
  CHART_PALETTE.primary,
  CHART_PALETTE.accent,
  CHART_PALETTE.secondary,
  CHART_PALETTE.tertiary,
  CHART_PALETTE.quaternary,
] as const;

/**
 * SECTION_PALETTE — rotacion de color dominante por posicion en el grid.
 *
 * Cada entrada setea 4 CSS vars scoped (`--section-primary`, `--section-accent`,
 * `--section-secondary`, `--section-tertiary`) que los charts internos leen
 * automaticamente (ver CHART_PALETTE).
 *
 * Tonos escogidos: dark-neutral + 1 accent vivo por rotacion. Suficiente
 * contraste para diferenciar vecinos sin romper la estetica minimalista.
 *
 * Paleta inspirada en Stripe/Linear dashboards — grises + acentos muted.
 */
export const SECTION_PALETTE: ReadonlyArray<Record<string, string>> = [
  // 0 · Neutral dark (default)
  {
    "--section-primary": "#0f172a",   // slate-900
    "--section-accent":  "#14b8a6",   // teal-500
    "--section-secondary": "#475569", // slate-600
    "--section-tertiary":  "#94a3b8", // slate-400
  },
  // 1 · Ocean
  {
    "--section-primary": "#0891b2",   // cyan-600
    "--section-accent":  "#0f172a",   // slate-900
    "--section-secondary": "#67e8f9", // cyan-300
    "--section-tertiary":  "#94a3b8",
  },
  // 2 · Sunset
  {
    "--section-primary": "#c2410c",   // orange-700
    "--section-accent":  "#0f172a",
    "--section-secondary": "#ffa89d", // orange-300
    "--section-tertiary":  "#94a3b8",
  },
  // 3 · Forest
  {
    "--section-primary": "#15803d",   // green-700
    "--section-accent":  "#ca8a04",   // yellow-600
    "--section-secondary": "#86efac", // green-300
    "--section-tertiary":  "#94a3b8",
  },
  // 4 · Violet
  {
    "--section-primary": "#6d28d9",   // violet-700
    "--section-accent":  "#ec4899",   // pink-500
    "--section-secondary": "#c4b5fd", // violet-300
    "--section-tertiary":  "#94a3b8",
  },
  // 5 · Steel
  {
    "--section-primary": "#334155",   // slate-700
    "--section-accent":  "#dc2626",   // red-600
    "--section-secondary": "#94a3b8",
    "--section-tertiary":  "#cbd5e1",
  },
];
