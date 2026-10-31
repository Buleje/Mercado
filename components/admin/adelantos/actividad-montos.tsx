/**
 * Las cifras del Historial en palabras (25-10): «Diste S/ 50 · Te devolvieron
 * S/ 340». Antes la cabecera y cada día usaban el signo de la DEUDA (+diste,
 * −recuperado) y cada fila el de la CAJA («+S/ 0.50 te devolvió» bajo un día que
 * decía «−S/ 0.50»). Con palabras y el mismo color de las filas no se contradicen.
 */

import { fmtMonedas } from "./shared";

export type MapaMontos = Record<string, number>;

export type TotalesActividad = {
  diste: MapaMontos;
  recuperado: MapaMontos;
  recibiste: MapaMontos;
  devolviste: MapaMontos;
};

export const totalesVacios = (): TotalesActividad => ({ diste: {}, recuperado: {}, recibiste: {}, devolviste: {} });

/** Por moneda, nunca cruzado: un adelanto en soles y una entrega en dólares del mismo período no son la misma plata. */
export const sumar = (map: MapaMontos, moneda: string | null | undefined, monto: number) => {
  const m = moneda || "PEN";
  map[m] = (map[m] ?? 0) + monto;
};
const tieneAlgo = (map: MapaMontos) => Object.values(map).some((v) => v > 0);

/** Palabra y color de cada total: el color es el MISMO de las filas del día. */
const PARTES = [
  { clave: "diste", palabra: "Diste", cls: "text-[var(--data-warning)]" },
  { clave: "recuperado", palabra: "Te devolvieron", cls: "text-[var(--data-success)]" },
  { clave: "recibiste", palabra: "Te prestaron", cls: "text-[var(--data-info-ink)]" },
  { clave: "devolviste", palabra: "Devolviste", cls: "text-[var(--data-info-ink)]" },
] as const;

/** «Diste S/ 50 · Te devolvieron S/ 340», sólo con los montos que existen, cada uno con su color. */
export function LineaMontos({ totales }: { totales: TotalesActividad }) {
  const activas = PARTES.filter((p) => tieneAlgo(totales[p.clave]));
  if (activas.length === 0) return null;
  return (
    <>
      {activas.map((p, i) => (
        <span key={p.clave}>
          {i > 0 && " · "}
          {p.palabra} <span className={`font-bold ${p.cls}`}>{fmtMonedas(totales[p.clave])}</span>
        </span>
      ))}
    </>
  );
}

/** La misma línea como texto plano (PDF). */
export function textoMontos(totales: TotalesActividad): string {
  return PARTES.filter((p) => tieneAlgo(totales[p.clave]))
    .map((p) => `${p.palabra} ${fmtMonedas(totales[p.clave])}`)
    .join(" · ");
}

export const movimientosTexto = (n: number) => `${n} movimiento${n === 1 ? "" : "s"}`;
