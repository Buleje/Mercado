/**
 * Paquetes sin medidas → aviso del libro (2026-09-30).
 *
 * Un paquete del libro (`ForestCtpPaquete`) puede no traer `espesorCm`,
 * `anchoCm` o `largoM`. Medido en Blas el 30/09: 34 de 835 paquetes, repartidos
 * en 15 corridas de 2025-10, 2026-06, 2026-08 y 2026-09. Sin las tres medidas
 * no se recalcula el volumen, el freno de cifras imposibles cae a su criterio
 * flojo y no se imprime la lista de empaque (ver `escuadria-del-paquete.ts`).
 *
 * Esto decide QUÉ medida falta, agrupa por corrida y nombra el aviso; la
 * campana «Avisos del libro» lo lista con «Poner medidas» al lado, que abre el
 * editor de escuadría que ya existe. PURO: sin fetch ni reloj propio — `ahora`
 * entra por parámetro.
 *
 * «Falta» es la misma vara que el resto del libro (`escuadriaCompleta`): null,
 * cero o negativa no es una medida. El servidor recorta con la misma regla en
 * el WHERE (`ForestCtpDB.paquetesSinMedidas`), esta función la repite para no
 * confiar en que la fila venga filtrada.
 */

import { formatNumber } from "@/lib/format";
import { limaDateKey } from "@/lib/utils";
import { diaConNombre } from "./plazo-de-apartado";
import { escuadriaCompleta } from "./escuadria-del-paquete";

/** Las tres medidas de la escuadría, como las nombra la plaza. */
export type MedidaQueFalta = "espesor" | "ancho" | "largo";

/** Cuántos paquetes se listan como máximo: el total siempre se cuenta entero. */
export const LIMITE_PAQUETES_SIN_MEDIDAS = 100;

/** Un paquete como lo lee el servidor, con su corrida. */
export interface PaqueteConMedidas {
  id: string;
  codigo: string;
  ctpEntryId: string;
  lineNo: number;
  /** Día date-only de la corrida «YYYY-MM-DD». */
  fecha: string;
  especie: string | null;
  producto: string | null;
  cantidad: number;
  volumenM3: number;
  espesorCm: number | null;
  anchoCm: number | null;
  largoM: number | null;
  /** La corrida cae en un mes cerrado: el servidor no deja corregirla sin reabrir. */
  periodoCerrado: boolean;
}

export interface PaqueteSinMedidas extends PaqueteConMedidas {
  /** Qué falta, en el orden en que se tipea: espesor, ancho, largo. Nunca vacío. */
  faltan: MedidaQueFalta[];
}

export interface CorridaConPaquetesSinMedidas {
  ctpEntryId: string;
  lineNo: number;
  fecha: string;
  especie: string | null;
  producto: string | null;
  paquetes: PaqueteSinMedidas[];
}

const falta = (v: number | null | undefined): boolean => !(typeof v === "number" && v > 0);

/** Qué medidas no tiene el paquete. Vacío = escuadría completa. */
export function medidasQueFaltan(p: {
  espesorCm: number | null | undefined;
  anchoCm: number | null | undefined;
  largoM: number | null | undefined;
}): MedidaQueFalta[] {
  const faltan: MedidaQueFalta[] = [];
  if (falta(p.espesorCm)) faltan.push("espesor");
  if (falta(p.anchoCm)) faltan.push("ancho");
  if (falta(p.largoM)) faltan.push("largo");
  return faltan;
}

/**
 * Los paquetes a los que les falta alguna medida, ordenados para leerse: la
 * corrida más reciente primero (es la madera que todavía está en la pila y se
 * puede medir), y dentro de cada una por código, con los números en su orden
 * natural (`SL-2` antes de `SL-10`). Los completos se descartan.
 */
export function paquetesSinMedidas(filas: readonly PaqueteConMedidas[]): PaqueteSinMedidas[] {
  const salida: PaqueteSinMedidas[] = [];
  for (const f of filas) {
    const faltan = medidasQueFaltan(f);
    if (faltan.length > 0) salida.push({ ...f, faltan });
  }
  return salida.sort(
    (a, b) =>
      b.fecha.localeCompare(a.fecha) ||
      b.lineNo - a.lineNo ||
      a.codigo.localeCompare(b.codigo, "es", { numeric: true }),
  );
}

/** Una corrida por bloque, en el orden en que llegaron los paquetes. */
export function agruparPorCorrida(
  paquetes: readonly PaqueteSinMedidas[],
): CorridaConPaquetesSinMedidas[] {
  const porCorrida = new Map<string, CorridaConPaquetesSinMedidas>();
  for (const p of paquetes) {
    const c = porCorrida.get(p.ctpEntryId);
    if (c) c.paquetes.push(p);
    else
      porCorrida.set(p.ctpEntryId, {
        ctpEntryId: p.ctpEntryId,
        lineNo: p.lineNo,
        fecha: p.fecha,
        especie: p.especie,
        producto: p.producto,
        paquetes: [p],
      });
  }
  return [...porCorrida.values()];
}

/** «Falta el largo» · «Faltan el espesor y el ancho» · «Faltan las tres medidas». */
export function textoMedidaQueFalta(faltan: readonly MedidaQueFalta[]): string {
  if (faltan.length >= 3) return "Faltan las tres medidas";
  const con = faltan.map((m) => `el ${m}`);
  return faltan.length === 1 ? `Falta ${con[0]}` : `Faltan ${con.join(" y ")}`;
}

/**
 * «1 paquete sin medidas» · «34 paquetes sin medidas».
 *
 * `enElPatio` (opcional) separa los que SIGUEN en la pila de los que ya salieron
 * o se usaron: «34 paquetes sin medidas · 11 en el patio». Es la cifra que lleva
 * la pestaña Productos disponibles; el total es el histórico del libro.
 */
export function resumenPaquetesSinMedidas(n: number, enElPatio?: number): string {
  const base = `${formatNumber(n, 0)} ${n === 1 ? "paquete sin medidas" : "paquetes sin medidas"}`;
  return enElPatio == null ? base : `${base} · ${formatNumber(Math.min(enElPatio, n), 0)} en el patio`;
}

/** Un producto agotado no es un producto disponible con cero: es uno que ya no está. */
export const tieneDisponible = (s: { disponible: number } | undefined): boolean => (s?.disponible ?? 0) > 0;

/** Un paquete vivo, candidato a estar sin medidas, con lo que hace falta para saber si sigue en el patio. */
export interface CandidatoEnElPatio {
  codigo: string;
  ctpEntryId: string;
  espesorCm: number | null;
  anchoCm: number | null;
  largoM: number | null;
}

/**
 * Cuántos de esos paquetes SIGUEN EN EL PATIO y no tienen escuadría: el número
 * del badge de «Productos disponibles», con la MISMA vara que su chip «sin
 * escuadría» (`resumenProductos`): la escuadría es `escuadriaCompleta`, la
 * corrida tiene saldo (`tieneDisponible`) y el paquete no va en una guía viva.
 * (La otra mitad del criterio —corrida registrada, con cantidad y origen, sin
 * «ya usado»— la pone el WHERE: `whereCorridaEnElPatio`.) PURO.
 */
export function contarSinMedidasEnElPatio(
  candidatos: readonly CandidatoEnElPatio[],
  saldos: ReadonlyMap<string, { disponible: number }>,
  despachados: ReadonlySet<string>,
): number {
  return candidatos.filter(
    (p) => !escuadriaCompleta(p) && tieneDisponible(saldos.get(p.ctpEntryId)) && !despachados.has(p.codigo),
  ).length;
}

/**
 * «Corrida N.º 29 · miércoles 23/09». Con el año sólo cuando no es el actual:
 * en la lista conviven 2025-10 y 2026-09, y «martes 14/10» no dice de cuál.
 */
export function rotuloDeCorrida(
  c: Pick<CorridaConPaquetesSinMedidas, "lineNo" | "fecha">,
  ahora: Date,
): string {
  const anio = c.fecha.slice(0, 4);
  const conAnio = anio !== limaDateKey(ahora).slice(0, 4);
  return `Corrida N.º ${c.lineNo} · ${diaConNombre(c.fecha)}${conAnio ? `/${anio}` : ""}`;
}

/** Si la lista está recortada, decirlo: «Se muestran 100 de 240.» Vacío si entra entera. */
export function avisoDeRecorte(mostrados: number, total: number): string | null {
  return total > mostrados
    ? `Se muestran ${formatNumber(mostrados, 0)} de ${formatNumber(total, 0)}: al ir poniendo medidas salen los demás.`
    : null;
}
