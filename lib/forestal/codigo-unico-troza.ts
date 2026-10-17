/**
 * El código ÚNICO de una troza que entra al Libro TH desde una guía (ADR-477,
 * reemplaza §2 de ADR-474): SIEMPRE `<código en la guía>-<correlativo corto>`.
 *
 *   «12A» de la GTF 019-001-0000001 → «12A-0001»
 *   otro talonario con el mismo correlativo ya usó «12A-0001» → «12A-019/0001»
 *   y si también está tomado → «12A-019-001/0001»
 *
 * El código de la guía NO se guarda aparte en la línea del libro: se deriva
 * (`codigoDeLaGuia`), porque el sufijo es inequívoco (medido 08-10: 0 de 253
 * `trozaCode`, 0 de 43 codificaciones del CTP y 0 de 117 items de GTF terminan
 * así). Con el N° de la guía, además, sólo se parte si el correlativo (y la
 * serie) son los de ESA guía: un «100-2020» tipeado a mano no se parte.
 *
 * PURO y client-safe: lo usan la revisión del importador, los parsers del
 * árbol (`arbolDeTroza`, `arbolDeCodificacion`), el emparejado con la ficha
 * SERFOR y la migración de lo ya importado.
 */
import { tramosDe } from "./gtf-talonario";

/** = `z.string().max(60)` de `trozaCode` en /api/admin/forestal/loth. */
export const CODIGO_UNICO_MAX = 60;

export type NivelCodigoUnico = 1 | 2 | 3;

export interface CodigoUnicoPartido {
  /** «12A», «13/A (0000008)». */
  codigoGuia: string;
  /** `null` (nivel 1) · «019» (2) · «019-001» (3). */
  serie: string | null;
  /** «0001», «90002». */
  correlativo: string;
  nivel: NivelCodigoUnico;
}

const txt = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();

/** Sin ceros a la izquierda y rellenado a 4: «0000001» → «0001», «0090002» → «90002». */
const corto = (tramo: string): string => (/^\d+$/.test(tramo) ? tramo.replace(/^0+(?=\d)/, "").padStart(4, "0") : tramo);

/**
 * El correlativo corto del N° de la guía: el último tramo sin ceros a la
 * izquierda, mínimo 4 dígitos (crece: «…-0090002» → «90002»). Último tramo no
 * numérico → tal cual. Sin N° → `null`.
 */
export function correlativoCorto(gtfNumber: string | null | undefined): string | null {
  const t = tramosDe(gtfNumber);
  return t ? corto(t[t.length - 1]) : null;
}

/** Las series con que se desambigua: nivel 2 = 1.er tramo; nivel 3 = todos menos el último (≥ 3 tramos). */
function seriesDe(gtfNumber: string): { n2: string | null; n3: string | null } {
  const t = tramosDe(gtfNumber);
  if (!t || t.length < 2) return { n2: null, n3: null };
  return { n2: t[0], n3: t.length >= 3 ? t.slice(0, -1).join("-") : null };
}

const SUFIJO = /^(.+?)-(?:(\d{1,4}(?:-\d{1,4})?)\/)?(\d{4,7})$/;

/**
 * Parte un código único en el de la guía + serie + correlativo. Con
 * `gtfNumber`, sólo si el correlativo (y la serie, si hay) son los de ESA
 * guía. `null` = no es un código único (o no de esa guía).
 */
export function partirCodigoUnico(code: string, gtfNumber?: string | null): CodigoUnicoPartido | null {
  const c = txt(code);
  const m = SUFIJO.exec(c);
  if (!m) return null;
  const codigoGuia = txt(m[1]);
  if (!codigoGuia || !/[A-Za-z0-9]/.test(codigoGuia)) return null;
  const serie = m[2] ?? null;
  const correlativo = m[3];
  const nivel: NivelCodigoUnico = serie == null ? 1 : serie.includes("-") ? 3 : 2;
  if (txt(gtfNumber)) {
    if (correlativo !== correlativoCorto(gtfNumber)) return null;
    if (serie != null) {
      const { n2, n3 } = seriesDe(txt(gtfNumber));
      if (serie !== (nivel === 2 ? n2 : n3)) return null;
    }
  }
  return { codigoGuia, serie, correlativo, nivel };
}

/**
 * Los códigos únicos que se le pueden dar a una troza de la guía, en orden:
 * [N1, N2, N3] sin repetidos, sin los > `CODIGO_UNICO_MAX` y sólo los que
 * `partirCodigoUnico` devuelve al mismo código (un N° con tramos no numéricos
 * no da serie). `[]` si no hay N° o el código está vacío.
 */
export function candidatosCodigoUnico(codigoGuia: string, gtfNumber: string): string[] {
  const cod = txt(codigoGuia);
  const num = txt(gtfNumber);
  const corr = correlativoCorto(num);
  if (!cod || !corr) return [];
  const { n2, n3 } = seriesDe(num);
  const todos = [`${cod}-${corr}`, ...(n2 ? [`${cod}-${n2}/${corr}`] : []), ...(n3 ? [`${cod}-${n3}/${corr}`] : [])];
  return [...new Set(todos)].filter((c) => c.length <= CODIGO_UNICO_MAX && partirCodigoUnico(c, num)?.codigoGuia === cod);
}

/** El código impreso en la guía: sin el sufijo si lo tiene; si no, el mismo. */
export function codigoDeLaGuia(code: string, gtfNumber?: string | null): string {
  return partirCodigoUnico(code, gtfNumber)?.codigoGuia ?? txt(code);
}
