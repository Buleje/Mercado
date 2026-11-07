/**
 * Visión del escáner (corre dentro de `escaner.worker.ts`): detecta el borde
 * del documento y endereza la perspectiva con OpenCV.js. Sin DOM salvo
 * ImageData (que existe en el worker). Reusa el mismo `/opencv/opencv.js`.
 */
import type { Cuadrilatero, Punto } from "@/lib/documentos/escaner/geometria";
import { ordenarEsquinas } from "@/lib/documentos/escaner/geometria";

export interface MatCv {
  rows: number;
  cols: number;
  data: Uint8Array;
  data32S: Int32Array;
  delete(): void;
}
interface MatVectorCv {
  size(): number;
  get(i: number): MatCv;
  delete(): void;
}
export interface OpenCvDoc {
  Mat: { new (): MatCv; new (rows: number, cols: number, type: number): MatCv };
  MatVector: new () => MatVectorCv;
  Size: new (w: number, h: number) => unknown;
  Scalar: new (...v: number[]) => unknown;
  CV_32FC2: number;
  COLOR_RGBA2GRAY: number;
  RETR_LIST: number;
  CHAIN_APPROX_SIMPLE: number;
  INTER_LINEAR: number;
  BORDER_CONSTANT: number;
  matFromImageData(d: ImageData): MatCv;
  matFromArray(rows: number, cols: number, type: number, datos: ArrayLike<number>): MatCv;
  cvtColor(src: MatCv, dst: MatCv, code: number): void;
  GaussianBlur(src: MatCv, dst: MatCv, k: unknown, sigma: number): void;
  Canny(src: MatCv, dst: MatCv, t1: number, t2: number): void;
  findContours(img: MatCv, contours: MatVectorCv, hierarchy: MatCv, mode: number, method: number): void;
  approxPolyDP(curve: MatCv, out: MatCv, epsilon: number, closed: boolean): void;
  arcLength(curve: MatCv, closed: boolean): number;
  contourArea(contour: MatCv, oriented?: boolean): number;
  isContourConvex(contour: MatCv): boolean;
  getPerspectiveTransform(src: MatCv, dst: MatCv): MatCv;
  warpPerspective(src: MatCv, dst: MatCv, M: MatCv, tam: unknown, flags: number, borde: number, valor: unknown): void;
}

/** La foto propone estar en gris para detectar bordes. */
function aGris(cv: OpenCvDoc, rgba: MatCv): MatCv {
  const gris = new cv.Mat();
  cv.cvtColor(rgba, gris, cv.COLOR_RGBA2GRAY);
  return gris;
}

/**
 * Busca el documento: el mayor cuadrilátero convexo cuya área supere el 18 %
 * de la foto. Devuelve las 4 esquinas NORMALIZADAS (0..1) o `null`.
 */
export function detectarDocumento(cv: OpenCvDoc, imagen: ImageData): Cuadrilatero | null {
  const rgba = cv.matFromImageData(imagen);
  const gris = aGris(cv, rgba);
  const suave = new cv.Mat();
  const bordes = new cv.Mat();
  const contornos = new cv.MatVector();
  const jerarquia = new cv.Mat();
  const w = imagen.width;
  const h = imagen.height;
  try {
    cv.GaussianBlur(gris, suave, new cv.Size(5, 5), 0);
    cv.Canny(suave, bordes, 60, 180);
    cv.findContours(bordes, contornos, jerarquia, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    const areaFoto = w * h;
    let mejor: Punto[] | null = null;
    let mejorArea = areaFoto * 0.18;
    for (let i = 0; i < contornos.size(); i++) {
      const c = contornos.get(i);
      const area = cv.contourArea(c);
      if (area < mejorArea) {
        c.delete();
        continue;
      }
      const aprox = new cv.Mat();
      cv.approxPolyDP(c, aprox, 0.02 * cv.arcLength(c, true), true);
      if (aprox.rows === 4 && cv.isContourConvex(aprox)) {
        mejor = [0, 1, 2, 3].map((k) => ({ x: aprox.data32S[k * 2] / w, y: aprox.data32S[k * 2 + 1] / h }));
        mejorArea = area;
      }
      aprox.delete();
      c.delete();
    }
    return mejor ? ordenarEsquinas(mejor) : null;
  } finally {
    rgba.delete();
    gris.delete();
    suave.delete();
    bordes.delete();
    contornos.delete();
    jerarquia.delete();
  }
}

/**
 * Endereza la perspectiva: toma el cuadrilátero (normalizado) de la foto y lo
 * estira a un rectángulo `anchoSalida × altoSalida`. Devuelve RGBA.
 */
export function enderezarDocumento(
  cv: OpenCvDoc,
  imagen: ImageData,
  q: Cuadrilatero,
  anchoSalida: number,
  altoSalida: number,
): ImageData {
  const rgba = cv.matFromImageData(imagen);
  const w = imagen.width;
  const h = imagen.height;
  const src = cv.matFromArray(4, 1, cv.CV_32FC2, [
    q[0].x * w, q[0].y * h,
    q[1].x * w, q[1].y * h,
    q[2].x * w, q[2].y * h,
    q[3].x * w, q[3].y * h,
  ]);
  const dst = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, anchoSalida, 0, anchoSalida, altoSalida, 0, altoSalida]);
  const M = cv.getPerspectiveTransform(src, dst);
  const out = new cv.Mat();
  try {
    cv.warpPerspective(rgba, out, M, new cv.Size(anchoSalida, altoSalida), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));
    return new ImageData(new Uint8ClampedArray(out.data), out.cols, out.rows);
  } finally {
    rgba.delete();
    src.delete();
    dst.delete();
    M.delete();
    out.delete();
  }
}
