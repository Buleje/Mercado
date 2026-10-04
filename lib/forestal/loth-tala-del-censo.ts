/**
 * La tala de un árbol del censo se asienta con la especie y el plan DEL CENSO,
 * no con lo que mandó el navegador (auditoría de seguridad T9, 30-09).
 *
 * Antes, `speciesCommon: "Tornilo"` sobre el 002-TOR (Tornillo) caía en una
 * especie sin cupo: 201 sin motivo ni auditoría, y el libro quedaba con otra
 * especie que la del censo. Y un `planId` de otro plan dejaba el censo vacío:
 * no se medía nada.
 *
 * Reglas (puras; la DB class las aplica con lo que lee de la base):
 *  - Código que NO está en ningún censo del tenant → código libre: queda lo que
 *    se mandó (el libro admite códigos libres; el cupo no los mide).
 *  - Con `planId`: el árbol tiene que estar en el censo de ESE plan; si está
 *    sólo en el de otro → 422.
 *  - Sin `planId`: se toma el plan del árbol; si el código está en el censo de
 *    dos planes, no se adivina → 422 pidiendo elegir el plan.
 *  - Especie: la del censo. Si el cliente mandó otra (tras `claveEspecie`,
 *    que ignora mayúsculas, tildes y el científico entre paréntesis) → 422.
 */
import { claveEspecie } from "./loth-constants";

export interface ArbolCensoDePlan {
  planId: string;
  speciesCommon: string;
  speciesScientific: string | null;
}

export interface TalaPedida {
  treeCode: string | null;
  planId: string | null;
  speciesCommon: string | null;
  speciesScientific: string | null;
}

export type CodigoTalaCenso = "TALA_PLAN_DISTINTO_AL_CENSO" | "TALA_ARBOL_EN_VARIOS_PLANES" | "TALA_ESPECIE_DISTINTA_AL_CENSO";

export type TalaResuelta =
  | { ok: true; delCenso: boolean; planId: string | null; speciesCommon: string | null; speciesScientific: string | null }
  | { ok: false; code: CodigoTalaCenso; mensaje: string; detail: Record<string, unknown> };

/**
 * @param arboles los árboles VIVOS del censo del tenant con ese código (de
 *   cualquier plan), ordenados de forma estable (por id).
 */
export function resolverTalaContraCenso(tala: TalaPedida, arboles: readonly ArbolCensoDePlan[]): TalaResuelta {
  const treeCode = tala.treeCode?.trim() || null;
  const libre = { ok: true as const, delCenso: false, planId: tala.planId, speciesCommon: tala.speciesCommon, speciesScientific: tala.speciesScientific };
  if (!treeCode || arboles.length === 0) return libre;

  let arbol: ArbolCensoDePlan | undefined;
  if (tala.planId) {
    arbol = arboles.find((a) => a.planId === tala.planId);
    if (!arbol) {
      return {
        ok: false,
        code: "TALA_PLAN_DISTINTO_AL_CENSO",
        mensaje: `El árbol ${treeCode} no está en el censo del plan elegido: está censado en otro plan. Elige el plan del árbol.`,
        detail: { treeCode, planId: tala.planId, planesDelArbol: [...new Set(arboles.map((a) => a.planId))] },
      };
    }
  } else {
    const planes = [...new Set(arboles.map((a) => a.planId))];
    if (planes.length > 1) {
      return {
        ok: false,
        code: "TALA_ARBOL_EN_VARIOS_PLANES",
        mensaje: `El código ${treeCode} está en el censo de ${planes.length} planes. Elige a qué plan pertenece esta tala.`,
        detail: { treeCode, planesDelArbol: planes },
      };
    }
    arbol = arboles[0];
  }
  if (!arbol) return libre;

  const pedida = tala.speciesCommon?.trim() || "";
  if (pedida && claveEspecie(pedida) !== claveEspecie(arbol.speciesCommon)) {
    return {
      ok: false,
      code: "TALA_ESPECIE_DISTINTA_AL_CENSO",
      mensaje: `El árbol ${treeCode} es ${arbol.speciesCommon} en el censo, no ${pedida}. La tala se registra con la especie del censo; si el censo está mal, corrígelo primero.`,
      detail: { treeCode, especieCenso: arbol.speciesCommon, especieEnviada: pedida },
    };
  }
  return {
    ok: true,
    delCenso: true,
    planId: arbol.planId,
    speciesCommon: arbol.speciesCommon,
    speciesScientific: arbol.speciesScientific?.trim() || tala.speciesScientific,
  };
}
