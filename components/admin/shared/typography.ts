/* ═══════════════════════════════════════════════════════════════════════════
 * Admin Typography Standard — Guía de estilos tipográficos
 *
 * REGLA: Todos los módulos admin deben seguir esta escala de tipografía.
 *
 * NIVELES:
 *   L1 — Título de módulo (AdminModuleHeader)
 *     → text-xl font-bold text-[var(--text-primary)]
 *
 *   L2 — Título de sección interna
 *     → text-lg font-semibold text-[var(--text-primary)]
 *
 *   L3 — Título de card/grupo
 *     → text-sm font-semibold text-[var(--text-primary)]
 *
 *   L4 — Label de campo o métrica
 *     → text-xs font-medium text-[var(--text-secondary)]
 *
 *   Body — Texto descriptivo
 *     → text-sm text-[var(--text-secondary)]
 *
 *   Caption — Nota al pie o timestamp
 *     → text-xs text-[var(--text-tertiary)]
 *
 *   Value — Valor numérico destacado
 *     → text-2xl font-bold text-[var(--text-primary)]  (grande)
 *     → text-lg font-bold text-[var(--text-primary)]   (mediano)
 *     → text-sm font-semibold text-[var(--text-primary)] (pequeño)
 *
 *   Accent — Color primario
 *     → text-[#2563EB]  (teal, para valores positivos, CTAs)
 *
 *   Danger — Color de alerta
 *     → text-[var(--data-error-600)]    (para deudas, errores, métricas negativas)
 *
 *   Warning — Color de advertencia
 *     → text-[var(--data-warning-600)]  (para vencimientos, stock bajo)
 *
 * COMPONENTES REUTILIZABLES (abajo)
 * ═══════════════════════════════════════════════════════════════════════════ */

export const typography = {
  // Títulos
  moduleTitle: "text-xl font-bold text-[var(--text-primary)]",
  sectionTitle: "text-lg font-semibold text-[var(--text-primary)]",
  cardTitle: "text-sm font-semibold text-[var(--text-primary)]",

  // Texto
  label: "text-xs font-medium text-[var(--text-secondary)]",
  body: "text-sm text-[var(--text-secondary)]",
  caption: "text-xs text-[var(--text-tertiary)]",
  description: "text-xs text-[var(--text-secondary)]",

  // Valores
  valueLg: "text-2xl font-bold text-[var(--text-primary)]",
  valueMd: "text-lg font-bold text-[var(--text-primary)]",
  valueSm: "text-sm font-semibold text-[var(--text-primary)]",

  // Colores semánticos
  accent: "text-[#2563EB]",
  danger: "text-[var(--data-error-600)]",
  warning: "text-[var(--data-warning-500)]",
  success: "text-[var(--data-success-500)]",
  muted: "text-[var(--text-tertiary)]",

  // Badges
  badgePrimary: "px-2 py-0.5 rounded-full bg-[#2563EB]/10 text-[#2563EB] text-xs font-bold",
  badgeDanger: "px-2 py-0.5 rounded-full bg-red-50 text-[var(--data-error-600)] text-xs font-bold",
  badgeWarning: "px-2 py-0.5 rounded-full bg-amber-50 text-[var(--data-warning-600)] text-xs font-bold",
  badgeSuccess: "px-2 py-0.5 rounded-full bg-primary/10 text-[var(--data-success-500)] text-xs font-bold",
  badgeNeutral: "px-2 py-0.5 rounded-full bg-gray-100 text-[var(--text-secondary)] text-xs font-bold",

  // Tablas
  tableHeader: "text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide",
  tableCell: "text-sm text-[var(--text-primary)]",
  tableCellBold: "text-sm font-medium text-[var(--text-primary)]",

  // KPI Cards
  kpiValue: "text-2xl font-extrabold text-[var(--text-primary)]",
  kpiLabel: "text-xs font-medium text-[var(--text-secondary)]",
  kpiDelta: "text-xs font-bold",
} as const;
