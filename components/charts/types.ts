/**
 * components/charts/types.ts
 *
 * Re-exporta los tipos más usados de recharts para que los consumidores puedan
 * importarlos desde "@/components/charts" sin necesidad de importar recharts
 * directamente (lo que añadiría el bundle estático que queremos evitar).
 *
 * IMPORTANTE: Solo tipos — nunca valores en tiempo de ejecución.
 * Los componentes reales se cargan de forma diferida via LazyChart.tsx.
 */

export type {
  // Tipos de datos
  TooltipProps,
  LegendProps,
  CartesianGridProps,
  XAxisProps,
  YAxisProps,
} from "recharts";

// Tipo auxiliar para el dato de cada celda/punto
export type ChartDataItem = Record<string, string | number | null | undefined>;

// Tipo para el formatter del tooltip
export type TooltipFormatter = (
  value: number | string,
  name: string,
  item: ChartDataItem
) => [string, string] | string;
