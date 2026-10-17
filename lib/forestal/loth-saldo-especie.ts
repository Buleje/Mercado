/**
 * Saldo por especie del Libro TH: de cada especie, cuánto se puede todavía
 * talar y cuánto hay todavía para mover.
 *
 * Son DOS saldos distintos y no se mezclan:
 * - **saldo por talar** = cupo − talado (`restanteM3` de `cupoPorEspecie`): lo
 *   que el permiso todavía deja sacar del monte;
 * - **en patio** = trozas trozadas que no salieron ni se consumieron: lo que
 *   todavía se puede mover.
 *
 * `computeBalance` (loth-constants) mide otra cosa —autorizado − movilizado por
 * guía—; acá el cupo y el talado salen de `cupoPorEspecie` y las trozas de
 * `construirTablero`, que ya decide el estado de cada una. Nada se recalcula.
 *
 * El embudo de cada especie cierra: trozado = despachado + consumido +
 * descartado + en patio. Trozas sin volumen cuentan en `trozasSinVolumen`, no
 * como 0. Lo que no pertenece al plan (otro plan, o un árbol que su censo no
 * tiene) no suma a ninguna especie: va en `fuera`, a la vista.
 *
 * Medido el 30-09 en Blas: Tornillo 320 autorizado, talado 9,537, trozado
 * 4,365 (2,850 despachada + 1,515 consumida) → saldo por talar 310,463.
 *
 * Puro y client-safe.
 */

import { claveEspecie, type LothEntryDTO } from "./loth-constants";
import {
  cupoPorEspecie,
  type ArbolCensoCupo,
  type CupoEspecie,
  type EspecieAutorizadaCupo,
  type FuenteCupo,
  type VeredictoCupo,
} from "./loth-cupo-especie";
import { talasDelPlan } from "./loth-cupo-vista";
import { construirTablero, type TrozaTablero } from "./loth-tablero-trozas";

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Lo mínimo de una troza para el saldo (un `TrozaTablero` ya lo cumple). */
export type TrozaSaldo = Pick<TrozaTablero, "code" | "treeCode" | "especie" | "volumenM3" | "estado">;

export interface SaldoEspecie {
  clave: string;
  especie: string;
  /** Autorizado si el plan lo trae; si no, lo censado. `null` = sin cupo. */
  cupoM3: number | null;
  fuente: FuenteCupo | null;
  taladoM3: number;
  arbolesTalados: number;
  /** cupo − talado; negativo = exceso. `null` sin cupo. */
  saldoPorTalarM3: number | null;
  pctUsado: number | null;
  veredicto: VeredictoCupo;
  trozadoM3: number;
  /** Trozas de la especie (todas las del trozado, con o sin volumen). */
  trozas: number;
  /** Trozas sin volumen: se cuentan pero no se pueden sumar. */
  trozasSinVolumen: number;
  /** Salieron del área con GTF. */
  despachadoM3: number;
  consumidoM3: number;
  descartadoM3: number;
  /** Trozadas y todavía en el patio: lo que se puede mover. */
  enPatioM3: number;
  /** La especie no tiene ninguna tala: se pliega en la vista. */
  sinTalar: boolean;
}

export interface TotalesSaldo {
  especies: number;
  conTala: number;
  sinTalar: number;
  /** Σ cupo de las especies que tienen cupo. */
  cupoM3: number;
  /** Especies talándose sin cupo contra el cual medir. */
  sinCupo: number;
  taladoM3: number;
  trozadoM3: number;
  despachadoM3: number;
  consumidoM3: number;
  descartadoM3: number;
  enPatioM3: number;
  /** Σ de lo que todavía se puede talar; el exceso de una especie NO le presta a otra. */
  saldoPorTalarM3: number;
  /** Σ de lo que se pasaron las especies excedidas. */
  excesoM3: number;
  /** Cupo de las especies sin talar: lo que está intacto. */
  cupoSinTalarM3: number;
}

/** Trozas que el saldo no pudo asignar a ninguna especie del plan. */
export interface FueraDelSaldo {
  n: number;
  m3: number;
}

export interface SaldoDelPlan {
  filas: SaldoEspecie[];
  totales: TotalesSaldo;
  fuera: FueraDelSaldo;
  /** Despachadas o consumidas sin una línea de Trozado: no suman, se avisan. */
  sinTrozado: number;
}

/**
 * El saldo de cada especie a partir del cupo ya calculado y de las trozas ya
 * cruzadas. Sin orden: para mostrar, `ordenarSaldo`.
 *
 * `codigosCenso` (opcional): si viene, sólo cuentan las trozas de un árbol del
 * censo de este plan; las demás van a `fuera`.
 */
export function saldoDeCupos(
  cupos: readonly CupoEspecie[],
  trozas: readonly TrozaSaldo[],
  codigosCenso?: ReadonlySet<string>,
): SaldoDelPlan {
  const acum = new Map<string, { trozado: number; n: number; sinVol: number; desp: number; cons: number; desc: number; patio: number }>();
  for (const c of cupos) acum.set(c.clave, { trozado: 0, n: 0, sinVol: 0, desp: 0, cons: 0, desc: 0, patio: 0 });

  let fueraN = 0;
  let fueraM3 = 0;
  let sinTrozado = 0;

  for (const t of trozas) {
    if (t.estado === "fantasma") {
      sinTrozado += 1;
      continue;
    }
    const vol = t.volumenM3 != null && t.volumenM3 > 0 ? t.volumenM3 : 0;
    const code = t.treeCode?.trim();
    const a = acum.get(claveEspecie(t.especie));
    if (!a || (codigosCenso && (!code || !codigosCenso.has(code)))) {
      fueraN += 1;
      fueraM3 += vol;
      continue;
    }
    a.n += 1;
    if (vol === 0) a.sinVol += 1;
    a.trozado += vol;
    if (t.estado === "despachada") a.desp += vol;
    else if (t.estado === "consumida") a.cons += vol;
    else if (t.estado === "descartada") a.desc += vol;
    else a.patio += vol;
  }

  const filas: SaldoEspecie[] = cupos.map((c) => {
    const a = acum.get(c.clave)!;
    return {
      clave: c.clave,
      especie: c.especie,
      cupoM3: c.cupoM3,
      fuente: c.fuente,
      taladoM3: c.taladoM3,
      arbolesTalados: c.arbolesTalados,
      saldoPorTalarM3: c.restanteM3,
      pctUsado: c.pctUsado,
      veredicto: c.veredicto,
      trozadoM3: r4(a.trozado),
      trozas: a.n,
      trozasSinVolumen: a.sinVol,
      despachadoM3: r4(a.desp),
      consumidoM3: r4(a.cons),
      descartadoM3: r4(a.desc),
      enPatioM3: r4(a.patio),
      sinTalar: c.arbolesTalados === 0 && c.taladoM3 === 0,
    };
  });

  return { filas, totales: totalesSaldo(filas), fuera: { n: fueraN, m3: r4(fueraM3) }, sinTrozado };
}

export function totalesSaldo(filas: readonly SaldoEspecie[]): TotalesSaldo {
  const suma = (f: (s: SaldoEspecie) => number) => r4(filas.reduce((s, x) => s + f(x), 0));
  return {
    especies: filas.length,
    conTala: filas.filter((f) => !f.sinTalar).length,
    sinTalar: filas.filter((f) => f.sinTalar).length,
    cupoM3: suma((f) => f.cupoM3 ?? 0),
    sinCupo: filas.filter((f) => f.cupoM3 == null && !f.sinTalar).length,
    taladoM3: suma((f) => f.taladoM3),
    trozadoM3: suma((f) => f.trozadoM3),
    despachadoM3: suma((f) => f.despachadoM3),
    consumidoM3: suma((f) => f.consumidoM3),
    descartadoM3: suma((f) => f.descartadoM3),
    enPatioM3: suma((f) => f.enPatioM3),
    saldoPorTalarM3: suma((f) => Math.max(0, f.saldoPorTalarM3 ?? 0)),
    excesoM3: suma((f) => (f.saldoPorTalarM3 != null && f.veredicto === "excedido" ? -f.saldoPorTalarM3 : 0)),
    cupoSinTalarM3: suma((f) => (f.sinTalar ? (f.cupoM3 ?? 0) : 0)),
  };
}

/**
 * Lo que se mira primero, primero: excedidas, luego las más taladas; al final
 * las sin talar (la vista las pliega). A igualdad, por nombre.
 */
export function ordenarSaldo(filas: readonly SaldoEspecie[]): SaldoEspecie[] {
  const rango = (f: SaldoEspecie) => (f.sinTalar ? 2 : f.veredicto === "excedido" ? 0 : 1);
  return [...filas].sort(
    (a, b) => rango(a) - rango(b) || b.taladoM3 - a.taladoM3 || a.especie.localeCompare(b.especie, "es"),
  );
}

export interface EntradaSaldo {
  /** Plan cuyo censo y talas se miden; `null` = sin plan activo (no filtra por plan). */
  planId: string | null;
  censo: readonly ArbolCensoCupo[];
  /** Las líneas del libro (todas las secciones); las anuladas se ignoran. */
  entries: readonly LothEntryDTO[];
  autorizadas?: readonly EspecieAutorizadaCupo[];
  hoy?: Date;
}

/**
 * Todo junto, desde lo que el padre ya tiene: el censo del plan, las líneas del
 * libro y las especies autorizadas. Cada plan con sus propias talas
 * (`talasDelPlan`) y sus propias trozas (las asentadas a
 * otro plan no cuentan).
 */
export function saldoPorEspecie(e: EntradaSaldo): SaldoDelPlan {
  const vivas = e.entries.filter((x) => x.status !== "anulado");
  const deEstePlan = vivas.filter((x) => !(x.planId != null && e.planId != null && x.planId !== e.planId));

  const talas = vivas
    .filter((x) => x.section === "tala")
    .map((x) => ({ treeCode: x.treeCode, speciesCommon: x.speciesCommon, volumeM3: x.volumeM3, planId: x.planId ?? null }));
  const codigos = new Set(e.censo.map((c) => c.treeCode.trim()));
  const cupos = cupoPorEspecie({
    censo: e.censo,
    talas: talasDelPlan(talas, codigos, e.planId).delPlan,
    autorizadas: e.autorizadas ?? [],
    soloCenso: true,
  });
  return saldoDeCupos(cupos, construirTablero(deEstePlan, e.hoy), codigos);
}
