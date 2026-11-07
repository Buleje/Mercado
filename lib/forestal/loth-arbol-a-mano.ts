/**
 * loth-arbol-a-mano — el árbol del censo de donde salió una troza anotada a
 * mano al despachar con guía (Brandon 15-10, «Árbol de origen en la troza»).
 *
 * Toda salida tiene que poder responder «¿de qué árbol salió?»
 * (`.claude/rules/forestal-serfor.md`). La troza a mano nacía en el Trozado sin
 * árbol; ahora se puede elegir el del censo. Es OPCIONAL: «sin árbol» sigue
 * valiendo (el libro admite huecos; el certificado no).
 *
 * Las reglas son las del libro, no nuevas:
 *  - Plan: un árbol es de UN plan (`ForestCensusTree.planId`). La troza va con
 *    el plan de la guía, así que el árbol tiene que ser de ése: la misma regla
 *    de la tala contra el censo (`resolverTalaContraCenso`,
 *    `TALA_PLAN_DISTINTO_AL_CENSO`). Una guía SIN permiso con un árbol de X no
 *    se adivina: la pantalla propone «Usar el permiso X» y el servidor rechaza
 *    (`GUIA_SIN_PERMISO_CON_ARBOL`), porque el titular, el título y el
 *    talonario de la guía salen de su plan.
 *  - Especie: la del censo (`TALA_ESPECIE_DISTINTA_AL_CENSO`, misma función).
 *    Sin especie en la fila, toma la del árbol.
 *  - Tala: NO se exige. El Trozado admite un árbol sin tala (T4 mide sólo si la
 *    tala existe, `forest-loth.db.ts` · `enforceInvariants`, rama trozado); con
 *    tala, T4 frena si se pasa de lo tumbado. La pantalla avisa «sin tala».
 *  - Código: el del trozado de siempre, árbol + la letra que sigue
 *    (`siguienteCodigoDeTroza`: «001-TOR-A», «001-TOR-B»), y en el libro el
 *    único de ADR-477 con el N° de la guía («001-TOR-A-0123»). Así
 *    `arbolDeTroza` y la columna `treeCode` dicen el mismo árbol.
 *
 * PURO y client-safe: lo usan el modal (vista previa y avisos) y la DB class
 * (la última palabra, dentro de la transacción).
 */
import { claveEspecie } from "./loth-constants";
import { codigoDeLaGuia } from "./codigo-unico-troza";
import { siguienteCodigoDeTroza } from "./loth-restante";
import { resolverTalaContraCenso, type CodigoTalaCenso } from "./loth-tala-del-censo";

/** Un árbol del censo que se puede elegir para una troza a mano. */
export interface ArbolParaTroza {
  /** id de `ForestCensusTree`: lo que viaja en el POST. */
  id: string;
  treeCode: string;
  especie: string;
  cientifico: string | null;
  planId: string;
  /** en_pie | talado (los descartados no se ofrecen). */
  estado: string;
  /** Volumen de su tala viva (`null` = sin tala en el libro: T4 no mide). */
  talaM3: number | null;
  /** Lo que ya tiene trozado (m³, trozas vivas de su plan o sin plan). */
  trozadoM3: number;
  /** Los códigos de sus trozas vivas (para la letra que sigue). */
  trozas: readonly string[];
}

export type CodigoArbolAMano = "ARBOL_NO_EXISTE" | "GUIA_SIN_PERMISO_CON_ARBOL" | CodigoTalaCenso;

export type ArbolRevisado =
  | { ok: true; treeCode: string; planId: string; especie: string; cientifico: string | null }
  | { ok: false; code: CodigoArbolAMano; mensaje: string; detail: Record<string, unknown> };

/**
 * ¿Puede esta troza ir con este árbol en esta guía? La misma respuesta en el
 * modal (antes de agregar) y en el servidor (al registrar).
 *
 * @param planDeLaGuia el plan con que va la guía (`null` = sin permiso).
 * @param especie la especie de la fila (`null`/vacía = toma la del árbol).
 */
export function revisarArbolDeTroza(
  arbol: ArbolParaTroza | null | undefined,
  ctx: { planDeLaGuia: string | null; especie: string | null | undefined },
): ArbolRevisado {
  if (!arbol) {
    return {
      ok: false,
      code: "ARBOL_NO_EXISTE",
      mensaje:
        "Ese árbol ya no está en el censo de este negocio (o su plan se dio de baja). Elige otro o anota la troza sin árbol.",
      detail: {},
    };
  }
  if (!ctx.planDeLaGuia) {
    return {
      ok: false,
      code: "GUIA_SIN_PERMISO_CON_ARBOL",
      mensaje: `El árbol ${arbol.treeCode} es de un permiso y esta guía va sin permiso: elige ese permiso para la guía, o anota la troza sin árbol.`,
      detail: { treeCode: arbol.treeCode, planDelArbol: arbol.planId },
    };
  }
  const r = resolverTalaContraCenso(
    {
      treeCode: arbol.treeCode,
      planId: ctx.planDeLaGuia,
      speciesCommon: ctx.especie?.trim() || null,
      speciesScientific: null,
    },
    [{ planId: arbol.planId, speciesCommon: arbol.especie, speciesScientific: arbol.cientifico }],
  );
  if (!r.ok) return r;
  return {
    ok: true,
    treeCode: arbol.treeCode,
    planId: arbol.planId,
    especie: r.speciesCommon ?? arbol.especie,
    cientifico: r.speciesScientific ?? null,
  };
}

/**
 * El código que imprime la guía para la próxima troza de este árbol: la letra
 * que sigue a las que ya tiene (en el libro, de otras guías, o asignadas antes
 * en ESTA guía). Los códigos del libro se leen sin el sufijo de ADR-477
 * («001-TOR-A-0123» ocupa la «A»).
 */
export function siguienteCodigoDelArbol(treeCode: string, tomados: Iterable<string>): string {
  const code = treeCode.trim();
  const prefijo = `${code}-`.toUpperCase();
  const delArbol = [...new Set([...tomados].map((c) => codigoDeLaGuia(c)))]
    .filter((c) => c.toUpperCase().startsWith(prefijo))
    .map((trozaCode) => ({ id: trozaCode, lineNo: 0, trozaCode, volumeM3: null }));
  return siguienteCodigoDeTroza(code, delArbol);
}

/**
 * Los árboles que ofrece el selector de una fila: los de la especie elegida
 * (si hay) y, si la guía tiene permiso, los de ese permiso; filtrados por lo
 * buscado (código). Primero los que tienen tala (de donde sale la madera) y
 * después por código natural.
 */
export function arbolesParaLaFila(
  arboles: readonly ArbolParaTroza[],
  f: { especie?: string | null; planId?: string | null; q?: string },
): ArbolParaTroza[] {
  const especie = claveEspecie(f.especie);
  const q = (f.q ?? "").trim().toUpperCase();
  return arboles
    .filter(
      (a) =>
        (!f.planId || a.planId === f.planId) &&
        (!especie || claveEspecie(a.especie) === especie) &&
        (!q || a.treeCode.toUpperCase().includes(q)),
    )
    .sort(
      (a, b) =>
        Number(b.talaM3 != null) - Number(a.talaM3 != null) ||
        a.treeCode.localeCompare(b.treeCode, "es", { numeric: true }),
    );
}

const r4 = (n: number): number => Math.round(n * 10_000) / 10_000;
const m3 = (n: number): string => r4(n).toFixed(3).replace(".", ",");

/** Lo que queda por trozar de la tala del árbol (m³); `null` = sin tala. */
export function restanteDeLaTala(a: Pick<ArbolParaTroza, "talaM3" | "trozadoM3">): number | null {
  return a.talaM3 == null ? null : r4(a.talaM3 - a.trozadoM3);
}

/**
 * T4 visto antes de registrar (`ForestLothDB.enforceInvariants`, rama trozado):
 * lo trozado del árbol más estas trozas no puede pasar de su tala. `null` =
 * entra, o el árbol no tiene tala (T4 no mide). Es una vista previa: el
 * servidor vuelve a sumar bajo candado.
 */
export function excesoDeLaTala(
  a: Pick<ArbolParaTroza, "treeCode" | "talaM3" | "trozadoM3">,
  nuevoM3: number,
): string | null {
  if (a.talaM3 == null || r4(a.trozadoM3 + nuevoM3) <= r4(a.talaM3)) return null;
  return `El árbol ${a.treeCode} se taló con ${m3(a.talaM3)} m³ y ya tiene ${m3(a.trozadoM3)} m³ trozados: estas trozas suman ${m3(nuevoM3)} m³ y pasan lo tumbado.`;
}
