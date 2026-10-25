/**
 * ¿A cuál de tus personas se refiere un nombre leído de una foto o dicho en
 * voz? Lo usan «Desde la foto» (el «Yapeaste a …» del voucher) y «Dictar»
 * («le di 500 a Wasaco…») del alta de adelanto. PURO: sin React ni fetch.
 *
 * POR QUÉ APROXIMADO. Yape recorta («Juan C. Pérez R.»), el OCR se come
 * tildes y el dictado escribe como suena: «Guasaco» por «Wasaco», «Kispe» por
 * «Quispe». Comparar exacto no encontraba a nadie. Se compara palabra por
 * palabra con una CLAVE FONÉTICA del castellano peruano (w = gu, v = b, z = s,
 * c/qu = k, h muda, ll = y) y se tolera una letra de diferencia en palabras
 * largas.
 *
 * NUNCA DECIDE SOLO ENTRE DOS. Si dos personas calzan igual, se devuelven las
 * dos y la pantalla pregunta. Sólo con UNA que calza entera se elige sola, y
 * aun así queda marcada para que la revisen antes de guardar.
 */

import { normalizarNombre } from "./vinculo-sugerido";

/** Palabras que no distinguen a nadie: «la mamá DE Alex», «DON Wasaco». */
const VACIAS = new Set([
  "de", "del", "la", "las", "el", "los", "y", "e", "a", "al", "san", "don", "dona", "doña",
  "sr", "sra", "srta", "senor", "señor", "senora", "señora", "su", "mi",
]);

/** La clave fonética de una palabra ya normalizada (minúsculas, sin tildes). */
export function claveFonetica(palabra: string): string {
  return palabra
    .replace(/ñ/g, "ni")
    .replace(/w/g, "gu")
    .replace(/gu(?=[ei])/g, "g")
    .replace(/v/g, "b")
    .replace(/z/g, "s")
    .replace(/c(?=[ei])/g, "s")
    .replace(/qu(?=[ei])/g, "k")
    .replace(/q/g, "k")
    .replace(/c/g, "k")
    .replace(/x/g, "ks")
    .replace(/ll/g, "y")
    .replace(/h/g, "")
    .replace(/(.)\1+/g, "$1");
}

/** Las palabras que cuentan de un nombre (≥ 2 letras, sin las vacías). */
export function palabrasDeNombre(nombre: string): string[] {
  return normalizarNombre(nombre)
    .split(" ")
    .filter((w) => w.length >= 2 && !VACIAS.has(w) && !/^\d+$/.test(w));
}

function distanciaMaxUna(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let dif = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++dif > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return dif + (a.length - i) + (b.length - j) <= 1;
}

/** ¿Dos palabras son la misma dicha o leída distinto? */
export function mismaPalabra(a: string, b: string): boolean {
  if (a === b) return true;
  const ka = claveFonetica(a);
  const kb = claveFonetica(b);
  if (ka === kb) return true;
  /* Una letra de diferencia sólo en palabras largas: «Perez»/«Peres» sí,
     «Ana»/«Ama» no. */
  return Math.min(ka.length, kb.length) >= 5 && distanciaMaxUna(ka, kb);
}

export interface PersonaBuscable {
  id: string;
  nombre: string;
  activo?: boolean | null;
}

export type PersonaEncontrada<T extends PersonaBuscable> =
  | { tipo: "una"; persona: T }
  | { tipo: "varias"; opciones: T[] }
  | { tipo: "ninguna" };

/** Cuántas palabras de `de` aparecen en `en` (cada palabra de `en` cuenta una sola vez). */
function coinciden(de: string[], en: string[]): number {
  const libres = [...en];
  let n = 0;
  for (const p of de) {
    const k = libres.findIndex((q) => mismaPalabra(p, q));
    if (k >= 0) {
      n++;
      libres.splice(k, 1);
    }
  }
  return n;
}

/**
 * La persona de un NOMBRE (el del voucher, o el que se dijo). Calza entera si
 * todas las palabras del lado más corto están en el otro: «Juan C. Pérez R.»
 * calza con «Juan Carlos Pérez Rojas»; «Juan Pérez» no calza con «Juan
 * Quispe» (comparten una de dos). Con una sola en común se ofrece como
 * opción, nunca se elige sola.
 */
export function buscarPersona<T extends PersonaBuscable>(nombre: string | null | undefined, personas: readonly T[]): PersonaEncontrada<T> {
  const q = palabrasDeNombre(nombre ?? "");
  if (!q.length) return { tipo: "ninguna" };
  const enteras: T[] = [];
  const parciales: { p: T; n: number }[] = [];
  for (const p of personas) {
    if (p.activo === false) continue;
    const w = palabrasDeNombre(p.nombre);
    if (!w.length) continue;
    const n = coinciden(q, w);
    if (n === 0) continue;
    if (n >= Math.min(q.length, w.length)) enteras.push(p);
    /* Una palabra en común sólo vale de opción si es un nombre «de verdad» (4+ letras). */
    else if (q.some((x) => x.length >= 4 && w.some((y) => mismaPalabra(x, y)))) parciales.push({ p, n });
  }
  if (enteras.length === 1) return { tipo: "una", persona: enteras[0] };
  if (enteras.length > 1) return { tipo: "varias", opciones: enteras.slice(0, 4) };
  if (parciales.length) {
    parciales.sort((a, b) => b.n - a.n);
    return { tipo: "varias", opciones: parciales.slice(0, 4).map((x) => x.p) };
  }
  return { tipo: "ninguna" };
}

/**
 * La persona MENCIONADA en una frase entera («mil doscientos a la mamá de Alex
 * por la primera carga»): calza la que tiene todas sus palabras en la frase.
 * Si calzan varias y una contiene a la otra («Juan» y «Juan Pérez»), gana la
 * de más palabras: se dijo el nombre completo. `excluir` = la nota dicha (sus
 * palabras no cuentan como nombre).
 */
export function personaEnFrase<T extends PersonaBuscable>(frase: string, personas: readonly T[], excluir?: string | null): PersonaEncontrada<T> {
  /* Sin las palabras de la nota: en «500 para la luz» la luz es el gasto, no la persona «Luz». */
  const enFrase = palabrasDeNombre(frase);
  for (const x of palabrasDeNombre(excluir ?? "")) {
    const k = enFrase.indexOf(x);
    if (k >= 0) enFrase.splice(k, 1);
  }
  if (!enFrase.length) return { tipo: "ninguna" };
  let mejores: T[] = [];
  let largo = 0;
  for (const p of personas) {
    if (p.activo === false) continue;
    const w = palabrasDeNombre(p.nombre);
    if (!w.length || coinciden(w, enFrase) < w.length) continue;
    if (w.length > largo) {
      mejores = [p];
      largo = w.length;
    } else if (w.length === largo) mejores.push(p);
  }
  if (mejores.length === 1) return { tipo: "una", persona: mejores[0] };
  if (mejores.length > 1) return { tipo: "varias", opciones: mejores.slice(0, 4) };
  return { tipo: "ninguna" };
}
