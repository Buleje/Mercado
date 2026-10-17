/// <reference lib="webworker" />
/**
 * Worker que lee los marcadores ArUco de la testa de las trozas (ADR-480,
 * 2026-10-08). Propio, NO dentro del de D-FINE: aquél tiene una fila en serie
 * donde una mirada tarda segundos, mira recortes de 320 y no el cuadro entero
 * en HD, y va a otro ritmo.
 *
 * - Motor: OpenCV.js 5.0.0-release.1 (Apache-2.0, 13 MB con el WASM adentro),
 *   servido desde el mismo origen (`scripts/copy-opencv-assets.mjs`). Se baja
 *   sólo cuando alguien cuenta trozas: el panel no lo carga nunca solo.
 * - Diccionario `DICT_4X4_250`. Sin corrección de bits: mejor no leer un
 *   marcador que leer otro número.
 * - Cada pedido trae el cuadro entero (ImageBitmap transferido) y devuelve,
 *   por marcador, su id, el lado en px y las 4 esquinas en fracciones.
 */

/** Lo mínimo de OpenCV.js que se usa acá (los tipos del paquete pesan y no se importan en el worker). */
interface MatLike {
  rows: number;
  data32F: Float32Array;
  data32S: Int32Array;
  delete(): void;
}
interface MatVectorLike {
  size(): number;
  get(i: number): MatLike;
  delete(): void;
}
interface OpenCv {
  Mat: new () => MatLike;
  MatVector: new () => MatVectorLike;
  matFromImageData(d: ImageData): MatLike;
  cvtColor(src: MatLike, dst: MatLike, code: number): void;
  COLOR_RGBA2GRAY: number;
  DICT_4X4_250: number;
  getPredefinedDictionary(d: number): unknown;
  aruco_DetectorParameters: new () => { errorCorrectionRate: number; delete?: () => void };
  aruco_RefineParameters: new (a: number, b: number, c: boolean) => unknown;
  aruco_ArucoDetector: new (
    dict: unknown,
    params: unknown,
    refine: unknown,
  ) => { detectMarkers(img: MatLike, corners: MatVectorLike, ids: MatLike, rejected: MatVectorLike): void };
}

export interface LecturaCruda {
  id: number;
  ladoPx: number;
  esquinas: [number, number][];
}

export type PedidoMarcadores =
  | { tipo: "cargar"; ruta: string }
  | { tipo: "leer"; id: number; imagen: ImageBitmap };

export type RespuestaMarcadores =
  | { tipo: "listo"; cargaMs: number }
  | { tipo: "fallo-carga"; error: string }
  | { tipo: "resultado"; id: number; lecturas: LecturaCruda[]; ancho: number; alto: number; ms: number }
  | { tipo: "fallo"; id: number; error: string };

const yo = self as unknown as DedicatedWorkerGlobalScope;
let cv: OpenCv | null = null;
type Detector = InstanceType<OpenCv["aruco_ArucoDetector"]>;
let detector: Detector | null = null;
let lienzo: OffscreenCanvas | null = null;

function enviar(r: RespuestaMarcadores): void {
  yo.postMessage(r);
}

/**
 * OpenCV.js es UMD: en un worker deja `globalThis.cv` (una promesa en la
 * 5.0). Primero como módulo (`import` del archivo público, fuera del
 * bundler); si el navegador no lo deja, el texto evaluado a mano.
 */
async function cargarOpenCv(ruta: string): Promise<OpenCv> {
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
  const mod = (crudo instanceof Promise ? await crudo : crudo) as Partial<OpenCv> & { onRuntimeInitialized?: () => void };
  if (!mod.Mat) await new Promise<void>((ok) => (mod.onRuntimeInitialized = () => ok()));
  return mod as OpenCv;
}

function crearDetector(o: OpenCv) {
  const dict = o.getPredefinedDictionary(o.DICT_4X4_250);
  const params = new o.aruco_DetectorParameters();
  /* 0 = el código tiene que coincidir entero (medido en el bench: lee igual
     desde 3 px por celda y nunca da otro número). */
  params.errorCorrectionRate = 0;
  const refine = new o.aruco_RefineParameters(10, 3, true);
  return new o.aruco_ArucoDetector(dict, params, refine);
}

function leer(imagen: ImageBitmap): { lecturas: LecturaCruda[]; ancho: number; alto: number } {
  if (!cv || !detector) throw new Error("OpenCV no está cargado");
  const { width: w, height: h } = imagen;
  if (!lienzo || lienzo.width !== w || lienzo.height !== h) lienzo = new OffscreenCanvas(w, h);
  const ctx = lienzo.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("sin lienzo 2D en el worker");
  ctx.drawImage(imagen, 0, 0);
  imagen.close();
  const src = cv.matFromImageData(ctx.getImageData(0, 0, w, h));
  const gris = new cv.Mat();
  const esquinas = new cv.MatVector();
  const ids = new cv.Mat();
  const rechazados = new cv.MatVector();
  try {
    cv.cvtColor(src, gris, cv.COLOR_RGBA2GRAY);
    detector.detectMarkers(gris, esquinas, ids, rechazados);
    const lecturas: LecturaCruda[] = [];
    for (let i = 0; i < ids.data32S.length; i++) {
      const c = esquinas.get(i);
      const p = c.data32F;
      const pts: [number, number][] = [0, 1, 2, 3].map((k) => [p[k * 2]!, p[k * 2 + 1]!]);
      c.delete();
      let lado = 0;
      for (let k = 0; k < 4; k++) {
        const [x1, y1] = pts[k]!;
        const [x2, y2] = pts[(k + 1) % 4]!;
        lado += Math.hypot(x2 - x1, y2 - y1) / 4;
      }
      lecturas.push({
        id: ids.data32S[i]!,
        ladoPx: Math.round(lado * 10) / 10,
        esquinas: pts.map(([x, y]) => [x / w, y / h]),
      });
    }
    return { lecturas, ancho: w, alto: h };
  } finally {
    src.delete();
    gris.delete();
    esquinas.delete();
    ids.delete();
    rechazados.delete();
  }
}

yo.onmessage = async (ev: MessageEvent<PedidoMarcadores>) => {
  const p = ev.data;
  if (p.tipo === "cargar") {
    const t0 = performance.now();
    try {
      cv = await cargarOpenCv(p.ruta);
      detector = crearDetector(cv);
      enviar({ tipo: "listo", cargaMs: Math.round(performance.now() - t0) });
    } catch (err) {
      enviar({ tipo: "fallo-carga", error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  const t0 = performance.now();
  try {
    const r = leer(p.imagen);
    enviar({ tipo: "resultado", id: p.id, ...r, ms: Math.round(performance.now() - t0) });
  } catch (err) {
    enviar({ tipo: "fallo", id: p.id, error: err instanceof Error ? err.message : String(err) });
  }
};
