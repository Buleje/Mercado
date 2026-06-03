"use client";

/**
 * components/charts/LazyChart.tsx
 *
 * Wrapper lazy para todos los chart types de recharts.
 * Elimina ~120-180 KB gzip del bundle inicial del admin cargando recharts
 * de forma diferida con next/dynamic + ssr:false.
 *
 * Exporta versiones tipadas de cada chart type. Los consumidores reemplazan:
 *   import { BarChart } from "recharts"       // bundle estático — evitar
 * por:
 *   import { LazyBarChart } from "@/components/charts"   // lazy — correcto
 *
 * Todos los props son pass-through: la API es idéntica a recharts original.
 * El fallback es <ChartSkeleton height={...} /> hasta que recharts carga.
 *
 * Ver WIRING.md para la lista de los 37 archivos que deben migrar.
 */

import dynamic from "next/dynamic";
import ChartSkeleton from "./ChartSkeleton";

// ── Tipos de recharts para props pass-through ─────────────────────────────────
import type {
  BarChart as BarChartType,
  LineChart as LineChartType,
  PieChart as PieChartType,
  AreaChart as AreaChartType,
  ComposedChart as ComposedChartType,
  ScatterChart as ScatterChartType,
  RadialBarChart as RadialBarChartType,
  RadarChart as RadarChartType,
} from "recharts";

// Extrae las props reales de un componente de recharts (ej. typeof BarChart).
// Antes envolvía con ComponentType<T> → resolvía al tipo del componente, no a
// sus props, y pasar data/children daba "No overload matches this call".
// Usa un conditional con infer (sin constraint) para soportar también los charts
// genéricos de recharts (RadialBar/Radar usan firma <DataPointType>).
type RechartProps<T> = T extends React.JSXElementConstructor<infer P> ? P : Record<string, unknown>;

// ── Factory para crear componentes lazy consistentes ──────────────────────────

function makeLazyChart<TProps>(
  loader: () => Promise<{ default: React.ComponentType<TProps> }>,
  skeletonHeight = 300
) {
  return dynamic(loader, {
    ssr: false,
    loading: () => <ChartSkeleton height={skeletonHeight} />,
  });
}

// ── BarChart ──────────────────────────────────────────────────────────────────

export const LazyBarChart = makeLazyChart<RechartProps<typeof BarChartType>>(
  () => import("recharts").then((m) => ({ default: m.BarChart as React.ComponentType<RechartProps<typeof BarChartType>> }))
);

// ── LineChart ─────────────────────────────────────────────────────────────────

export const LazyLineChart = makeLazyChart<RechartProps<typeof LineChartType>>(
  () => import("recharts").then((m) => ({ default: m.LineChart as React.ComponentType<RechartProps<typeof LineChartType>> }))
);

// ── PieChart ──────────────────────────────────────────────────────────────────

export const LazyPieChart = makeLazyChart<RechartProps<typeof PieChartType>>(
  () => import("recharts").then((m) => ({ default: m.PieChart as React.ComponentType<RechartProps<typeof PieChartType>> })),
  280
);

// ── AreaChart ─────────────────────────────────────────────────────────────────

export const LazyAreaChart = makeLazyChart<RechartProps<typeof AreaChartType>>(
  () => import("recharts").then((m) => ({ default: m.AreaChart as React.ComponentType<RechartProps<typeof AreaChartType>> }))
);

// ── ComposedChart ─────────────────────────────────────────────────────────────

export const LazyComposedChart = makeLazyChart<RechartProps<typeof ComposedChartType>>(
  () => import("recharts").then((m) => ({ default: m.ComposedChart as React.ComponentType<RechartProps<typeof ComposedChartType>> }))
);

// ── ScatterChart ──────────────────────────────────────────────────────────────

export const LazyScatterChart = makeLazyChart<RechartProps<typeof ScatterChartType>>(
  () => import("recharts").then((m) => ({ default: m.ScatterChart as React.ComponentType<RechartProps<typeof ScatterChartType>> }))
);

// ── RadialBarChart ────────────────────────────────────────────────────────────

export const LazyRadialBarChart = makeLazyChart<RechartProps<typeof RadialBarChartType>>(
  () => import("recharts").then((m) => ({ default: m.RadialBarChart as React.ComponentType<RechartProps<typeof RadialBarChartType>> })),
  260
);

// ── RadarChart ────────────────────────────────────────────────────────────────

export const LazyRadarChart = makeLazyChart<RechartProps<typeof RadarChartType>>(
  () => import("recharts").then((m) => ({ default: m.RadarChart as React.ComponentType<RechartProps<typeof RadarChartType>> })),
  260
);

// ── Re-export del skeleton para consumidores que lo quieran usar directamente ─

export { default as ChartSkeleton } from "./ChartSkeleton";
