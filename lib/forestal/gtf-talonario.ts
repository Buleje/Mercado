/**
 * El talonario de la GTF de salida (ADR-446, punto 7).
 *
 * Qué pasó: la Ficha de Blas tenía la serie como `19-00000` y «Emitir GTF»
 * rellenaba el correlativo a 6 dígitos mirando sólo los despachos. Salieron
 * `19-00000-000001` y `-000002`, dos números que no existen en el talonario
 * real (`19-001-00000NN`, 7 dígitos), cuyo último usado —el 064— estaba en un
 * Anexo 04 guardado, no en un despacho.
 *
 * Tres reglas, todas acá (PURO y client-safe: el servidor decide con esto y la
 * pantalla muestra lo mismo):
 *
 * 1. **Un número se compara por tramos.** `019-001-0000064` y `19-001-0000064`
 *    son la misma guía: los ingresos se tipean con el cero del código de región
 *    y la Ficha sin él. Cada tramo numérico vale por su valor, no por sus ceros.
 * 2. **El siguiente es el máximo + 1 de TODO lo usado**: despachos vigentes,
 *    anulados (un número de talonario que se usó no vuelve) y los Anexos 04
 *    guardados. Nunca sólo de lo que el sistema numeró.
 * 3. **Cuántos dígitos** lleva el correlativo lo dice la Ficha; si no lo dice,
 *    los que ya tiene el último número de la serie; si la serie está virgen, 7.
 *    Así un libro que ya numeraba a 6 sigue a 6 sin que nadie toque nada.
 */

/** El talonario de SERFOR numera a 7 dígitos (`19-001-0000065`). */
export const GTF_DIGITOS_DEFAULT = 7;
/** Rango aceptado en la Ficha: fuera de esto es un tipeo, no un talonario. */
export const GTF_DIGITOS_MIN = 4;
export const GTF_DIGITOS_MAX = 10;

/**
 * Cuánto puede adelantarse el N° confirmado sobre el propuesto sin preguntar.
 *
 * Un número grabado corre el máximo PARA SIEMPRE (los usados no vuelven), así
 * que un tipeo —«650» o «1900165» cuando se propone 65— arruina el talonario
 * entero. 20 sale de Blas: 11 guías (054…064) entre el 07/08 y el 25/09, ~1,6
 * por semana; 20 números son unos 3 meses de guías hechas a mano fuera del
 * sistema, un hueco que nadie tiene sin saberlo. Y un dígito de más multiplica
 * por 10: desde el correlativo 3 en adelante el salto ya pasa de 20.
 */
export const GTF_SALTO_MAX = 20;

/** De dónde salió un número ya usado. */
export type FuenteGtf = "despacho" | "despacho_anulado" | "anexo";

/** Un número que ya ocupa el talonario. */
export interface GtfUsada {
  numero: string;
  fuente: FuenteGtf;
  /** El despacho que lo lleva (o del que salió el anexo, si se emitió desde ahí). */
  despachoId?: string | null;
  /** Los despachos a los que quedó enlazado un Anexo 04 (puente ADR-446). */
  despachoIds?: string[];
  lineNo?: number | null;
  /** Fecha date-only AAAA-MM-DD. */
  fecha?: string | null;
  /** El N° propio del Anexo 04 (no es el de la guía). */
  anexoNumero?: string | null;
}

/** De dónde sale la cantidad de dígitos de la propuesta. */
export type OrigenDigitos = "ficha" | "ultimo" | "defecto";

export interface PropuestaGtf {
  /** El número propuesto, ya armado: `19-001-0000065`. */
  gtf: string;
  serie: string;
  correlativo: number;
  digitos: number;
  origenDigitos: OrigenDigitos;
  /** El número más alto ya usado de la serie, con su fuente. */
  ultimo: (GtfUsada & { correlativo: number; digitos: number }) | null;
}

/** Los tramos de un número: `« 019 - 001-0000064 »` → `["019", "001", "0000064"]`. */
function tramosDe(texto: string | null | undefined): string[] | null {
  const limpio = String(texto ?? "").trim().toUpperCase().replace(/^-+|-+$/g, "");
  if (!limpio) return null;
  const tramos = limpio.split(/\s*-\s*/).map((t) => t.replace(/\s+/g, " ").trim());
  return tramos.every((t) => t.length > 0) ? tramos : null;
}

/** Un tramo numérico vale por su valor: `019` ≡ `19`, `0000064` ≡ `64`. */
const canon = (t: string): string => (/^\d+$/.test(t) ? t.replace(/^0+(?=\d)/, "") : t);

/** La serie como se imprime: sin espacios ni guiones sobrantes en las puntas. */
export function serieLimpia(serie: string): string {
  return String(serie ?? "").trim().replace(/^-+|-+$/g, "");
}

/**
 * ¿La serie se puede guardar en la Ficha? Vacía (todavía no la cargó) o tramos
 * separados por UN guion: `19--001` o `19-001-` dejaban un tramo vacío y el
 * número salía `19--001-0000065`, que no calza con ningún talonario.
 */
export function serieGtfValida(serie: string): boolean {
  const t = String(serie ?? "").trim();
  return t === "" || t.split(/\s*-\s*/).every((x) => x.trim().length > 0);
}

/** Dígitos válidos para la Ficha, o `null` (= automático). */
export function digitosGtfValidos(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= GTF_DIGITOS_MIN && n <= GTF_DIGITOS_MAX ? n : null;
}

/** ¿Es la misma guía? Compara tramo a tramo, los numéricos por valor. */
export function mismoNumeroGtf(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = tramosDe(a);
  const tb = tramosDe(b);
  if (!ta || !tb || ta.length !== tb.length) return false;
  return ta.every((t, i) => canon(t) === canon(tb[i]));
}

/**
 * El correlativo de `numero` si es de `serie`: sus tramos son los de la serie
 * más uno final, todo dígitos. `digitos` es el largo con el que se escribió.
 */
export function correlativoEnSerie(
  numero: string | null | undefined,
  serie: string,
): { correlativo: number; digitos: number } | null {
  const tn = tramosDe(numero);
  const ts = tramosDe(serie);
  if (!tn || !ts || tn.length !== ts.length + 1) return null;
  if (!ts.every((t, i) => canon(t) === canon(tn[i]))) return null;
  const ult = tn[tn.length - 1];
  if (!/^\d+$/.test(ult)) return null;
  const correlativo = Number(ult);
  if (!Number.isSafeInteger(correlativo) || correlativo <= 0) return null;
  return { correlativo, digitos: ult.length };
}

/** Arma el número: serie de la Ficha + correlativo con sus ceros. */
export function armarGtf(serie: string, correlativo: number, digitos: number): string {
  return `${serieLimpia(serie)}-${String(correlativo).padStart(digitos, "0")}`;
}

/**
 * El siguiente número del talonario.
 *
 * `digitosFicha` null = la Ficha no lo fijó: se usan los del último número de
 * la serie (si están en rango) o `GTF_DIGITOS_DEFAULT`.
 */
export function proponerGtf(
  serie: string,
  digitosFicha: number | null | undefined,
  usados: readonly GtfUsada[],
): PropuestaGtf {
  let ultimo: PropuestaGtf["ultimo"] = null;
  for (const u of usados) {
    const c = correlativoEnSerie(u.numero, serie);
    if (!c) continue;
    // Empate de correlativo: gana el escrito con más dígitos (es el del papel).
    if (!ultimo || c.correlativo > ultimo.correlativo || (c.correlativo === ultimo.correlativo && c.digitos > ultimo.digitos)) {
      ultimo = { ...u, ...c };
    }
  }
  const deFicha = digitosGtfValidos(digitosFicha);
  const delUltimo = ultimo ? digitosGtfValidos(ultimo.digitos) : null;
  const digitos = deFicha ?? delUltimo ?? GTF_DIGITOS_DEFAULT;
  const origenDigitos: OrigenDigitos = deFicha != null ? "ficha" : delUltimo != null ? "ultimo" : "defecto";
  const correlativo = (ultimo?.correlativo ?? 0) + 1;
  return { gtf: armarGtf(serie, correlativo, digitos), serie: serieLimpia(serie), correlativo, digitos, origenDigitos, ultimo };
}

/**
 * Lo que el operador confirmó (o cambió) en «Emitir GTF», llevado a la forma
 * canónica de la Ficha. Acepta el número entero en cualquier notación de
 * tramos (`019-001-65`) o sólo el correlativo (`65`, `0000065`).
 */
export function leerGtfConfirmada(
  texto: string,
  serie: string,
  digitos: number,
): { ok: true; gtf: string; correlativo: number } | { ok: false } {
  const solo = String(texto ?? "").trim();
  // Sólo el correlativo: hasta el tope de dígitos. Más largo es el número
  // entero tipeado sin guiones, y pegarle la serie delante lo duplicaría.
  const c = /^\d+$/.test(solo)
    ? solo.length <= GTF_DIGITOS_MAX && Number(solo) > 0
      ? { correlativo: Number(solo) }
      : null
    : correlativoEnSerie(solo, serie);
  if (!c) return { ok: false };
  return { ok: true, gtf: armarGtf(serie, c.correlativo, digitos), correlativo: c.correlativo };
}

/**
 * El despacho VIGENTE (otro que `despachoId`) que ya lleva ese número, si hay.
 * Los anulados y los anexos cuentan para el máximo pero no bloquean: un anexo
 * puede ser justo el papel de ESTE despacho, emitido antes que su guía.
 *
 * `mismaGuiaQue` = el operador confirmó que esta línea va en LA MISMA guía que
 * ese despacho (un camión con dos productos, cada uno su línea). Sólo vale si
 * ese despacho lleva de verdad el número: confirmar contra otro no destraba nada.
 */
export function gtfEnUso(
  gtf: string,
  usados: readonly GtfUsada[],
  despachoId: string,
  mismaGuiaQue?: string | null,
): GtfUsada | null {
  const conEseNumero = usados.filter((u) => u.fuente === "despacho" && u.despachoId !== despachoId && mismoNumeroGtf(u.numero, gtf));
  if (conEseNumero.length === 0) return null;
  if (mismaGuiaQue && conEseNumero.some((u) => u.despachoId === mismaGuiaQue)) return null;
  return conEseNumero[0];
}

/**
 * Cuántos números saltea el confirmado sobre el propuesto, si pasa del tope
 * (`GTF_SALTO_MAX`); `null` si está dentro. Ir para ATRÁS no se pregunta: es
 * llenar un hueco del talonario (una guía que se hizo a mano), y si ese número
 * ya lo lleva un despacho vigente lo frena `gtfEnUso`.
 */
export function saltoDeCorrelativo(correlativo: number, propuesta: Pick<PropuestaGtf, "correlativo">): number | null {
  const salto = correlativo - propuesta.correlativo;
  return salto > GTF_SALTO_MAX ? salto : null;
}

/** Cómo se dice de dónde salió el último número, para la pantalla. */
export function fuenteGtfTexto(u: GtfUsada): string {
  const fecha = u.fecha && /^\d{4}-\d{2}-\d{2}/.test(u.fecha) ? ` del ${u.fecha.slice(8, 10)}/${u.fecha.slice(5, 7)}` : "";
  if (u.fuente === "anexo") return `Anexo 04${u.anexoNumero ? ` N° ${u.anexoNumero}` : ""}${fecha}`;
  const linea = u.lineNo != null ? ` #${u.lineNo}` : "";
  return u.fuente === "despacho_anulado" ? `despacho${linea} (anulado)${fecha}` : `despacho${linea}${fecha}`;
}
