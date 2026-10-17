"use client";

/**
 * Tres gráficos de «Extracción» (ADR-454 §4, 3-5):
 *
 *   3. En el tiempo: barras por semana (talado, trozado, despachado) y dos
 *      líneas en el eje derecho: lo talado acumulado y la meta para agotar lo
 *      aprobado al cierre de la vigencia.
 *   4. La cadena del permiso, en m³: censo → autorizado → talado → trozado →
 *      despachado → recibido en planta → aserrado. Lo consumido en el TH es
 *      una RAMA (sale de lo trozado sin despacharse) y se dice aparte: no se
 *      dibuja como merma (lección de `loth-analitica.ts`).
 *   5. Árboles por etapa, con los colores del mapa: acá se cuentan árboles,
 *      en los demás m³.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_GRID_STROKE, ChartTooltip } from "@/components/ui-system/charts";
import { formatDateShort, formatNumber } from "@/lib/format";
import { ETAPAS, ETAPA_LABEL, ETAPA_TOKEN, type EtapaArbol } from "@/lib/forestal/loth-etapa-arbol";
import type { ExtraccionResponse, PasoCadena } from "@/lib/forestal/loth-extraccion-tipos";
import { COLOR, CURSOR, Leyenda, Marco, SinDatos, TICK, enM3 } from "./loth-extraccion-grafico-base";
import { ejeM3, esUnPermiso, fm3, fpct, nombreCorto, nombrePermiso } from "./loth-extraccion-shared";

const SERIES_SEMANA = [
  { key: "talado", label: "Talado", color: COLOR.talado },
  { key: "trozado", label: "Trozado", color: COLOR.trozado },
  { key: "despachado", label: "Despachado", color: COLOR.despachado },
  { key: "acum", label: "Talado acumulado", color: COLOR.aserrado, linea: true },
  { key: "meta", label: "Meta acumulada", color: COLOR.meta, linea: true },
] as const;

export function GraficoSemanas({ datos }: { datos: ExtraccionResponse }) {
  const filas = datos.semanas.map((s) => ({
    etiqueta: formatDateShort(s.semana, { soloFecha: true }),
    talado: s.taladoM3,
    trozado: s.trozadoM3,
    despachado: s.despachadoM3,
    acum: s.taladoAcumM3,
    ...(s.metaAcumM3 != null ? { meta: s.metaAcumM3 } : {}),
  }));
  const hayMeta = datos.semanas.some((s) => s.metaAcumM3 != null);
  const series = SERIES_SEMANA.filter((s) => s.key !== "meta" || hayMeta);
  return (
    <Marco
      titulo="En el tiempo"
      ayuda={{
        what: "Lo talado, trozado y despachado cada semana, y lo talado acumulado.",
        affects: "Si la línea del acumulado va por debajo de la meta, no llegas al cierre.",
        example: "La meta reparte lo aprobado en parejo hasta la vigencia.",
      }}
    >
      {filas.length === 0 ? (
        <SinDatos>Sin tala, trozado ni despacho en el período.</SinDatos>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={240} minWidth={0}>
            <ComposedChart data={filas} margin={{ top: 8, right: 4, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
              <XAxis dataKey="etiqueta" tick={TICK} tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis yAxisId="sem" tick={TICK} tickLine={false} axisLine={false} width={40} tickFormatter={ejeM3} />
              <YAxis yAxisId="acum" orientation="right" tick={TICK} tickLine={false} axisLine={false} width={44} tickFormatter={ejeM3} />
              <Tooltip
                content={<ChartTooltip format={enM3} extras={() => <span>Semana que empieza ese lunes</span>} />}
                cursor={CURSOR}
              />
              <Bar yAxisId="sem" dataKey="talado" name="Talado" fill={COLOR.talado} maxBarSize={18} radius={[3, 3, 0, 0]} />
              <Bar yAxisId="sem" dataKey="trozado" name="Trozado" fill={COLOR.trozado} maxBarSize={18} radius={[3, 3, 0, 0]} />
              <Bar yAxisId="sem" dataKey="despachado" name="Despachado" fill={COLOR.despachado} maxBarSize={18} radius={[3, 3, 0, 0]} />
              <Line yAxisId="acum" type="monotone" dataKey="acum" name="Talado acumulado" stroke={COLOR.aserrado} strokeWidth={2.5} dot={filas.length < 3} />
              {hayMeta && (
                <Line
                  yAxisId="acum"
                  type="linear"
                  dataKey="meta"
                  name="Meta acumulada"
                  stroke={COLOR.meta}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  connectNulls
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          <Leyenda series={series} />
        </>
      )}
    </Marco>
  );
}

const COLOR_PASO: Record<PasoCadena, string> = {
  censo: COLOR.base,
  autorizado: COLOR.autorizado,
  talado: COLOR.talado,
  trozado: COLOR.trozado,
  despachado: COLOR.despachado,
  recibido: COLOR.recibido,
  aserrado: COLOR.aserrado,
};

export function GraficoEmbudo({ datos }: { datos: ExtraccionResponse }) {
  const pasos = datos.embudo
    .filter((e): e is typeof e & { m3: number } => e.m3 != null)
    .map((e) => ({ ...e, texto: `${fm3(e.m3)}${e.pctDelAnterior != null ? ` · ${fpct(e.pctDelAnterior)}` : ""}` }));
  const consumido = datos.total.consumidoTh;
  return (
    <Marco
      titulo="La cadena del permiso"
      ayuda={{
        what: "Cuánto pasó de cada paso al siguiente, del censo al aserradero.",
        affects: "El porcentaje es contra el paso anterior; donde cae, ahí se quedó la madera.",
        example: "Talado 32.9 m³ y trozado 6.6 m³: 20 % ya es troza.",
      }}
    >
      {pasos.length === 0 ? (
        <SinDatos>Sin censo ni operaciones todavía.</SinDatos>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(160, pasos.length * 36 + 16)} minWidth={0}>
          <BarChart data={pasos} layout="vertical" margin={{ top: 4, right: 96, bottom: 4, left: 4 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="label" tick={TICK} tickLine={false} axisLine={false} width={116} interval={0} />
            <Tooltip
              content={
                <ChartTooltip
                  format={enM3}
                  extras={(x) => {
                    const n = typeof x.n === "number" ? x.n : null;
                    const pct = typeof x.pctDelAnterior === "number" ? x.pctDelAnterior : null;
                    return (
                      <span>
                        {n != null ? `${formatNumber(n)} piezas` : "—"}
                        {pct != null ? ` · ${fpct(pct)} del paso anterior` : ""}
                      </span>
                    );
                  }}
                />
              }
              cursor={CURSOR}
            />
            {/* `minPointSize`: un paso en cero igual lleva su rótulo («0.000»), no queda mudo. */}
            <Bar dataKey="m3" name="m³" maxBarSize={22} radius={[0, 4, 4, 0]} minPointSize={2}>
              {pasos.map((p) => (
                <Cell key={p.paso} fill={COLOR_PASO[p.paso]} />
              ))}
              <LabelList dataKey="texto" position="right" style={{ ...TICK, fill: "var(--text-primary)", fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
      {consumido.n > 0 && (
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Además, <span className="font-bold tabular-nums text-[var(--text-primary)]">{fm3(consumido.m3)} m³</span> de troza se
          consumieron en el TH.
        </p>
      )}
    </Marco>
  );
}

export function GraficoEtapas({ datos }: { datos: ExtraccionResponse }) {
  const permisos = esUnPermiso(datos) ? datos.permisos.slice(0, 1) : datos.permisos.filter((p) => p.planId);
  const filas = permisos.map((p) => ({ nombre: nombrePermiso(p), ...p.arboles.porEtapa }));
  const presentes: EtapaArbol[] = ETAPAS.filter((e) => permisos.some((p) => (p.arboles.porEtapa[e] ?? 0) > 0));
  const series = presentes.map((e) => ({ key: e, label: ETAPA_LABEL[e], color: ETAPA_TOKEN[e] }));
  return (
    <Marco
      titulo="Árboles por etapa"
      ayuda={{
        what: "Cuántos árboles del censo hay en cada etapa, con los colores del mapa.",
        affects: "Cuenta árboles, no m³: un árbol grande pesa lo mismo que uno chico.",
        example: "61 en pie, 2 talados y 2 trozados.",
      }}
    >
      {presentes.length === 0 ? (
        <SinDatos>El censo todavía no tiene árboles.</SinDatos>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={Math.max(110, filas.length * 40 + 30)} minWidth={0}>
            <BarChart data={filas} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid stroke={CHART_GRID_STROKE} horizontal={false} />
              <XAxis type="number" tick={TICK} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="nombre" tick={TICK} tickLine={false} axisLine={false} width={120} interval={0} tickFormatter={(v: string) => nombreCorto(v)} />
              <Tooltip content={<ChartTooltip format={(v) => `${formatNumber(Number(v))} árboles`} />} cursor={CURSOR} />
              {presentes.map((e, i) => (
                <Bar
                  key={e}
                  dataKey={e}
                  name={ETAPA_LABEL[e]}
                  stackId="e"
                  fill={ETAPA_TOKEN[e]}
                  fillOpacity={e === "despachado_parcial" ? 0.55 : 1}
                  stroke="var(--surface-raised)"
                  strokeWidth={1}
                  maxBarSize={24}
                  radius={i === presentes.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
          <Leyenda series={series} />
        </>
      )}
    </Marco>
  );
}
