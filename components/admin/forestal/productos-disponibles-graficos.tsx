"use client";

/**
 * Los tres gráficos de «Productos disponibles»: pt por especie, pt por producto
 * partido por especie y pt por días parado. Los tres son lo DISPONIBLE (libre +
 * apartado); lo marcado como usado no entra.
 *
 * En pt porque es como se vende la madera aserrada (el m³ va en el tooltip).
 * Clic en una barra = el mismo filtro que el clic en una fila (otro clic lo
 * suelta). Cada gráfico se cuenta sin SU filtro, así la barra elegida sigue a
 * la vista entre las demás (atenuadas). Colores de la paleta del DS.
 */

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  CHART_AXIS_COLOR,
  CHART_FONT,
  CHART_GRID_STROKE,
  CHART_PALETTE,
  ChartTooltip,
} from "@/components/ui-system/charts";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { ETIQUETA_TRAMO, TRAMOS_EDAD, type ResumenEdad, type TramoEdad } from "@/lib/forestal/edad-del-patio";
import {
  claveProducto,
  ptDe,
  type FilaGrupo,
  type PilaProductoEspecie,
} from "@/lib/forestal/productos-disponibles-resumen";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { productLabel } from "./ctp-shared";

const nf = (n: number) => formatNumber(n);
const TOPE = 8;
const COLORES = [
  CHART_PALETTE.accent,
  CHART_PALETTE.primary,
  CHART_PALETTE.amber,
  CHART_PALETTE.info,
  CHART_PALETTE.purple,
  CHART_PALETTE.secondary,
];
const TONO_TRAMO: Record<TramoEdad, string> = {
  fresco: CHART_PALETTE.success,
  maduro: CHART_PALETTE.warning,
  viejo: CHART_PALETTE.error,
};
const CORTO_TRAMO: Record<TramoEdad, string> = { fresco: "≤ 30 d", maduro: "31–90 d", viejo: "> 90 d" };
const TICK = { fontSize: CHART_FONT.axisSize - 1, fontFamily: CHART_FONT.family, fill: CHART_AXIS_COLOR };
const compacto = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v)));
const cursor = { fill: "var(--rule-soft)", opacity: 0.5 };
/** Recharts 3 pasa el dato original en `payload` del rectángulo cliqueado. */
const datoDe = <T,>(d: unknown): T | undefined => (d as { payload?: T } | null)?.payload;

export function GraficoEspeciesPt({
  grupos,
  activas,
  onElegir,
}: {
  grupos: readonly FilaGrupo[];
  activas: readonly string[];
  onElegir: (especie: string) => void;
}) {
  const conStock = grupos.filter((g) => g.disponible.m3 > 0);
  const resto = conStock.slice(TOPE);
  const datos = [
    ...conStock.slice(0, TOPE).map((g) => ({ nombre: g.etiqueta, pt: g.disponible.pt, m3: g.disponible.m3, elegible: true })),
    ...(resto.length > 0
      ? [
          {
            nombre: `Otras (${resto.length})`,
            pt: ptDe(resto.reduce((a, g) => a + g.disponible.m3, 0)),
            m3: resto.reduce((a, g) => a + g.disponible.m3, 0),
            elegible: false,
          },
        ]
      : []),
  ];
  const hayActiva = activas.length > 0;
  const esActiva = (n: string) => activas.some((a) => claveEspecie(a) === claveEspecie(n));
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, datos.length * 30 + 24)} minWidth={0}>
      <BarChart data={datos} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={CHART_GRID_STROKE} horizontal={false} />
        <XAxis type="number" tick={TICK} tickLine={false} axisLine={false} tickFormatter={compacto} />
        <YAxis type="category" dataKey="nombre" tick={TICK} tickLine={false} axisLine={false} width={104} interval={0} />
        <Tooltip
          content={
            <ChartTooltip
              format={(v) => `${nf(Number(v))} pt`}
              extras={(x) => <span className="text-sm text-[var(--text-secondary)]">{fmtM3(Number(x.m3 ?? 0))} m³</span>}
            />
          }
          cursor={cursor}
        />
        <Bar
          dataKey="pt"
          name="pt"
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

export function GraficoProductosPt({
  pila,
  activos,
  onElegir,
}: {
  pila: PilaProductoEspecie;
  activos: readonly string[];
  onElegir: (producto: string) => void;
}) {
  /* Claves `e0…eN`: recharts lee un `dataKey` con puntos como una ruta. */
  const datos = pila.filas.map((f) => ({
    etiqueta: productLabel(f.producto),
    clave: f.clave,
    ...Object.fromEntries(pila.especies.map((e, i) => [`e${i}`, f.porEspecie[e.clave] ?? 0])),
    otras: f.otras,
  }));
  const hayActivo = activos.length > 0;
  const opacidad = (clave: string) =>
    hayActivo && !activos.some((a) => claveProducto(a) === clave) ? 0.35 : 1;
  const series = [
    ...pila.especies.map((e, i) => ({ key: `e${i}`, label: e.especie, color: COLORES[i % COLORES.length]! })),
    ...(pila.hayOtras ? [{ key: "otras", label: "Otras", color: CHART_PALETTE.tertiary }] : []),
  ];
  const alClic = (d: unknown) => {
    const x = datoDe<(typeof datos)[number]>(d);
    if (x?.clave) onElegir(x.etiqueta);
  };
  return (
    <div>
      <ResponsiveContainer width="100%" height={Math.max(140, datos.length * 40 + 30)} minWidth={0}>
        <BarChart data={datos} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={CHART_GRID_STROKE} horizontal={false} />
          <XAxis type="number" tick={TICK} tickLine={false} axisLine={false} tickFormatter={compacto} />
          <YAxis type="category" dataKey="etiqueta" tick={TICK} tickLine={false} axisLine={false} width={132} interval={0} />
          <Tooltip content={<ChartTooltip format={(v) => `${nf(Number(v))} pt`} />} cursor={cursor} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="p"
              fill={s.color}
              stroke="var(--surface-raised)"
              strokeWidth={1.5}
              maxBarSize={24}
              radius={i === series.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0]}
              cursor="pointer"
              onClick={alClic}
            >
              {datos.map((x) => (
                <Cell key={`${s.key}-${x.clave}`} fillOpacity={opacidad(x.clave)} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
      {/* La leyenda como lista: la de recharts se montaba sobre el eje a 400 px. */}
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1" aria-label="Colores de las especies">
        {series.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
            <span aria-hidden className="h-3 w-3 shrink-0 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GraficoEdadPt({
  edad,
  activos,
  onElegir,
}: {
  edad: ResumenEdad;
  activos: readonly TramoEdad[];
  onElegir: (tramo: TramoEdad) => void;
}) {
  const datos = TRAMOS_EDAD.map((t) => ({
    tramo: t,
    etiqueta: CORTO_TRAMO[t],
    pt: ptDe(edad.porTramo[t].volumenM3),
    m3: edad.porTramo[t].volumenM3,
    filas: edad.porTramo[t].filas,
  }));
  const hayActivo = activos.length > 0;
  return (
    <ResponsiveContainer width="100%" height={200} minWidth={0}>
      <BarChart data={datos} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
        <XAxis dataKey="etiqueta" tick={TICK} tickLine={false} axisLine={false} />
        <YAxis tick={TICK} tickLine={false} axisLine={false} width={40} tickFormatter={compacto} />
        <Tooltip
          content={
            <ChartTooltip
              format={(v) => `${nf(Number(v))} pt`}
              extras={(x) => (
                <span className="text-sm text-[var(--text-secondary)]">
                  {ETIQUETA_TRAMO[x.tramo as TramoEdad] ?? ""} · {fmtM3(Number(x.m3 ?? 0))} m³ · {nf(Number(x.filas ?? 0))} filas
                </span>
              )}
            />
          }
          cursor={cursor}
        />
        <Bar
          dataKey="pt"
          name="pt"
          radius={[4, 4, 0, 0]}
          maxBarSize={48}
          cursor="pointer"
          onClick={(d) => {
            const x = datoDe<(typeof datos)[number]>(d);
            if (x && x.filas > 0) onElegir(x.tramo);
          }}
        >
          {datos.map((x) => (
            <Cell
              key={x.tramo}
              fill={TONO_TRAMO[x.tramo]}
              fillOpacity={hayActivo && !activos.includes(x.tramo) ? 0.35 : 1}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
