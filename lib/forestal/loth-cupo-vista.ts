/**
 * Cupo por especie, escrito para la vista «Por árbol»: el texto de la celda de
 * la tabla «En pie» y la línea de alerta del «Avance del permiso».
 *
 * Puro y client-safe. La cuenta vive en `loth-cupo-especie`; acá sólo se decide
 * cómo se dice. Medido el 30-09 en Blas: Tornillo 9,537 de 320 m³ (3 %, en
 * regla) con 2 árboles censados de 45 autorizados; Copaiba sin autorizado →
 * cupo del censo 126,9, talado 10,37 (8 %).
 */

import { fmtM3, fmtPct } from "./cubicacion-formato";
import type { CupoEspecie, VeredictoCupo } from "./loth-cupo-especie";

/** El texto del veredicto: el color solo no le dice nada a quien no distingue rojo de verde. */
export function etiquetaVeredicto(f: CupoEspecie): string {
  if (f.veredicto === "excedido") return `Excedido +${fmtM3(f.excesoM3)} m³`;
  if (f.veredicto === "cerca") return "Cerca del cupo";
  if (f.veredicto === "ok") return "En regla";
  return f.arbolesTalados > 0 ? "Talada sin cupo" : "Sin cupo";
}

/** «3 %»; menos de 1 % lo dice («<1 %») en vez de redondear a 0. */
export function pctCorto(pct: number): string {
  if (pct > 0 && pct < 1) return "<1 %";
  return `${Math.round(pct).toLocaleString("es-PE")} %`;
}

export interface CupoEnPieTexto {
  /** «9,537 de 320,000 m³ · 3 %» (sin porcentaje si no hay cupo). */
  medida: string;
  veredicto: VeredictoCupo;
  etiqueta: string;
  /** De dónde sale el cupo: «autorizado» / «del censo». `null` sin cupo. */
  fuente: string | null;
  /** Dato, no alarma: «2 de 45 árboles en el censo». `null` si no hay faltante. */
  censo: string | null;
}

export function textoCupoEnPie(f: CupoEspecie): CupoEnPieTexto {
  const medida =
    f.cupoM3 == null
      ? `${fmtM3(f.taladoM3)} m³ talados, sin cupo`
      : `${fmtM3(f.taladoM3)} de ${fmtM3(f.cupoM3)} m³${f.pctUsado != null ? ` · ${pctCorto(f.pctUsado)}` : ""}`;
  const faltanEnCenso = f.arbolesAutorizados != null && f.arbolesCensados < f.arbolesAutorizados;
  return {
    medida,
    veredicto: f.veredicto,
    etiqueta: etiquetaVeredicto(f),
    fuente: f.fuente === "autorizado" ? "autorizado" : f.fuente === "censo" ? "del censo" : null,
    censo: faltanEnCenso ? `${f.arbolesCensados} de ${f.arbolesAutorizados} ${f.arbolesAutorizados === 1 ? "árbol" : "árboles"} en el censo` : null,
  };
}

export interface AlertaCupo {
  especie: string;
  veredicto: "excedido" | "cerca";
  /** «+3,337 m³» o «92 %». */
  detalle: string;
}

/** Las especies excedidas o cerca del cupo, las excedidas primero. */
export function alertasDeCupo(filas: readonly CupoEspecie[]): AlertaCupo[] {
  const alerta = (f: CupoEspecie, veredicto: "excedido" | "cerca"): AlertaCupo => ({
    especie: f.especie,
    veredicto,
    detalle: veredicto === "excedido" ? `+${fmtM3(f.excesoM3)} m³` : `${fmtPct(f.pctUsado ?? 0)} %`,
  });
  return [
    ...filas.filter((f) => f.veredicto === "excedido").map((f) => alerta(f, "excedido")),
    ...filas.filter((f) => f.veredicto === "cerca").map((f) => alerta(f, "cerca")),
  ];
}

export interface TalaConPlan {
  treeCode: string | null;
  /** Plan al que se asentó la línea; `null`/ausente = línea vieja sin plan. */
  planId?: string | null;
}

/**
 * De las talas vivas del libro, las que cuentan contra el cupo del plan cuyo
 * censo se usa. Con dos planes vivos (Blas, 30-09: uno con 65 árboles y otro
 * con 2 de Tornillo), una tala de Copaiba del primero no puede gastar el cupo
 * del segundo.
 *
 * - línea asentada a OTRO plan → `fuera`;
 * - si no, cuenta sólo si su código está en el censo de este plan;
 * - sin código, o con código que el censo no tiene → `fuera` («fuera del
 *   censo»): se cuenta aparte, nunca contra el cupo de otro plan.
 */
export function talasDelPlan<T extends TalaConPlan>(
  talas: readonly T[],
  codigosCenso: ReadonlySet<string>,
  planIdActivo: string | null,
): { delPlan: T[]; fuera: T[] } {
  const delPlan: T[] = [];
  const fuera: T[] = [];
  for (const t of talas) {
    const code = t.treeCode?.trim();
    const otroPlan = t.planId != null && planIdActivo != null && t.planId !== planIdActivo;
    (!otroPlan && code && codigosCenso.has(code) ? delPlan : fuera).push(t);
  }
  return { delPlan, fuera };
}
