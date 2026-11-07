/// <reference lib="webworker" />
/**
 * Worker de «Medir por foto» (16-10, F1): mide las testas de la cara de una
 * carga con OpenCV.js. Propio y no el de los marcadores de troza: aquél lee
 * cuadros de video seguidos; éste endereza UNA foto de 12 MP, guarda la
 * imagen suavizada para «agregar al tocar» y devuelve la foto enderezada en
 * color (la que ve el operador, con los círculos encima). F2: guarda una
 * suavizada por cara (atrás y adelante): se agrega en la que se está viendo.
 *
 * Carga el MISMO `/opencv/opencv.js` (13 MB, mismo origen) y sólo cuando
 * alguien elige «Medir por foto». El algoritmo vive en `testas-cv.ts` y el
 * del toque en `segmentar-toque.ts` (sin DOM: también corren en el banco de Node).
 */
import type { CaraMedida, TestaPropuesta } from "@/lib/forestal/testas-medicion";
import { crearDetectorHojas, enderezar, medirCara, type DetectorHojas, type MatCv, type OpenCvTestas } from "./testas-cv";
import { testaEn } from "./segmentar-toque";

type OpenCvWorker = OpenCvTestas & {
  matFromImageData(d: ImageData): MatCv;
  cvtColor(src: MatCv, dst: MatCv, code: number): void;
  COLOR_RGBA2GRAY: number;
};

export type PedidoTestas =
  | { tipo: "cargar"; ruta: string }
  | { tipo: "medir"; id: number; imagen: ImageBitmap; cara: CaraMedida["cara"] }
  | { tipo: "agregar"; id: number; x: number; y: number; rRef: number; testaId: string; cara: CaraMedida["cara"] }
  | { tipo: "soltar" };

export type RespuestaTestas =
  | { tipo: "listo"; cargaMs: number }
  | { tipo: "fallo-carga"; error: string }
  | { tipo: "medida"; id: number; cara: CaraMedida; enderezada: Blob; otrosIds: number[]; ms: number }
  | { tipo: "sin-hoja"; id: number; otrosIds: number[] }
  | { tipo: "agregada"; id: number; testa: TestaPropuesta | null }
  | { tipo: "fallo"; id: number; error: string };

const yo = self as unknown as DedicatedWorkerGlobalScope;
let cv: OpenCvWorker | null = null;
let detector: DetectorHojas | null = null;
/** La suavizada de la última foto de cada cara: «agregar al tocar» busca el borde en la de esa cara. */
const ultimas = new Map<CaraMedida["cara"], { suave: MatCv; mmPorPx: number }>();

function enviar(r: RespuestaTestas): void {
  yo.postMessage(r);
}

function soltarCara(cara: CaraMedida["cara"]): void {
  ultimas.get(cara)?.suave.delete();
  ultimas.delete(cara);
}

/** Igual que el worker de marcadores: módulo fuera del bundler y, si no se deja, el texto evaluado. */
async function cargarOpenCv(ruta: string): Promise<OpenCvWorker> {
  const url = new URL(ruta, yo.location.origin).href;
  try {
    await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url);
  } catch {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`OpenCV respondió ${r.status} (¿falta npm run opencv:copiar?)`);
    new Function(await r.text())();
  }
  const crudo = (globalThis as unknown as { cv?: unknown }).cv;
  if (!crudo) throw new Error("OpenCV no quedó cargado");
  const mod = (crudo instanceof Promise ? await crudo : crudo) as Partial<OpenCvWorker> & { onRuntimeInitialized?: () => void };
  if (!mod.Mat) await new Promise<void>((ok) => (mod.onRuntimeInitialized = () => ok()));
  return mod as OpenCvWorker;
}

/** La enderezada en color, en JPEG: es lo que se dibuja y lo que va anotado a los papeles de la guía. */
async function jpegDe(rgba: MatCv): Promise<Blob> {
  const img = new ImageData(new Uint8ClampedArray(rgba.data), rgba.cols, rgba.rows);
  const lienzo = new OffscreenCanvas(rgba.cols, rgba.rows);
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("sin lienzo 2D en el worker");
  ctx.putImageData(img, 0, 0);
  return lienzo.convertToBlob({ type: "image/jpeg", quality: 0.85 });
}

async function medir(imagen: ImageBitmap, cara: CaraMedida["cara"]): Promise<Extract<RespuestaTestas, { tipo: "medida" | "sin-hoja" }>> {
  if (!cv || !detector) throw new Error("OpenCV no está cargado");
  const o = cv;
  const { width: w, height: h } = imagen;
  const lienzo = new OffscreenCanvas(w, h);
  const ctx = lienzo.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("sin lienzo 2D en el worker");
  ctx.drawImage(imagen, 0, 0);
  imagen.close();
  const rgba = o.matFromImageData(ctx.getImageData(0, 0, w, h));
  const gris = new o.Mat();
  try {
    o.cvtColor(rgba, gris, o.COLOR_RGBA2GRAY);
    soltarCara(cara);
    const r = medirCara(o, gris, detector, cara);
    if (!r.ok) return { tipo: "sin-hoja", id: 0, otrosIds: r.otrosIds };
    r.enderezada.delete();
    ultimas.set(cara, { suave: r.suave, mmPorPx: r.cara.mmPorPx });
    const color = enderezar(o, rgba, r.marco, 40);
    try {
      return { tipo: "medida", id: 0, cara: r.cara, enderezada: await jpegDe(color), otrosIds: r.otrosIds, ms: r.ms };
    } finally {
      color.delete();
    }
  } finally {
    rgba.delete();
    gris.delete();
  }
}

yo.onmessage = async (ev: MessageEvent<PedidoTestas>) => {
  const p = ev.data;
  if (p.tipo === "cargar") {
    const t0 = performance.now();
    try {
      cv = await cargarOpenCv(p.ruta);
      detector = crearDetectorHojas(cv);
      enviar({ tipo: "listo", cargaMs: Math.round(performance.now() - t0) });
    } catch (err) {
      enviar({ tipo: "fallo-carga", error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  if (p.tipo === "soltar") {
    for (const cara of [...ultimas.keys()]) soltarCara(cara);
    return;
  }
  try {
    if (p.tipo === "medir") {
      const r = await medir(p.imagen, p.cara);
      enviar({ ...r, id: p.id });
      return;
    }
    const ultima = ultimas.get(p.cara);
    if (!cv || !ultima) throw new Error("no hay foto medida de esa cara");
    const testa = testaEn(cv, ultima.suave, p.x, p.y, p.rRef, ultima.mmPorPx, p.testaId);
    enviar({ tipo: "agregada", id: p.id, testa });
  } catch (err) {
    enviar({ tipo: "fallo", id: p.id, error: err instanceof Error ? err.message : String(err) });
  }
};
