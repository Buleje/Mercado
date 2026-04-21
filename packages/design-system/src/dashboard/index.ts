/**
 * @buleje/design-system/dashboard — barrel
 *
 * Primitivos de dashboard canónicos (ADR-076 addendum).
 * Consumidores: import { ChartCard, KpiCard, PeriodFilter } from "@buleje/design-system/dashboard"
 */

export { ChartCard, type ChartCardProps, type ChartCardTone, type ChartCardVariant } from "./ChartCard";
export { DashboardSection, type DashboardSectionProps, type DashboardGridCols } from "./DashboardSection";
export { KpiCard, type KpiCardProps, type KpiCardVariant, type KpiCardTone } from "./KpiCard";
export { PeriodFilter, type PeriodFilterProps, type Period, type DateRange } from "./PeriodFilter";
