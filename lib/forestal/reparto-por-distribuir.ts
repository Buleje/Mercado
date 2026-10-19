/**
 * Lo marcado y lo que queda «Por distribuir» en el reparto de rolliza.
 *
 * Brandon, 2026-10-19: *«en cada bloque hay 2 con check y uno vacío (la larga
 * angosta)… quiero unificar esos que están vacíos en un bloque especial y ahí
 * usar su anexo 4; y que el anexo 4 de cada bloque traiga sólo lo marcado»*.
 *
 * La casilla «Distribuido» de cada línea (bloque × día × tipo, `claveMarca`)
 * parte la madera de los bloques en dos: lo tildado y lo que falta tildar. Las
 * dos mitades salen de ACÁ y de ninguna otra parte, así suman siempre el todo:
 *
 * · **No es una copia.** «Por distribuir» se deriva de las casillas cada vez:
 *   tildar una línea la saca de ahí sola, destildarla la devuelve.
 * · **Mismo volumen que la pantalla.** Se suman los m³ de la distribución que
 *   se dibuja (`distConVolumenOficial`), en milésimos enteros: marcado +
 *   pendiente = todo, sin deriva de float.
 * · **No confundir con «Falta por distribuir»**: eso es aserrada que NINGÚN
 *   bloque alcanzó a amparar (`e.faltante`). Lo de acá sí tiene bloque y
 *   permiso; sólo falta tildarlo.
 */

import { unificarPorMedida, type PiezaCubicada } from "./cubicacion";
import {
  claveMarca,
  esAserradaDirecta,
  type AsignacionGrupo,
  type BloqueDistribuido,
  type Distribucion,
} from "./cubicacion-reparto";
import { piezasDeGrupos } from "./reparto-anexo";

/** Decide, por la clave de la casilla (`claveMarca`), si una línea entra. */
export type IncluirLinea = (clave: string) => boolean;

export interface TotalesLinea {
  piezas: number;
  pt: number;
  m3: number;
}

/** Las jornadas del bloque; sin jornadas, una sola con todo lo asignado (como `repartoOficial`). */
export function jornadasDe(b: BloqueDistribuido): { dia: number; grupos: AsignacionGrupo[] }[] {
  return b.porDia.length > 0 ? b.porDia : [{ dia: 1, grupos: b.asignado }];
}

/** Las claves de casilla del bloque (día × tipo), las mismas que dibuja la tarjeta. */
export function clavesDelBloque(b: BloqueDistribuido): string[] {
  return jornadasDe(b).flatMap((j) => j.grupos.map((g) => claveMarca(b.bloque.id, j.dia, g.clave)));
}

/**
 * Las piezas de las líneas del bloque que pasan el filtro, en el formato del
 * Anexo 04. Con `dia`, sólo esa jornada. La misma medida de dos jornadas va en
 * una fila (`unificarPorMedida`): el anexo del bloque entero nunca la repitió.
 */
export function piezasFiltradasDelBloque(
  b: BloqueDistribuido,
  especie: string,
  incluir: IncluirLinea,
  dia?: number,
): PiezaCubicada[] {
  const out: PiezaCubicada[] = [];
  for (const j of jornadasDe(b)) {
    if (dia != null && j.dia !== dia) continue;
    const grupos = j.grupos.filter((g) => incluir(claveMarca(b.bloque.id, j.dia, g.clave)));
    out.push(...piezasDeGrupos(grupos, especie, `${b.bloque.id}-d${j.dia}`));
  }
  return unificarPorMedida(out);
}

/** Sólo lo tildado como distribuido. */
export const marcadoEn =
  (marcadas: ReadonlySet<string>): IncluirLinea =>
  (k) =>
    marcadas.has(k);

/** Sólo lo que falta tildar: lo que va al bloque «Por distribuir». */
export const pendienteEn =
  (marcadas: ReadonlySet<string>): IncluirLinea =>
  (k) =>
    !marcadas.has(k);

/** Una línea del reparto: un tipo de un bloque en una jornada. */
export interface LineaDelReparto {
  clave: string;
  bloqueId: string;
  etiqueta: string;
  especie: string;
  /** Recortado; `null` = el bloque no declaró permiso. */
  permiso: string | null;
  dia: number;
  /** Cuántas jornadas tiene el bloque: con una sola no se dice «día 1». */
  dias: number;
  aserradaDirecta: boolean;
  grupo: AsignacionGrupo;
}

export function lineasDelReparto(dist: Distribucion): LineaDelReparto[] {
  const out: LineaDelReparto[] = [];
  for (const e of dist.especies) {
    for (const b of e.bloques) {
      const jornadas = jornadasDe(b);
      for (const j of jornadas) {
        for (const g of j.grupos) {
          out.push({
            clave: claveMarca(b.bloque.id, j.dia, g.clave),
            bloqueId: b.bloque.id,
            etiqueta: b.bloque.etiqueta.trim() || "Sin etiqueta",
            especie: e.especie,
            permiso: (b.bloque.permiso ?? "").trim() || null,
            dia: j.dia,
            dias: jornadas.length,
            aserradaDirecta: esAserradaDirecta(b.bloque),
            grupo: g,
          });
        }
      }
    }
  }
  return out;
}

/** Suma en unidades enteras (milésimos de m³, centésimos de PT): sin deriva. */
export function sumarLineas(lineas: readonly LineaDelReparto[]): TotalesLinea {
  let piezas = 0;
  let ptCent = 0;
  let m3Mil = 0;
  for (const l of lineas) {
    piezas += l.grupo.piezas;
    ptCent += Math.round(l.grupo.pieTablar * 100);
    m3Mil += Math.round(l.grupo.m3 * 1000);
  }
  return { piezas, pt: ptCent / 100, m3: m3Mil / 1000 };
}

export interface BloquePendiente {
  bloqueId: string;
  etiqueta: string;
  especie: string;
  permiso: string | null;
  aserradaDirecta: boolean;
  lineas: LineaDelReparto[];
  totales: TotalesLinea;
}

export interface PermisoPendiente {
  permiso: string | null;
  label: string;
  bloques: BloquePendiente[];
  lineas: number;
  totales: TotalesLinea;
}

export interface PorDistribuir {
  lineas: LineaDelReparto[];
  porPermiso: PermisoPendiente[];
  totales: TotalesLinea;
}

/**
 * El bloque especial «Por distribuir»: las líneas sin tildar de TODOS los
 * bloques, por permiso y dentro de cada permiso por bloque de origen. Un permiso
 * por papel: nunca un Anexo 04 con dos títulos habilitantes.
 */
export function porDistribuir(dist: Distribucion, marcadas: ReadonlySet<string>): PorDistribuir {
  const lineas = lineasDelReparto(dist).filter((l) => !marcadas.has(l.clave) && l.grupo.piezas > 0);
  const permisos = new Map<string, Map<string, LineaDelReparto[]>>();
  for (const l of lineas) {
    const kp = l.permiso ?? "";
    const bloques = permisos.get(kp) ?? new Map<string, LineaDelReparto[]>();
    bloques.set(l.bloqueId, [...(bloques.get(l.bloqueId) ?? []), l]);
    permisos.set(kp, bloques);
  }
  const porPermiso: PermisoPendiente[] = [...permisos.entries()].map(([kp, bloques]) => {
    const bs: BloquePendiente[] = [...bloques.values()].map((ls) => ({
      bloqueId: ls[0].bloqueId,
      etiqueta: ls[0].etiqueta,
      especie: ls[0].especie,
      permiso: ls[0].permiso,
      aserradaDirecta: ls[0].aserradaDirecta,
      lineas: ls,
      totales: sumarLineas(ls),
    }));
    const todas = bs.flatMap((b) => b.lineas);
    return {
      permiso: kp || null,
      label: kp || "Sin permiso declarado",
      bloques: bs,
      lineas: todas.length,
      totales: sumarLineas(todas),
    };
  });
  porPermiso.sort((a, b) => b.totales.m3 - a.totales.m3);
  return { lineas, porPermiso, totales: sumarLineas(lineas) };
}

export interface CuadreMarcado {
  todo: TotalesLinea;
  marcado: TotalesLinea;
  pendiente: TotalesLinea;
  /** Marcado + pendiente = todo en las tres unidades (enteros: tiene que ser exacto). */
  cuadra: boolean;
}

/** Lo tildado + lo que falta tildar = todo lo que los bloques amparan. */
export function cuadreMarcado(dist: Distribucion, marcadas: ReadonlySet<string>): CuadreMarcado {
  const todas = lineasDelReparto(dist);
  const todo = sumarLineas(todas);
  const marcado = sumarLineas(todas.filter((l) => marcadas.has(l.clave)));
  const pendiente = sumarLineas(todas.filter((l) => !marcadas.has(l.clave)));
  const igual = (a: number, b: number, escala: number) => Math.round(a * escala) === Math.round(b * escala);
  return {
    todo,
    marcado,
    pendiente,
    cuadra:
      marcado.piezas + pendiente.piezas === todo.piezas &&
      igual(marcado.pt + pendiente.pt, todo.pt, 100) &&
      igual(marcado.m3 + pendiente.m3, todo.m3, 1000),
  };
}
