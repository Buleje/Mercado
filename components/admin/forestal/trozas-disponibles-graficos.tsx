"use client";

/**
 * Los tres gráficos de «Trozas disponibles»: m³ por especie, m³ por permiso
 * partido por especie y cuántas trozas hay en cada tramo de días. Los tres son
 * EN EL PATIO; lo sin recepcionar se dice en una línea aparte.
 *
 * Clic en una barra = el mismo filtro que el clic en una fila (otro clic lo
 * suelta). Cada gráfico se cuenta sin SU filtro, así la barra elegida sigue a
 * la vista entre las demás (atenuadas). Los colores salen de la paleta del DS
 * (`CHART_PALETTE`), que cambia sola en oscuro.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CHART_AXIS_COLOR,
  CHART_FONT,
  CHART_GRID_STROKE,
  CHART_PALETTE,
  ChartTooltip,
} from "@/components/ui-system/charts";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import {
  ETIQUETA_CORTA_TRAMO_DIAS,
  TONO_TRAMO_DIAS,
  type TramoDias,
} from "@/lib/forestal/patio-resumen";
import {
  permisoCorto,
  ptDe,
  type BarraAntiguedad,
  type FilaEspecieDisponible,
  type PilaPermisoEspecie,
} from "@/lib/forestal/trozas-disponibles";

const nf = (n: number) => formatNumber(n);
const TOPE_ESPECIES = 8;
/** Los colores de las especies en la barra apilada; «Otras» va en gris. */
const COLORES = [
  CHART_PALETTE.accent,
  CHART_PALETTE.primary,
  CHART_PALETTE.amber,
  CHART_PALETTE.info,
  CHART_PALETTE.purple,
  CHART_PALETTE.secondary,
];
const TONO: Record<"ok" | "warn" | "danger", string> = {
  ok: CHART_PALETTE.success,
  warn: CHART_PALETTE.warning,
  danger: CHART_PALETTE.error,
};
const TICK = {
  fontSize: CHART_FONT.axisSize - 1,
  fontFamily: CHART_FONT.family,
  fill: CHART_AXIS_COLOR,
};
const enM3 = (v: number | string) => `${fmtM3(Number(v))} m³ · ≈${nf(ptDe(Number(v)))} pt`;
const compacto = (v: number) =>
  Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v));

/** Recharts 3 pasa el dato original en `payload` del rectángulo cliqueado. */
const datoDe = <T,>(d: unknown): T | undefined => (d as { payload?: T } | null)?.payload;

export function GraficoEspecies({
  filas,
  activas,
  onElegir,
}: {
  filas: readonly FilaEspecieDisponible[];
  activas: readonly string[];
  onElegir: (especie: string) => void;
}) {
  /* Sólo lo que está EN EL PATIO: lo sin recepcionar no entra a los gráficos. */
  const conPatio = filas.filter((f) => f.m3 > 0);
  const propias = conPatio.slice(0, TOPE_ESPECIES);
  const resto = conPatio.slice(TOPE_ESPECIES);
  const datos = [
    ...propias.map((f) => ({ nombre: f.especie, m3: f.m3, elegible: Boolean(f.clave) })),
    ...(resto.length > 0
      ? [
          {
            nombre: `Otras (${resto.length})`,
            m3: resto.reduce((a, f) => a + f.m3, 0),
            elegible: false,
          },
        ]
      : []),
  ];
  const hayActiva = activas.length > 0;
  const esActiva = (n: string) => activas.some((a) => a.toLowerCase() === n.toLowerCase());
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, datos.length * 30 + 24)} minWidth={0}>
      <BarChart data={datos} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={CHART_GRID_STROKE} horizontal={false} />
        <XAxis
          type="number"
          tick={TICK}
          tickLine={false}
          axisLine={false}
          tickFormatter={compacto}
        />
        <YAxis
          type="category"
          dataKey="nombre"
          tick={TICK}
          tickLine={false}
          axisLine={false}
          width={104}
          interval={0}
        />
        <Tooltip
          content={<ChartTooltip format={enM3} />}
          cursor={{ fill: "var(--rule-soft)", opacity: 0.5 }}
        />
        <Bar
          dataKey="m3"
          name="m³"
          radius={[0, 4, 4, 0]}
          maxBarSize={20}
          cursor="pointer"
          onClick={(d) => {
            const x = datoDe<(typeof datos)[number]>(d);
            if (x?.elegible) onElegir(x.nombre);
          }}
        >
          {datos.map((x) => (
            <Cell
              key={x.nombre}
              fill={x.elegible ? CHART_PALETTE.accent : CHART_PALETTE.tertiary}
              fillOpacity={hayActiva && !esActiva(x.nombre) ? 0.35 : 1}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function GraficoPermisos({
  pila,
  activos,
  onElegir,
}: {
  pila: PilaPermisoEspecie;
  activos: readonly string[];
  onElegir: (permiso: string) => void;
}) {
  /* Claves `e0…eN`: recharts lee un `dataKey` con puntos como una ruta. */
  const datos = pila.filas.map((f) => ({
    etiqueta: permisoCorto(f.permiso),
    permiso: f.permiso,
    ...Object.fromEntries(pila.especies.map((e, i) => [`e${i}`, f.porEspecie[e.clave] ?? 0])),
    otras: f.otras,
  }));
  const hayActivo = activos.length > 0;
  const opacidad = (p: string | null) => (hayActivo && !(p && activos.includes(p)) ? 0.35 : 1);
  const series = [
    ...pila.especies.map((e, i) => ({
      key: `e${i}`,
      label: e.especie,
      color: COLORES[i % COLORES.length]!,
    })),
    ...(pila.hayOtras ? [{ key: "otras", label: "Otras", color: CHART_PALETTE.tertiary }] : []),
  ];
  const alClic = (d: unknown) => {
    const x = datoDe<(typeof datos)[number]>(d);
    if (x?.permiso) onElegir(x.permiso);
  };
  return (
    <div>
      <ResponsiveContainer width="100%" height={Math.max(140, datos.length * 44 + 30)} minWidth={0}>
        <BarChart data={datos} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={CHART_GRID_STROKE} horizontal={false} />
          <XAxis
            type="number"
            tick={TICK}
            tickLine={false}
            axisLine={false}
            tickFormatter={compacto}
          />
          <YAxis
            type="category"
            dataKey="etiqueta"
            tick={TICK}
            tickLine={false}
            axisLine={false}
            width={132}
            interval={0}
          />
          <Tooltip
            content={<ChartTooltip format={(v) => `${fmtM3(Number(v))} m³`} />}
            cursor={{ fill: "var(--rule-soft)", opacity: 0.5 }}
          />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="p"
              fill={s.color}
              stroke="var(--surface-raised)"
              strokeWidth={1.5}
              maxBarSize={26}
              radius={i === series.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0]}
              cursor="pointer"
              onClick={alClic}
            >
              {datos.map((x) => (
                <Cell key={`${s.key}-${x.permiso ?? "sin"}`} fillOpacity={opacidad(x.permiso)} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
      {/* La leyenda como lista: la de recharts se montaba sobre el eje a 400 px. */}
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1" aria-label="Colores de las especies">
        {series.map((s) => (
          <li
            key={s.key}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)]"
          >
            <span
              aria-hidden
              className="h-3 w-3 shrink-0 rounded-sm"
              style={{ background: s.color }}
            />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GraficoAntiguedad({
  tramos,
  activos,
  onElegir,
}: {
  tramos: readonly BarraAntiguedad[];
  activos: readonly TramoDias[];
  onElegir: (tramo: TramoDias) => void;
}) {
  const datos = tramos.map((t) => ({ ...t, etiqueta: ETIQUETA_CORTA_TRAMO_DIAS[t.tramo] }));
  const hayActivo = activos.length > 0;
  return (
    <ResponsiveContainer width="100%" height={200} minWidth={0}>
      <BarChart data={datos} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
        <XAxis dataKey="etiqueta" tick={TICK} tickLine={false} axisLine={false} />
        <YAxis tick={TICK} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
        <Tooltip
          content={
            <ChartTooltip
              format={(v) => `${nf(Number(v))} trozas`}
              extras={(x) => (
                <span className="text-sm text-[var(--text-secondary)]">
                  {fmtM3(Number(x.m3 ?? 0))} m³
                </span>
              )}
            />
          }
          cursor={{ fill: "var(--rule-soft)", opacity: 0.5 }}
        />
        <Bar
          dataKey="trozas"
          name="Trozas"
          radius={[4, 4, 0, 0]}
          maxBarSize={48}
          cursor="pointer"
          onClick={(d) => {
            const x = datoDe<(typeof datos)[number]>(d);
            if (x && x.trozas > 0) onElegir(x.tramo);
          }}
        >
          {datos.map((x) => (
            <Cell
              key={x.tramo}
              fill={TONO[TONO_TRAMO_DIAS[x.tramo]]}
              fillOpacity={hayActivo && !activos.includes(x.tramo) ? 0.35 : 1}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
