"use client";

import { memo } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
  LabelList,
  ReferenceArea,
} from "recharts";
import type { ReactNode } from "react";
import {
  CHART_GRID_STROKE,
  CHART_AXIS_COLOR,
  CHART_FONT,
  CHART_PALETTE,
} from "./palette";
import { ChartTooltip } from "./ChartTooltip";
import { cn } from "@/lib/utils";

/**
 * BulejeComposedChart — compound chart (Bar + Line + Area) con dual-axis.
 *
 * Uso: consolidar 3 métricas correlacionadas en 1 chart en vez de 3 separados.
 * Patron research 2026: max 3 series, dual-axis solo si unidades diferentes,
 * bar siempre zero-based.
 *
 * @example
 * <BulejeComposedChart
 *   data={last30Days}
 *   xKey="date"
 *   bars={[{ key: "ventas", label: "Ventas (S/)", color: "primary", yAxis: "left" }]}
 *   lines={[{ key: "ticket", label: "Ticket prom. (S/)", color: "accent", yAxis: "right" }]}
 *   areas={[{ key: "clientes", label: "Clientes únicos", color: "tertiary", yAxis: "right", opacity: 0.15 }]}
 *   leftAxisFormat={(v) => `S/${v}`}
 *   rightAxisFormat={(v) => v.toString()}
 *   height={320}
 * />
 */

type ColorKey = "primary" | "secondary" | "tertiary" | "quaternary" | "accent" | "info" | "amber" | "purple";

interface SeriesConfig {
  key: string;
  label: string;
  color?: ColorKey;
  yAxis?: "left" | "right";
  /** Para Area: opacity del fill. Default 0.15 */
  opacity?: number;
}

interface Props {
  // Permite booleans para flags derivados (ej: isWeekend, _isPico) que el
  // tooltip lee vía `tooltipExtras`. Recharts ignora los keys que no son
  // dataKey de un Bar/Line/Area, así que es seguro.
  data: Array<Record<string, string | number | boolean>>;
  xKey: string;
  /** Bars zero-based (buenas para contar) */
  bars?: SeriesConfig[];
  /** Lines para tendencias (mejor con medias móviles, ticket promedio) */
  lines?: SeriesConfig[];
  /** Areas para volumen acumulado o ranges */
  areas?: SeriesConfig[];
  height?: number;
  leftAxisFormat?: (value: number) => string;
  rightAxisFormat?: (value: number) => string;
  /** Tooltip value formatter — default toLocaleString es-PE */
  tooltipFormat?: (value: number | string, name?: string) => string;
  showLegend?: boolean;
  showGrid?: boolean;
  /** Cuando hay <3 puntos, muestra mensaje en vez de chart (evitar malinterpretación) */
  minDataPoints?: number;
  /**
   * Si true, muestra el valor de cada barra encima de la barra (data labels).
   * Brandon mayo 2026: facilita lectura para dueños de bodega que no son
   * lectores de gráficos — el número ya está en la barra, no hay que hacer
   * hover ni leer ejes.
   */
  showValues?: boolean;
  /**
   * Formatter del label de la barra. Recibe el valor crudo y el key de la
   * serie (útil para distinguir Soles vs Unidades). Default: número grande
   * formateado como "1.2k" si >= 1000, sino el número directo.
   */
  valueFormat?: (value: number, seriesKey: string) => string;
  /**
   * Brandon mayo 2026: bandas de referencia en el eje X. Útil para destacar
   * fines de semana, feriados, periodos especiales. Las bandas van detrás
   * de bars/lines/areas, no interrumpen interacción.
   */
  referenceAreas?: Array<{
    x1: string | number;
    x2: string | number;
    fillKey?: ColorKey;
    opacity?: number;
    label?: string;
  }>;
  /**
   * Brandon mayo 2026: render extra debajo del tooltip — ej "↑ 12% sobre
   * promedio". Recibe la entry completa de data. Pasado tal cual a
   * ChartTooltip.
   */
  tooltipExtras?: (entry: Record<string, unknown>) => ReactNode;
  className?: string;
}

function defaultValueFormat(v: number): string {
  if (v === 0) return "";
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return v.toLocaleString("es-PE", { maximumFractionDigits: 0 });
}

function resolveColor(key?: ColorKey): string {
  if (!key) return CHART_PALETTE.primary;
  return CHART_PALETTE[key] ?? CHART_PALETTE.primary;
}

export const BulejeComposedChart = memo(function BulejeComposedChart({
  data,
  xKey,
  bars = [],
  lines = [],
  areas = [],
  height = 280,
  leftAxisFormat,
  rightAxisFormat,
  tooltipFormat,
  showLegend = true,
  showGrid = true,
  minDataPoints = 2,
  // Brandon mayo 2026: default a TRUE — todos los charts del admin ahora
  // muestran data labels arriba de cada barra para que sean legibles sin
  // hover ni leer ejes. Caller puede pasar showValues={false} para opt-out.
  showValues = true,
  valueFormat,
  referenceAreas = [],
  tooltipExtras,
  className,
}: Props) {
  const hasRightAxis = [...bars, ...lines, ...areas].some((s) => s.yAxis === "right");

  if (data.length < minDataPoints) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed border-[var(--rule-base)] flex flex-col items-center justify-center text-center p-8",
          className,
        )}
        style={{ height }}
      >
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
          Datos insuficientes
        </p>
        <p className="text-sm text-[var(--text-secondary)]">
          Se necesitan {minDataPoints}+ puntos de datos para mostrar esta correlación.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={height} minWidth={0}>
        <ComposedChart
          data={data}
          margin={{
            // showValues activo: extra top headroom para que la pill flotante
            // del label encima de la barra más alta no se corte. Bumped a 36
            // (era 28) porque la pill ahora tiene border-rect y offset=10.
            top: showValues ? 36 : 12,
            right: 16,
            bottom: 4,
            left: 0,
          }}
        >
          {showGrid && (
            <CartesianGrid
              stroke={CHART_GRID_STROKE}
              strokeDasharray="0"
              vertical={false}
            />
          )}
          <XAxis
            dataKey={xKey}
            stroke={CHART_AXIS_COLOR}
            fontSize={CHART_FONT.axisSize}
            tickLine={false}
            axisLine={false}
            tick={{ fill: CHART_AXIS_COLOR, fontWeight: 600 }}
            // Brandon mayo 2026 v2: interval=0 fuerza mostrar TODOS los
            // labels (Recharts default omite cuando no caben). Rotación
            // -30° + height=60 acomoda labels largos "Lunes 10/05" sin
            // pisarse. dy=8 baja un toque para no solapar el axis line.
            interval={0}
            angle={-30}
            textAnchor="end"
            height={60}
            dy={8}
          />
          <YAxis
            yAxisId="left"
            stroke={CHART_AXIS_COLOR}
            fontSize={CHART_FONT.axisSize}
            tickLine={false}
            axisLine={false}
            tick={{ fill: CHART_AXIS_COLOR, fontWeight: 600 }}
            tickFormatter={leftAxisFormat}
            // Bars always zero-based per research rule
            domain={[0, "auto"]}
          />
          {hasRightAxis && (
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke={CHART_AXIS_COLOR}
              fontSize={CHART_FONT.axisSize}
              tickLine={false}
              axisLine={false}
              tick={{ fill: CHART_AXIS_COLOR, fontWeight: 600 }}
              tickFormatter={rightAxisFormat}
            />
          )}
          <Tooltip
            content={<ChartTooltip format={tooltipFormat} extras={tooltipExtras} />}
            cursor={{ fill: "var(--rule-soft)", opacity: 0.5 }}
          />

          {/* Reference areas — fondos para destacar fines de semana, feriados, etc.
              Van detrás de areas/bars/lines pero no interfieren con interacción. */}
          {referenceAreas.map((ra, i) => {
            const fill = resolveColor(ra.fillKey ?? "amber");
            return (
              <ReferenceArea
                key={`ref-${i}-${ra.x1}-${ra.x2}`}
                x1={ra.x1}
                x2={ra.x2}
                yAxisId="left"
                fill={fill}
                fillOpacity={ra.opacity ?? 0.08}
                stroke="none"
                ifOverflow="hidden"
              />
            );
          })}
          {showLegend && (
            <Legend
              wrapperStyle={{
                paddingTop: 16,
                fontSize: CHART_FONT.labelSize,
                fontFamily: CHART_FONT.family,
                fontWeight: 600,
              }}
              iconType="circle"
              iconSize={12}
            />
          )}

          {/* Areas primero (van al fondo) */}
          {areas.map((series) => {
            const color = resolveColor(series.color);
            const gradientId = `area-${series.key}-gradient`;
            return (
              <g key={`area-${series.key}`}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={series.opacity ?? 0.15} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey={series.key}
                  name={series.label}
                  stroke="none"
                  fill={`url(#${gradientId})`}
                  yAxisId={series.yAxis ?? "left"}
                  isAnimationActive={true}
                  animationDuration={700}
                />
              </g>
            );
          })}

          {/* Bars en medio */}
          {bars.map((series) => {
            const color = resolveColor(series.color);
            return (
              <Bar
                key={`bar-${series.key}`}
                dataKey={series.key}
                name={series.label}
                fill={color}
                yAxisId={series.yAxis ?? "left"}
                radius={[3, 3, 0, 0]}
                isAnimationActive={true}
                animationDuration={600}
                maxBarSize={40}
              >
                {showValues && (
                  <LabelList
                    dataKey={series.key}
                    position="top"
                    offset={10}
                    // Brandon mayo 2026 v2: custom content que dibuja un
                    // rect de fondo detrás del texto. Sin esto, las líneas
                    // de tendencia (Saldo neto, Pedidos, Ingresos S/) pasan
                    // por encima y tapan los labels de las barras.
                    content={((props: {
                      x?: number;
                      y?: number;
                      width?: number;
                      value?: number | string;
                    }) => {
                      const { x = 0, y = 0, width = 0, value } = props;
                      const num = Number(value);
                      if (!Number.isFinite(num) || num === 0) return null;
                      const text = valueFormat
                        ? valueFormat(num, series.key)
                        : defaultValueFormat(num);
                      if (!text) return null;
                      const cx = x + width / 2;
                      // Estimación ancho del texto: 6.5px por char a fontSize 11
                      const padX = 6;
                      const rectWidth = Math.max(20, text.length * 6.5 + padX * 2);
                      const rectHeight = 18;
                      return (
                        <g pointerEvents="none">
                          <rect
                            x={cx - rectWidth / 2}
                            y={y - rectHeight - 2}
                            width={rectWidth}
                            height={rectHeight}
                            rx={4}
                            ry={4}
                            fill="var(--surface-raised)"
                            stroke="var(--rule-base)"
                            strokeWidth={1}
                          />
                          <text
                            x={cx}
                            y={y - rectHeight / 2 - 2}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill={CHART_AXIS_COLOR}
                            fontSize={CHART_FONT.axisSize}
                            fontWeight={700}
                            fontFamily={CHART_FONT.family}
                          >
                            {text}
                          </text>
                        </g>
                      );
                    }) as never}
                  />
                )}
              </Bar>
            );
          })}

          {/* Lines encima (más visible) */}
          {lines.map((series) => {
            const color = resolveColor(series.color);
            return (
              <Line
                key={`line-${series.key}`}
                type="monotone"
                dataKey={series.key}
                name={series.label}
                stroke={color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: color }}
                yAxisId={series.yAxis ?? "left"}
                isAnimationActive={true}
                animationDuration={800}
              />
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
});
