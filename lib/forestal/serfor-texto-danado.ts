/**
 * Texto dañado que publica SERFOR, reparado SIN inventar letras (2026-09-25).
 *
 * Medido en Blas: 21 de 26 fichas guardadas tenían «SANTOS MUÃ?OZ JOSE HORD».
 * El daño NO es nuestro: la consulta pública del SNIFFS sirve UTF-8 correcto y
 * en la MISMA página trae el nombre bien («MUÑOZ», bytes C3 91) en unos campos
 * y roto en otro («MUÃ?OZ», bytes C3 83 3F). Su base guardó ese campo leyendo
 * UTF-8 como Latin-1: la segunda mitad de la letra cayó en un carácter de
 * control y se volvió un «?» literal.
 *
 * Dos casos, tratados distinto:
 *  · **Sin ambigüedad** — la minúscula con tilde sobrevive como un par visible
 *    («Ã±» = ñ, «Ã©» = é; también «Ã‘» = Ñ si el paso fue por Windows-1252):
 *    se decodifica siempre.
 *  · **«Ã?»** — cualquier mayúscula con tilde (Ñ, Á, É, Í, Ó, Ú, Ü…) termina
 *    igual: la letra se PERDIÓ. Sólo se repara si otro texto de la misma ficha
 *    trae la palabra bien escrita y hay UNA sola candidata; si no, queda como
 *    vino. Una letra adivinada en un documento que es declaración jurada es
 *    peor que una letra rota a la vista.
 */

/** Windows-1252 en 0x80–0x9F: el carácter visible → su byte. */
const CP1252: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88,
  "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93,
  "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b,
  "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};

/** El segundo byte UTF-8 (0x80–0xBF) de un carácter que se leyó como Latin-1 o 1252. */
function segundoByte(ch: string): number | null {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp >= 0x80 && cp <= 0xbf) return cp; // Latin-1 (incluye controles C1)
  return CP1252[ch] ?? null;
}

/** Mayúsculas con tilde que colapsan a «Ã?»: las que pueden estar detrás del «?». */
const MAYUSCULAS_PERDIDAS = "ÁÉÍÓÚÑÜÀÈÌÒÙÂÊÎÔÛÄËÏÖÇ";

/**
 * Lo que se decodifica sin dudas: «Ã» o «Â» seguidos del segundo byte visible.
 * `Ã` + byte → U+00C0.. (letras con tilde); `Â` + byte → el mismo byte (°, º, ª…).
 */
export function repararSinAmbiguedad(texto: string): string {
  if (!/[ÃÂ]/.test(texto)) return texto;
  return texto.replace(/([ÃÂ])([\u0080-¿€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ])/g, (m, lead: string, ch: string) => {
    const b = segundoByte(ch);
    if (b == null) return m;
    return String.fromCharCode(lead === "Ã" ? 0xc0 + (b - 0x80) : b);
  });
}

const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Repara un texto con la ayuda de los demás textos de la misma ficha.
 * `contexto` puede incluir al propio texto: sólo cuentan las palabras sanas.
 */
export function repararTextoSerfor(texto: string, contexto: readonly string[]): string {
  return repararConSanos(texto, textoSano(contexto));
}

/** Los textos sanos del contexto, unidos: se calcula UNA vez por ficha (con
 *  cientos de trozas, recalcularlo por cada texto crecía al cuadrado). */
function textoSano(contexto: readonly string[]): string {
  return contexto.map(repararSinAmbiguedad).filter((c) => !c.includes("Ã?")).join(" \u0000 ");
}

function repararConSanos(texto: string, sanos: string): string {
  let t = repararSinAmbiguedad(texto);
  if (!t.includes("Ã?")) return t;
  t = t.replace(/[A-Za-zÀ-ÿ]*Ã\?[A-Za-zÀ-ÿ]*/g, (palabra) => {
    const partes = palabra.split("Ã?");
    // Dos letras perdidas en la misma palabra: no hay forma honesta de elegir.
    if (partes.length !== 2) return palabra;
    const [antes, despues] = partes;
    const re = new RegExp(`(?:^|[^A-Za-zÀ-ÿ])(${escaparRegex(antes ?? "")}([${MAYUSCULAS_PERDIDAS}])${escaparRegex(despues ?? "")})(?![A-Za-zÀ-ÿ])`, "g");
    const letras = new Set<string>();
    for (const m of sanos.matchAll(re)) if (m[2]) letras.add(m[2]);
    return letras.size === 1 ? `${antes}${[...letras][0]}${despues}` : palabra;
  });
  return t;
}

/** Todos los textos de un valor (objeto, lista o texto), para armar el contexto. */
function textosDe(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => textosDe(x, out));
  else if (esPlano(v)) Object.values(v).forEach((x) => textosDe(x, out));
  return out;
}

function esPlano(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** El mismo valor con cada texto reparado; claves y números intactos. */
function mapearTextos(v: unknown, f: (s: string) => string): unknown {
  if (typeof v === "string") return f(v);
  if (Array.isArray(v)) return v.map((x) => mapearTextos(x, f));
  // Sólo objetos PLANOS: un Date (u otra clase) saldría convertido en {}.
  if (esPlano(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapearTextos(x, f)]));
  return v;
}

/**
 * Repara TODA una ficha de SERFOR (o el cuerpo de una guía) usando sus propios
 * textos como contexto. `extra` suma otros textos del mismo documento — por
 * ejemplo, la ficha cuando se repara el cuerpo copiado de ella.
 */
export function repararFichaSerfor<T>(ficha: T, extra: readonly string[] = []): T {
  const contexto = [...textosDe(ficha), ...extra];
  if (!contexto.some((s) => /[ÃÂ]/.test(s))) return ficha;
  const sanos = textoSano(contexto);
  return mapearTextos(ficha, (s) => repararConSanos(s, sanos)) as T;
}
