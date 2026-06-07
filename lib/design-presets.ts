/**
 * lib/design-presets.ts — Sistema de tokens de diseño heredables.
 *
 * Cada `DesignPreset` define una identidad visual completa (colores,
 * tipografía, espaciado, bordes, sombras, animaciones, botones) que se
 * traduce en un set de CSS variables inyectadas al shell del admin.
 *
 * Flujo de herencia:
 *   1. Superadmin elige el preset GLOBAL (activeDesignPresetSlug).
 *   2. Cada tenant puede tener su override propio (DesignPresetCustom).
 *   3. Si el tenant no tiene override, hereda el global.
 *   4. Los componentes del admin leen las CSS vars (ya están preparados
 *      para consumir `--accent`, `--surface-raised`, `--ts-base`, etc.).
 *
 * Editar tokens: cambiar el objeto preset → recompilar inyecta nuevas vars.
 * Editar live: superadmin modifica via /superadmin/design-system y se
 * persiste en `DesignPresetCustom.tokensJson`.
 */

export interface DesignTokens {
  /** Identidad del preset. */
  meta: {
    name: string;
    slug: string;
    description: string;
    author: "buleje" | "custom";
  };

  /** Paleta de colores (todos en hex o oklch para evitar drift en dark). */
  colors: {
    /** Accent principal — botones primarios, links, focus rings. */
    accent: string;
    accentDark: string;
    accentSoft: string;       // bg-* suave (5-10% opacity)
    /** Superficies. */
    surface: string;          // bg principal del shell
    surfaceRaised: string;    // cards, popovers
    surfaceSunken: string;    // inputs, separators
    /** Texto. */
    textPrimary: string;
    textSecondary: string;
    textTertiary: string;
    /** Bordes / reglas. */
    ruleBase: string;
    ruleStrong: string;
    /** Estados semánticos. */
    success: string;
    warning: string;
    error: string;
  };

  /** Tipografía con escala modular. */
  typography: {
    /** Font stacks (incluyendo web-safe fallbacks). */
    fontHeading: string;      // hero, h1, h2
    fontBody: string;         // párrafos, labels
    fontMono: string;         // SKU, precios, tabular
    /** Tamaño base en rem. */
    sizeBase: string;         // "1rem"
    /** Ratio de escala — 1.125 (minor second) → 1.333 (perfect fourth). */
    sizeScale: number;
    /** Pesos disponibles. */
    weightRegular: number;
    weightMedium: number;
    weightBold: number;
    weightBlack: number;
  };

  /** Espaciado con escala progresiva. */
  spacing: {
    /** Unidad base — todo se multiplica por esto. */
    base: string;             // "0.25rem"
    /** Densidad de los componentes — "compact" | "comfortable" | "spacious". */
    density: "compact" | "comfortable" | "spacious";
  };

  /** Bordes y esquinas redondeadas. */
  radius: {
    sm: string;               // chips pequeños, badges
    md: string;               // botones default
    lg: string;               // cards
    xl: string;               // modales, hero containers
    full: string;             // avatars, círculos
  };

  /** Sombras escalonadas + sombra con accent. */
  shadows: {
    sm: string;
    md: string;
    lg: string;
    accent: string;           // shadow tonalizado con accent
  };

  /** Animaciones y transiciones. */
  motion: {
    durFast: string;          // hover, focus → "120ms"
    durBase: string;          // default → "240ms"
    durSlow: string;          // modal enter → "400ms"
    easing: string;           // cubic-bezier
  };

  /** Estilo de botones primarios — heredado por todos los CTA. */
  buttons: {
    height: string;           // "h-12" → 48px
    paddingX: string;         // "px-5"
    radius: keyof DesignTokens["radius"];  // "lg"
    fontWeight: number;
    /** Variante "filled" | "outline" | "ghost" como default. */
    variant: "filled" | "outline";
    /** Si tiene shadow accent al hover. */
    accentShadow: boolean;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// PRESETS PREDEFINIDOS
// ────────────────────────────────────────────────────────────────────────────

const BULEJE_DEFAULT: DesignTokens = {
  meta: {
    name: "Buleje Default",
    slug: "buleje-default",
    description:
      "Identidad oficial — emerald accent, serif para títulos, sans body. La base actual del admin del negocio.",
    author: "buleje",
  },
  colors: {
    accent:        "oklch(0.69 0.13 175)",      // teal/emerald
    accentDark:    "oklch(0.55 0.13 175)",
    accentSoft:    "oklch(0.95 0.04 175)",
    surface:       "oklch(0.98 0.005 240)",     // bg-canvas casi blanco
    surfaceRaised: "oklch(1 0 0)",              // blanco puro
    surfaceSunken: "oklch(0.96 0.005 240)",
    textPrimary:   "oklch(0.20 0.015 250)",
    textSecondary: "oklch(0.42 0.015 250)",
    textTertiary:  "oklch(0.60 0.012 250)",
    ruleBase:      "oklch(0.92 0.005 240)",
    ruleStrong:    "oklch(0.85 0.008 240)",
    success:       "oklch(0.65 0.18 150)",
    warning:       "oklch(0.78 0.16 80)",
    error:         "oklch(0.62 0.22 25)",
  },
  typography: {
    fontHeading: '"Instrument Serif", Georgia, serif',
    fontBody:    '"Geist", system-ui, sans-serif',
    fontMono:    '"Geist Mono", ui-monospace, monospace',
    sizeBase:    "1rem",
    sizeScale:   1.25,                           // major third
    weightRegular: 400,
    weightMedium:  500,
    weightBold:    700,
    weightBlack:   900,
  },
  spacing: { base: "0.25rem", density: "comfortable" },
  radius: { sm: "0.5rem", md: "0.75rem", lg: "1rem", xl: "1.5rem", full: "9999px" },
  shadows: {
    sm:     "0 1px 2px rgba(0,0,0,0.04)",
    md:     "0 4px 12px rgba(0,0,0,0.08)",
    lg:     "0 10px 30px rgba(0,0,0,0.12)",
    accent: "0 4px 14px rgba(0, 160, 160,0.35)",
  },
  motion: {
    durFast: "120ms",
    durBase: "240ms",
    durSlow: "400ms",
    easing:  "cubic-bezier(0.22, 1, 0.36, 1)",
  },
  buttons: {
    height: "3rem",
    paddingX: "1.25rem",
    radius: "lg",
    fontWeight: 700,
    variant: "filled",
    accentShadow: true,
  },
};

const BODEGA_CALIDA: DesignTokens = {
  meta: {
    name: "Bodega Cálida",
    slug: "bodega-calida",
    description:
      "Tonos cálidos de barrio — amber/terracota, sans rounded. Ideal para bodegas familiares y panaderías.",
    author: "buleje",
  },
  colors: {
    accent:        "oklch(0.72 0.16 50)",       // amber/orange warm
    accentDark:    "oklch(0.58 0.16 50)",
    accentSoft:    "oklch(0.96 0.04 50)",
    surface:       "oklch(0.98 0.012 70)",      // bg crema
    surfaceRaised: "oklch(1 0 0)",
    surfaceSunken: "oklch(0.96 0.012 70)",
    textPrimary:   "oklch(0.25 0.04 30)",       // marrón cálido
    textSecondary: "oklch(0.45 0.03 30)",
    textTertiary:  "oklch(0.62 0.02 30)",
    ruleBase:      "oklch(0.90 0.02 50)",
    ruleStrong:    "oklch(0.82 0.03 50)",
    success:       "oklch(0.65 0.18 150)",
    warning:       "oklch(0.78 0.16 80)",
    error:         "oklch(0.62 0.22 25)",
  },
  typography: {
    fontHeading: '"Fraunces", Georgia, serif',
    fontBody:    '"Nunito", system-ui, sans-serif',
    fontMono:    '"JetBrains Mono", ui-monospace, monospace',
    sizeBase:    "1rem",
    sizeScale:   1.25,
    weightRegular: 400,
    weightMedium:  600,
    weightBold:    800,
    weightBlack:   900,
  },
  spacing: { base: "0.25rem", density: "comfortable" },
  radius: { sm: "0.625rem", md: "1rem", lg: "1.25rem", xl: "1.75rem", full: "9999px" },
  shadows: {
    sm:     "0 2px 4px rgba(180,90,30,0.06)",
    md:     "0 6px 16px rgba(180,90,30,0.10)",
    lg:     "0 12px 32px rgba(180,90,30,0.14)",
    accent: "0 6px 18px rgba(255,150,60,0.40)",
  },
  motion: {
    durFast: "150ms",
    durBase: "280ms",
    durSlow: "450ms",
    easing:  "cubic-bezier(0.34, 1.56, 0.64, 1)", // bounce sutil
  },
  buttons: {
    height: "3.25rem",
    paddingX: "1.5rem",
    radius: "xl",
    fontWeight: 800,
    variant: "filled",
    accentShadow: true,
  },
};

const MERCADO_MODERNO: DesignTokens = {
  meta: {
    name: "Mercado Moderno",
    slug: "mercado-moderno",
    description:
      "Estética premium con slate + indigo. Bordes finos, sombras suaves, geist sans para todo. Ideal para minimarkets de gama alta.",
    author: "buleje",
  },
  colors: {
    accent:        "oklch(0.55 0.20 270)",      // indigo deep
    accentDark:    "oklch(0.42 0.20 270)",
    accentSoft:    "oklch(0.95 0.04 270)",
    surface:       "oklch(0.99 0.003 250)",
    surfaceRaised: "oklch(1 0 0)",
    surfaceSunken: "oklch(0.97 0.005 250)",
    textPrimary:   "oklch(0.18 0.02 260)",      // slate-900
    textSecondary: "oklch(0.40 0.015 260)",
    textTertiary:  "oklch(0.58 0.01 260)",
    ruleBase:      "oklch(0.93 0.005 260)",
    ruleStrong:    "oklch(0.86 0.008 260)",
    success:       "oklch(0.65 0.18 150)",
    warning:       "oklch(0.78 0.16 80)",
    error:         "oklch(0.62 0.22 25)",
  },
  typography: {
    fontHeading: '"Geist", system-ui, sans-serif', // sin serif — todo geist
    fontBody:    '"Geist", system-ui, sans-serif',
    fontMono:    '"Geist Mono", ui-monospace, monospace',
    sizeBase:    "1rem",
    sizeScale:   1.2,                            // ratio más sutil
    weightRegular: 400,
    weightMedium:  500,
    weightBold:    600,                          // bold menos pesado, más refinado
    weightBlack:   800,
  },
  spacing: { base: "0.25rem", density: "spacious" },
  radius: { sm: "0.375rem", md: "0.5rem", lg: "0.75rem", xl: "1rem", full: "9999px" },
  shadows: {
    sm:     "0 1px 3px rgba(0,0,0,0.05)",
    md:     "0 2px 8px rgba(30,40,80,0.08)",
    lg:     "0 8px 24px rgba(30,40,80,0.12)",
    accent: "0 4px 16px rgba(80,90,200,0.35)",
  },
  motion: {
    durFast: "100ms",
    durBase: "200ms",
    durSlow: "350ms",
    easing:  "cubic-bezier(0.4, 0, 0.2, 1)",     // material standard
  },
  buttons: {
    height: "2.75rem",                            // 44px más slim
    paddingX: "1.25rem",
    radius: "md",
    fontWeight: 600,
    variant: "filled",
    accentShadow: false,                          // sombras sutiles, sin halo
  },
};

const PASTEL_FRESH: DesignTokens = {
  meta: {
    name: "Pastel Fresh",
    slug: "pastel-fresh",
    description:
      "Paleta soft pastel rosa/celeste, super redondeado, sans rounded. Para tiendas de cosmética, juguetería, librería.",
    author: "buleje",
  },
  colors: {
    accent:        "oklch(0.78 0.13 350)",      // rosa coral
    accentDark:    "oklch(0.62 0.16 350)",
    accentSoft:    "oklch(0.96 0.04 350)",
    surface:       "oklch(0.99 0.005 320)",
    surfaceRaised: "oklch(1 0 0)",
    surfaceSunken: "oklch(0.97 0.012 320)",
    textPrimary:   "oklch(0.28 0.04 320)",
    textSecondary: "oklch(0.48 0.03 320)",
    textTertiary:  "oklch(0.65 0.02 320)",
    ruleBase:      "oklch(0.93 0.012 320)",
    ruleStrong:    "oklch(0.86 0.018 320)",
    success:       "oklch(0.78 0.14 160)",       // verde menta
    warning:       "oklch(0.82 0.14 80)",
    error:         "oklch(0.70 0.18 15)",
  },
  typography: {
    fontHeading: '"Quicksand", system-ui, sans-serif',
    fontBody:    '"Quicksand", system-ui, sans-serif',
    fontMono:    '"JetBrains Mono", ui-monospace, monospace',
    sizeBase:    "1rem",
    sizeScale:   1.22,
    weightRegular: 400,
    weightMedium:  500,
    weightBold:    700,
    weightBlack:   800,
  },
  spacing: { base: "0.3rem", density: "comfortable" },
  radius: { sm: "0.875rem", md: "1.5rem", lg: "2rem", xl: "2.5rem", full: "9999px" },
  shadows: {
    sm:     "0 2px 6px rgba(220,100,150,0.06)",
    md:     "0 8px 20px rgba(220,100,150,0.10)",
    lg:     "0 14px 36px rgba(220,100,150,0.14)",
    accent: "0 8px 22px rgba(255,140,180,0.40)",
  },
  motion: {
    durFast: "180ms",
    durBase: "320ms",
    durSlow: "500ms",
    easing:  "cubic-bezier(0.34, 1.56, 0.64, 1)",
  },
  buttons: {
    height: "3.25rem",
    paddingX: "1.75rem",
    radius: "xl",
    fontWeight: 700,
    variant: "filled",
    accentShadow: true,
  },
};

const DARK_PRO: DesignTokens = {
  meta: {
    name: "Dark Pro",
    slug: "dark-pro",
    description:
      "Modo oscuro premium con accent vibrante. Reduce fatiga visual en sesiones largas. Ideal para gerentes que operan de noche.",
    author: "buleje",
  },
  colors: {
    accent:        "oklch(0.78 0.18 175)",      // teal vibrante en dark
    accentDark:    "oklch(0.65 0.18 175)",
    accentSoft:    "oklch(0.30 0.08 175)",      // accent-soft adaptado dark
    surface:       "oklch(0.16 0.01 250)",      // bg-canvas dark
    surfaceRaised: "oklch(0.21 0.012 250)",
    surfaceSunken: "oklch(0.13 0.008 250)",
    textPrimary:   "oklch(0.96 0.005 250)",
    textSecondary: "oklch(0.78 0.008 250)",
    textTertiary:  "oklch(0.60 0.01 250)",
    ruleBase:      "oklch(0.30 0.012 250)",
    ruleStrong:    "oklch(0.40 0.015 250)",
    success:       "oklch(0.72 0.18 150)",
    warning:       "oklch(0.82 0.16 80)",
    error:         "oklch(0.70 0.22 25)",
  },
  typography: {
    fontHeading: '"Instrument Serif", Georgia, serif',
    fontBody:    '"Geist", system-ui, sans-serif',
    fontMono:    '"Geist Mono", ui-monospace, monospace',
    sizeBase:    "1rem",
    sizeScale:   1.25,
    weightRegular: 400,
    weightMedium:  500,
    weightBold:    700,
    weightBlack:   900,
  },
  spacing: { base: "0.25rem", density: "comfortable" },
  radius: { sm: "0.5rem", md: "0.75rem", lg: "1rem", xl: "1.5rem", full: "9999px" },
  shadows: {
    sm:     "0 1px 2px rgba(0,0,0,0.30)",
    md:     "0 4px 14px rgba(0,0,0,0.40)",
    lg:     "0 12px 32px rgba(0,0,0,0.50)",
    accent: "0 6px 20px rgba(0,255,210,0.30)",
  },
  motion: {
    durFast: "120ms",
    durBase: "240ms",
    durSlow: "400ms",
    easing:  "cubic-bezier(0.22, 1, 0.36, 1)",
  },
  buttons: {
    height: "3rem",
    paddingX: "1.25rem",
    radius: "lg",
    fontWeight: 700,
    variant: "filled",
    accentShadow: true,
  },
};

export const DESIGN_PRESETS: readonly DesignTokens[] = [
  BULEJE_DEFAULT,
  BODEGA_CALIDA,
  MERCADO_MODERNO,
  PASTEL_FRESH,
  DARK_PRO,
] as const;

export const DEFAULT_PRESET_SLUG = "buleje-default";

export function getPresetBySlug(slug: string): DesignTokens | null {
  return DESIGN_PRESETS.find((p) => p.meta.slug === slug) ?? null;
}

// ────────────────────────────────────────────────────────────────────────────
// CSS Variable injection
// ────────────────────────────────────────────────────────────────────────────

/**
 * Convierte un DesignTokens en un objeto plano `{ "--var": "value" }` listo
 * para escribir en `<style>{`:root {${vars}}`}</style>` o como `style` prop.
 *
 * Las CSS vars son compatibles con los componentes existentes (que ya leen
 * `var(--accent)`, `var(--surface-raised)`, etc).
 */
export function tokensToCssVars(tokens: DesignTokens): Record<string, string> {
  const t = tokens;
  // Helpers para derivar shades vía CSS color-mix (soportado en todos los browsers modernos).
  // Permite que un solo color base (success/warning/error) genere su escala -50/100/500/600/700
  // sin que el usuario tenga que especificarlas a mano en el preset.
  const lighten = (c: string, pct: number) => `color-mix(in oklab, ${c} ${100 - pct}%, white)`;
  const darken  = (c: string, pct: number) => `color-mix(in oklab, ${c} ${100 - pct}%, black)`;

  // Escala tipográfica derivada del sizeBase + sizeScale (modular scale)
  const baseRem = parseFloat(t.typography.sizeBase) || 1;
  const scale = t.typography.sizeScale || 1.25;
  const sz = (step: number) => `${(baseRem * Math.pow(scale, step)).toFixed(4)}rem`;

  return {
    // ── Colors: identidad ──────────────────────────────────────────────────
    "--accent":         t.colors.accent,
    "--accent-dark":    t.colors.accentDark,
    "--accent-soft":    t.colors.accentSoft,
    "--accent-muted":   lighten(t.colors.accent, 50),

    // ── Surfaces ───────────────────────────────────────────────────────────
    "--surface-canvas": t.colors.surface,
    "--surface-raised": t.colors.surfaceRaised,
    "--surface-sunken": t.colors.surfaceSunken,

    // ── Text ──────────────────────────────────────────────────────────────
    "--text-primary":   t.colors.textPrimary,
    "--text-secondary": t.colors.textSecondary,
    "--text-tertiary":  t.colors.textTertiary,

    // ── Borders / rules ───────────────────────────────────────────────────
    "--rule-soft":      lighten(t.colors.ruleBase, 35),
    "--rule-base":      t.colors.ruleBase,
    "--rule-strong":    t.colors.ruleStrong,

    // ── Semantic data colors + escala -50/100/500/600/700 ─────────────────
    "--data-success":      t.colors.success,
    "--data-success-50":   lighten(t.colors.success, 88),
    "--data-success-100":  lighten(t.colors.success, 75),
    "--data-success-500":  t.colors.success,
    "--data-success-600":  darken(t.colors.success, 12),
    "--data-success-700":  darken(t.colors.success, 24),

    "--data-warning":      t.colors.warning,
    "--data-warning-50":   lighten(t.colors.warning, 88),
    "--data-warning-100":  lighten(t.colors.warning, 75),
    "--data-warning-500":  t.colors.warning,
    "--data-warning-600":  darken(t.colors.warning, 12),
    "--data-warning-700":  darken(t.colors.warning, 24),

    "--data-error":        t.colors.error,
    "--data-error-50":     lighten(t.colors.error, 88),
    "--data-error-100":    lighten(t.colors.error, 75),
    "--data-error-500":    t.colors.error,
    "--data-error-600":    darken(t.colors.error, 12),
    "--data-error-700":    darken(t.colors.error, 24),

    // info no es parte del preset — derivado del accent (si querés blue específico, fork)
    "--data-info":         t.colors.accent,
    "--data-info-50":      lighten(t.colors.accent, 88),
    "--data-info-100":     lighten(t.colors.accent, 75),
    "--data-info-500":     t.colors.accent,
    "--data-info-600":     darken(t.colors.accent, 12),
    "--data-info-700":     darken(t.colors.accent, 24),

    // ── Aliases brand-* — admins viejos siguen consumiendo brand-primary ──
    "--brand-primary":       t.colors.accent,
    "--brand-primary-light": lighten(t.colors.accent, 30),
    "--brand-primary-bg":    lighten(t.colors.accent, 90),
    "--color-primary":       t.colors.accent,
    "--color-primary-dark":  t.colors.accentDark,

    // ── Typography ────────────────────────────────────────────────────────
    "--font-heading":   t.typography.fontHeading,
    "--font-body":      t.typography.fontBody,
    "--font-mono":      t.typography.fontMono,
    "--ts-3xs":         sz(-3),
    "--ts-2xs":         sz(-2.5),
    "--ts-xs":          sz(-2),
    "--ts-sm":          sz(-1),
    "--ts-base":        t.typography.sizeBase,
    "--ts-lg":          sz(1),
    "--ts-xl":          sz(2),
    "--ts-2xl":         sz(3),
    "--ts-3xl":         sz(4),
    "--ts-4xl":         sz(5),
    "--ts-scale":       String(t.typography.sizeScale),
    "--fw-regular":     String(t.typography.weightRegular),
    "--fw-medium":      String(t.typography.weightMedium),
    "--fw-bold":        String(t.typography.weightBold),
    "--fw-black":       String(t.typography.weightBlack),
    "--ls-tight":       "-0.01em",
    "--ls-wide":        "0.05em",
    "--ls-wider":       "0.1em",

    // ── Spacing ───────────────────────────────────────────────────────────
    "--space-base":     t.spacing.base,
    "--density":        t.spacing.density,

    // ── Radius ────────────────────────────────────────────────────────────
    "--radius-sm":      t.radius.sm,
    "--radius-md":      t.radius.md,
    "--radius-lg":      t.radius.lg,
    "--radius-xl":      t.radius.xl,
    "--radius-full":    t.radius.full,

    // ── Shadows ──────────────────────────────────────────────────────────
    "--shadow-sm":      t.shadows.sm,
    "--shadow-md":      t.shadows.md,
    "--shadow-lg":      t.shadows.lg,
    "--shadow-xl":      t.shadows.lg, // xl no es parte del preset, alias a lg
    "--shadow-accent":  t.shadows.accent,

    // ── Motion ───────────────────────────────────────────────────────────
    "--dur-fast":       t.motion.durFast,
    "--dur-base":       t.motion.durBase,
    "--dur-slow":       t.motion.durSlow,
    "--dur-slower":     t.motion.durSlow,
    "--easing":         t.motion.easing,

    // ── Buttons ──────────────────────────────────────────────────────────
    "--btn-height":     t.buttons.height,
    "--btn-padding-x":  t.buttons.paddingX,
    "--btn-radius":     t.radius[t.buttons.radius],
    "--btn-fw":         String(t.buttons.fontWeight),
  };
}

/**
 * Serializa CSS vars a un string CSS válido para inyectar en `<style>`.
 */
export function tokensToCssString(tokens: DesignTokens, scope = ":root"): string {
  const vars = tokensToCssVars(tokens);
  const body = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  return `${scope} {\n${body}\n}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Editor helpers
// ────────────────────────────────────────────────────────────────────────────

/** Deep clone de un preset — usado por el editor para no mutar el original. */
export function cloneTokens(tokens: DesignTokens): DesignTokens {
  return JSON.parse(JSON.stringify(tokens)) as DesignTokens;
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** Merge profundo de un partial sobre una base. Útil para el editor. */
export function mergeTokens(base: DesignTokens, partial: DeepPartial<DesignTokens>): DesignTokens {
  const out = cloneTokens(base);
  const outRec = out as unknown as Record<string, unknown>;
  for (const key of Object.keys(partial) as Array<keyof DesignTokens>) {
    const src = partial[key];
    if (src && typeof src === "object" && !Array.isArray(src)) {
      outRec[key as string] = {
        ...(out[key] as object),
        ...(src as object),
      };
    } else if (src !== undefined) {
      outRec[key as string] = src;
    }
  }
  return out;
}

/** Convierte un nombre humano en kebab-case slug seguro. */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `preset-${Date.now().toString(36)}`;
}

/** Devuelve lista de errores (vacío = válido). Validación liviana para el editor. */
export function validateTokens(tokens: unknown): string[] {
  const errors: string[] = [];
  if (!tokens || typeof tokens !== "object") {
    return ["tokens debe ser un objeto"];
  }
  const t = tokens as Partial<DesignTokens>;
  if (!t.meta?.name) errors.push("meta.name requerido");
  if (!t.meta?.slug || !/^[a-z][a-z0-9-]*$/.test(t.meta.slug)) {
    errors.push("meta.slug debe ser kebab-case");
  }
  const colorKeys: Array<keyof DesignTokens["colors"]> = [
    "accent",
    "accentDark",
    "accentSoft",
    "surface",
    "surfaceRaised",
    "surfaceSunken",
    "textPrimary",
    "textSecondary",
    "textTertiary",
    "ruleBase",
    "ruleStrong",
    "success",
    "warning",
    "error",
  ];
  for (const k of colorKeys) {
    if (!t.colors?.[k] || typeof t.colors[k] !== "string") {
      errors.push(`colors.${k} requerido`);
    }
  }
  if (!t.typography?.fontHeading) errors.push("typography.fontHeading requerido");
  if (!t.typography?.fontBody) errors.push("typography.fontBody requerido");
  if (!t.typography?.sizeBase) errors.push("typography.sizeBase requerido");
  if (
    typeof t.typography?.sizeScale !== "number" ||
    t.typography.sizeScale < 1.05 ||
    t.typography.sizeScale > 1.5
  ) {
    errors.push("typography.sizeScale debe ser número entre 1.05 y 1.5");
  }
  if (!t.spacing?.density || !["compact", "comfortable", "spacious"].includes(t.spacing.density)) {
    errors.push("spacing.density inválido");
  }
  const radiusKeys: Array<keyof DesignTokens["radius"]> = ["sm", "md", "lg", "xl", "full"];
  for (const k of radiusKeys) {
    if (!t.radius?.[k]) errors.push(`radius.${k} requerido`);
  }
  if (!t.shadows?.md || !t.shadows?.accent) errors.push("shadows.md/accent requeridos");
  if (!t.motion?.durBase || !t.motion?.easing) errors.push("motion.durBase/easing requeridos");
  if (!t.buttons?.height || !t.buttons?.radius) errors.push("buttons.height/radius requeridos");
  if (t.buttons?.radius && !radiusKeys.includes(t.buttons.radius)) {
    errors.push("buttons.radius debe ser sm|md|lg|xl|full");
  }
  return errors;
}

/** Valor inicial para un preset en blanco — clona Buleje Default y le da nombre nuevo. */
export function blankCustomPreset(name: string): DesignTokens {
  const base = cloneTokens(BULEJE_DEFAULT);
  base.meta = {
    name,
    slug: slugify(name),
    description: "Preset personalizado",
    author: "custom",
  };
  return base;
}
