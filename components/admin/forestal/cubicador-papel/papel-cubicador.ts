/**
 * El papel de una cubicación (Brandon 23-10: «que tengan su formato ahí para
 * descargar y cubicador con ese papel vinculado para que se haga más fácil
 * buscar»). PURO y client-safe: el código impreso en la hoja, las etiquetas
 * con que el papel queda en el Archivo, qué planilla va con cada cubicador y
 * el buscador por código o nombre (lo usan los dos cubicadores).
 *
 * El vínculo es el de ADR-502: carpeta + etiquetas, sin schema. Un papel es un
 * documento del Archivo con `papel-cubicador` + `cubicacion:<id>` + el código
 * de la hoja en minúsculas (así el buscador del Archivo también lo encuentra).
 */
import type { PlanillaId } from "@/lib/forestal/planillas/tipos";

export type TipoPapel = "aserrada" | "trozas";

export const TAG_PAPEL = "papel-cubicador";
export const CARPETA_PAPELES = "Cubicador/Papeles";
const PREFIJO_TAG = "cubicacion:";
/** El endpoint del Archivo corta cada etiqueta en 64. */
const TOPE_TAG = 64;

export const tagCubicacion = (id: string): string => `${PREFIJO_TAG}${id}`.slice(0, TOPE_TAG);

/** El id de la cubicación de un papel, leído de sus etiquetas (`null` = no es de ninguna). */
export function idDeCubicacionEnTags(tags: readonly string[] | null | undefined): string | null {
  const t = tags?.find((x) => x.startsWith(PREFIJO_TAG));
  const id = t?.slice(PREFIJO_TAG.length).trim();
  return id ? id : null;
}

/* ── Código de la hoja ─────────────────────────────────────────────────── */

/** Base 32 de Crockford: sin I, L, O ni U (no se confunden con 1, 0 ni V al escribir a mano). */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** FNV-1a de 32 bits: el mismo id da siempre el mismo código, en cualquier equipo. */
function fnv1a(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function base32(n: number, largo: number): string {
  let s = "";
  let v = n;
  for (let i = 0; i < largo; i++) {
    s = CROCKFORD[v % 32] + s;
    v = Math.floor(v / 32);
  }
  return s;
}

const PREFIJO_HOJA: Record<TipoPapel, string> = { aserrada: "MA", trozas: "TR" };

/** Código corto derivado del id («MA-7K3QX»): 32⁵ ≈ 33 millones, sin choques en un negocio. */
export function codigoDerivado(tipo: TipoPapel, id: string): string {
  return `${PREFIJO_HOJA[tipo]}-${base32(fnv1a(id), 5)}`;
}

/**
 * El código que se imprime en la hoja de una cubicación guardada. Las de la
 * cuenta (trozas y madera a cuenta) ya tienen el suyo, «CUB-2026-0003», el que
 * se ve al guardarlas y en el adelanto: ése. Las del Cubicador de madera no
 * tienen código: uno corto derivado de su id.
 */
export function codigoDeHoja(tipo: TipoPapel, id: string, codigoCuenta?: string | null): string {
  const c = codigoCuenta?.trim();
  return c ? c.toUpperCase() : codigoDerivado(tipo, id);
}

/**
 * ¿El id es de la cuenta (`/cubicaciones-trozas`, cuid) o del historial del
 * Cubicador de madera (`/cubicaciones`, «cub-<fecha>-<azar>»)? Sólo las de la
 * cuenta tienen «CUB-…» para pedir.
 */
export const esIdDeLaCuenta = (id: string): boolean => !/^cub-/i.test(id);

/** Para comparar códigos: sin guiones ni espacios, en mayúsculas («cub 2026-3» ≈ «CUB20263»). */
export const normalizarCodigo = (s: string): string => s.toUpperCase().replace(/[^0-9A-Z]/g, "");

const normalizarTexto = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * ¿La búsqueda da con esta cubicación? Por código (con o sin guiones, una parte
 * alcanza: «0003» encuentra «CUB-2026-0003») o por cualquiera de sus textos
 * (persona, nombre del lote, guía), sin tildes ni mayúsculas. Vacía = todas.
 */
export function coincideConHoja(q: string, c: { codigos: readonly (string | null | undefined)[]; textos: readonly (string | null | undefined)[] }): boolean {
  const texto = normalizarTexto(q);
  if (!texto) return true;
  const cod = normalizarCodigo(q);
  if (cod.length >= 2 && c.codigos.some((x) => x && normalizarCodigo(x).includes(cod))) return true;
  const palabras = texto.split(" ");
  return c.textos.some((t) => {
    if (!t) return false;
    const n = normalizarTexto(t);
    return palabras.every((p) => n.includes(p));
  });
}

/** Filtra una lista con `coincideConHoja`; el madera la usa con sus registros. */
export function filtrarPorHoja<T>(
  lista: readonly T[],
  q: string,
  campos: (x: T) => { codigos: readonly (string | null | undefined)[]; textos: readonly (string | null | undefined)[] },
): T[] {
  if (!q.trim()) return [...lista];
  return lista.filter((x) => coincideConHoja(q, campos(x)));
}

/* ── Qué planilla va con cada cubicador ────────────────────────────────── */

export type FormulaPapel = "smalian" | "oxapampina";

const PLANILLA_DE_FORMULA: Record<FormulaPapel, PlanillaId> = { smalian: "rolliza-smalian", oxapampina: "rolliza-oxapampa" };

/**
 * Las planillas que ofrece el cubicador, la que usa primero. Aserrada = la de
 * pie tablar. Trozas = Smalian y Oxapampina, primero la fórmula de la
 * cubicación (o la que tiene abierta el patio).
 */
export function planillasDelTipo(tipo: TipoPapel, formula?: string | null): PlanillaId[] {
  if (tipo === "aserrada") return ["aserrada-pt"];
  const primera: FormulaPapel = formula === "oxapampina" ? "oxapampina" : "smalian";
  const otra: FormulaPapel = primera === "smalian" ? "oxapampina" : "smalian";
  return [PLANILLA_DE_FORMULA[primera], PLANILLA_DE_FORMULA[otra]];
}

/* ── Etiquetas y nombre del papel en el Archivo ────────────────────────── */

/** Las etiquetas de un papel: el vínculo, el tipo y el código (minúsculas, sin repetir, ≤ 20). */
export function etiquetasDelPapel(o: { tipo: TipoPapel; cubicacionId: string; codigo: string; previas?: readonly string[] }): string[] {
  const propias = [TAG_PAPEL, "cubicador", tagCubicacion(o.cubicacionId), o.tipo === "aserrada" ? "madera-aserrada" : "trozas", o.codigo.toLowerCase()];
  const todas = [...propias, ...(o.previas ?? [])].map((t) => t.trim().slice(0, TOPE_TAG)).filter(Boolean);
  return Array.from(new Set(todas)).slice(0, 20);
}

/** «Papel CUB-2026-0003 · Juan Pérez · hoja 2». */
export function nombreDelPapel(codigo: string, etiqueta: string | null | undefined, hoja: number): string {
  const partes = [`Papel ${codigo}`];
  const e = etiqueta?.replace(/\s+/g, " ").trim();
  if (e) partes.push(e.slice(0, 80));
  if (hoja > 1) partes.push(`hoja ${hoja}`);
  return partes.join(" · ");
}

/** Lo que acepta el botón de subir: foto o PDF, hasta 20 MB. `null` = sirve. */
export const PESO_MAXIMO_PAPEL = 20 * 1024 * 1024;
export function problemaDelArchivo(f: { type: string; size: number }): string | null {
  const imagen = f.type.startsWith("image/");
  if (!imagen && f.type !== "application/pdf") return "Sube una foto o un PDF de la hoja.";
  if (f.size > PESO_MAXIMO_PAPEL) return "Pesa más de 20 MB: toma la foto con menos resolución.";
  if (f.size === 0) return "El archivo está vacío.";
  return null;
}
