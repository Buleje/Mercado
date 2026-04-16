/* ═══════════════════════════════════════════════════════════════════════════
 * Admin Typography Standard — Guía de estilos tipográficos
 *
 * REGLA: Todos los módulos admin deben seguir esta escala de tipografía.
 *
 * NIVELES:
 *   L1 — Título de módulo (AdminModuleHeader)
 *     → text-xl font-bold text-gray-900
 *
 *   L2 — Título de sección interna
 *     → text-lg font-semibold text-gray-900
 *
 *   L3 — Título de card/grupo
 *     → text-sm font-semibold text-gray-900
 *
 *   L4 — Label de campo o métrica
 *     → text-xs font-medium text-gray-500
 *
 *   Body — Texto descriptivo
 *     → text-sm text-gray-600
 *
 *   Caption — Nota al pie o timestamp
 *     → text-xs text-gray-400
 *
 *   Value — Valor numérico destacado
 *     → text-2xl font-bold text-gray-900  (grande)
 *     → text-lg font-bold text-gray-900   (mediano)
 *     → text-sm font-semibold text-gray-900 (pequeño)
 *
 *   Accent — Color primario
 *     → text-[#2563EB]  (teal, para valores positivos, CTAs)
 *
 *   Danger — Color de alerta
 *     → text-red-600    (para deudas, errores, métricas negativas)
 *
 *   Warning — Color de advertencia
 *     → text-amber-600  (para vencimientos, stock bajo)
 *
 * COMPONENTES REUTILIZABLES (abajo)
 * ═══════════════════════════════════════════════════════════════════════════ */

export const typography = {
  // Títulos
  moduleTitle: "text-xl font-bold text-gray-900",
  sectionTitle: "text-lg font-semibold text-gray-900",
  cardTitle: "text-sm font-semibold text-gray-900",

  // Texto
  label: "text-xs font-medium text-gray-500",
  body: "text-sm text-gray-600",
  caption: "text-xs text-gray-400",
  description: "text-xs text-gray-500",

  // Valores
  valueLg: "text-2xl font-bold text-gray-900",
  valueMd: "text-lg font-bold text-gray-900",
  valueSm: "text-sm font-semibold text-gray-900",

  // Colores semánticos
  accent: "text-[#2563EB]",
  danger: "text-red-600",
  warning: "text-amber-600",
  success: "text-emerald-600",
  muted: "text-gray-400",

  // Badges
  badgePrimary: "px-2 py-0.5 rounded-full bg-[#2563EB]/10 text-[#2563EB] text-xs font-bold",
  badgeDanger: "px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-xs font-bold",
  badgeWarning: "px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 text-xs font-bold",
  badgeSuccess: "px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-xs font-bold",
  badgeNeutral: "px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-bold",

  // Tablas
  tableHeader: "text-xs font-semibold text-gray-500 uppercase tracking-wide",
  tableCell: "text-sm text-gray-700",
  tableCellBold: "text-sm font-medium text-gray-900",

  // KPI Cards
  kpiValue: "text-2xl font-extrabold text-gray-900",
  kpiLabel: "text-xs font-medium text-gray-500",
  kpiDelta: "text-xs font-bold",
} as const;
