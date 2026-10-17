/**
 * code128 — código de barras Code 128 (subconjunto B) como SVG, sin librerías.
 *
 * Para qué: el QR de la etiqueta de una troza abre su ficha con el celular,
 * pero la pistola lectora de la balanza o del almacén no lee QR — lee barras
 * lineales. El subconjunto B cubre todo el ASCII imprimible (letras, números,
 * `-`, `/`), que es lo que llevan los códigos de planta («115-A», «PQ-2609-004»).
 *
 * Cómo se arma (ISO/IEC 15417):
 *   [zona muda] START-B · un símbolo por carácter · CHECKSUM · STOP [zona muda]
 * Cada símbolo son 3 barras + 3 espacios que suman 11 módulos; el STOP suma 13
 * (lleva una barra final de 2). El checksum es
 *   (104 + Σ valor(carácter_i) × i) mod 103, con i desde 1.
 *
 * PURO: devuelve strings. El SVG va inline en la hoja de etiquetas (la CSP de
 * `openCtpReport` no deja cargar nada externo, así que no puede ser un <img src>).
 */

/**
 * Anchos de barra/espacio de los 107 símbolos (valor = índice). Cada cadena
 * alterna barra, espacio, barra… empezando por barra.
 */
export const CODE128_PATRONES: readonly string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

export const CODE128_START_B = 104;
export const CODE128_STOP = 106;
/** La zona muda mínima que pide la norma a cada lado: 10 módulos. */
export const CODE128_ZONA_MUDA = 10;

/**
 * Lo que el subconjunto B puede codificar: ASCII 32-126. Las tildes se quitan
 * («Tornillo Ñ» → «Tornillo N») y lo demás se vuelve «-», para que la pistola
 * lea lo mismo que dice el texto impreso debajo.
 */
export function textoCode128(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "-")
    .trim();
}

/** Los valores de los símbolos, START y CHECKSUM incluidos, sin el STOP. */
export function valoresCode128(texto: string): number[] {
  const limpio = textoCode128(texto);
  const datos = [...limpio].map((c) => c.charCodeAt(0) - 32);
  const suma = datos.reduce((acc, v, i) => acc + v * (i + 1), CODE128_START_B);
  return [CODE128_START_B, ...datos, suma % 103];
}

/** El checksum (mod 103) de un texto en subconjunto B. */
export function checksumCode128(texto: string): number {
  const v = valoresCode128(texto);
  return v[v.length - 1]!;
}

/**
 * La secuencia de módulos (1 = barra, 0 = espacio) SIN zona muda. Sirve para
 * probar el patrón contra la norma y para dibujar.
 */
export function modulosCode128(texto: string): string {
  const simbolos = [...valoresCode128(texto), CODE128_STOP];
  let bits = "";
  for (const v of simbolos) {
    const patron = CODE128_PATRONES[v]!;
    for (let i = 0; i < patron.length; i++) {
      bits += (i % 2 === 0 ? "1" : "0").repeat(Number(patron[i]));
    }
  }
  return bits;
}

export interface Code128SvgOpts {
  /** Alto del dibujo en módulos (el ancho real lo pone el CSS). Default 40. */
  altoModulos?: number;
  /** Color de las barras. Negro por defecto: las térmicas imprimen sólo negro. */
  color?: string;
  /** Texto accesible (`aria-label`). */
  etiqueta?: string;
}

/**
 * El código de barras como `<svg>` inline. Se estira al ancho de su caja
 * (`preserveAspectRatio="none"`): el alto queda fijo y las barras mantienen su
 * proporción entre sí, que es lo único que mira el lector. `""` si no hay nada
 * que codificar — mejor sin barras que unas barras de un texto vacío.
 */
export function code128Svg(texto: string, opts: Code128SvgOpts = {}): string {
  if (!textoCode128(texto)) return "";
  const bits = modulosCode128(texto);
  const alto = opts.altoModulos ?? 40;
  const ancho = bits.length + CODE128_ZONA_MUDA * 2;
  const color = opts.color ?? "#000";
  /* Una barra ancha es UN rect (no N de 1 módulo): menos nodos y sin costuras
     de antialias entre módulos vecinos. */
  let rects = "";
  let i = 0;
  while (i < bits.length) {
    if (bits[i] === "1") {
      let j = i;
      while (j < bits.length && bits[j] === "1") j++;
      rects += `<rect x="${i + CODE128_ZONA_MUDA}" y="0" width="${j - i}" height="${alto}"/>`;
      i = j;
    } else {
      i++;
    }
  }
  const aria = (opts.etiqueta ?? `Código de barras ${textoCode128(texto)}`).replace(/[&<>"']/g, "");
  return `<svg class="barras" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ancho} ${alto}" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="${aria}"><rect width="${ancho}" height="${alto}" fill="#fff"/><g fill="${color}">${rects}</g></svg>`;
}
