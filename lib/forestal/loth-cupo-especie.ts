/**
 * Cupo por especie del Libro TH: cuánto se puede talar de cada especie y
 * cuánto ya se taló.
 *
 * Medido el 30-09 en Blas: el Tornillo tenía 2 árboles censados con 6,2 m³
 * estimados y se talaron los dos con 9,537 m³ — 154 % de lo censado — sin que
 * ninguna pantalla lo dijera. `restanteDeEspecie` (loth-restante) ya restaba el
 * censo del talado para la ficha de UN árbol, y `computeBalance`
 * (loth-constants) compara lo AUTORIZADO contra lo MOVILIZADO por guía; ninguno
 * de los dos decía «esta especie ya se pasó de lo que se podía talar».
 *
 * **Cuál es el cupo.** Si el plan aprobado trae un volumen autorizado para la
 * especie (`ForestPlanSpecies.volumenAutorizadoM3`), ése es el cupo: es lo que
 * dice la resolución. Si no, el cupo es lo censado (`ForestCensusTree`), que es
 * la mejor referencia que queda. Cada fila dice cuál usó (`fuente`), porque «de
 * lo autorizado» y «de lo censado» no pesan igual ante la ARFFS.
 *
 * **Tolerancia con la unidad del negocio**: 0,01 m³ (10 litros). La cinta del
 * monte no mide más fino; pasarse por 0,0001 no es un exceso, es un redondeo.
 *
 * Puro y client-safe: el formulario lo usa para avisar antes de guardar, la
 * ruta lo usa para decidir (el cliente no decide), y los tests lo prueban solo.
 */

import { fmtM3 } from "./cubicacion-formato";
import type { ArbolParaElegir } from "./loth-censo-uso";
import { claveEspecie } from "./loth-constants";
import { talasDelPlan, type TalaConPlan } from "./loth-cupo-vista";

/** Pasarse de esto no es un exceso: es la cinta (10 litros). */
export const TOLERANCIA_CUPO_M3 = 0.01;

/** Desde este % de uso la especie está «cerca» de su cupo. */
export const UMBRAL_CERCA_PCT = 90;

/** Largo mínimo del motivo para registrar una tala por encima del cupo. */
export const MOTIVO_CUPO_MIN = 5;

// ─── Entradas ────────────────────────────────────────────────────────────────

export interface ArbolCensoCupo {
  treeCode: string;
  speciesCommon: string;
  volumenEstimadoM3: number | string | null;
}

export interface TalaCupo {
  treeCode: string | null;
  /** Si viene vacía se toma la del árbol en el censo. */
  speciesCommon: string | null;
  volumeM3: number | string | null;
}

export interface EspecieAutorizadaCupo {
  speciesCommon: string;
  volumenAutorizadoM3?: number | string | null;
  arbolesAutorizados?: number | null;
}

export interface EntradaCupo {
  censo: readonly ArbolCensoCupo[];
  /** Las talas vivas del libro (registradas, sin anular) del mismo plan. */
  talas: readonly TalaCupo[];
  autorizadas?: readonly EspecieAutorizadaCupo[];
  /**
   * Sólo se mide contra el cupo lo que está en el censo: una tala nueva con un
   * código que el censo no tiene no se juzga acá (igual que `talasDelPlan`).
   */
  soloCenso?: boolean;
}

/**
 * La entrada desde el censo YA cruzado con el libro (`prepararArboles`), que es
 * lo que tiene cargado el formulario de tala: cada árbol trae su tala (si la
 * hay) en `uso.tala`. Las talas de códigos que no están en el censo no llegan
 * por acá: para el aviso previo alcanza, y la ruta —que decide— las cuenta.
 */
export function entradaDesdeCensoCruzado(
  arboles: readonly Pick<ArbolParaElegir, "treeCode" | "speciesCommon" | "volM3" | "uso">[],
  autorizadas: readonly EspecieAutorizadaCupo[] = [],
): EntradaCupo {
  return {
    censo: arboles.map((a) => ({ treeCode: a.treeCode, speciesCommon: a.speciesCommon, volumenEstimadoM3: a.volM3 })),
    talas: arboles
      .filter((a) => a.uso?.tala)
      .map((a) => ({ treeCode: a.treeCode, speciesCommon: a.speciesCommon, volumeM3: a.uso?.tala?.volumeM3 ?? null })),
    autorizadas,
    soloCenso: true,
  };
}

/**
 * La entrada tal como la arma el SERVIDOR: las talas del libro pasan por
 * `talasDelPlan` (loth-cupo-vista) — cuentan sólo las de un código del censo de
 * este plan y no asentadas a otro plan. Las de afuera no suman contra el cupo:
 * la vista las muestra aparte, y la ruta no puede medir distinto que la vista.
 */
export function entradaDelPlan(
  planId: string,
  censo: readonly ArbolCensoCupo[],
  talas: readonly (TalaCupo & TalaConPlan)[],
  autorizadas: readonly EspecieAutorizadaCupo[],
): EntradaCupo {
  const codigos = new Set(censo.map((c) => c.treeCode.trim()));
  return { censo, talas: talasDelPlan(talas, codigos, planId).delPlan, autorizadas, soloCenso: true };
}

// ─── Salida ──────────────────────────────────────────────────────────────────

export type FuenteCupo = "autorizado" | "censo";

/**
 * - `ok`: por debajo del 90 %.
 * - `cerca`: 90 % o más, sin pasarse.
 * - `excedido`: talado > cupo + 0,01 m³.
 * - `sin_cupo`: ni autorizado ni censado con volumen: no hay contra qué medir.
 */
export type VeredictoCupo = "ok" | "cerca" | "excedido" | "sin_cupo";

export interface CupoEspecie {
  /** Clave canónica (`claveEspecie`): cruza «Tornillo (Cedrelinga…)» con «Tornillo». */
  clave: string;
  especie: string;
  arbolesCensados: number;
  /** Talas de la especie en el libro (estén o no en el censo). */
  arbolesTalados: number;
  arbolesAutorizados: number | null;
  censadoM3: number;
  /** `null` = el plan no autoriza un volumen para esta especie. */
  autorizadoM3: number | null;
  /** Autorizado si existe, si no lo censado; `null` si no hay ninguno. */
  cupoM3: number | null;
  fuente: FuenteCupo | null;
  taladoM3: number;
  /** cupo − talado; negativo = exceso. `null` sin cupo. */
  restanteM3: number | null;
  /** Cuánto se pasó; 0 si no está excedida. */
  excesoM3: number;
  /** talado / cupo × 100, con un decimal. `null` sin cupo. */
  pctUsado: number | null;
  /** Talas sin volumen: cuentan como árbol, no suman m³. */
  talasSinVolumen: number;
  veredicto: VeredictoCupo;
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

const num = (v: number | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

interface Acum {
  especie: string;
  arbolesCensados: number;
  censado: number;
  talados: number;
  talado: number;
  sinVolumen: number;
  autorizado: number | null;
  arbolesAutorizados: number | null;
}

function veredictoDe(cupo: number | null, talado: number, pct: number | null): VeredictoCupo {
  if (cupo == null || pct == null) return "sin_cupo";
  if (talado > cupo + TOLERANCIA_CUPO_M3) return "excedido";
  if (pct >= UMBRAL_CERCA_PCT) return "cerca";
  return "ok";
}

/**
 * El cupo de cada especie: autorizadas del plan ∪ censadas ∪ taladas.
 * Sin orden: para mostrar, `ordenarCupos`.
 */
export function cupoPorEspecie(entrada: EntradaCupo): CupoEspecie[] {
  const porClave = new Map<string, Acum>();
  const acum = (nombre: string): Acum | null => {
    const k = claveEspecie(nombre);
    if (!k) return null;
    let a = porClave.get(k);
    if (!a) {
      a = { especie: nombre.trim(), arbolesCensados: 0, censado: 0, talados: 0, talado: 0, sinVolumen: 0, autorizado: null, arbolesAutorizados: null };
      porClave.set(k, a);
    }
    return a;
  };

  /* El nombre que se muestra es el del plan cuando lo hay (es el de la
     resolución), si no el del censo. */
  for (const s of entrada.autorizadas ?? []) {
    const a = acum(s.speciesCommon);
    if (!a) continue;
    a.especie = s.speciesCommon.replace(/\s*\([^)]*\)\s*/g, " ").trim() || a.especie;
    const v = num(s.volumenAutorizadoM3);
    if (v != null && v > 0) a.autorizado = (a.autorizado ?? 0) + v;
    if (s.arbolesAutorizados != null) a.arbolesAutorizados = (a.arbolesAutorizados ?? 0) + s.arbolesAutorizados;
  }

  const especieDelArbol = new Map<string, string>();
  for (const t of entrada.censo) {
    const a = acum(t.speciesCommon);
    if (!a) continue;
    especieDelArbol.set(t.treeCode.trim(), t.speciesCommon);
    a.arbolesCensados += 1;
    a.censado += num(t.volumenEstimadoM3) ?? 0;
  }

  for (const l of entrada.talas) {
    const nombre = l.speciesCommon?.trim() || (l.treeCode ? especieDelArbol.get(l.treeCode.trim()) : undefined);
    if (!nombre) continue;
    const a = acum(nombre);
    if (!a) continue;
    a.talados += 1;
    const v = num(l.volumeM3);
    if (v == null || v <= 0) a.sinVolumen += 1;
    else a.talado += v;
  }

  const filas: CupoEspecie[] = [];
  for (const [clave, a] of porClave) {
    const censado = r4(a.censado);
    const talado = r4(a.talado);
    const autorizado = a.autorizado != null ? r4(a.autorizado) : null;
    const fuente: FuenteCupo | null = autorizado != null ? "autorizado" : censado > 0 ? "censo" : null;
    const cupo = fuente === "autorizado" ? autorizado : fuente === "censo" ? censado : null;
    const pct = cupo != null && cupo > 0 ? Math.round((talado / cupo) * 1000) / 10 : null;
    const veredicto = veredictoDe(cupo, talado, pct);
    filas.push({
      clave,
      especie: a.especie,
      arbolesCensados: a.arbolesCensados,
      arbolesTalados: a.talados,
      arbolesAutorizados: a.arbolesAutorizados,
      censadoM3: censado,
      autorizadoM3: autorizado,
      cupoM3: cupo,
      fuente,
      taladoM3: talado,
      restanteM3: cupo != null ? r4(cupo - talado) : null,
      excesoM3: veredicto === "excedido" && cupo != null ? r4(talado - cupo) : 0,
      pctUsado: pct,
      talasSinVolumen: a.sinVolumen,
      veredicto,
    });
  }
  return filas;
}

/**
 * Lo que tiene que mirarse primero, primero: excedidas, taladas sin cupo,
 * cerca, en regla; y las que no tienen ni cupo ni tala, al final. Dentro de
 * cada grupo, la de mayor % arriba; a igualdad, por nombre.
 */
export function ordenarCupos(filas: readonly CupoEspecie[]): CupoEspecie[] {
  const rango = (f: CupoEspecie): number =>
    f.veredicto === "excedido" ? 0 : f.veredicto === "sin_cupo" && f.arbolesTalados > 0 ? 1 : f.veredicto === "cerca" ? 2 : f.veredicto === "ok" ? 3 : 4;
  return [...filas].sort(
    (a, b) =>
      rango(a) - rango(b) ||
      (b.pctUsado ?? -1) - (a.pctUsado ?? -1) ||
      b.taladoM3 - a.taladoM3 ||
      a.especie.localeCompare(b.especie, "es"),
  );
}

export interface TotalesCupo {
  especies: number;
  excedidas: number;
  cerca: number;
  censadoM3: number;
  taladoM3: number;
}

export function totalesCupo(filas: readonly CupoEspecie[]): TotalesCupo {
  return {
    especies: filas.length,
    excedidas: filas.filter((f) => f.veredicto === "excedido").length,
    cerca: filas.filter((f) => f.veredicto === "cerca").length,
    censadoM3: r4(filas.reduce((s, f) => s + f.censadoM3, 0)),
    taladoM3: r4(filas.reduce((s, f) => s + f.taladoM3, 0)),
  };
}

// ─── Al registrar una tala ───────────────────────────────────────────────────

/** «de lo censado» / «de lo autorizado»: el texto dice contra qué se mide. */
export function deLoQue(fuente: FuenteCupo): string {
  return fuente === "autorizado" ? "de lo autorizado en el plan" : "de lo censado";
}

/** «154 %»: el entero es lo que se lee de un vistazo; el decimal va en la tabla. */
export const pctEntero = (pct: number): string => `${Math.round(pct).toLocaleString("es-PE")} %`;

export interface AvisoCupo {
  especie: string;
  fuente: FuenteCupo;
  cupoM3: number;
  taladoAntesM3: number;
  taladoConEsteM3: number;
  pctConEste: number;
  excesoM3: number;
  /** La especie ya estaba pasada antes de este árbol. */
  yaExcedida: boolean;
  /**
   * Sólo contra lo AUTORIZADO se exige motivo (422 sin él). Contra el censo es
   * un aviso: el censo puede estar incompleto (Blas, 30-09: Tornillo con 2 de
   * 45 árboles autorizados censados), y frenar ahí rompería el importador.
   */
  exigeMotivo: boolean;
  /** El texto que se muestra antes de guardar (y que devuelve la ruta). */
  mensaje: string;
}

export interface TalaNueva {
  treeCode: string | null;
  speciesCommon: string | null;
  volumeM3: number | string | null;
}

/**
 * ¿Esta tala deja a su especie por encima del cupo? `null` si no (o si no hay
 * cupo contra el cual medir: eso lo avisa T7/«fuera del plan», no esto).
 *
 * Si el árbol ya tiene una tala en `entrada.talas` (se está corrigiendo), la
 * medida nueva la reemplaza: el mismo árbol no cuenta dos veces.
 */
export function avisoCupoAlTalar(entrada: EntradaCupo, nueva: TalaNueva): AvisoCupo | null {
  const vol = num(nueva.volumeM3);
  if (vol == null || vol <= 0) return null;
  const code = nueva.treeCode?.trim() || null;
  if (entrada.soloCenso && (!code || !entrada.censo.some((t) => t.treeCode.trim() === code))) return null;
  const nombre =
    nueva.speciesCommon?.trim() || (code ? entrada.censo.find((t) => t.treeCode.trim() === code)?.speciesCommon : undefined) || "";
  const clave = claveEspecie(nombre);
  if (!clave) return null;

  const otras = code ? entrada.talas.filter((t) => t.treeCode?.trim() !== code) : entrada.talas;
  const antes = cupoPorEspecie({ ...entrada, talas: otras }).find((f) => f.clave === clave);
  const despues = cupoPorEspecie({ ...entrada, talas: [...otras, { treeCode: code, speciesCommon: nombre, volumeM3: vol }] }).find(
    (f) => f.clave === clave,
  );
  if (!despues || despues.veredicto !== "excedido" || despues.cupoM3 == null || despues.fuente == null || despues.pctUsado == null) {
    return null;
  }

  const yaExcedida = antes?.veredicto === "excedido";
  const cupo = despues.cupoM3;
  const de = deLoQue(despues.fuente);
  const conEste = `${fmtM3(despues.taladoM3)} de ${fmtM3(cupo)} m³`;
  const mensaje = yaExcedida
    ? `${despues.especie} ya estaba por encima ${de} (${fmtM3(antes?.taladoM3 ?? 0)} de ${fmtM3(cupo)} m³); con este árbol llega a ${pctEntero(despues.pctUsado)} (${conEste}).`
    : `Con este árbol, ${despues.especie} llega a ${pctEntero(despues.pctUsado)} ${de} (${conEste}).`;

  return {
    especie: despues.especie,
    fuente: despues.fuente,
    cupoM3: cupo,
    taladoAntesM3: antes?.taladoM3 ?? 0,
    taladoConEsteM3: despues.taladoM3,
    pctConEste: despues.pctUsado,
    excesoM3: despues.excesoM3,
    yaExcedida,
    exigeMotivo: despues.fuente === "autorizado",
    mensaje,
  };
}

/** ¿Alcanza el motivo? Mismo criterio en el formulario y en la ruta. */
export const motivoCupoValido = (motivo: string | null | undefined): boolean => (motivo ?? "").trim().length >= MOTIVO_CUPO_MIN;

/**
 * Lo que queda escrito en las observaciones de la línea: la excepción se lee de
 * una en el libro (y en el export a la ARFFS), igual que la del DMC.
 */
export function notaSobreCupo(aviso: AvisoCupo, motivo: string): string {
  return `[Tala sobre el cupo: ${aviso.especie} ${pctEntero(aviso.pctConEste)} ${deLoQue(aviso.fuente)} (${fmtM3(aviso.taladoConEsteM3)} de ${fmtM3(aviso.cupoM3)} m³). Motivo: ${motivo.trim()}]`;
}
