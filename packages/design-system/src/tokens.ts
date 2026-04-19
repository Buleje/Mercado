/**
 * Design tokens — TypeScript-level shape del sistema de diseno.
 *
 * Los valores reales viven en `app/globals.css` (CSS custom properties).
 * Este archivo exporta ALIAS nombrados en TypeScript para usar en logica
 * dinamica que necesite hacer `var(--token-name)` sin hardcodear el string.
 *
 * @example
 * import { colors, space } from "@buleje/design-system/tokens";
 * <div style={{ background: colors.surfaceSunken }}>...</div>
 */

// ── Colors ────────────────────────────────────────────────────────────────────
export const colors = {
  // Surfaces
  surfaceCanvas: "var(--surface-canvas)",
  surfaceSunken: "var(--surface-sunken)",
  surfaceRaised: "var(--surface-raised)",
  surfaceInverse: "var(--surface-inverse)",

  // Text
  textPrimary: "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  textTertiary: "var(--text-tertiary)",
  textInverse: "var(--text-inverse)",

  // Rules / borders
  ruleSoft: "var(--rule-soft)",
  ruleBase: "var(--rule-base)",
  ruleStrong: "var(--rule-strong)",

  // Data viz
  dataSuccess: "var(--data-success)",
  dataWarning: "var(--data-warning)",
  dataError: "var(--data-error)",

  // Brand
  brandInk: "var(--brand-ink)",
  accent: "var(--accent)",
} as const;

// ── Data state scale (Sprint C1 — ADR-075 addendum) ──────────────────────────
/**
 * Escalas semánticas completas para estados success/warning/error/info.
 * Cada estado expone tokens {50, 100, DEFAULT, 600, 700}:
 *   - `50`  → soft backgrounds (alerts, chips)
 *   - `100` → soft hover
 *   - `DEFAULT` (alias del -500) → icons, text, borders
 *   - `600`, `700` → hover/pressed
 *
 * Light mode usa -500 como DEFAULT. Dark mode usa -400/300 para contraste AA
 * (resueltos runtime por `app/globals.css` selector `.dark`).
 *
 * @example
 * import { dataColors } from "@buleje/design-system/tokens";
 * <div className={`bg-[${dataColors.success[50]}] border-[${dataColors.success.DEFAULT}]`}>
 */
export const dataColors = {
  success: {
    50: "var(--data-success-50)",
    100: "var(--data-success-100)",
    DEFAULT: "var(--data-success-500)",
    500: "var(--data-success-500)",
    600: "var(--data-success-600)",
    700: "var(--data-success-700)",
  },
  warning: {
    50: "var(--data-warning-50)",
    100: "var(--data-warning-100)",
    DEFAULT: "var(--data-warning-500)",
    500: "var(--data-warning-500)",
    600: "var(--data-warning-600)",
    700: "var(--data-warning-700)",
  },
  error: {
    50: "var(--data-error-50)",
    100: "var(--data-error-100)",
    DEFAULT: "var(--data-error-500)",
    500: "var(--data-error-500)",
    600: "var(--data-error-600)",
    700: "var(--data-error-700)",
  },
  info: {
    50: "var(--data-info-50)",
    100: "var(--data-info-100)",
    DEFAULT: "var(--data-info-500)",
    500: "var(--data-info-500)",
    600: "var(--data-info-600)",
    700: "var(--data-info-700)",
  },
} as const;

export type DataColorState = keyof typeof dataColors;
export type DataColorShade = keyof (typeof dataColors)["success"];

// ── Typography (ADR-070) ──────────────────────────────────────────────────────
export const typography = {
  size: {
    "2xs": "var(--ts-2xs)",
    xs: "var(--ts-xs)",
    sm: "var(--ts-sm)",
    base: "var(--ts-base)",
    lg: "var(--ts-lg)",
    xl: "var(--ts-xl)",
    "2xl": "var(--ts-2xl)",
    "3xl": "var(--ts-3xl)",
  },
  weight: {
    regular: "var(--fw-regular)",
    medium: "var(--fw-medium)",
    bold: "var(--fw-bold)",
    extrabold: "var(--fw-extrabold)",
  },
  lineHeight: {
    tight: "var(--lh-tight)",
    snug: "var(--lh-snug)",
    normal: "var(--lh-normal)",
  },
  letterSpacing: {
    tight: "var(--ls-tight)",
    normal: "var(--ls-normal)",
    wide: "var(--ls-wide)",
    wider: "var(--ls-wider)",
  },
} as const;

// ── Space scale (8pt grid) ─────────────────────────────────────────────────────
export const space = {
  1: "var(--space-1)",
  2: "var(--space-2)",
  3: "var(--space-3)",
  4: "var(--space-4)",
  5: "var(--space-5)",
  6: "var(--space-6)",
  8: "var(--space-8)",
  10: "var(--space-10)",
  12: "var(--space-12)",
  16: "var(--space-16)",
  20: "var(--space-20)",
  24: "var(--space-24)",
} as const;

// ── Radii ──────────────────────────────────────────────────────────────────────
export const radius = {
  pill: "var(--r-pill)",
  xl: "var(--r-xl)",
  lg: "var(--r-lg)",
  sm: "var(--r-sm)",
} as const;

// ── Elevations ─────────────────────────────────────────────────────────────────
export const elevation = {
  1: "var(--elev-1)",
  2: "var(--elev-2)",
  3: "var(--elev-3)",
  4: "var(--elev-4)",
} as const;

// ── Shadow scale (ADR-072) — alias semanticos sobre elevation ──────────────────
export const shadow = {
  none: "var(--shadow-none)",
  sm: "var(--shadow-sm)",
  md: "var(--shadow-md)",
  lg: "var(--shadow-lg)",
  xl: "var(--shadow-xl)",
} as const;

// ── Motion (ADR-071) ───────────────────────────────────────────────────────────
export const motion = {
  duration: {
    instant: "var(--dur-instant)",    // 0ms — no animar
    micro: "var(--dur-micro)",        // 80ms — hover feedback
    fast: "var(--dur-fast)",          // 160ms — small transitions
    base: "var(--dur-base)",          // 240ms — default UI
    slow: "var(--dur-slow)",          // 400ms — complex transitions
    slower: "var(--dur-slower)",      // 600ms — page transitions
  },
  ease: {
    editorial: "var(--ease-editorial)",
    snap: "var(--ease-snap)",
    soft: "var(--ease-soft)",
    entrance: "var(--ease-entrance)",
    exit: "var(--ease-exit)",
    bounce: "var(--ease-bounce)",
  },
} as const;

// ── Product card layout sizes (Ola 7 / B1) ─────────────────────────────────────
/**
 * Dimensiones canonicas de los 3 primitivos de ProductCard. Usar estos tokens
 * para mantener consistencia visual entre `ProductCardHero`, `ProductCardGrid`
 * y `ProductCardCompact`. Cambiar aqui propaga a todos los cards del catalogo.
 *
 * @example
 *   import { productCardSizes } from "@buleje/design-system/tokens";
 *   <div style={{ minHeight: productCardSizes.hero.minHeight }}>...</div>
 */
export const productCardSizes = {
  hero: { minHeight: "420px", imageAspect: "4/5" },
  grid: { minHeight: "340px", imageAspect: "1/1" },
  compact: { minWidth: "180px", minHeight: "260px" },
} as const;
