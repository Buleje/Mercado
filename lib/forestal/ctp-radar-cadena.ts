/**
 * ctp-radar-cadena — seguir UNA GTF aguas abajo, de punta a punta.
 *
 * Es la vista que hoy se arma a mano cuando OSINFOR pregunta por un ingreso
 * puntual: «esta guía de 12 m³, ¿dónde terminó?». El radar completo muestra
 * todo a la vez; acá se aísla una sola cadena con el volumen que sobrevive a
 * cada paso.
 *
 * Regla de lectura del volumen: en el paso ingreso→corrida el volumen es
 * comparable (m³ contra m³), así que la merma tiene sentido. En el paso
 * corrida→despacho la unidad puede ser otra (pt, kg), por eso la cantidad se
 * reporta CON su unidad y no se calcula ningún porcentaje entre pasos de
 * unidades distintas — un "45%" entre m³ y pies tablares sería un número
 * inventado.
 *
 * PURO y client-safe.
 */

import type { TrazaGrafo } from "@/lib/db/forest-ctp.db";

export interface PasoCorrida {
  id: string;
  lineNo: number;
  etiqueta: string;
  /** m³ de ESTA GTF que entraron a la corrida. */
  consumidoM3: number;
  /** Total producido por la corrida (puede venir de varias GTF). */
  producido: number;
  unidad: string;
  /** Qué parte de la corrida vino de esta GTF (0–100). */
  aporteGtfPct: number | null;
  despachos: PasoDespacho[];
}

export interface PasoDespacho {
  id: string;
  lineNo: number;
  destino: string;
  /** Cantidad de la corrida atribuida a este despacho. */
  cantidad: number;
  unidad: string;
  gtfSalida: string | null;
  fecha: string;
}

export interface CadenaGtf {
  ingresoId: string;
  gtf: string;
  especie: string;
  fecha: string;
  cites: boolean;
  volumenM3: number;
  /** m³ que entraron a producción. */
  consumidoM3: number;
  /** m³ todavía en patio (volumen − consumido, nunca negativo). */
  enPatioM3: number;
  corridas: PasoCorrida[];
  /** Destinos finales distintos alcanzados por esta GTF. */
  destinos: string[];
  /** true si toda la cadena llega a un despacho. */
  cerrada: boolean;
  /** Qué falta para que cierre, en castellano. */
  pendiente: string | null;
}

const round = (n: number, d = 4): number => Number(n.toFixed(d));
const EPS = 1e-4;

/** Arma la cadena aguas abajo de un ingreso. Devuelve null si no existe. */
export function cadenaDeIngreso(g: TrazaGrafo, ingresoId: string): CadenaGtf | null {
  const w = g.ingresos.find((x) => x.id === ingresoId);
  if (!w) return null;

  const corridaById = new Map(g.corridas.map((c) => [c.id, c]));
  const despachoById = new Map(g.despachos.map((d) => [d.id, d]));

  // Total producido por corrida y cuánto de eso vino de ESTA GTF.
  const consumoTotalPorCorrida = new Map<string, number>();
  for (const c of g.consumos) {
    consumoTotalPorCorrida.set(c.to, (consumoTotalPorCorrida.get(c.to) ?? 0) + (Number(c.volumeM3) || 0));
  }

  const corridas: PasoCorrida[] = [];
  let consumido = 0;
  for (const c of g.consumos) {
    if (c.from !== w.id) continue;
    const k = corridaById.get(c.to);
    if (!k) continue;
    const consumidoM3 = round(Number(c.volumeM3) || 0);
    consumido += consumidoM3;

    const totalCorrida = consumoTotalPorCorrida.get(k.id) ?? 0;
    const despachos: PasoDespacho[] = g.origenes
      .filter((o) => o.from === k.id)
      .map((o) => {
        const d = despachoById.get(o.to);
        if (!d) return null;
        return {
          id: d.id,
          lineNo: d.lineNo,
          destino: d.destino || d.label || "—",
          cantidad: round(Number(o.quantity) || 0),
          unidad: d.unit ?? k.unit ?? "",
          gtfSalida: d.gtf,
          fecha: d.fecha,
        };
      })
      .filter((x): x is PasoDespacho => x !== null)
      .sort((a, b) => a.lineNo - b.lineNo);

    corridas.push({
      id: k.id,
      lineNo: k.lineNo,
      etiqueta: k.label,
      consumidoM3,
      producido: Number(k.quantity) || 0,
      unidad: k.unit ?? "",
      // Con qué parte de la corrida contribuyó esta GTF: si la corrida mezcla
      // varias guías, el producto que salió no es todo de esta.
      aporteGtfPct: totalCorrida > EPS ? Math.round((consumidoM3 / totalCorrida) * 100) : null,
      despachos,
    });
  }
  corridas.sort((a, b) => a.lineNo - b.lineNo);

  const destinos = [...new Set(corridas.flatMap((c) => c.despachos.map((d) => d.destino)))];
  const enPatioM3 = round(Math.max(0, (Number(w.volumeM3) || 0) - consumido));
  const sinDespachar = corridas.filter((c) => c.despachos.length === 0);

  let pendiente: string | null = null;
  if (corridas.length === 0) {
    pendiente = "Esta GTF todavía no entró a ninguna corrida de producción.";
  } else if (sinDespachar.length > 0) {
    pendiente = `${sinDespachar.length === 1 ? "La corrida" : "Las corridas"} ${sinDespachar.map((c) => `#${c.lineNo}`).join(", ")} ${sinDespachar.length === 1 ? "no tiene" : "no tienen"} despacho atribuido.`;
  } else if (enPatioM3 > EPS) {
    pendiente = `Quedan ${enPatioM3} m³ de esta guía sin entrar a producción.`;
  }

  return {
    ingresoId: w.id,
    gtf: w.gtf || "—",
    especie: w.species ?? "—",
    fecha: w.fecha,
    cites: w.cites,
    volumenM3: round(Number(w.volumeM3) || 0),
    consumidoM3: round(consumido),
    enPatioM3,
    corridas,
    destinos,
    cerrada: corridas.length > 0 && sinDespachar.length === 0,
    pendiente,
  };
}

/** Texto de una línea para el encabezado de la vista. */
export function resumenCadena(c: CadenaGtf): string {
  if (c.corridas.length === 0) return `${c.volumenM3} m³ en patio, sin procesar`;
  const destinos = c.destinos.length === 0
    ? "sin despachar"
    : c.destinos.length === 1
      ? `a ${c.destinos[0]}`
      : `a ${c.destinos.length} destinos`;
  return `${c.consumidoM3} de ${c.volumenM3} m³ procesados en ${c.corridas.length} ${c.corridas.length === 1 ? "corrida" : "corridas"} · ${destinos}`;
}
