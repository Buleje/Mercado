/**
 * @buleje/design-system/dashboard — barrel
 *
 * Primitivos de dashboard canónicos (ADR-076 addendum).
 * Consumidores: import { ChartCard, PeriodFilter } from "@buleje/design-system/dashboard"
 *
 * `KpiCard` salió del export (canon KPI 2026-09-22): 0 usos en todo el repo
 * (grep de `@buleje/design-system/dashboard` no encontró ningún import real,
 * sólo los comentarios de este mismo directorio) y duplicaba a `StatCard`
 * (`../data-display.tsx`, 51 usos). El archivo `KpiCard.tsx` sigue en disco —
 * el entorno de esta sesión no permitió borrar archivos (`rm` denegado por el
 * sistema de permisos) — queda huérfano y documentado para que un borrado
 * físico posterior no tenga que volver a investigar si es seguro.
 */

export { ChartCard, type ChartCardProps, type ChartCardTone, type ChartCardVariant } from "./ChartCard";
export { DashboardSection, type DashboardSectionProps, type DashboardGridCols } from "./DashboardSection";
export { PeriodFilter, type PeriodFilterProps, type Period, type DateRange } from "./PeriodFilter";
