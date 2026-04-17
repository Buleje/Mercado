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
