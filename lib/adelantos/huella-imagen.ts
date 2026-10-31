/**
 * La huella escaneada con la cámara (23-10): puro, sobre RGBA → testeable en Node.
 *
 * - `cajaGuia`: el marco donde va la yema del dedo (lo que se recorta y guarda).
 * - `nitidez`: varianza del laplaciano en gris. Una yema enfocada tiene crestas
 *   finas que dan bordes fuertes; movida o desenfocada, la varianza cae.
 * - `realzarHuella`: gris + contraste LOCAL (media y desvío por ventana, con
 *   imágenes integrales) — el mismo efecto que un CLAHE: las crestas se ven
 *   parejas aunque la linterna deje una mancha clara en el medio. Sin OpenCV:
 *   cargar los 13 MB de `/opencv/opencv.js` en el celular para esto no vale.
 *
 * Es la IMAGEN de la huella como prueba del recibo: no se compara contra RENIEC
 * ni contra otra huella.
 */

/** Por encima de esto (en la escala de `nitidez`, gris 0-255 a ~200 px) la foto sale con crestas. */
export const NITIDEZ_BUENA = 90;
/** Cuadros seguidos con `NITIDEZ_BUENA` antes de tomarla sola (~0,5 s a 6 por segundo). */
export const CUADROS_PARA_TOMAR = 3;

const lum = (r: number, g: number, b: number): number => 0.299 * r + 0.587 * g + 0.114 * b;

/** El gris de un buffer RGBA. */
export function aGris(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const gris = new Float32Array(w * h);
  for (let i = 0, p = 0; p < gris.length; i += 4, p++) gris[p] = lum(data[i], data[i + 1], data[i + 2]);
  return gris;
}

/**
 * El marco de la yema en un cuadro de `w × h`: vertical (3 de ancho por 4 de
 * alto, como una yema), centrado y del 46 % del lado corto.
 */
export function cajaGuia(w: number, h: number): { x: number; y: number; ancho: number; alto: number } {
  const ancho = Math.round(Math.min(w, (h * 3) / 4) * 0.46 * (w >= h ? 1 : 1.3));
  const alto = Math.min(h, Math.round((ancho * 4) / 3));
  return { x: Math.round((w - ancho) / 2), y: Math.round((h - alto) / 2), ancho, alto };
}

/** Varianza del laplaciano (4 vecinos) sobre el gris. 0 = imagen plana. */
export function nitidez(gris: Float32Array, w: number, h: number): number {
  if (w < 3 || h < 3) return 0;
  let suma = 0;
  let suma2 = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      const l = gris[p - 1] + gris[p + 1] + gris[p - w] + gris[p + w] - 4 * gris[p];
      suma += l;
      suma2 += l * l;
      n++;
    }
  }
  const media = suma / n;
  return suma2 / n - media * media;
}

/**
 * ¿Se toma sola? Las últimas `CUADROS_PARA_TOMAR` medidas nítidas Y parejas
 * (la mayor ≤ 1,35 × la menor): si el dedo se mueve, la nitidez salta.
 */
export function debeTomar(historial: readonly number[], umbral = NITIDEZ_BUENA): boolean {
  if (historial.length < CUADROS_PARA_TOMAR) return false;
  const ultimas = historial.slice(-CUADROS_PARA_TOMAR);
  const menor = Math.min(...ultimas);
  return menor >= umbral && Math.max(...ultimas) <= menor * 1.35;
}

/** Radio de la ventana local: unas dos crestas a la escala de la foto. */
export const radioLocal = (w: number, h: number): number => Math.max(4, Math.round(Math.min(w, h) / 40));

/**
 * Realza EN SITIO: cada píxel = 128 + ganancia · (gris − media local) / (desvío local + piso).
 * El `piso` evita inflar el ruido de una zona plana (fondo, uña): ahí queda gris parejo.
 */
export function realzarHuella(data: Uint8ClampedArray, w: number, h: number, { ganancia = 52, piso = 6 }: { ganancia?: number; piso?: number } = {}): void {
  const gris = aGris(data, w, h);
  const W = w + 1;
  const s1 = new Float64Array(W * (h + 1));
  const s2 = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let f1 = 0;
    let f2 = 0;
    for (let x = 0; x < w; x++) {
      const v = gris[y * w + x];
      f1 += v;
      f2 += v * v;
      s1[(y + 1) * W + x + 1] = s1[y * W + x + 1] + f1;
      s2[(y + 1) * W + x + 1] = s2[y * W + x + 1] + f2;
    }
  }
  const r = radioLocal(w, h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h - 1, y + r) + 1;
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r) + 1;
      const area = (x1 - x0) * (y1 - y0);
      const a = s1[y1 * W + x1] - s1[y0 * W + x1] - s1[y1 * W + x0] + s1[y0 * W + x0];
      const b = s2[y1 * W + x1] - s2[y0 * W + x1] - s2[y1 * W + x0] + s2[y0 * W + x0];
      const media = a / area;
      const desvio = Math.sqrt(Math.max(0, b / area - media * media));
      const p = y * w + x;
      const v = 128 + (ganancia * (gris[p] - media)) / (desvio + piso);
      const o = p * 4;
      data[o] = data[o + 1] = data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
}
