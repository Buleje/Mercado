/**
 * components/charts/index.ts
 *
 * Barrel del sistema de charts lazy del admin.
 * Importar desde "@/components/charts" en lugar de "recharts" directamente.
 *
 * Exporta:
 *   - LazyBarChart, LazyLineChart, LazyPieChart, LazyAreaChart
 *   - LazyComposedChart, LazyScatterChart, LazyRadialBarChart, LazyRadarChart
 *   - ChartSkeleton — skeleton standalone para loading states
 *   - Tipos: ChartDataItem, TooltipFormatter (sin bundle de recharts)
 */

export {
  LazyBarChart,
  LazyLineChart,
  LazyPieChart,
  LazyAreaChart,
  LazyComposedChart,
  LazyScatterChart,
  LazyRadialBarChart,
  LazyRadarChart,
  ChartSkeleton,
} from "./LazyChart";

export type { ChartDataItem, TooltipFormatter } from "./types";
