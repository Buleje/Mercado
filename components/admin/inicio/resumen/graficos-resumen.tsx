"use client";

/**
 * Los tres dibujos del Resumen de Inicio (2026-10-09, pedido de Brandon:
 * «revisa los gráficos… con buen diseño y formato»):
 *  - `BarrasPorDia`: una barra por día (o tramo), un solo eje, color por
 *    concepto (`COLOR_CONCEPTO`), línea punteada del promedio y el mejor día
 *    resaltado. Reemplaza a los compuestos de 3 series con doble eje.
 *  - `BarrasRanking`: barras horizontales con la cifra al final (3+ filas).
 *  - `RankingCorto`: 1-2 filas → lista, no un gráfico de una barra.
 * Ejes compactos («S/ 1.5 mil»), tooltip con el día escrito («jueves 01/10»).
 */
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { KpiTile, MicroList, type SectionKPI } from "../_shared";
import { cn } from "@/lib/utils";
import {
  cantidad,
  COLOR_CONCEPTO,
  fechaConDia,
  numeroEje,
  soles,
  solesEje,
} from "@/lib/admin/inicio/formato-tablero";

export type Formato = "soles" | "cantidad";

const fmtValor = (f: Formato, v: unknown) => (f === "soles" ? soles(v) : cantidad(v));
const fmtEje = (f: Formato, v: unknown) => (f === "soles" ? solesEje(v) : numeroEje(v));

const TICK = { fontSize: 12, fill: "var(--text-tertiary)" } as const;

export interface Serie {
  key: string;
  nombre: string;
  color: string;
}

interface PropsTooltip {
  active?: boolean;
  payload?: ReadonlyArray<{ name?: unknown; value?: unknown; color?: string; payload?: unknown }>;
  label?: unknown;
  formato: Formato;
  /** Título del tooltip a partir de la fila (p. ej. «jueves 01/10»). */
  titulo?: (fila: Record<string, unknown>) => string;
  /** Línea extra bajo las cifras («3 órdenes · S/ 600 sin pagar»). */
  detalle?: (fila: Record<string, unknown>) => string | null;
}

function TooltipResumen({ active, payload, label, formato, titulo, detalle }: PropsTooltip) {
  if (!active || !payload?.length) return null;
  const fila = (payload[0]?.payload ?? {}) as Record<string, unknown>;
  const cabeza = titulo ? titulo(fila) : String(label ?? "");
  const extra = detalle?.(fila);
  return (
    <div className="min-w-[11rem] border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-sm shadow-[var(--shadow-md)]">
      <p className="mb-1 font-bold text-[var(--text-primary)]">{cabeza}</p>
      {payload.map((p) => (
        <div key={String(p.name)} className="flex items-center gap-2 py-0.5">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: p.color }}
            aria-hidden
          />
          <span className="font-medium text-[var(--text-secondary)]">{String(p.name)}</span>
          <span className="ml-auto pl-3 font-extrabold tabular-nums text-[var(--text-primary)]">
            {fmtValor(formato, p.value)}
          </span>
        </div>
      ))}
      {extra && <p className="mt-1 text-xs font-medium text-[var(--text-tertiary)]">{extra}</p>}
    </div>
  );
}

/** Leyenda chica: sólo cuando hay más de una serie (con una, el título ya la nombra). */
export function Leyenda({ series }: { series: Serie[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-[var(--text-secondary)]">
      {series.map((s) => (
        <li key={s.key} className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: s.color }}
            aria-hidden
          />
          {s.nombre}
        </li>
      ))}
    </ul>
  );
}

interface PropsPorDia<T extends { day: string; iso: string }> {
  data: T[];
  series: Serie[];
  formato: Formato;
  alto?: number;
  apiladas?: boolean;
  /** Línea punteada del promedio diario (una sola serie). */
  promedio?: number | null;
  /** Sin eje Y ni grilla: para el hero, donde la cifra grande ya da la escala. */
  compacto?: boolean;
}

/** Barras por día, un solo eje. El mejor día de una serie única va resaltado. */
export function BarrasPorDia<T extends { day: string; iso: string }>({
  data,
  series,
  formato,
  alto = 220,
  apiladas = false,
  promedio,
  compacto = false,
}: PropsPorDia<T>) {
  const unica = series.length === 1 ? series[0] : null;
  let mejor = -1;
  if (unica) {
    let max = 0;
    data.forEach((f, i) => {
      const v = Number((f as Record<string, unknown>)[unica.key] ?? 0);
      if (v > max) {
        max = v;
        mejor = i;
      }
    });
  }
  const esHora = data[0]?.day.endsWith("h");
  return (
    <div style={{ height: alto }} className="w-full min-w-0">
      <ResponsiveContainer
        initialDimension={{ width: 1, height: 1 }}
        minWidth={0}
        width="100%"
        height="100%"
      >
        <BarChart
          data={data}
          margin={{ top: 8, right: 4, left: compacto ? 4 : 0, bottom: 0 }}
          barGap={2}
        >
          {!compacto && (
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--rule-soft)" />
          )}
          <XAxis
            dataKey="day"
            tick={TICK}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={14}
          />
          <YAxis
            hide={compacto}
            tick={TICK}
            axisLine={false}
            tickLine={false}
            width={64}
            tickFormatter={(v) => fmtEje(formato, v)}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-sunken)" }}
            content={(p) => (
              <TooltipResumen
                active={p.active}
                payload={p.payload}
                label={p.label}
                formato={formato}
                titulo={esHora ? undefined : (f) => fechaConDia(String(f.iso ?? ""))}
              />
            )}
          />
          {promedio != null && promedio > 0 && (
            <ReferenceLine
              y={promedio}
              stroke={COLOR_CONCEPTO.referencia}
              strokeDasharray="4 4"
              label={{
                value: `promedio ${fmtEje(formato, promedio)}`,
                position: "insideTopRight",
                fill: "var(--text-tertiary)",
                fontSize: 11,
              }}
            />
          )}
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.nombre}
              fill={s.color}
              stackId={apiladas ? "a" : undefined}
              radius={apiladas ? 0 : [4, 4, 0, 0]}
              maxBarSize={32}
              isAnimationActive={false}
            >
              {unica &&
                data.map((f, i) => (
                  <Cell
                    key={f.iso}
                    fill={s.color}
                    fillOpacity={mejor < 0 || i === mejor ? 1 : 0.55}
                  />
                ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface PropsRanking<T> {
  data: T[];
  nombre: (fila: T) => string;
  valor: Extract<keyof T, string>;
  serie: string;
  color: string;
  formato: Formato;
  detalle?: (fila: T) => string | null;
}

/** Ranking de 3+ filas: barras horizontales, la cifra al final de cada una. */
export function BarrasRanking<T extends object>({
  data,
  nombre,
  valor,
  serie,
  color,
  formato,
  detalle,
}: PropsRanking<T>) {
  const filas = data.map((f) => ({ ...f, __nombre: nombre(f) }));
  const corto = (s: string) => (s.length > 16 ? `${s.slice(0, 15)}…` : s);
  return (
    <div style={{ height: filas.length * 30 + 12 }} className="w-full min-w-0">
      <ResponsiveContainer
        initialDimension={{ width: 1, height: 1 }}
        minWidth={0}
        width="100%"
        height="100%"
      >
        <BarChart data={filas} layout="vertical" margin={{ top: 4, right: 72, left: 0, bottom: 4 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="__nombre"
            tick={TICK}
            axisLine={false}
            tickLine={false}
            width={118}
            tickFormatter={corto}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-sunken)" }}
            content={(p) => (
              <TooltipResumen
                active={p.active}
                payload={p.payload}
                label={p.label}
                formato={formato}
                titulo={(f) => String(f.__nombre ?? "")}
                detalle={detalle ? (f) => detalle(f as T) : undefined}
              />
            )}
          />
          <Bar<Record<string, unknown>, number>
            dataKey={valor as string}
            name={serie}
            fill={color}
            radius={[0, 4, 4, 0]}
            barSize={20}
            isAnimationActive={false}
          >
            {/* Sin dataKey: el rótulo toma el valor de su barra. */}
            <LabelList
              position="right"
              formatter={(v: unknown) => fmtEje(formato, v)}
              style={{ fontSize: 12, fontWeight: 700, fill: "var(--text-primary)" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 1-2 filas: lista corta con la cifra a la derecha (no un gráfico de 1 barra). */
export function RankingCorto<T>({
  data,
  nombre,
  valor,
  formato,
  color,
  sub,
}: {
  data: T[];
  nombre: (fila: T) => string;
  valor: (fila: T) => number;
  formato: Formato;
  color: string;
  sub?: (fila: T) => string | undefined;
}) {
  return (
    <MicroList
      barColor={color}
      items={data.map((f) => ({
        name: nombre(f),
        value: valor(f),
        label: fmtValor(formato, valor(f)),
        sublabel: sub?.(f),
      }))}
    />
  );
}

/** Pie del bloque: una línea chica bajo el dibujo («y 4 categorías más»). */
export function NotaPie({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-xs font-medium text-[var(--text-tertiary)]">{children}</p>;
}

/**
 * Cifras + dibujo. En una sección ancha (≥48rem, `@container` de
 * DashboardSection) las cifras van a la IZQUIERDA del dibujo en vez de
 * encima: ~110 px menos de alto por bloque. En media columna o en celular,
 * arriba en 2 columnas, como el resto del tablero.
 */
export function ConCifras({ kpis, children }: { kpis: SectionKPI[]; children: ReactNode }) {
  const dos = kpis.length > 2;
  return (
    <div
      className={cn(
        // flex-1 + content-start: en una fila pareja, lo que sobra queda abajo, no entre
        // el título y las cifras.
        "grid flex-1 content-start gap-5 @3xl:items-center",
        dos ? "@3xl:grid-cols-[20rem_1fr]" : "@3xl:grid-cols-[15rem_1fr]",
      )}
    >
      <div className={cn("grid grid-cols-2 gap-3", dos ? "@3xl:grid-cols-2" : "@3xl:grid-cols-1")}>
        {kpis.map((k) => (
          <KpiTile key={k.label} kpi={k} />
        ))}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
