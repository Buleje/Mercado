"use client";

/**
 * «Diste vs Te devolvieron», mes por mes (6 meses), en barras con su monto.
 *
 * Antes era una curva suavizada (`type="monotone"`) sobre seis puntos: con dos
 * meses con plata y cuatro en cero dibujaba una «montaña» en agosto que no
 * existe — entre dos meses no hay datos que unir. Las barras dicen lo que hay:
 * cuánto salió y cuánto volvió en cada mes, con la cifra escrita.
 *
 * Ancho: con el bloque angosto (celular) las barras se acuestan y los meses
 * van en filas, así la cifra entra a la derecha de cada barra en vez de
 * pisarse con la del lado. El eje va compacto: «S/ 3.8 mil» en un renglón.
 */
import { useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList, type LabelProps } from "recharts";
import type { MesAnalisis } from "@/lib/adelantos/analisis";
import { fmtMon } from "../shared";
import { montoEje } from "./formato";

export const COLOR_DISTE = "var(--data-warning-500)";
export const COLOR_VOLVIO = "var(--data-success-500)";
const ANGOSTO = 520;

const TICK = { fontSize: 14, fill: "var(--text-secondary)" };
const ETIQUETA = { fontSize: 14, fontWeight: 700, fill: "var(--text-primary)" };
const TOOLTIP = {
  borderRadius: "12px",
  fontSize: "14px",
  background: "var(--surface-raised)",
  border: "1px solid var(--rule-base)",
  color: "var(--text-primary)",
};
/** Alto de un renglón de etiqueta: dos cifras más cerca que esto se pisan. */
const RENGLON = 18;

type Clave = "diste" | "devolvieron";
const claveDelMes = (e: { payload?: unknown }): string => (e.payload as MesAnalisis | undefined)?.clave ?? "";
type Caja = { x?: number; y?: number; width?: number; height?: number };

/**
 * La cifra de una barra, en UN renglón. La etiqueta de recharts parte el texto
 * al ancho de la barra («S/» / «20.9» / «mil» en tres renglones). En columnas,
 * si las dos barras del mes terminan casi a la misma altura, la cifra de la
 * más baja sube un renglón para no pisarse con la de al lado.
 *
 * El valor que llega es la clave del mes (`claveDelMes`), no el monto: el
 * `index` de recharts cuenta sólo las barras dibujadas (los meses en cero no
 * entran), así que no sirve para encontrar el mes.
 */
function EtiquetaBarra({ meses, moneda, clave, acostada, ...p }: LabelProps & { meses: MesAnalisis[]; moneda: string; clave: Clave; acostada: boolean }) {
  const { x = 0, y = 0, width = 0, height = 0 } = (p.viewBox ?? {}) as Caja;
  const mes = meses.find((m) => m.clave === String(p.value));
  const propio = mes?.[clave] ?? 0;
  if (!mes || propio <= 0) return null;
  const texto = montoEje(propio, moneda);
  if (acostada) {
    return <text x={x + width + 6} y={y + height / 2} dominantBaseline="central" textAnchor="start" {...ETIQUETA}>{texto}</text>;
  }
  const otro = mes[clave === "diste" ? "devolvieron" : "diste"];
  const cede = otro > propio || (otro === propio && clave === "devolvieron");
  const topeOtro = y + height - otro * (height / propio);
  const base = cede && otro > 0 && y - topeOtro < RENGLON ? topeOtro - RENGLON : y;
  return <text x={x + width / 2} y={base - 6} textAnchor="middle" {...ETIQUETA}>{texto}</text>;
}

export function PorMes({ meses, moneda }: { meses: MesAnalisis[]; moneda: string }) {
  const [ancho, setAncho] = useState(0);
  const angosto = ancho > 0 && ancho < ANGOSTO;
  const eje = (v: number) => montoEje(v, moneda);
  const tooltip = ((v: number, nombre: string) => [fmtMon(Number(v), moneda), nombre === "diste" ? "Diste" : "Te devolvieron"]) as never;
  const alto = angosto ? meses.length * 64 + 32 : 280;

  return (
    <div role="img" aria-label={meses.map((m) => `${m.mes}: diste ${fmtMon(m.diste, moneda)}, te devolvieron ${fmtMon(m.devolvieron, moneda)}`).join("; ")}>
      <ResponsiveContainer minWidth={0} width="100%" height={alto} onResize={(w) => setAncho(w)}>
        {angosto ? (
          <BarChart data={meses} layout="vertical" margin={{ top: 0, right: 92, bottom: 0, left: 0 }} barGap={3} barCategoryGap="18%">
            <CartesianGrid stroke="var(--rule-soft)" horizontal={false} />
            <XAxis type="number" tickFormatter={eje} tick={TICK} axisLine={false} tickLine={false} tickCount={3} />
            <YAxis type="category" dataKey="corto" width={36} tick={TICK} axisLine={false} tickLine={false} />
            <Tooltip formatter={tooltip} contentStyle={TOOLTIP} cursor={{ fill: "var(--surface-sunken)" }} />
            <Bar dataKey="diste" fill={COLOR_DISTE} radius={[0, 4, 4, 0]} isAnimationActive={false}>
              <LabelList valueAccessor={claveDelMes} content={<EtiquetaBarra meses={meses} moneda={moneda} clave="diste" acostada />} />
            </Bar>
            <Bar dataKey="devolvieron" fill={COLOR_VOLVIO} radius={[0, 4, 4, 0]} isAnimationActive={false}>
              <LabelList valueAccessor={claveDelMes} content={<EtiquetaBarra meses={meses} moneda={moneda} clave="devolvieron" acostada />} />
            </Bar>
          </BarChart>
        ) : (
          <BarChart data={meses} margin={{ top: 44, right: 8, bottom: 0, left: 0 }} barGap={4} barCategoryGap="22%">
            <CartesianGrid stroke="var(--rule-soft)" vertical={false} />
            <XAxis dataKey="mes" tick={TICK} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={eje} tick={TICK} width={84} axisLine={false} tickLine={false} tickCount={4} />
            <Tooltip formatter={tooltip} contentStyle={TOOLTIP} cursor={{ fill: "var(--surface-sunken)" }} />
            <Bar dataKey="diste" fill={COLOR_DISTE} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false}>
              <LabelList valueAccessor={claveDelMes} content={<EtiquetaBarra meses={meses} moneda={moneda} clave="diste" acostada={false} />} />
            </Bar>
            <Bar dataKey="devolvieron" fill={COLOR_VOLVIO} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false}>
              <LabelList valueAccessor={claveDelMes} content={<EtiquetaBarra meses={meses} moneda={moneda} clave="devolvieron" acostada={false} />} />
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
