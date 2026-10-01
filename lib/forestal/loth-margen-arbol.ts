/**
 * loth-margen-arbol — bajar el margen del nivel «especie» al nivel «árbol».
 *
 * El costeo por especie contesta «¿conviene trabajar tornillo?». La pregunta que
 * se hace el operador en el monte es otra: «¿convino tumbar ESTE árbol?». Un
 * fuste que rindió el 30% y otro que rindió el 80% aparecen promediados en la
 * misma fila de especie, y el promedio esconde justamente al que hay que mirar.
 *
 * El precio y el costo por m³ salen del costeo de su especie (no hay precio por
 * árbol en el sistema); lo que cambia entre árboles es **cuánto volumen llegó a
 * moverse**. Por eso el resultado se llama margen estimado: es exacto en el
 * volumen y heredado en el precio.
 *
 * PURO y client-safe.
 */

import { claveEspecie, type CosteoRow } from "./loth-constants";
import type { TraceOperation } from "./loth-trace";

export interface MargenArbol {
  tree: string;
  especie: string | null;
  taladoM3: number;
  /** Lo que se vendió como troza (salió con guía). Es lo que genera ingreso acá. */
  movilizadoM3: number;
  /**
   * Lo que se fue al aserrío. No suma ingreso en esta tabla: su plata aparece en
   * el despacho del producto terminado, que el libro atribuye por especie.
   */
  consumidoM3: number;
  rendimientoPct: number | null;
  precioM3: number;
  costoM3: number;
  margenM3: number;
  ingreso: number;
  costo: number;
  margen: number;
  /** Margen sobre ingreso, en %. null si no hubo ingreso. */
  margenPct: number | null;
  /** El costeo no tiene esta especie: no se puede valorizar. */
  sinPrecio: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Volumen que se VENDIÓ como troza, es decir el que salió con guía.
 *
 * La troza consumida NO cuenta acá aunque haya salido del patio: no se vendió,
 * se transformó — su ingreso aparece después, en el despacho del producto
 * terminado. Contarla sería cobrar dos veces la misma madera, y además haría
 * que el total por árbol dejara de coincidir con el total por especie, que es
 * exactamente el tipo de discrepancia que hace desconfiar de un tablero.
 */
function despachadoDe(op: TraceOperation): number {
  let total = 0;
  for (const t of op.trozado) {
    if (t.trozaCode && op.trozaEstado[t.trozaCode] === "despachada") total += Number(t.volumeM3 ?? 0) || 0;
  }
  return Math.round(total * 10000) / 10000;
}

/** Volumen que se fue al aserrío: su plata vive en el producto terminado. */
function consumidoDe(op: TraceOperation): number {
  let total = 0;
  for (const t of op.trozado) {
    if (t.trozaCode && op.trozaEstado[t.trozaCode] === "consumida") total += Number(t.volumeM3 ?? 0) || 0;
  }
  return Math.round(total * 10000) / 10000;
}

export function margenPorArbol(ops: TraceOperation[], costeo: CosteoRow[]): MargenArbol[] {
  const porEspecie = new Map<string, CosteoRow>();
  for (const c of costeo) porEspecie.set(claveEspecie(c.species), c);

  return ops
    .map((op): MargenArbol => {
      const c = porEspecie.get(claveEspecie(op.species));
      const movilizadoM3 = despachadoDe(op);
      const consumidoM3 = consumidoDe(op);
      const precioM3 = c?.precioVentaM3 ?? 0;
      const costoM3 = c?.costoTotalM3 ?? 0;
      const margenM3 = c?.margenM3 ?? 0;
      const ingreso = r2(precioM3 * movilizadoM3);
      const costo = r2(costoM3 * movilizadoM3);
      const margen = r2(margenM3 * movilizadoM3);
      return {
        tree: op.tree,
        especie: op.species,
        taladoM3: op.talaVolM3,
        movilizadoM3,
        consumidoM3,
        rendimientoPct: op.talaVolM3 > 0 ? Math.round((op.trozadoVolM3 / op.talaVolM3) * 1000) / 10 : null,
        precioM3: r2(precioM3),
        costoM3: r2(costoM3),
        margenM3: r2(margenM3),
        ingreso,
        costo,
        margen,
        margenPct: ingreso > 0 ? Math.round((margen / ingreso) * 1000) / 10 : null,
        sinPrecio: !c,
      };
    })
    .sort((a, b) => b.margen - a.margen);
}

export interface ResumenMargenArbol {
  arboles: number;
  /** Árboles con volumen movilizado (los únicos que generaron ingreso). */
  conMovimiento: number;
  ingreso: number;
  costo: number;
  margen: number;
  /** El que más y el que menos aportó (entre los que movieron madera). */
  mejor: MargenArbol | null;
  peor: MargenArbol | null;
  /** Árboles talados cuya madera todavía no salió: plata inmovilizada. */
  sinMovilizar: number;
  sinMovilizarM3: number;
  /** Volumen que fue al aserrío: su ingreso NO está en este total. */
  consumidoM3: number;
}

export function resumirMargenArbol(filas: MargenArbol[]): ResumenMargenArbol {
  const conMovimiento = filas.filter((f) => f.movilizadoM3 > 0);
  const quietos = filas.filter((f) => f.movilizadoM3 <= 0);
  return {
    arboles: filas.length,
    conMovimiento: conMovimiento.length,
    ingreso: r2(conMovimiento.reduce((a, f) => a + f.ingreso, 0)),
    costo: r2(conMovimiento.reduce((a, f) => a + f.costo, 0)),
    margen: r2(conMovimiento.reduce((a, f) => a + f.margen, 0)),
    mejor: conMovimiento[0] ?? null,
    peor: conMovimiento.length > 1 ? conMovimiento[conMovimiento.length - 1] : null,
    sinMovilizar: quietos.length,
    sinMovilizarM3: Math.round(quietos.reduce((a, f) => a + f.taladoM3, 0) * 10000) / 10000,
    consumidoM3: Math.round(filas.reduce((a, f) => a + f.consumidoM3, 0) * 10000) / 10000,
  };
}
