/**
 * lote-programacion.ts — la programación de un lote de aserrío (ADR-342).
 *
 * Los catálogos y las reglas que la pantalla y el servidor comparten cuando el
 * lote se DECLARA antes de cargarlo: qué materia prima se puede consumir y qué
 * piezas del patio corresponden a ese lote.
 *
 * PURO y client-safe.
 */

import type { TrozaConsumible } from "./consumo-trozas";
import { motivoBloqueo } from "./consumo-trozas";

/**
 * «Tipo de producto a consumir» del formulario oficial.
 *
 * Son los estados en que la materia prima entra a un CTP. La rolliza es el caso
 * normal —troncos del monte— y va primera; el resto existe porque un aserradero
 * también re-procesa madera que ya pasó por otra planta.
 */
export const PRODUCTOS_CONSUMIBLES_LOTE = [
  { valor: "rolliza", label: "Madera rolliza (troncos)" },
  { valor: "aserrada", label: "Madera aserrada" },
  { valor: "tablones", label: "Tablones" },
  { valor: "otro", label: "Otro" },
] as const;

export type ProductoConsumibleLote = (typeof PRODUCTOS_CONSUMIBLES_LOTE)[number]["valor"];

export function labelProductoConsumible(valor: string | null | undefined): string {
  return PRODUCTOS_CONSUMIBLES_LOTE.find((p) => p.valor === valor)?.label ?? "—";
}

const norm = (v: string | null | undefined) =>
  (v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * Las piezas del patio que corresponden a un lote programado.
 *
 * **La especie manda**: un lote es de una sola (la sierra se calibra por
 * especie), así que al elegirlo en Consumos la tabla se filtra sola en vez de
 * dejar que el operador tilde madera que el servidor va a rechazar.
 *
 * Se devuelven también las que ya están EN ese lote: son parte de lo que va a
 * entrar a la sierra cuando se consuma.
 */
export function trozasDelLote(
  trozas: readonly TrozaConsumible[],
  lote: { id: string; speciesCommon: string },
): TrozaConsumible[] {
  const especie = norm(lote.speciesCommon);
  return trozas.filter((t) => {
    if (t.consumidaEnId) return false;
    /* La guía sin recibir NO está en el patio (ADR-339). Sin esto el selector
       prometía «4 pza disponibles» y la tabla mostraba una: medido en el tenant
       real, tres de esas Capirona eran de una guía que seguía en la bandeja. */
    if (t.guiaRecepcionada === false) return false;
    if (norm(t.especieComun) !== especie) return false;
    if (t.loteAserrioId === lote.id) return true;
    return !t.loteAserrioId && motivoBloqueo(t) === null;
  });
}

/** Lo que hay hoy de cada especie en el patio, para elegir con el dato a la vista. */
export interface DisponibleEspecie {
  nombre: string;
  cientifico: string | null;
  piezas: number;
  volumen: number;
}

export function disponiblePorEspecie(trozas: readonly TrozaConsumible[]): DisponibleEspecie[] {
  const mapa = new Map<string, DisponibleEspecie>();
  for (const t of trozas) {
    /* Mismo criterio que `trozasDelLote`: si acá se contara la madera sin
       recibir, el modal ofrecería una especie que después no aparece. */
    if (t.guiaRecepcionada === false) continue;
    if (t.loteAserrioId || t.consumidaEnId || motivoBloqueo(t) !== null) continue;
    const nombre = (t.especieComun ?? "").trim();
    if (!nombre) continue;
    const acc = mapa.get(nombre) ?? { nombre, cientifico: t.especieCientifica ?? null, piezas: 0, volumen: 0 };
    acc.piezas += 1;
    acc.volumen += Number(t.volumenM3 ?? 0);
    if (!acc.cientifico && t.especieCientifica) acc.cientifico = t.especieCientifica;
    mapa.set(nombre, acc);
  }
  return [...mapa.values()]
    .map((e) => ({ ...e, volumen: Math.round(e.volumen * 10000) / 10000 }))
    .sort((a, b) => b.volumen - a.volumen);
}
