"use client";

/**
 * VentasBarras — el gráfico de barras de la pestaña Ventas del Inicio.
 *
 * Por qué uno propio y no `BulejeComposedChart` (Brandon 2026-10-09: «revisa los
 * gráficos… mejóralos con buen diseño y formato»):
 *  - COLOR POR CONCEPTO: ventas siempre teal, utilidad tinta, período anterior gris
 *    (`COLOR_CONCEPTO`). El primitivo lee `--section-*`, que `DraggableSections`
 *    rota por posición: la misma «Ventas» salía teal en una sección y cian en otra.
 *  - UN SOLO EJE en soles compactos («S/ 1.5 mil»); lo que no es plata (tickets)
 *    va al tooltip, no a un segundo eje.
 *  - Promedio / referencia PUNTEADA, para no leerse como otra serie.
 *  - Barra destacada (el mejor día, la hora pico) y el resto atenuado.
 *  - Leyenda en HTML, legible a 1 m, y tooltip en español con un extra por fila.
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CHART_AXIS_COLOR,
  CHART_FONT,
  CHART_GRID_STROKE,
} from "@/components/ui-system/charts/palette";
import { COLOR_CONCEPTO, soles, solesEje } from "@/lib/admin/inicio/formato-tablero";

export type FilaGrafico = Record<string, string | number | boolean | null | undefined>;

export interface SerieBarra {
  key: string;
  label: string;
  color: string;
}

export interface SerieLinea extends SerieBarra {
  /** Promedio, meta o período anterior: punteada. */
  punteada?: boolean;
}

interface Props {
  data: FilaGrafico[];
  xKey: string;
  barras: SerieBarra[];
  lineas?: SerieLinea[];
  /** Índice de la fila que se destaca (mejor día, hora pico) en la 1.ª serie; el resto se atenúa. */
  destacar?: number;
  /** Formato del eje Y. Default: soles compactos. */
  formatoEje?: (v: number) => string;
  /** Formato de cada valor en el tooltip. Default: soles exactos. */
  formatoValor?: (v: number, key: string) => string;
  /** Línea extra del tooltip para esa fila («3 tickets», «+12% vs promedio»). */
  extraTooltip?: (fila: FilaGrafico) => ReactNode;
  /** Título del tooltip (default: el valor del eje X). */
  tituloTooltip?: (fila: FilaGrafico) => string;
  alto?: number;
  /** Descripción para lectores de pantalla. */
  ariaLabel: string;
}

function useAngosto(): boolean {
  const [angosto, setAngosto] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 640px)");
    const cambiar = () => setAngosto(mq.matches);
    cambiar();
    mq.addEventListener("change", cambiar);
    return () => mq.removeEventListener("change", cambiar);
  }, []);
  return angosto;
}

interface ContenidoTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: {
    dataKey?: string | number;
    name?: string;
    value?: number | string;
    color?: string;
    payload?: FilaGrafico;
  }[];
  formatoValor: (v: number, key: string) => string;
  extraTooltip?: (fila: FilaGrafico) => ReactNode;
  tituloTooltip?: (fila: FilaGrafico) => string;
}

function ContenidoTooltip({
  active,
  label,
  payload,
  formatoValor,
  extraTooltip,
  tituloTooltip,
}: ContenidoTooltipProps) {
  if (!active || !payload?.length) return null;
  const fila = payload[0]?.payload ?? {};
  const extra = extraTooltip?.(fila);
  return (
    <div className="min-w-[11rem] border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-sm shadow-[var(--shadow-sm)]">
      <p className="mb-1.5 text-base font-bold text-[var(--text-primary)]">
        {tituloTooltip ? tituloTooltip(fila) : String(label ?? "")}
      </p>
      {payload.map((p) => {
        const n = Number(p.value);
        return (
          <div key={String(p.dataKey)} className="flex items-center gap-2 py-0.5">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: p.color }}
              aria-hidden
            />
            <span className="font-medium text-[var(--text-secondary)]">{p.name}</span>
            <span className="ml-auto pl-3 font-extrabold tabular-nums text-[var(--text-primary)]">
              {Number.isFinite(n) ? formatoValor(n, String(p.dataKey)) : "—"}
            </span>
          </div>
        );
      })}
      {extra && (
        <div className="mt-1.5 border-t border-[var(--rule-soft)] pt-1.5 text-xs">{extra}</div>
      )}
    </div>
  );
}

/** Leyenda en HTML: punto (barra) o raya (línea; punteada si es referencia). */
function Leyenda({ barras, lineas }: { barras: SerieBarra[]; lineas: SerieLinea[] }) {
  if (barras.length + lineas.length < 2) return null;
  return (
    <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-sm font-semibold text-[var(--text-secondary)]">
      {barras.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span
            className="h-3 w-3 shrink-0 rounded-[3px]"
            style={{ backgroundColor: s.color }}
            aria-hidden
          />
          {s.label}
        </li>
      ))}
      {lineas.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span
            className="w-5 shrink-0 border-t-2"
            style={{ borderColor: s.color, borderTopStyle: s.punteada ? "dashed" : "solid" }}
            aria-hidden
          />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

export function VentasBarras({
  data,
  xKey,
  barras,
  lineas = [],
  destacar,
  formatoEje = solesEje,
  formatoValor = (v) => soles(v),
  extraTooltip,
  tituloTooltip,
  alto = 280,
  ariaLabel,
}: Props) {
  const angosto = useAngosto();
  const tick = {
    fill: CHART_AXIS_COLOR,
    fontSize: angosto ? 12 : 13,
    fontFamily: CHART_FONT.family,
    fontWeight: 600,
  };
  const hayDestacada = typeof destacar === "number" && destacar >= 0;

  return (
    <div role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={alto}>
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          barCategoryGap={angosto ? "18%" : "24%"}
        >
          <CartesianGrid vertical={false} stroke={CHART_GRID_STROKE} />
          <XAxis
            dataKey={xKey}
            tick={tick}
            tickLine={false}
            axisLine={{ stroke: "var(--rule-base)" }}
            interval="preserveStartEnd"
            minTickGap={angosto ? 10 : 6}
          />
          <YAxis
            tick={tick}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatoEje(v)}
            width={angosto ? 56 : 72}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: "var(--accent-soft)" }}
            content={
              <ContenidoTooltip
                formatoValor={formatoValor}
                extraTooltip={extraTooltip}
                tituloTooltip={tituloTooltip}
              />
            }
          />
          {barras.map((s, serie) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color}
              radius={[3, 3, 0, 0]}
              maxBarSize={44}
              animationDuration={500}
            >
              {/* Se destaca sólo la serie principal; la de comparación queda entera. */}
              {hayDestacada &&
                serie === 0 &&
                data.map((_, i) => (
                  <Cell key={i} fill={s.color} fillOpacity={i === destacar ? 1 : 0.45} />
                ))}
            </Bar>
          ))}
          {lineas.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={s.punteada ? 2 : 2.5}
              strokeDasharray={s.punteada ? "6 4" : undefined}
              dot={false}
              activeDot={{ r: 4, fill: s.color }}
              animationDuration={600}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
      <Leyenda barras={barras} lineas={lineas} />
    </div>
  );
}

/**
 * La cifra «primary» de cada KPI (y lo que lea `--section-primary`) sale teal de
 * ventas en TODAS las secciones: la grilla rota `--section-*` por posición y el
 * «mejor día» salía cian en una sección y coral en otra.
 */
const TONO_VENTAS = { "--section-primary": COLOR_CONCEPTO.ventas } as CSSProperties;
export function ConTonoVentas({ children }: { children: ReactNode }) {
  return (
    <div style={TONO_VENTAS} className="h-full">
      {children}
    </div>
  );
}
