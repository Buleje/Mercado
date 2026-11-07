/**
 * Filtros de escaneo (puro, opera sobre RGBA → testeable en Node).
 *
 * Nombres para Brandon: Original, Aclarar, Blanco y negro, Magia pro. La meta
 * es que el DOCUMENTO se vea más claro y nítido, no un filtro de foto.
 */

export type FiltroId = "original" | "aclarar" | "byn" | "magia";

export interface Filtro {
  id: FiltroId;
  etiqueta: string;
  descripcion: string;
}

export const FILTROS: readonly Filtro[] = [
  { id: "original", etiqueta: "Original", descripcion: "Sin cambios" },
  { id: "aclarar", etiqueta: "Aclarar", descripcion: "Más brillo y contraste" },
  { id: "byn", etiqueta: "Blanco y negro", descripcion: "Documento nítido, papel bien blanco" },
  { id: "magia", etiqueta: "Magia pro", descripcion: "Color realzado y parejo" },
];

const lum = (r: number, g: number, b: number): number => 0.299 * r + 0.587 * g + 0.114 * b;

/** Percentil p (0..1) de un histograma de 256 cubetas con `total` muestras. */
function percentil(hist: Uint32Array, total: number, p: number): number {
  const meta = total * p;
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= meta) return i;
  }
  return 255;
}

/** Estira el contraste del canal de luz usando los percentiles 2 y 98 + sube el brillo. */
function aclarar(data: Uint8ClampedArray): void {
  const hist = new Uint32Array(256);
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) hist[Math.round(lum(data[i], data[i + 1], data[i + 2]))]++;
  const lo = percentil(hist, n, 0.02);
  const hi = percentil(hist, n, 0.98);
  const rango = Math.max(1, hi - lo);
  const brillo = 12; // empujón suave para que el papel quede bien claro
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = ((v - lo) / rango) * 255 + brillo;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }
}

/**
 * Blanco y negro para documentos: gris + umbral ADAPTATIVO (media local por
 * ventana, vía imagen integral) con una constante C. Da texto negro nítido
 * sobre papel bien blanco aunque la foto tenga sombras.
 */
function blancoNegro(data: Uint8ClampedArray, w: number, h: number): void {
  const n = w * h;
  const gris = new Float64Array(n);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) gris[p] = lum(data[i], data[i + 1], data[i + 2]);
  // Imagen integral (suma acumulada) para medias de ventana en O(1).
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let fila = 0;
    for (let x = 0; x < w; x++) {
      fila += gris[y * w + x];
      integral[(y + 1) * (w + 1) + (x + 1)] = integral[y * (w + 1) + (x + 1)] + fila;
    }
  }
  const radio = Math.max(8, Math.round(Math.min(w, h) / 24));
  const C = 10; // cuánto por debajo de la media local es «tinta»
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radio);
    const y1 = Math.min(h - 1, y + radio);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radio);
      const x1 = Math.min(w - 1, x + radio);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const suma =
        integral[(y1 + 1) * (w + 1) + (x1 + 1)] -
        integral[y0 * (w + 1) + (x1 + 1)] -
        integral[(y1 + 1) * (w + 1) + x0] +
        integral[y0 * (w + 1) + x0];
      const media = suma / area;
      const p = y * w + x;
      const val = gris[p] < media - C ? 0 : 255;
      const o = p * 4;
      data[o] = data[o + 1] = data[o + 2] = val;
    }
  }
}

/**
 * Magia pro: balance de blancos (mundo gris: cada canal se escala para igualar
 * su media a la media global) + realce de saturación + un toque de contraste.
 * Deja el documento parejo y con color vivo.
 */
function magia(data: Uint8ClampedArray): void {
  let sr = 0;
  let sg = 0;
  let sb = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    sr += data[i];
    sg += data[i + 1];
    sb += data[i + 2];
  }
  const mr = sr / n;
  const mg = sg / n;
  const mb = sb / n;
  const gris = (mr + mg + mb) / 3;
  const kr = gris / Math.max(1, mr);
  const kg = gris / Math.max(1, mg);
  const kb = gris / Math.max(1, mb);
  const sat = 1.35; // realce de color
  const contraste = 1.12;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] * kr;
    let g = data[i + 1] * kg;
    let b = data[i + 2] * kb;
    const l = lum(r, g, b);
    r = l + (r - l) * sat;
    g = l + (g - l) * sat;
    b = l + (b - l) * sat;
    data[i] = (r - 128) * contraste + 128;
    data[i + 1] = (g - 128) * contraste + 128;
    data[i + 2] = (b - 128) * contraste + 128;
  }
}

/** Aplica un filtro EN SITIO sobre un buffer RGBA. `original` no hace nada. */
export function aplicarFiltro(data: Uint8ClampedArray, w: number, h: number, filtro: FiltroId): void {
  if (filtro === "aclarar") aclarar(data);
  else if (filtro === "byn") blancoNegro(data, w, h);
  else if (filtro === "magia") magia(data);
}
