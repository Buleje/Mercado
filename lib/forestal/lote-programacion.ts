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
  lote: { id: string; speciesCommon: string; permiso?: string | null },
): TrozaConsumible[] {
  const especie = norm(lote.speciesCommon);
  const permiso = (lote.permiso ?? "").trim();
  return trozas.filter((t) => {
    if (t.consumidaEnId) return false;
    /* La guía sin recibir NO está en el patio (ADR-339). Sin esto el selector
       prometía «4 pza disponibles» y la tabla mostraba una: medido en el tenant
       real, tres de esas Capirona eran de una guía que seguía en la bandeja. */
    if (t.guiaRecepcionada === false) return false;
    if (norm(t.especieComun) !== especie) return false;
    /* El lote declaró un título habilitante: sólo toma madera de ESE (ADR-393).
       Un lote con dos permisos no puede decir después de cuál salió su corrida.
       Sin permiso declarado se comporta como siempre — no se rompe lo viejo.

       La pieza que YA está en este lote se sigue mostrando aunque su permiso no
       coincida: si un lote armado antes de esta regla tiene madera mezclada, hay
       que poder verla para sacarla, no esconderla. */
    if (t.loteAserrioId === lote.id) return true;
    if (permiso && (t.permiso ?? "").trim() !== permiso) return false;
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

/** Un título habilitante del patio con lo que hay disponible de él. */
export interface DisponiblePermiso {
  permiso: string;
  piezas: number;
  volumen: number;
  especies: number;
}

/** Las trozas que el modal puede ofrecer: recibidas, libres y sin bloqueo. */
function ofrecibles(trozas: readonly TrozaConsumible[]): TrozaConsumible[] {
  return trozas.filter(
    (t) => t.guiaRecepcionada !== false && !t.loteAserrioId && !t.consumidaEnId && motivoBloqueo(t) === null,
  );
}

/**
 * Los permisos que hay en el patio, con cuánto tiene cada uno (ADR-393).
 *
 * Es el primer paso al armar un lote: elegido el permiso, las especies se
 * acotan a las que tienen madera de ESE título. Un lote con dos permisos rompe
 * la trazabilidad hacia adelante — la corrida que sale no puede decir de qué
 * título salió su madera.
 *
 * Las piezas sin permiso NO se cuentan acá: no tienen título que elegir. Se
 * siguen ofreciendo con «todos los permisos», que es lo que hace un CTP de una
 * sola fuente.
 */
export function disponiblePorPermiso(trozas: readonly TrozaConsumible[]): DisponiblePermiso[] {
  const mapa = new Map<string, DisponiblePermiso & { _especies: Set<string> }>();
  for (const t of ofrecibles(trozas)) {
    const permiso = (t.permiso ?? "").trim();
    if (!permiso) continue;
    const acc = mapa.get(permiso) ?? { permiso, piezas: 0, volumen: 0, especies: 0, _especies: new Set<string>() };
    acc.piezas += 1;
    acc.volumen += Number(t.volumenM3 ?? 0);
    const esp = (t.especieComun ?? "").trim();
    if (esp) acc._especies.add(esp);
    mapa.set(permiso, acc);
  }
  return [...mapa.values()]
    .map(({ _especies, ...p }) => ({ ...p, volumen: Math.round(p.volumen * 10000) / 10000, especies: _especies.size }))
    .sort((a, b) => b.volumen - a.volumen);
}

/**
 * Las especies del patio con lo que hay de cada una.
 *
 * Con `permiso`, sólo cuenta la madera de ESE título habilitante: es lo que
 * hace que elegir el permiso primero acote de verdad las especies que siguen
 * (ADR-393). Sin él, cuenta todo el patio, como siempre.
 */
export function disponiblePorEspecie(
  trozas: readonly TrozaConsumible[],
  permiso?: string | null,
): DisponibleEspecie[] {
  const mapa = new Map<string, DisponibleEspecie>();
  for (const t of trozas) {
    /* Mismo criterio que `trozasDelLote`: si acá se contara la madera sin
       recibir, el modal ofrecería una especie que después no aparece. */
    if (t.guiaRecepcionada === false) continue;
    if (t.loteAserrioId || t.consumidaEnId || motivoBloqueo(t) !== null) continue;
    if (permiso && (t.permiso ?? "").trim() !== permiso) continue;
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
