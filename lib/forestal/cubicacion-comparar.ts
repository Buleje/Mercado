/**
 * cubicacion-comparar — pone dos lotes lado a lado.
 *
 * La pregunta del aserradero no es sólo "qué tengo" sino "¿mejoré?": si esta
 * corrida sacó más comercial y menos corta que la anterior, el aserrío está
 * yendo bien; si el precio por pie tablar bajó, hay que mirar la mezcla antes de
 * culpar al mercado.
 *
 * PURO: se apoya en `agruparPor`, la misma fuente que las tablas y los insights.
 */
import type { PiezaCubicada } from "./cubicacion";
import { agruparPor, type DimensionResumen, type PrecioPt } from "./cubicacion-resumen";
import { fmtPt, fmtPtSigno } from "./cubicacion-formato";

export interface FilaComparacion {
  label: string;
  /** Pie tablar de cada lote y su diferencia (B − A). */
  ptA: number; ptB: number; deltaPt: number;
  /** Participación en el mix (% del PT del propio lote) y su diferencia. */
  pctA: number; pctB: number; deltaPct: number;
  valorA: number; valorB: number; deltaValor: number;
}

export interface Comparacion {
  filas: FilaComparacion[];
  total: FilaComparacion;
  /** S/ por pie tablar de cada lote (0 si el lote no tiene precio cargado). */
  precioPtA: number; precioPtB: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Compara dos lotes por la dimensión pedida. `A` es la referencia (el lote
 * anterior) y `B` el actual: los deltas se leen "cuánto cambió respecto de A".
 * Los grupos que existen en uno solo aparecen igual, con 0 del otro lado — que
 * un tipo haya desaparecido es justamente lo que se quiere ver.
 */
export function compararLotes(
  a: PiezaCubicada[],
  b: PiezaCubicada[],
  dim: DimensionResumen = "tipo",
  precio: PrecioPt = 0,
): Comparacion {
  const ra = agruparPor(a, dim, precio);
  const rb = agruparPor(b, dim, precio);
  const mapA = new Map(ra.grupos.map((g) => [g.label, g]));
  const mapB = new Map(rb.grupos.map((g) => [g.label, g]));

  const labels = [...new Set([...mapA.keys(), ...mapB.keys()])];
  const filas = labels.map<FilaComparacion>((label) => {
    const ga = mapA.get(label), gb = mapB.get(label);
    const ptA = ga?.pieTablar ?? 0, ptB = gb?.pieTablar ?? 0;
    const pctA = ga?.pctPt ?? 0, pctB = gb?.pctPt ?? 0;
    const valorA = ga?.valor ?? 0, valorB = gb?.valor ?? 0;
    return {
      label,
      ptA: r2(ptA), ptB: r2(ptB), deltaPt: r2(ptB - ptA),
      pctA: r2(pctA), pctB: r2(pctB), deltaPct: r2(pctB - pctA),
      valorA: r2(valorA), valorB: r2(valorB), deltaValor: r2(valorB - valorA),
    };
  });
  // Lo que más se movió arriba: es donde está la explicación del cambio.
  filas.sort((x, y) => Math.abs(y.deltaPt) - Math.abs(x.deltaPt));

  const total: FilaComparacion = {
    label: "TOTAL",
    ptA: r2(ra.total.pieTablar), ptB: r2(rb.total.pieTablar), deltaPt: r2(rb.total.pieTablar - ra.total.pieTablar),
    pctA: 100, pctB: 100, deltaPct: 0,
    valorA: r2(ra.total.valor), valorB: r2(rb.total.valor), deltaValor: r2(rb.total.valor - ra.total.valor),
  };

  return {
    filas,
    total,
    precioPtA: ra.total.pieTablar > 0 ? r2(ra.total.valor / ra.total.pieTablar) : 0,
    precioPtB: rb.total.pieTablar > 0 ? r2(rb.total.valor / rb.total.pieTablar) : 0,
  };
}

/**
 * Una línea que resume la comparación en criollo, para no obligar a leer la
 * tabla: qué grupo explica el cambio y si el pie tablar se está pagando mejor.
 */
export function lecturaComparacion(c: Comparacion): string {
  if (c.total.ptA === 0 && c.total.ptB === 0) return "Los dos lotes están vacíos.";
  const mov = c.filas.find((f) => f.deltaPt !== 0);
  const dirTotal = c.total.deltaPt >= 0 ? "más" : "menos";
  // El pie tablar se escribe entero, igual que en las tablas de Resúmenes: la
  // frase y la columna de al lado no pueden decir dos cifras distintas.
  const partes = [
    `Este lote tiene ${fmtPt(Math.abs(c.total.deltaPt))} PT ${dirTotal} que el otro`,
  ];
  if (mov) {
    partes.push(`el cambio se explica sobre todo por ${mov.label} (${fmtPtSigno(mov.deltaPt)} PT)`);
  }
  if (c.precioPtA > 0 && c.precioPtB > 0) {
    const d = r2(c.precioPtB - c.precioPtA);
    partes.push(d === 0
      ? `el pie tablar se paga igual (S/ ${c.precioPtB})`
      : `el pie tablar se paga ${d > 0 ? "mejor" : "peor"}: S/ ${c.precioPtB} vs S/ ${c.precioPtA}`);
  }
  return `${partes.join("; ")}.`;
}
