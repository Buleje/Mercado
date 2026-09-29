"use client";

/**
 * Los gráficos de «Extracción» (ADR-454 §4), plegables y recordados. Arrancan
 * abiertos en pantalla ancha y plegados en el celular (ahí son cinco pantallas
 * de scroll); lo que elijas después se recuerda.
 *
 *   1. Por especie: lo aprobado contra cada operación. Clic = filtra la tabla.
 *   2. De punta a punta: tramos que no se pisan, por permiso (o por especie
 *      con un permiso elegido).
 *   3-5. En `loth-extraccion-graficos-cadena.tsx`: semanas, cadena y etapas.
 */

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, ChevronDown } from "@buleje/design-system/icons";
import { CHART_GRID_STROKE, ChartTooltip } from "@/components/ui-system/charts";
import { useLocalStorage } from "@/hooks/use-local-storage";
import type { ExtraccionResponse } from "@/lib/forestal/loth-extraccion-tipos";
import { COLOR, CURSOR, Leyenda, Marco, SinDatos, TICK, datoDe, enM3 } from "./loth-extraccion-grafico-base";
import { GraficoEmbudo, GraficoEtapas, GraficoSemanas } from "./loth-extraccion-graficos-cadena";
import { barrasPorEspecie, ejeM3, esUnPermiso, nombreCorto, nombrePermiso, tramosDe } from "./loth-extraccion-shared";

const SERIES_ESPECIE = [
  { key: "aprovechable", label: "Aprobado según censo", color: COLOR.base },
  { key: "talado", label: "Talado", color: COLOR.talado },
  { key: "trozado", label: "Trozado", color: COLOR.trozado },
  { key: "despachado", label: "Despachado", color: COLOR.despachado },
] as const;

function GraficoEspecies({
  datos,
  especie,
  onEspecie,
}: {
  datos: ExtraccionResponse;
  especie: string | null;
  onEspecie: (c: string | null) => void;
}) {
  const barras = barrasPorEspecie(datos.especies);
  if (barras.length === 0) return <SinDatos>Sin especies en el censo.</SinDatos>;
  const opacidad = (clave: string | null) => (especie && clave !== especie ? 0.3 : 1);
  const alClic = (d: unknown) => {
    const x = datoDe<(typeof barras)[number]>(d);
    if (x?.clave) onEspecie(x.clave === especie ? null : x.clave);
  };
  return (
    <>
      <ResponsiveContainer width="100%" height={Math.max(180, barras.length * 60 + 24)} minWidth={0}>
        <BarChart data={barras} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }} barGap={1}>
          <CartesianGrid stroke={CHART_GRID_STROKE} horizontal={false} />
          <XAxis type="number" tick={TICK} tickLine={false} axisLine={false} tickFormatter={ejeM3} />
          <YAxis type="category" dataKey="nombre" tick={TICK} tickLine={false} axisLine={false} width={104} interval={0} />
          <Tooltip content={<ChartTooltip format={enM3} />} cursor={CURSOR} />
          {SERIES_ESPECIE.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color}
              maxBarSize={11}
              radius={[0, 3, 3, 0]}
              cursor="pointer"
              onClick={alClic}
            >
              {barras.map((b) => (
                <Cell key={`${s.key}-${b.nombre}`} fillOpacity={opacidad(b.clave)} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
      <Leyenda series={SERIES_ESPECIE} />
    </>
  );
}

const SERIES_PUNTA = [
  { key: "despachado", label: "Despachado", color: COLOR.despachado },
  { key: "consumido", label: "Consumido en el TH", color: COLOR.consumido },
  { key: "monte", label: "Trozas en el monte", color: COLOR.trozado },
  { key: "sinTrozar", label: "Talado sin trozar", color: COLOR.talado },
  { key: "porTalar", label: "Por talar", color: COLOR.porTalar },
] as const;

function GraficoPuntaAPunta({ datos }: { datos: ExtraccionResponse }) {
  const filas = esUnPermiso(datos)
    ? (datos.permisos[0]?.especies ?? datos.especies).map((e) => tramosDe(e.etiqueta, e.clave, e))
    : datos.permisos.map((p) => tramosDe(nombrePermiso(p), p.planId ?? "sin-plan", p.total));
  if (filas.length === 0) return <SinDatos>Sin permisos que mostrar.</SinDatos>;
  return (
    <>
      <ResponsiveContainer width="100%" height={Math.max(140, filas.length * 40 + 30)} minWidth={0}>
        <BarChart data={filas} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={CHART_GRID_STROKE} horizontal={false} />
          <XAxis type="number" tick={TICK} tickLine={false} axisLine={false} tickFormatter={ejeM3} />
          <YAxis type="category" dataKey="nombre" tick={TICK} tickLine={false} axisLine={false} width={120} interval={0} tickFormatter={(v: string) => nombreCorto(v)} />
          <Tooltip content={<ChartTooltip format={enM3} />} cursor={CURSOR} />
          {SERIES_PUNTA.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="p"
              fill={s.color}
              stroke="var(--surface-raised)"
              strokeWidth={1}
              maxBarSize={24}
              radius={i === SERIES_PUNTA.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <Leyenda series={SERIES_PUNTA} />
    </>
  );
}

export default function LothExtraccionGraficos({
  datos,
  especie,
  onEspecie,
}: {
  datos: ExtraccionResponse;
  especie: string | null;
  onEspecie: (c: string | null) => void;
}) {
  const [angosta] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches);
  const [guardado, setGuardado] = useLocalStorage<boolean | null>("loth-extraccion:graficos", null);
  const abierto = guardado ?? !angosta;
  return (
    <section aria-label="Gráficos de la extracción" className="space-y-3">
      <button
        type="button"
        onClick={() => setGuardado(!abierto)}
        aria-expanded={abierto}
        className={`inline-flex h-9 items-center gap-2 rounded-lg border-[1.5px] px-3 text-sm font-bold transition-colors ${
          abierto
            ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
            : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--accent)]"
        }`}
      >
        <BarChart3 className="h-4 w-4" aria-hidden />
        Gráficos
        <span className="rounded-full bg-[var(--surface-sunken)] px-1.5 text-xs tabular-nums text-[var(--text-tertiary)]">5</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {abierto && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Marco
            titulo="Por especie"
            ayuda={{
              what: "Lo aprobado según censo de cada especie contra lo talado, trozado y despachado.",
              affects: "Toca una especie para ver sólo esa en la tabla; otro toque la suelta.",
              example: "Copaiba: 91.8 m³ aprobados y 10.4 m³ talados.",
            }}
          >
            <GraficoEspecies datos={datos} especie={especie} onEspecie={onEspecie} />
          </Marco>
          <Marco
            titulo="De punta a punta"
            ayuda={{
              what: "Dónde está la madera de cada permiso, en tramos que no se repiten.",
              affects: "La barra entera es lo aprobado; lo gris es lo que falta talar.",
              example: "Una troza despachada no vuelve a contarse como trozada.",
            }}
          >
            <GraficoPuntaAPunta datos={datos} />
          </Marco>
          <GraficoSemanas datos={datos} />
          <GraficoEmbudo datos={datos} />
          <GraficoEtapas datos={datos} />
        </div>
      )}
    </section>
  );
}
