// Botones con señuelo de la ventana de OK (revisión de seguridad 29-10, hallazgo 4: «Sí» se apretaba sin leer).
// En vez de «Sí, hazlo» van 3 botones en orden al azar: el dato real (monto, o el nombre si no hay monto, o un
// código) y 2 parecidos. Solo el correcto aprueba; un señuelo = «no». Puro: sin red, sin SDK.
import { randomInt as randomIntReal } from "node:crypto";
import { numero, soles } from "./formato.mjs";

/** Controles, saltos de línea, bidi y ancho cero: un nombre no puede partir la etiqueta ni darse vuelta. */
const RE_RARO = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;

/** Una línea, ≤ max caracteres (los de más → «…»), sin saltos ni caracteres invisibles. @param {unknown} s */
export function linea60(s, max = 60) {
  const t = String(s ?? "").normalize("NFC").replace(RE_RARO, " ").replace(/\s+/g, " ").trim();
  const letras = [...t];
  return letras.length > max ? `${letras.slice(0, max - 1).join("").trimEnd()}…` : t;
}

/**
 * Homoglifos comunes (2.ª pasada de seguridad 29-10, BAJO-MEDIO): «Juаn» con «а» cirílica se ve igual que «Juan».
 * Cirílico y griego → la letra latina que imitan. Escrito con escapes \u{…} a propósito (el editor los volvía letras).
 */
const CONFUSABLES = new Map(Object.entries({ "\u{430}": "a", "\u{432}": "b", "\u{435}": "e", "\u{451}": "e", "\u{43a}": "k", "\u{43c}": "m", "\u{43d}": "h", "\u{43e}": "o", "\u{440}": "p", "\u{441}": "c", "\u{442}": "t", "\u{443}": "y", "\u{445}": "x", "\u{456}": "i", "\u{457}": "i", "\u{458}": "j", "\u{455}": "s", "\u{501}": "d", "\u{51b}": "q", "\u{51d}": "w", "\u{4bb}": "h", "\u{4cf}": "l", "\u{261}": "g", "\u{433}": "r", "\u{43f}": "n", "\u{44c}": "b", "\u{410}": "A", "\u{412}": "B", "\u{415}": "E", "\u{401}": "E", "\u{41a}": "K", "\u{41c}": "M", "\u{41d}": "H", "\u{41e}": "O", "\u{420}": "P", "\u{421}": "C", "\u{422}": "T", "\u{423}": "Y", "\u{425}": "X", "\u{406}": "I", "\u{407}": "I", "\u{408}": "J", "\u{405}": "S", "\u{500}": "D", "\u{51a}": "Q", "\u{51c}": "W", "\u{4ba}": "H", "\u{4c0}": "I", "\u{3b1}": "a", "\u{3b2}": "b", "\u{3b5}": "e", "\u{3b7}": "n", "\u{3b9}": "i", "\u{3ba}": "k", "\u{3bd}": "v", "\u{3bf}": "o", "\u{3c1}": "p", "\u{3c4}": "t", "\u{3c5}": "u", "\u{3c7}": "x", "\u{3b3}": "y", "\u{3c9}": "w", "\u{391}": "A", "\u{392}": "B", "\u{395}": "E", "\u{396}": "Z", "\u{397}": "H", "\u{399}": "I", "\u{39a}": "K", "\u{39c}": "M", "\u{39d}": "N", "\u{39f}": "O", "\u{3a1}": "P", "\u{3a4}": "T", "\u{3a5}": "Y", "\u{3a7}": "X", "\u{131}": "i", "\u{237}": "j", "\u{17f}": "s" }));

/** Forma para comparar: NFKC (ancho completo, ligaduras), homoglifos → latino, sin tildes, minúsculas. @param {unknown} s */
export function esqueleto(s) {
  // Tildes fuera ANTES del mapa: «ί» (iota con tilde) → «ι» → «i»; «ё» → «е» → «e».
  const base = String(s ?? "").normalize("NFKC").normalize("NFD").replace(/\p{M}/gu, "");
  return [...base].map((c) => CONFUSABLES.get(c) ?? c).join("").toLocaleLowerCase("es").replace(/\s+/g, " ").trim();
}

/** ¿Trae letras que no son del alfabeto latino (cirílico, griego…)? @param {unknown} s */
export const letrasRaras = (s) => /(?=\p{L})\P{Script=Latin}/u.test(String(s ?? "").normalize("NFKC"));
export const MARCA_RARAS = "(\u{26a0} letras raras)";
/** El nombre con la marca «⚠ letras raras» si las trae; ≤60 en total; idempotente. Nunca en los botones (delataría al real). @param {unknown} s */
export function conMarca(s) {
  const t = linea60(s);
  if (!t || !letrasRaras(t) || t.endsWith(MARCA_RARAS)) return t;
  return `${linea60(t, 60 - [...MARCA_RARAS].length - 1)} ${MARCA_RARAS}`;
}

const igual = (a, b) => esqueleto(a) === esqueleto(b);

/** Los primeros `n` candidatos distintos del valor y entre sí. */
function distintos(valor, candidatos, n = 2) {
  /** @type {string[]} */ const sal = [];
  for (const c of candidatos) {
    const t = linea60(c);
    if (!t || igual(t, valor) || sal.some((x) => igual(x, t))) continue;
    sal.push(t);
    if (sal.length === n) break;
  }
  return sal;
}

/**
 * Monto en S/: señuelos ×10 y ÷10 (si al formatear salen iguales, ×100, ÷100, +10…).
 * @param {number} n @param {{ etiqueta?: string }} [op]
 */
export function claveMonto(n, op = {}) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const valor = soles(x);
  const senuelos = distintos(valor, [x * 10, x / 10, x * 100, x / 100, x + 10, x + 100, x + 1, x * 2].map((v) => soles(v)));
  return senuelos.length === 2 ? { etiqueta: op.etiqueta ?? "Monto", valor, senuelos, palabra: "monto" } : null;
}

/**
 * Cantidad entera (unidades, productos, piezas): señuelos ×10 y ÷10 redondeado.
 * @param {number} n @param {{ etiqueta?: string, unidad?: string }} [op]
 */
export function claveCantidad(n, op = {}) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const u = op.unidad ? ` ${op.unidad}` : "";
  const f = (v) => `${numero(v, Number.isInteger(v) ? 0 : 2)}${u}`;
  const valor = f(x);
  const senuelos = distintos(valor, [x * 10, Math.round(x / 10), x + 10, x * 2, x + 1, x + 100].filter((v) => v > 0).map(f));
  return senuelos.length === 2 ? { etiqueta: op.etiqueta ?? "Cantidad", valor, senuelos, palabra: "número" } : null;
}

/** Variantes de un nombre cuando no hay otros de la misma lista: palabras al revés, una vocal cambiada, una letra menos. */
function parecidos(nombre) {
  const p = nombre.split(" ");
  const sal = [];
  if (p.length > 1) sal.push([...p].reverse().join(" "));
  const vocales = "aeiou";
  const i = [...nombre].findIndex((c) => vocales.includes(c.toLowerCase()));
  if (i >= 0) {
    const letras = [...nombre];
    const v = letras[i].toLowerCase();
    const otra = vocales[(vocales.indexOf(v) + 2) % 5];
    letras[i] = letras[i] === v ? otra : otra.toUpperCase();
    sal.push(letras.join(""));
  }
  if (nombre.length > 3) sal.push(nombre.slice(0, -1));
  sal.push(`${nombre} 2`, `Otro: ${nombre}`);
  return sal;
}

/**
 * Nombre (persona, producto, tarea…): señuelos de la misma lista; si no hay, nombres parecidos.
 * @param {unknown} nombre @param {unknown[]} [alternativas] @param {{ etiqueta?: string, palabra?: string, aleatorio?: (n: number) => number }} [op]
 */
export function claveNombre(nombre, alternativas = [], op = {}) {
  const valor = linea60(nombre);
  if (!valor) return null;
  const azar = op.aleatorio ?? ((n) => randomIntReal(n));
  const otros = [...new Set((alternativas ?? []).map((x) => linea60(x)).filter(Boolean))];
  for (let i = otros.length - 1; i > 0; i--) { const j = azar(i + 1); [otros[i], otros[j]] = [otros[j], otros[i]]; }
  const senuelos = distintos(valor, [...otros, ...parecidos(valor)]);
  return senuelos.length === 2 ? { etiqueta: op.etiqueta ?? "A quién", valor, senuelos, palabra: op.palabra ?? "nombre" } : null;
}

/** Sin monto ni nombre: un código de 3 cifras que la ventana muestra arriba. @param {(n: number) => number} [aleatorio] */
export function claveCodigo(aleatorio) {
  const azar = aleatorio ?? ((n) => randomIntReal(n));
  /** @type {string[]} */ const c = [];
  // Tope de vueltas: un azar que repite (tests, o uno roto) no cuelga el servidor; se completa con +337.
  for (let i = 0; i < 30 && c.length < 3; i++) { const v = String(100 + azar(900)); if (!c.includes(v)) c.push(v); }
  while (c.length < 3) { const v = String(100 + ((Number(c[c.length - 1] ?? 100) - 100 + 337) % 900)); c.push(c.includes(v) ? String(100 + ((Number(v) - 100 + 1) % 900)) : v); }
  return { etiqueta: "Código de esta operación", valor: c[0], senuelos: [c[1], c[2]], palabra: "código" };
}

/**
 * Lo que va FUERA del cuadro de texto: la clave (dato de los botones) y hasta 4 filas fijas «etiqueta: valor».
 * Todo a una línea de ≤60. Sin clave válida → código. Idempotente. Una fila con letras no latinas lleva «⚠ letras raras».
 * @param {any} v @param {(n: number) => number} [aleatorio]
 * @returns {import("./tipos.mjs").Ventana}
 */
export function sanearVentana(v, aleatorio) {
  const c = v?.clave;
  let clave = null;
  if (c && typeof c === "object" && Array.isArray(c.senuelos)) {
    const valor = linea60(c.valor);
    const senuelos = valor ? distintos(valor, c.senuelos) : [];
    if (valor && senuelos.length === 2) clave = { etiqueta: linea60(c.etiqueta || "Dato", 40), valor, senuelos, palabra: linea60(c.palabra || "dato", 20) };
  }
  const filas = (Array.isArray(v?.filas) ? v.filas : [])
    .map((f) => ({ etiqueta: linea60(f?.etiqueta, 30), valor: conMarca(f?.valor) }))
    .filter((f) => f.etiqueta && f.valor)
    .slice(0, 4);
  return { clave: clave ?? claveCodigo(aleatorio), filas };
}

/** Línea que se suma al resumen: qué botón aprieta Brandon. @param {{ clave: { palabra: string } }} ventana */
export const lineaInstruccion = (ventana) => `Para hacerlo, aprieta el botón con el ${ventana.clave.palabra} correcto.`;

/**
 * Los 3 textos en orden al azar y cuál es el correcto (Fisher-Yates con randomInt).
 * @param {{ valor: string, senuelos: string[] }} clave @param {(n: number) => number} [aleatorio]
 * @returns {{ textos: string[], correcto: number }}
 */
export function armarBotones(clave, aleatorio) {
  const azar = aleatorio ?? ((n) => randomIntReal(n));
  const textos = [clave.valor, ...clave.senuelos.slice(0, 2)];
  for (let i = textos.length - 1; i > 0; i--) { const j = azar(i + 1); [textos[i], textos[j]] = [textos[j], textos[i]]; }
  return { textos, correcto: textos.indexOf(clave.valor) };
}
