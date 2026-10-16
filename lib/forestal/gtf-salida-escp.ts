/**
 * gtf-salida-escp — la guía en bytes ESC/P para la matricial Epson, SIN
 * driver (16-10): cada valor en su mm del talonario, con el perfil de la
 * impresora. Lo manda el celular del monte tal cual (WebUSB, RawBT o un
 * servidor de impresión en el puerto 9100).
 *
 * Referencia: Epson «ESC/P Reference Manual» (ESC/P 2, ESC/P y 9-Pin ESC/P),
 * https://files.support.epson.com/pdf/general/escp2ref.pdf — páginas:
 *   ESC @ C-198 · ESC R C-80 · ESC t C-77 (tabla 1 = PC437 de fábrica) ·
 *   ESC 6 C-151 (imprime 0x80-0x9F: é ü É Ü) · ESC U C-159 (una sola
 *   dirección: la columna cae siempre en el mismo lugar) · ESC 3 + ESC C
 *   C-13 (largo de página en renglones del interlineado actual) · ESC J C-41
 *   (avanza n/216″ en 9 agujas, n/180″ en 24, IMPRIME lo del búfer y no mueve
 *   la X) · ESC $ C-31 (X absoluta en 1/60″ desde el margen izquierdo) ·
 *   ESC P/M/g C-100..105 (10/12/15 cpi) · SI/DC2 C-134/C-138 (condensado) ·
 *   ESC E C-110 (negrita) · ESC G C-121 (doble pasada: marca las 3 copias).
 *
 * Decisiones:
 *   · Sin CR: ESC J ya imprime el búfer, y una matricial con «Auto LF»
 *     encendido haría de cada CR un renglón de más. La X va siempre absoluta.
 *   · Sólo se avanza: los renglones van de arriba abajo (no hay ESC j en 24
 *     agujas) y un FF por hoja, ninguno de más.
 *   · El paso (cpi) es el más angosto que no ensancha lo diseñado en pantalla
 *     (Courier 0,6 em): el texto nunca invade la caja vecina.
 *   · El texto va en lo común a PC437 y PC850 (minúsculas con tilde, ñ/Ñ,
 *     ü/Ü, É, °, º, ª, ¿, ¡): sale igual con cualquiera de las dos tablas
 *     asignada a la 1. Á Í Ó Ú van sin tilde (en PC437 no existen). Los
 *     caracteres de control se quitan: nadie mete comandos por un campo.
 *   · La Y que se manda es la del cabezal (arriba de la letra): base del
 *     renglón − alto de la mayúscula de la matricial. El resto lo calibra la
 *     hoja de prueba ESC/P con el perfil.
 * PURO: sin DOM, sin "use client".
 */

import { CRUZ_MM, type DisposicionHoja } from "./gtf-matricial-disposicion";
import type { Transformacion } from "./gtf-matricial-perfiles";
import { aplicarX, aplicarY, escalaPct } from "./gtf-matricial-perfiles";
import { xInicio, type RenglonSalida } from "./gtf-salida-geometria";

export type Agujas = 9 | 24;

const ESC = 0x1b;
const FF = 0x0c;
const SI = 0x0f;
const DC2 = 0x12;
const MM_POR_PULGADA = 25.4;

/** Unidad de ESC J y ESC 3: 1/216″ en 9 agujas; 1/180″ en 24 agujas (ESC/P y ESC/P 2). */
export const unidadVertical = (a: Agujas): number => (a === 9 ? 216 : 180);
/** Unidad de ESC $: 1/60″ en todas. */
export const UNIDAD_HORIZONTAL = 60;
/** Ancho que imprime una matricial de carro angosto (80 columnas a 10 cpi): LX-350, LX-310, FX-890. */
export const ANCHO_IMPRESION_MM = 8 * MM_POR_PULGADA;
/** Alto de la mayúscula: 7 agujas de 1/72″ en 9 agujas; ~18/180″ en 24. Aproximado: lo calibra la prueba. */
export const altoMayusculaMm = (a: Agujas): number => (a === 9 ? (7 / 72) * MM_POR_PULGADA : (18 / 180) * MM_POR_PULGADA);

export interface Paso {
  cpi: number;
  bytes: readonly number[];
}

/** De más ancho a más angosto. DC2 apaga el condensado que haya dejado el anterior. */
export const PASOS: readonly Paso[] = [
  { cpi: 10, bytes: [ESC, 0x50, DC2] },
  { cpi: 12, bytes: [ESC, 0x4d, DC2] },
  { cpi: 15, bytes: [ESC, 0x67, DC2] },
  { cpi: 120 / 7, bytes: [ESC, 0x50, SI] }, // 10 cpi condensado ≈ 17,14
  { cpi: 20, bytes: [ESC, 0x4d, SI] }, // 12 cpi condensado
];

/** El paso para una letra de `letraPt`: Courier mide 0,6 em → 120/letraPt cpi; el primero que no sea más ancho. */
export function pasoPara(letraPt: number): Paso {
  const cpiPantalla = 120 / letraPt;
  return PASOS.find((p) => p.cpi >= cpiPantalla - 1e-6) ?? PASOS[PASOS.length - 1];
}

export const anchoCaracterMm = (p: Paso): number => MM_POR_PULGADA / p.cpi;

/** Lo común a PC437 y PC850 (Epson, tablas «PC437» y «PC850 Multilingual»). */
const TABLA_PC: Readonly<Record<string, number>> = {
  á: 0xa0, é: 0x82, í: 0xa1, ó: 0xa2, ú: 0xa3, ñ: 0xa4, Ñ: 0xa5, ü: 0x81, Ü: 0x9a, É: 0x90,
  "°": 0xf8, "º": 0xa7, "ª": 0xa6, "¿": 0xa8, "¡": 0xad, "·": 0xfa, "²": 0xfd,
};
const SUSTITUTOS: Readonly<Record<string, string>> = { "³": "3", "–": "-", "—": "-", "“": '"', "”": '"', "‘": "'", "’": "'", "×": "x", "\t": " " };

/** Un carácter → sus bytes en la tabla de la matricial. Control = nada; desconocido = «?». */
export function codificarTexto(texto: string): number[] {
  const out: number[] = [];
  /* NFC primero: «JOSE\u0301» (tilde aparte, como llega pegado de un PDF) es «JOSÉ», no «JOSE?». */
  for (const ch of texto.normalize("NFC")) {
    const directo = TABLA_PC[ch];
    if (directo !== undefined) {
      out.push(directo);
      continue;
    }
    const c = SUSTITUTOS[ch] ?? ch;
    const code = c.codePointAt(0) ?? 0;
    if (c.length === 1 && code >= 0x20 && code <= 0x7e) {
      out.push(code);
      continue;
    }
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) continue;
    const base = c.normalize("NFD").replace(/[̀-ͯ]/g, "");
    const b = base.codePointAt(0) ?? 0;
    out.push(base.length === 1 && b >= 0x20 && b <= 0x7e ? b : 0x3f);
  }
  return out;
}

/**
 * ESC 3 s + ESC C L: el largo de página más cercano al alto del talonario
 * (L ≤ 127, s ≤ 255, L·s ≤ 22″). Se compara contra el alto EXACTO, no contra
 * el redondeado: con formulario continuo el error se suma en cada FF (A4 en
 * 1/216″: 2525 = 101 × 25 da 0,08 mm por hoja; 2527 = 133 × 19 daba 0,16).
 */
export function largoDePagina(altoMm: number, unidad: number): { s: number; L: number } {
  const exacto = (altoMm / MM_POR_PULGADA) * unidad;
  let mejor = { s: 1, L: 1, error: Infinity };
  for (let L = 1; L <= 127; L++) {
    for (const s of [Math.floor(exacto / L), Math.ceil(exacto / L)]) {
      if (s < 1 || s > 255 || s * L > 22 * unidad) continue;
      const error = Math.abs(s * L - exacto);
      if (error < mejor.error - 1e-9) mejor = { s, L, error };
    }
  }
  return { s: mejor.s, L: mejor.L };
}

export interface SalidaGenerada {
  bytes: Uint8Array;
  paginas: number;
  /** Renglones que cayeron (todo o parte) fuera de lo que la impresora alcanza. */
  recortados: number;
}

interface Trozo {
  y: number;
  x: number;
  paso: Paso;
  texto: number[];
}

/** Los trozos de UNA hoja, en unidades de la impresora y recortados a lo que alcanza. */
function trozosDeLaHoja(renglones: RenglonSalida[], altoMm: number, agujas: Agujas, cuenta: { recortados: number }): Trozo[] {
  const u = unidadVertical(agujas);
  const cap = altoMayusculaMm(agujas);
  const out: Trozo[] = [];
  for (const r of renglones) {
    const paso = pasoPara(r.letraPt);
    const w = anchoCaracterMm(paso);
    const yMm = r.baseMm - cap;
    if (yMm < -0.01 || r.baseMm > altoMm + 0.01) {
      cuenta.recortados++;
      continue;
    }
    let x = xInicio(r, w);
    let texto = r.texto;
    const antes = texto.length;
    if (x < 0) {
      const fuera = Math.ceil(-x / w - 1e-9);
      texto = texto.slice(fuera);
      x += fuera * w;
    }
    const entran = Math.floor((ANCHO_IMPRESION_MM - x) / w + 1e-9);
    texto = texto.slice(0, Math.max(0, entran));
    if (texto.length < antes) cuenta.recortados++;
    const bytes = codificarTexto(texto);
    if (!bytes.length) continue;
    out.push({ y: Math.round((Math.max(0, yMm) / MM_POR_PULGADA) * u), x: Math.round((x / MM_POR_PULGADA) * UNIDAD_HORIZONTAL), paso, texto: bytes });
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** El trabajo entero: arranque, una hoja por página del talonario, un FF por hoja. */
export function escpTalonario(hoja: Pick<DisposicionHoja, "altoMm">, paginas: RenglonSalida[][], agujas: Agujas = 9): SalidaGenerada {
  const u = unidadVertical(agujas);
  const { s, L } = largoDePagina(hoja.altoMm, u);
  const out: number[] = [
    ESC, 0x40, // ESC @  reinicia
    ESC, 0x52, 0, // ESC R 0  juego internacional EE. UU. (sin cambiar # $ @ [ ])
    ESC, 0x74, 1, // ESC t 1  tabla 1 (PC437 / PC850)
    ESC, 0x36, // ESC 6  0x80-0x9F se imprimen
    ESC, 0x55, 1, // ESC U 1  una sola dirección
    ESC, 0x33, s, // ESC 3 s  interlineado s/u″ …
    ESC, 0x43, L, // ESC C L  … largo de página = L renglones = alto del talonario
    ESC, 0x32, // ESC 2  vuelve a 1/6″ (no cambia el largo ya fijado)
    ESC, 0x45, // ESC E  negrita
    ESC, 0x47, // ESC G  doble pasada
  ];
  const cuenta = { recortados: 0 };
  for (const renglones of paginas) {
    let y = 0;
    let paso: Paso | null = null;
    for (const t of trozosDeLaHoja(renglones, hoja.altoMm, agujas, cuenta)) {
      for (let falta = t.y - y; falta > 0; falta -= 255) out.push(ESC, 0x4a, Math.min(255, falta)); // ESC J n
      y = t.y;
      if (paso !== t.paso) {
        out.push(...t.paso.bytes);
        paso = t.paso;
      }
      out.push(ESC, 0x24, t.x & 0xff, t.x >> 8, ...t.texto); // ESC $ nL nH + texto
    }
    out.push(FF);
  }
  return { bytes: Uint8Array.from(out), paginas: paginas.length, recortados: cuenta.recortados };
}

/**
 * La hoja de PRUEBA para la matricial, en texto (ESC/P no dibuja líneas sin
 * pasar a gráficos): una «+» con su centro a 10 mm de cada borde y en el
 * centro, una regla de «|» cada 10 mm arriba y de «-» a la izquierda, y el
 * perfil usado. Con el perfil aplicado, como los valores.
 */
export function renglonesPruebaEscp(hoja: Pick<DisposicionHoja, "anchoMm" | "altoMm">, t: Transformacion, agujas: Agujas = 9): RenglonSalida[] {
  const cap = altoMayusculaMm(agujas);
  const W = hoja.anchoMm;
  const H = hoja.altoMm;
  const LETRA = 12; // 10 cpi
  const marca = (texto: string, cx: number, cy: number): RenglonSalida => ({
    texto,
    letraPt: LETRA,
    alinea: "centro",
    izqMm: aplicarX(t, cx) - 20,
    derMm: aplicarX(t, cx) + 20,
    arribaMm: aplicarY(t, cy) - cap / 2,
    baseMm: aplicarY(t, cy) + cap / 2,
  });
  const out: RenglonSalida[] = [
    marca("+", CRUZ_MM, CRUZ_MM), marca("+", W - CRUZ_MM, CRUZ_MM), marca("+", CRUZ_MM, H - CRUZ_MM), marca("+", W - CRUZ_MM, H - CRUZ_MM), marca("+", W / 2, H / 2),
  ];
  for (let x = 30; x <= W - 30; x += 10) out.push(marca("|", x, 20));
  for (let y = 30; y <= H - 30; y += 10) out.push(marca("-", 20, y));
  const f = (v: number) => String(Math.round(v * 100) / 100).replace(".", ",");
  out.push(
    marca(`PRUEBA ${f(W)} x ${f(H)} mm`, W / 2, H / 2 - 12),
    marca(`Impresora: ${t.perfil.nombre}`, W / 2, H / 2 + 12),
    marca(`Corrimiento X ${f(t.dx)} Y ${f(t.dy)} mm`, W / 2, H / 2 + 18),
    marca(`Escala X ${escalaPct(t.sx)} Y ${escalaPct(t.sy)}`, W / 2, H / 2 + 24),
    marca(`Del borde al centro de cada + : ${CRUZ_MM} mm`, W / 2, H / 2 + 30),
  );
  return out;
}
