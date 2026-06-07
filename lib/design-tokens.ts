/**
 * design-tokens.ts — Fuente única de verdad para colores, espaciado y radios.
 *
 * ARQUITECTURA:
 *   1. Este archivo es la fuente de verdad en TypeScript.
 *   2. Los valores aquí DEBEN coincidir con las variables CSS en `app/globals.css`
 *      bajo el bloque `@theme inline { ... }`.
 *   3. Tailwind v4 lee esas CSS vars y expone clases semánticas:
 *      `bg-primary`, `text-secondary`, `border-danger`, etc.
 *   4. Usa las clases Tailwind para JSX normal.
 *      Importa este archivo SOLO cuando necesites el valor hex directamente
 *      (inline styles, librerías de charts como Recharts, GSAP, Canvas, etc.)
 *
 * CÓMO AGREGAR UN TOKEN NUEVO:
 *   a) Agrega el valor aquí en la sección que corresponda.
 *   b) Agrega la CSS var equivalente en `app/globals.css` dentro de `@theme inline`.
 *   c) Si aplica dark mode, agrega el override en el bloque `.dark { ... }`.
 *   d) Documenta el caso de uso en el comentario junto al valor.
 *
 * POLÍTICA (YAGNI duro):
 *   Solo se agrega un token si el valor se usa en 3+ lugares distintos.
 *   Valores de un solo uso van directamente en el componente con un comentario
 *   explicando por qué no es un token.
 */

export const tokens = {
  color: {
    /**
     * Primary — Alegra Teal
     * CSS vars: --color-primary, --color-primary-dark, --color-primary-light, --color-accent
     * Tailwind: bg-primary, text-primary, border-primary, bg-accent, etc.
     */
    primary: {
      DEFAULT: "#00A0A0", // Alegra Teal — color de marca principal
      dark:    "#009690", // hover / active states
      light:   "#33C4B8", // variante clara, badges, backgrounds suaves
      bright:  "#00D4D4", // accent interactivo (ring, focus indicators)
    },

    /**
     * Secondary — Naranja cálido
     * CSS vars: --color-secondary, --color-secondary-dark
     * Tailwind: bg-secondary, text-secondary, etc.
     */
    secondary: {
      DEFAULT: "#f97316", // Orange 500
      dark:    "#ea580c", // Orange 600 — hover
    },

    /**
     * Estados semánticos
     * CSS vars: --color-danger, --color-success, --color-warning, --color-info
     * Tailwind: bg-danger, text-success, border-warning, etc.
     */
    danger:  "#ef4444", // Red 500    — errores, eliminaciones, alertas críticas
    success: "#10b981", // Emerald 500 — confirmaciones, éxito, estados activos
    warning: "#f59e0b", // Amber 500  — advertencias, estados pendientes
    info:    "#0ea5e9", // Sky 500    — información, tooltips, banners neutros

    /**
     * Superficie / neutros
     * CSS vars: --color-surface, --color-muted, --color-border, --color-card
     * Tailwind: bg-surface, text-muted, border-border, bg-card, etc.
     */
    surface: "#f8fafa",  // Fondo de módulos admin (light)
    muted:   "#6b7280",  // Texto secundario / labels
    border:  "#e5e7eb",  // Bordes de cards, separadores
    card:    "#ffffff",  // Fondo de tarjetas (light)
  },

  spacing: {
    /**
     * Clases Tailwind para stacks verticales consistentes.
     * Usar como: <div className={tokens.spacing.moduleStack}>
     */
    moduleStack:  "space-y-4", // stack entre módulos del panel admin
    sectionStack: "space-y-6", // stack entre secciones de marketing / storefront
  },

  radius: {
    /**
     * Clases Tailwind para border-radius estándar.
     * Usar como: <div className={tokens.radius.card}>
     */
    default: "rounded-lg",  // inputs, chips, badges
    card:    "rounded-xl",  // cards de admin, modales
    pill:    "rounded-full", // avatars, tags, badges numéricos
  },
} as const;

/**
 * Alias de conveniencia: solo los hex de colores principales.
 * Útil para pasar a librerías externas (Recharts, GSAP, Chart.js).
 *
 * @example
 *   <Line stroke={chartColors.primary} />
 *   gsap.to(el, { backgroundColor: chartColors.danger })
 */
export const chartColors = {
  primary:   tokens.color.primary.DEFAULT,
  secondary: tokens.color.secondary.DEFAULT,
  danger:    tokens.color.danger,
  success:   tokens.color.success,
  warning:   tokens.color.warning,
  info:      tokens.color.info,
} as const;

export type DesignTokens = typeof tokens;
export type ChartColors  = typeof chartColors;
