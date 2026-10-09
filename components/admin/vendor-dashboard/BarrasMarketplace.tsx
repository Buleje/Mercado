"use client";

/**
 * BarrasMarketplace — el gráfico de barras de la pestaña Marketplace del Inicio.
 *
 * Una sola forma para los 4 gráficos de barras de la pestaña (ventas de 7
 * días, ingresos por mes, semana vs la pasada, más vendidos), así se leen
 * igual: un solo eje, color por concepto (`COLOR_CONCEPTO`), la cifra encima
 * de cada barra cuando hay una sola serie, tooltip en español con soles.
 * `horizontal` = ranking: el nombre entero a la izquierda, la barra a la derecha.
 */

import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type FilaBarras = Record<string, string | number | boolean | null | undefined>;

export interface SerieBarras {
  key: string;
  label: string;
  color: string;
}

interface Props {
  data: FilaBarras[];
  /** Clave de la categoría (día, mes, producto). */
  xKey: string;
  series: SerieBarras[];
  /** Barras horizontales (rankings). */
  horizontal?: boolean;
  /** Fila resaltada (hoy, el mes actual); las demás van más claras. */
  destacar?: (fila: FilaBarras) => boolean;
  /** Formato largo del valor (tooltip): «S/ 1,234.50». */
  formatoValor: (v: number) => string;
  /** Formato corto (cifra sobre la barra y eje): «S/ 1.5 mil». */
  formatoCorto: (v: number) => string;
  /** Con una sola serie la cifra va encima de la barra y el eje sobra. */
  etiquetas?: boolean;
  /** Título del tooltip (default: la categoría). */
  tituloTooltip?: (fila: FilaBarras) => string;
  extraTooltip?: (fila: FilaBarras) => ReactNode;
  alto?: number;
  ariaLabel: string;
}

const TICK = { fontSize: 12, fill: "var(--text-secondary)", fontWeight: 600 } as const;
const LARGO_NOMBRE = 22;

function corto(nombre: unknown): string {
  const s = String(nombre ?? "");
  return s.length > LARGO_NOMBRE ? `${s.slice(0, LARGO_NOMBRE - 1)}…` : s;
}

/** Nombre en UNA línea (el tick por defecto de Recharts lo partía en dos). */
function TickNombre({ x, y, payload }: { x?: number | string; y?: number | string; payload?: { value?: unknown } }) {
  return (
    <text x={Number(x ?? 0)} y={Number(y ?? 0)} dy={4} textAnchor="end" fontSize={12} fontWeight={600} fill="var(--text-secondary)">
      <title>{String(payload?.value ?? "")}</title>
      {corto(payload?.value)}
    </text>
  );
}

/**
 * Cifra encima (o a la derecha) de la barra en UNA línea: la de Recharts se
 * parte al ancho de la barra y a 400 px «S/ 48» salía en dos renglones.
 */
function etiquetaValor(
  p: { x?: unknown; y?: unknown; width?: unknown; height?: unknown; value?: unknown },
  horizontal: boolean,
  formato: (v: number) => string,
) {
  const v = Number(p.value);
  if (!Number.isFinite(v) || v === 0) return null;
  const x = Number(p.x ?? 0);
  const y = Number(p.y ?? 0);
  const w = Number(p.width ?? 0);
  const h = Number(p.height ?? 0);
  return (
    <text
      x={horizontal ? x + w + 6 : x + w / 2}
      y={horizontal ? y + h / 2 : y - 6}
      dy={horizontal ? 4 : 0}
      textAnchor={horizontal ? "start" : "middle"}
      fontSize={12}
      fontWeight={700}
      fill="var(--text-primary)"
    >
      {formato(v)}
    </text>
  );
}

interface ContenidoProps {
  active?: boolean;
  label?: string | number;
  payload?: { dataKey?: string | number; name?: string; value?: number | string; color?: string; payload?: FilaBarras }[];
  formatoValor: (v: number) => string;
  tituloTooltip?: (fila: FilaBarras) => string;
  extraTooltip?: (fila: FilaBarras) => ReactNode;
}

function Contenido({ active, label, payload, formatoValor, tituloTooltip, extraTooltip }: ContenidoProps) {
  if (!active || !payload?.length) return null;
  const fila = payload[0]?.payload ?? {};
  const extra = extraTooltip?.(fila);
  return (
    <div className="min-w-[11rem] border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-sm shadow-[var(--shadow-sm)]">
      <p className="mb-1.5 text-base font-bold text-[var(--text-primary)]">{tituloTooltip ? tituloTooltip(fila) : String(label ?? "")}</p>
      {payload.map((p) => {
        const n = Number(p.value);
        return (
          <div key={String(p.dataKey)} className="flex items-center gap-2 py-0.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} aria-hidden />
            <span className="font-medium text-[var(--text-secondary)]">{p.name}</span>
            <span className="ml-auto pl-3 font-extrabold tabular-nums text-[var(--text-primary)]">
              {Number.isFinite(n) ? formatoValor(n) : "—"}
            </span>
          </div>
        );
      })}
      {extra && <div className="mt-1 border-t border-[var(--rule-soft)] pt-1.5 text-[var(--text-secondary)]">{extra}</div>}
    </div>
  );
}

export function BarrasMarketplace({
  data,
  xKey,
  series,
  horizontal = false,
  destacar,
  formatoValor,
  formatoCorto,
  etiquetas = series.length === 1,
  tituloTooltip,
  extraTooltip,
  alto = 220,
  ariaLabel,
}: Props) {
  return (
    <div role="img" aria-label={ariaLabel} className="w-full">
      <ResponsiveContainer minWidth={0} width="100%" height={alto}>
        <BarChart
          data={data}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={horizontal ? { top: 4, right: 64, bottom: 4, left: 4 } : { top: etiquetas ? 22 : 8, right: 8, bottom: 0, left: 0 }}
          barCategoryGap={horizontal ? "22%" : "28%"}
        >
          {!etiquetas && !horizontal && <CartesianGrid vertical={false} stroke="var(--rule-soft)" />}
          {horizontal ? (
            <>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey={xKey}
                width={160}
                tick={<TickNombre />}
                tickLine={false}
                axisLine={false}
              />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} tick={TICK} tickLine={false} axisLine={{ stroke: "var(--rule-base)" }} interval={0} />
              <YAxis
                hide={etiquetas}
                tick={TICK}
                tickLine={false}
                axisLine={false}
                width={64}
                tickFormatter={(v: number) => formatoCorto(v)}
              />
            </>
          )}
          <Tooltip
            cursor={{ fill: "var(--surface-sunken)" }}
            content={<Contenido formatoValor={formatoValor} tituloTooltip={tituloTooltip} extraTooltip={extraTooltip} />}
          />
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color}
              radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
              maxBarSize={horizontal ? 28 : 56}
              isAnimationActive={false}
            >
              {destacar &&
                data.map((fila, i) => (
                  <Cell key={i} fill={s.color} fillOpacity={destacar(fila) ? 1 : 0.5} />
                ))}
              {etiquetas && (
                <LabelList dataKey={s.key} content={(p) => etiquetaValor(p, horizontal, formatoCorto)} />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
      {series.length > 1 && (
        <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold text-[var(--text-secondary)]">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden />
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
