/**
 * T9 (cupo de la especie) en la VISTA PREVIA de «Importar guías ya
 * despachadas» (ADR-461, 04-10).
 *
 * La importación mide cada tala que escribe —las nuevas con
 * `ForestLothDB.registrarLineaEnTx`, las que se agrandan con
 * `cupoAlAmpliarTalaEnTx`— y sobre lo AUTORIZADO sin motivo rechaza la guía.
 * Acá se repite ESA medición sin escribir: la misma lectura del plan
 * (`ForestLothDB.entradaCupoDelPlan`, que el servidor pasa como `EntradaCupo`)
 * y la misma función pura (`avisoCupoAlTalar`), tala por tala y en el mismo
 * orden (las nuevas primero), cada una viendo lo que dejaron las anteriores.
 * Nada de la regla se copia: si T9 cambia, cambia en los dos lados.
 *
 * Lo que replica de la escritura (para que «lo que avisa» = «lo que rechaza»):
 *  - nueva: se mide con la especie del CENSO del árbol (`especieDelCensoEnTx`)
 *    y la fila nueva queda con esa especie;
 *  - ampliar: sólo si CRECE (`despues > antes`), con la especie del censo; la
 *    fila conserva su nombre y sólo cambia el volumen (el `update`);
 *  - sólo cuentan los árboles del censo del plan (`talasDelPlan`): lo de afuera
 *    ni se mide ni suma.
 *
 * PURO y client-safe.
 */
import { fmtM3 } from "./cubicacion-formato";
import { avisoCupoAlTalar, type AvisoCupo, type EntradaCupo, type TalaCupo } from "./loth-cupo-especie";
import { claveEspecie } from "./loth-constants";
import type { SobreCupoDeLaGuia, TalaReferencial } from "./loth-importar-guia-tipos";

export interface CupoDeLaGuia {
  /** Una fila por especie que la guía deja por encima de su cupo (lo último medido). */
  sobreCupo: SobreCupoDeLaGuia[];
  /** La entrada con lo que la guía escribe: la mide la guía siguiente de la tanda. */
  despues: EntradaCupo;
}

/** «Tornillo: 8,000 de 7,000 m³ autorizados — exceso 1,000 m³». */
function filaDe(a: AvisoCupo): SobreCupoDeLaGuia {
  return {
    especie: a.especie,
    fuente: a.fuente,
    cupoM3: a.cupoM3,
    totalConLaGuiaM3: a.taladoConEsteM3,
    excesoM3: a.excesoM3,
    pct: a.pctConEste,
    exigeMotivo: a.exigeMotivo,
    mensaje: `${a.especie}: ${fmtM3(a.taladoConEsteM3)} de ${fmtM3(a.cupoM3)} m³ ${a.fuente === "autorizado" ? "autorizados" : "censados"} — exceso ${fmtM3(a.excesoM3)} m³`,
  };
}

/**
 * Lo que la guía deja por encima del cupo, midiendo `escritas` (lo que
 * devuelve `talasAEscribir` con el interruptor como esté) contra `entrada`.
 */
export function cupoDeLaGuia(entrada: EntradaCupo, escritas: readonly TalaReferencial[]): CupoDeLaGuia {
  const especieDelCenso = new Map(entrada.censo.map((c) => [c.treeCode.trim(), c.speciesCommon]));
  let talas: TalaCupo[] = [...entrada.talas];
  const porEspecie = new Map<string, AvisoCupo>();
  /* El orden de `importarGuia`: las nuevas antes que las ampliadas. */
  const orden = [...escritas.filter((t) => t.estado === "nueva"), ...escritas.filter((t) => t.estado === "ampliar")];
  for (const t of orden) {
    const code = t.treeCode.trim();
    const censo = especieDelCenso.get(code);
    const vol = t.volumeM3;
    const crece = t.estado === "nueva" || (vol != null && vol > (t.talaExistente?.volumeM3 ?? 0));
    if (crece) {
      const aviso = avisoCupoAlTalar({ ...entrada, talas }, { treeCode: code, speciesCommon: censo ?? t.speciesCommon, volumeM3: vol });
      if (aviso) porEspecie.set(claveEspecie(aviso.especie), aviso);
    }
    /* Lo que deja escrito (sólo de un árbol del censo: lo de afuera no suma). */
    if (censo === undefined) continue;
    const i = talas.findIndex((x) => x.treeCode?.trim() === code);
    /* El `update` de una ampliada; si su fila no está (la armaba otra guía de
       la tanda que no va), el servidor la crea: se suma como nueva. */
    if (t.estado !== "nueva" && i >= 0) talas = talas.map((x, j) => (j === i ? { ...x, volumeM3: vol } : x));
    else talas = [...talas, { treeCode: code, speciesCommon: censo, volumeM3: vol }];
  }
  return { sobreCupo: [...porEspecie.values()].map(filaDe), despues: { ...entrada, talas } };
}

/** Las filas que piden motivo (contra lo AUTORIZADO): sin él, la guía no entra. */
export const sobreCupoConMotivo = (filas: readonly SobreCupoDeLaGuia[] | null | undefined): SobreCupoDeLaGuia[] =>
  (filas ?? []).filter((f) => f.exigeMotivo);
