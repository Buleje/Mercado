/**
 * loth-talonario — el N° de la guía del bosque y de su lista, POR TITULAR
 * (Brandon 29-09-2026: «N° de GTF correlativo por región»).
 *
 * Los talonarios son del titular. Medido en la base de Blas: la Ficha del CTP
 * va por 054…064 en 19-001 mientras la C.N. Santa Rosa de Chivis usó
 * 019-001-0000003/4 el mismo mes, y Quinchunlla el 019-001-0000013. Dos
 * titulares pueden tener, legítimamente, el MISMO N°. Por eso:
 *
 *   · la propuesta es el máximo + 1 de lo que usó ESTE titular;
 *   · un N° repetido BLOQUEA sólo si es del mismo titular (o si de un lado no
 *     se sabe el titular: por las dudas);
 *   · el mismo N° en una guía de OTRO titular es un aviso, no un freno.
 *
 * El titular se compara primero por el título habilitante y después por el
 * nombre con tolerancia («CCNN SAN LUIS DE CHINCHIGUANI» es la «COMUNIDAD
 * NATIVA SAN LUIS DE CHINCHIHUANI» que publica SERFOR).
 *
 * PURO: lo usan el modal, el endpoint y la transacción que registra.
 */

import {
  GTF_DIGITOS_DEFAULT,
  claveNumeroGtf,
  correlativoEnSerie,
  mismoNumeroGtf,
  proponerGtf,
  saltoDeCorrelativo,
  type GtfUsada,
  type PropuestaGtf,
} from "./gtf-talonario";
import { codigoRegionGtf, departamentoDeCodigo, regionDeNumero, serieDeCodigo, serieDelNumero, ubigeoDelPadron, type UbigeoPadron } from "./gtf-serie-region";
import { proponerListas, type PropuestaListas } from "./loth-lista-numero";
import { mismaPersona, palabrasDelTitular } from "./serfor-titular";

const txt = (v: string | null | undefined): string => (v ?? "").trim();

/**
 * El siguiente N° del talonario de guías del bosque cuando no se sabe la
 * región: la serie sale del último número de estas guías, y el correlativo es
 * el máximo + 1 de TODO lo usado en esa serie —anuladas incluidas, un número
 * que se usó no vuelve—, con la regla de tramos de `gtf-talonario`
 * (`019-0000001` ≡ `19-0000001`). Sin ninguna guía anterior: `null`.
 */
export function proponerGtfLoth(usadas: readonly GtfUsada[]): PropuestaGtf | null {
  const ultima = usadas.find((u) => /\d\s*-\s*\d+\s*$/.test(u.numero.trim()));
  if (!ultima) return null;
  const tramos = ultima.numero.trim().split(/\s*-\s*/);
  const serie = tramos.slice(0, -1).join("-");
  if (!serie || !correlativoEnSerie(ultima.numero, serie)) return null;
  return proponerGtf(serie, null, usadas);
}

// ── ¿Es el mismo titular? ───────────────────────────────────────────────────

/** Mismo título habilitante escrito distinto («19-SEC/REG-PLT-2021-017» / «19 SEC REG PLT 2021 017»). */
export function mismoPermiso(a: string | null | undefined, b: string | null | undefined): boolean {
  const n = (s: string | null | undefined) => txt(s).replace(/[^a-z0-9]/gi, "").toUpperCase();
  return n(a) !== "" && n(a) === n(b);
}

/** Letras de diferencia entre dos palabras (Levenshtein), cortando en `tope`. */
function distancia(a: string, b: string, tope: number): number {
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let menor = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      menor = Math.min(menor, cur[j]);
    }
    if (menor > tope) return tope + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Cuántas letras se le perdonan a una palabra: ninguna a las de menos de 7
 * («LUIS» ≠ «JUAN», «ROSA» ≠ «ROSITA», «MIGUEL» ≠ «MANUEL»), una desde 7, dos
 * desde 10. Es el tipeo de una letra en un nombre largo (G/H:
 * CHINCHIGUANI/CHINCHIHUANI).
 */
const tolerancia = (w: string): number => (w.length >= 10 ? 2 : w.length >= 7 ? 1 : 0);

/**
 * Palabras que no distinguen a nadie y que unos escriben y otros no:
 * «SANTA ROSA DE CHIVIS» es «SANTA ROSA CHIVIS» (revisión 29-09-2026).
 */
const VACIAS = new Set(["DE", "DEL", "LA", "LAS", "LOS", "EL", "Y"]);

/**
 * La única diferencia es la ÚLTIMA letra (cambiada, o una de más al final):
 * es el género —«FERNANDO»/«FERNANDA»—, dos personas, no un tipeo.
 */
function soloCambiaElFinal(a: string, b: string): boolean {
  if (a.length === b.length) return a.slice(0, -1) === b.slice(0, -1);
  const [corta, larga] = a.length < b.length ? [a, b] : [b, a];
  return larga.length === corta.length + 1 && larga.startsWith(corta);
}

/**
 * ¿Es el mismo titular escrito distinto? Primero la vara del alta desde SERFOR
 * (`mismaPersona`: las mismas palabras, sin relleno —COMUNIDAD, NATIVA, CCNN,
 * C.N., SAC, E.I.R.L.—, en cualquier orden). Si no, sin las palabras vacías
 * (DE, LA, Y…), las mismas palabras con 1-2 letras de diferencia en las de 7 o
 * más —salvo que sólo cambie la última: FERNANDO ≠ FERNANDA—, cada una contra
 * una distinta. Nunca «uno contiene al otro»: «PEREZ GARCIA JUAN» no es
 * «PEREZ GARCIA JUAN CARLOS».
 */
export function mismoTitular(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = txt(a);
  const y = txt(b);
  if (!x || !y) return false;
  if (mismaPersona(x, y)) return true;
  const pa = [...palabrasDelTitular(x)].filter((w) => !VACIAS.has(w));
  const pb = [...palabrasDelTitular(y)].filter((w) => !VACIAS.has(w));
  if (pa.length === 0 || pa.length !== pb.length) return false;
  const libres = new Set(pb.map((_, i) => i));
  let exactas = 0;
  for (const w of pa) {
    let hallada = -1;
    for (const i of libres) {
      if (pb[i] === w) {
        hallada = i;
        exactas += 1;
        break;
      }
    }
    if (hallada < 0) {
      for (const i of libres) {
        const t = Math.min(tolerancia(w), tolerancia(pb[i]));
        if (t > 0 && !soloCambiaElFinal(w, pb[i]) && distancia(w, pb[i], t) <= t) {
          hallada = i;
          break;
        }
      }
    }
    if (hallada < 0) return false;
    libres.delete(hallada);
  }
  // Al menos una palabra idéntica: dos nombres de una palabra cada uno no se unen por un tipeo.
  return exactas > 0;
}

// ── ¿Es la misma guía? (el N° solo no la identifica) ────────────────────────

/** De quién es una guía: su titular y su título habilitante. */
export interface IdentidadDeGuiaBuscada {
  titular?: string | null;
  permiso?: string | null;
}

/**
 * ¿Es del mismo dueño que la buscada? `true` = lo dice el permiso o el titular
 * (`mismoPermiso` / `mismoTitular`); `false` = los dos lados dicen algo
 * comparable y no coincide; `null` = no se puede saber (falta de un lado: lo
 * que falta no objeta, como en `mismaGuiaTh`).
 */
export function mismoDuenoDeGuia(a: IdentidadDeGuiaBuscada, b: IdentidadDeGuiaBuscada): boolean | null {
  if (mismoPermiso(a.permiso, b.permiso) || mismoTitular(a.titular, b.titular)) return true;
  const comparable = (txt(a.permiso) && txt(b.permiso)) || (txt(a.titular) && txt(b.titular));
  return comparable ? false : null;
}

/** ¿Puede ser de la buscada? Sin identidad buscada, cualquiera puede. */
export function puedeSerDelDueno(c: IdentidadDeGuiaBuscada, buscada: IdentidadDeGuiaBuscada | null | undefined): boolean {
  if (!buscada || (!txt(buscada.titular) && !txt(buscada.permiso))) return true;
  return mismoDuenoDeGuia(c, buscada) !== false;
}

export type EleccionDeGuia<T> =
  | { estado: "una"; guia: T }
  | { estado: "ninguna" }
  /** Dos o más guías de dueños distintos con el mismo N°, y no hay con qué elegir. */
  | { estado: "ambigua"; candidatas: T[] };

/**
 * Entre las guías con el mismo N° (ya comparado tramo a tramo), la de ESTE
 * dueño (regla de la memoria `numero-de-guia-tramo-a-tramo`, 29-09-2026: dos
 * titulares comparten la serie 019-001, y el N° solo no identifica la guía).
 *
 * Con identidad, se descartan las que dicen otro titular Y otro permiso; entre
 * las que quedan mandan las confirmadas. Sin identidad —o si quedan guías de
 * dueños distintos— con más de una: «ambigua». NUNCA la primera de la lista.
 * Varias del MISMO dueño son la misma guía (un ingreso por especie): vale la
 * primera, en el orden en que vinieron.
 */
export function elegirGuiaDelDueno<T>(
  candidatas: readonly T[],
  buscada: IdentidadDeGuiaBuscada | null | undefined,
  dueDe: (c: T) => IdentidadDeGuiaBuscada,
): EleccionDeGuia<T> {
  const sabe = Boolean(buscada && (txt(buscada.titular) || txt(buscada.permiso)));
  const posibles = candidatas.filter((c) => puedeSerDelDueno(dueDe(c), buscada));
  if (posibles.length === 0) return { estado: "ninguna" };
  const confirmadas = sabe && buscada ? posibles.filter((c) => mismoDuenoDeGuia(dueDe(c), buscada) === true) : [];
  const grupo = confirmadas.length ? confirmadas : posibles;
  const primera = grupo[0];
  const unaSola = grupo.every((c) => c === primera || mismoDuenoDeGuia(dueDe(c), dueDe(primera)) === true);
  return unaSola ? { estado: "una", guia: primera } : { estado: "ambigua", candidatas: grupo };
}

// ── De quién es cada N° ─────────────────────────────────────────────────────

/** Un N° ya usado, con de quién es (el N° solo no dice de qué talonario salió). */
export interface GtfUsadaLoth extends GtfUsada {
  titular?: string | null;
  /** Título habilitante que ampara la guía. */
  permiso?: string | null;
  /** Plan de manejo (sólo las guías de este Libro TH). */
  planId?: string | null;
  /** Lo que la guía dijo en el (35): «5, 6». */
  listas?: string | null;
}

/** De quién es el talonario: el titular del plan, su título y el plan. */
export interface DuenoDelTalonario {
  titular: string;
  permiso: string;
  planId: string | null;
}

type ConDueno = { titular?: string | null; permiso?: string | null; planId?: string | null };

/**
 * ¿Salió del talonario de este titular? Mismo plan, mismo título habilitante
 * o mismo titular escrito como sea (`mismoTitular`).
 */
export function esDelDueno(u: ConDueno, d: ConDueno): boolean {
  if (d.planId && u.planId === d.planId) return true;
  if (mismoPermiso(u.permiso, d.permiso)) return true;
  return mismoTitular(u.titular, d.titular);
}

/**
 * ¿Dos guías de ESTE libro con el mismo N° chocan? Sí si son del mismo
 * titular, y también si a una de las dos le falta el titular: no se puede
 * saber que son dos talonarios, y un N° repetido en el mismo talonario es la
 * misma madera declarada dos veces.
 */
export function chocanEnElLibro(nueva: ConDueno, existente: ConDueno): boolean {
  if (!txt(nueva.titular) || !txt(existente.titular)) return true;
  return esDelDueno(existente, nueva);
}

// ── El talonario del plan ───────────────────────────────────────────────────

export interface RegionDelPlan {
  /** `019`. */
  codigo: string;
  /** Como lo dice el padrón: `Pasco`. */
  departamento: string;
  /** El departamento se dedujo de una provincia o un distrito escrito en su lugar. */
  deducidoDe: UbigeoPadron["deducidoDe"];
}

export interface TalonarioDelPlan {
  region: RegionDelPlan | null;
  /** `019-001` (o `019` si el titular numera sin el tramo del medio). `null` = no hay de dónde sacarla. */
  serie: string | null;
  /** Dígitos del correlativo: los del último número de la serie, o 7. */
  digitos: number;
  /** El que sigue. `null` = el titular no tiene ninguna guía en esa serie: se pide el correlativo. */
  propuesta: PropuestaGtf | null;
  /** La última guía del titular FUERA de la serie (otra forma, otra región): se nombra, no se sigue. */
  fueraDeSerie: GtfUsadaLoth | null;
  /** Las guías de este titular (propuesta, listas, duplicados). */
  delDueno: GtfUsadaLoth[];
  /** Las de OTROS titulares: su N° no frena, pero se avisa si coincide. */
  ajenas: GtfUsadaLoth[];
}

/** El valor que más se repite (el primero si empatan: las usadas vienen de la más nueva a la más vieja). */
function masRepetido(valores: readonly string[]): string | null {
  const cuenta = new Map<string, number>();
  for (const v of valores) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  let mejor: string | null = null;
  for (const [v, n] of cuenta) if (mejor == null || n > (cuenta.get(mejor) ?? 0)) mejor = v;
  return mejor;
}

/**
 * El talonario de la guía, por PLAN: la región sale del plan de las trozas;
 * la serie, de los N° que ESTE titular ya usó en esa región (con el tramo del
 * medio o sin él, como los escribe él); si no usó ninguno, la de la región
 * (`serieDeCodigo`). El correlativo es el máximo + 1 de lo del titular en esa
 * serie —anuladas, guardadas e ingresos incluidos—, tramo a tramo.
 *
 * Sin ninguna guía del titular en la serie no se propone el 0000001: el
 * talonario ya viene impreso y la persona escribe el correlativo que tiene en
 * la mano. Sin región (el plan no dice el departamento) se sigue la serie del
 * último número del titular (`proponerGtfLoth`).
 */
export function talonarioDelPlan(
  x: { ubigeo: { departamento?: string | null; provincia?: string | null; distrito?: string | null }; dueno: DuenoDelTalonario },
  usadas: readonly GtfUsadaLoth[],
): TalonarioDelPlan {
  const delDueno = usadas.filter((u) => esDelDueno(u, x.dueno));
  const ajenas = usadas.filter((u) => !esDelDueno(u, x.dueno));
  const padron = ubigeoDelPadron(x.ubigeo);
  const codigo = padron.codigo ? codigoRegionGtf(padron.departamento) : null;
  if (!codigo) {
    const legado = proponerGtfLoth(delDueno);
    return {
      region: null,
      serie: legado?.serie ?? null,
      digitos: legado?.digitos ?? GTF_DIGITOS_DEFAULT,
      propuesta: legado,
      fueraDeSerie: null,
      delDueno,
      ajenas,
    };
  }
  const propias = delDueno.map((u) => serieDelNumero(u.numero, codigo)).filter((s): s is string => Boolean(s));
  const serie = masRepetido(propias) ?? serieDeCodigo(codigo, usadas.map((u) => u.numero));
  const enSerie = delDueno.filter((u) => correlativoEnSerie(u.numero, serie));
  const propuesta = enSerie.length ? proponerGtf(serie, null, enSerie) : null;
  return {
    region: { codigo, departamento: padron.departamento, deducidoDe: padron.deducidoDe },
    serie,
    digitos: propuesta?.digitos ?? GTF_DIGITOS_DEFAULT,
    propuesta,
    fueraDeSerie: propuesta ? null : (delDueno.find((u) => !correlativoEnSerie(u.numero, serie)) ?? null),
    delDueno,
    ajenas,
  };
}

// ── Qué se pregunta antes de grabar un N° ───────────────────────────────────

export interface RevisionNumero {
  /** El N° es de OTRA región que el plan (010 con un plan en Pasco). */
  otraRegion: { codigo: string; departamento: string | null } | null;
  /** Cuántos se adelanta al que sigue, si pasa del tope (`GTF_SALTO_MAX`). */
  salto: number | null;
  /** Una guía de ESTE libro y del mismo titular ya lleva ese N°: no se registra. */
  repetida: GtfUsadaLoth | null;
  /**
   * Una guía de SERFOR del mismo titular (guardada o ingresada) ya lleva ese N°:
   * no frena —puede ser la misma guía hecha a mano que ahora se asienta acá—,
   * pero se dice.
   */
  deSerfor: GtfUsadaLoth | null;
  /** Una guía de OTRO titular lleva ese N°: otro talonario, sólo se avisa. */
  deOtroTitular: GtfUsadaLoth | null;
}

const DEL_LIBRO = new Set<GtfUsada["fuente"]>(["despacho", "despacho_anulado"]);

/**
 * Lo que hay que preguntar antes de grabar un N°. La MISMA función en el modal
 * (avisa mientras se escribe) y en el servidor (frena o pide confirmar): un N°
 * grabado corre el talonario para siempre.
 */
export function revisarNumeroLoth(
  numero: string,
  t: Pick<TalonarioDelPlan, "region" | "serie" | "propuesta"> & Partial<Pick<TalonarioDelPlan, "delDueno" | "ajenas">>,
  dueno?: ConDueno,
): RevisionNumero {
  const region = regionDeNumero(numero);
  const otraRegion = t.region && region && region !== t.region.codigo ? { codigo: region, departamento: departamentoDeCodigo(region) } : null;
  const c = t.serie && t.propuesta ? correlativoEnSerie(numero, t.serie) : null;
  const iguales = (u: GtfUsadaLoth) => mismoNumeroGtf(u.numero, numero);
  const nuevo = dueno ?? {};
  const delLibro = [...(t.delDueno ?? []), ...(t.ajenas ?? [])].filter((u) => DEL_LIBRO.has(u.fuente) && iguales(u));
  return {
    otraRegion,
    salto: c && t.propuesta ? saltoDeCorrelativo(c.correlativo, t.propuesta) : null,
    repetida: delLibro.find((u) => chocanEnElLibro(nuevo, u)) ?? null,
    deSerfor: (t.delDueno ?? []).find((u) => !DEL_LIBRO.has(u.fuente) && iguales(u)) ?? null,
    deOtroTitular: (t.ajenas ?? []).find((u) => iguales(u) && txt(u.titular) && !chocanEnElLibro(nuevo, u)) ?? null,
  };
}

/** Cómo se pregunta por un N° de otra región. */
export function mensajeOtraRegion(numero: string, r: NonNullable<RevisionNumero["otraRegion"]>, plan: RegionDelPlan): string {
  return `El N° ${numero} es de ${r.departamento ?? "otra región"} (${r.codigo}) y el plan de estas trozas está en ${plan.departamento} (${plan.codigo}). ¿Es correcto?`;
}

/** Cómo se avisa que otro titular usó el mismo N°. */
export function avisoDeOtroTitular(u: GtfUsadaLoth): string {
  return `Ese N° también figura en una guía de ${txt(u.titular)}: es otro talonario, revisa que el papel sea el tuyo.`;
}

/** Los N° de lista de la guía nueva, siguiendo los que ya usó el titular. */
export function listasDelTalonario(t: Pick<TalonarioDelPlan, "delDueno">, trozas: number): PropuestaListas {
  return proponerListas({ usadas: t.delDueno.map((u) => u.listas), trozas });
}

// ── (36) GTF de origen ──────────────────────────────────────────────────────

/** Una guía del sistema que se puede citar como GTF de origen (36). */
export interface GuiaParaOrigen {
  numero: string;
  etiqueta: string;
}

/**
 * Las guías que el sistema conoce, para COPIAR el N° al (36) sin tipearlo:
 * las del Libro TH vigentes y las de SERFOR guardadas o ingresadas. Sin la
 * guía que se está haciendo y sin repetir la misma guía (N° tramo a tramo y
 * mismo titular) escrita dos veces.
 */
export function guiasParaOrigen(usadas: readonly GtfUsadaLoth[], excluir: string): GuiaParaOrigen[] {
  const vistas: GtfUsadaLoth[] = [];
  const fecha = (f?: string | null) => (f && /^\d{4}-\d{2}-\d{2}/.test(f) ? ` · ${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : "");
  return usadas
    .filter((u) => (u.fuente === "despacho" || u.fuente === "guardada" || u.fuente === "ingreso") && !mismoNumeroGtf(u.numero, excluir))
    .filter((u) => {
      if (!claveNumeroGtf(u.numero)) return false;
      if (vistas.some((v) => mismoNumeroGtf(v.numero, u.numero) && chocanEnElLibro(v, u))) return false;
      vistas.push(u);
      return true;
    })
    .map((u) => ({
      numero: u.numero,
      etiqueta: `${u.numero}${u.titular ? ` · ${u.titular}` : ""}${fecha(u.fecha)}${u.fuente === "despacho" ? "" : " · SERFOR"}`,
    }));
}
