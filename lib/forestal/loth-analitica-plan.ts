/**
 * loth-analitica-plan — qué líneas del libro son de UN plan, para la analítica
 * («Rentabilidad y rendimiento»).
 *
 * Sin esto, con dos planes el movilizado de todos se valorizaba con los precios
 * de uno, y las líneas sin `planId` (los `despacho_troza` viajan con `null`)
 * entraban en TODOS los planes: el mismo despacho se valorizaba dos veces.
 *
 * La atribución NO se duplica: es la de «Extracción» (`atribuirLineas`, ADR-454).
 * Una línea va a su `planId`; si no lo tiene, al plan cuyo censo tiene su árbol;
 * un despacho o consumo sigue a SU troza (trozado → tala). Lo que no se puede
 * atribuir queda «sin plan» y no entra en ninguno — se avisa, no se reparte.
 *
 * PURO y client-safe.
 */

import {
  atribuirLineas,
  type ArbolDeExtraccion,
  type LineaDeExtraccion,
} from "./loth-extraccion";

export interface LineasDelPlan {
  /** Ids de las líneas vivas de ESE plan (todas las secciones atribuibles). */
  ids: Set<string>;
  /** Líneas de la cadena sin plan ni árbol en un censo; `ambiguas` = el árbol está en 2+ censos. */
  sinPlan: { lineas: number; ambiguas: number };
}

/** Secciones que `atribuirLineas` no conoce (transformación, producto terminado…): sólo por su `planId`. */
const SECCIONES_DE_LA_CADENA = new Set(["tala", "trozado", "despacho_troza", "consumo_troza", "despacho_producto"]);

export function lineasDelPlan(
  planIds: readonly string[],
  planId: string,
  arboles: readonly ArbolDeExtraccion[],
  lineas: readonly LineaDeExtraccion[],
): LineasDelPlan {
  const cadena = lineas.filter((l) => SECCIONES_DE_LA_CADENA.has(l.section));
  const atr = atribuirLineas(planIds.map((id) => ({ id })), arboles, cadena, "9999-12-31");
  const ids = new Set<string>();
  for (const l of atr.lineasDelPlan.get(planId) ?? []) if (l.status === "registrado") ids.add(l.id);
  // Fuera de la cadena: la línea es del plan sólo si lo dice ella.
  for (const l of lineas) if (!SECCIONES_DE_LA_CADENA.has(l.section) && l.planId === planId) ids.add(l.id);
  return { ids, sinPlan: atr.sinPlan };
}
