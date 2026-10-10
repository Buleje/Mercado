/**
 * Detector de personas LOCAL del mosaico (Brandon 2026-10-07): MediaPipe Tasks
 * Vision `ObjectDetector` + EfficientDet-Lite0 int8 (COCO, categoría `person`).
 * Corre en el navegador, sin IA paga y sin mandar video a nadie.
 *
 * - UNA carga para todas las cámaras (singleton). Se baja recién cuando una
 *   cámara prende la detección (import dinámico: no pesa en el panel).
 * - Todo del propio sitio: `/mediapipe/wasm/*` (scripts/copy-mediapipe-assets.mjs)
 *   y `/modelos/efficientdet_lite0.tflite`. La CSP ya permite `'self'` +
 *   `'unsafe-eval'` (compilar WASM); el cargador inyecta un `<script>` que
 *   `'strict-dynamic'` acepta porque lo crea un script con nonce.
 * - Delegado: CPU (WASM + XNNPACK). El modelo int8 NO tiene camino de GPU:
 *   la tabla oficial de MediaPipe da «int8: CPU 29 ms / GPU —», y medido el
 *   07-10 con GPU (WebGL por software) el mismo cuadro dio 0 personas en
 *   830 ms contra 1 persona en 70 ms por CPU. `DELEGADOS` deja la puerta para
 *   un modelo float16 («GPU» primero y CPU de respaldo).
 * - `detect()` es síncrono y corre en el hilo principal: las cámaras se turnan
 *   solas (nunca dos a la vez) y `intervaloDeteccionMs()` estira la vuelta si
 *   las cámaras juntas comerían más de un cuarto de cada segundo.
 */
import type { ObjectDetector } from "@mediapipe/tasks-vision";
import {
  CADA_CUANTO_DETECTAR_MS,
  CONFIANZA_MINIMA_PERSONA,
  VENTANA_CONFIRMAR_PERSONA_MS,
} from "@/lib/camaras/personas";
import { logger } from "@/lib/logger";
import { imagenDeBase64 } from "./analizar-cuadro";

export const RUTA_WASM_MEDIAPIPE = "/mediapipe/wasm";
export const RUTA_MODELO_PERSONAS = "/modelos/efficientdet_lite0.tflite";
/** Sin cámaras mirando por este tiempo, se suelta el detector (≈40 MB de WASM). */
const SOLTAR_TRAS_MS = 60_000;
/** Parte de cada segundo que el detector puede ocupar el hilo principal entre todas las cámaras. */
const PRESUPUESTO_HILO = 0.25;

export type DelegadoDetector = "GPU" | "CPU";
/** En orden de preferencia; si uno no carga, el siguiente. Ver la cabecera: int8 = sólo CPU. */
const DELEGADOS: readonly DelegadoDetector[] = ["CPU"];

/** Caja de una persona en píxeles de la imagen que se le pasó a `detectarPersonas`. */
export interface CajaPersona {
  x: number;
  y: number;
  ancho: number;
  alto: number;
  confianza: number;
}

export interface DeteccionPersonas {
  personas: number;
  /** La confianza más alta del cuadro (0 si no hay nadie). */
  confianza: number;
  cajas: CajaPersona[];
}

export interface InfoDetectorPersonas {
  delegado: DelegadoDetector;
  /** Desde que se pidió hasta que quedó listo (WASM + modelo + calentamiento). */
  cargaMs: number;
  /** Promedio móvil de las últimas detecciones. */
  msPorDeteccion: number | null;
}

interface Cargado {
  detector: ObjectDetector;
  info: InfoDetectorPersonas;
}

let cargando: Promise<Cargado> | null = null;
let listo: Cargado | null = null;
let usuarios = 0;
let relojSoltar: ReturnType<typeof setTimeout> | undefined;

/**
 * MediaPipe (emscripten) guarda `console.error.bind(console)` al crear cada
 * detector, y por ahí avisa «INFO: Created TensorFlow Lite XNNPACK delegate for
 * CPU.» en la primera detección: Next lo pintaba como error rojo (Brandon
 * 2026-10-08). Mientras se crea, `console.error` es un filtro que descarta sólo
 * las líneas «INFO:»; MediaPipe se queda con el filtro y el resto de la app
 * vuelve al original al terminar. Medido en Chromium: un filtro puesto recién
 * en la detección no ve nada (la copia ya estaba hecha).
 */
async function sinAvisosInfo<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.error;
  const filtro = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("INFO:")) return;
    original.apply(console, args);
  };
  console.error = filtro;
  try {
    return await fn();
  } finally {
    if (console.error === filtro) console.error = original;
  }
}

/** Un cuadro chico para probar que el delegado de verdad corre (la GPU puede crearse y fallar al primer uso). */
function calentar(detector: ObjectDetector): void {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  c.getContext("2d")?.fillRect(0, 0, 64, 64);
  detector.detect(c);
}

async function crear(): Promise<Cargado> {
  const t0 = performance.now();
  const { FilesetResolver, ObjectDetector } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(RUTA_WASM_MEDIAPIPE);
  const con = (delegate: DelegadoDetector) =>
    ObjectDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: RUTA_MODELO_PERSONAS, delegate },
      runningMode: "IMAGE",
      scoreThreshold: CONFIANZA_MINIMA_PERSONA,
      categoryAllowlist: ["person"],
      maxResults: 25,
    });

  let ultimoError: unknown = null;
  for (const delegado of DELEGADOS) {
    let detector: ObjectDetector | null = null;
    try {
      detector = await sinAvisosInfo(() => con(delegado));
      calentar(detector);
      return {
        detector,
        info: { delegado, cargaMs: Math.round(performance.now() - t0), msPorDeteccion: null },
      };
    } catch (err) {
      logger.warn(`[camaras] el detector de personas no corre con ${delegado}`, {
        error: String(err),
      });
      detector?.close();
      ultimoError = err;
    }
  }
  throw ultimoError ?? new Error("sin delegado para el detector de personas");
}

/** El detector compartido. Si la carga falla, la próxima llamada reintenta. */
export function cargarDetectorPersonas(): Promise<InfoDetectorPersonas> {
  if (!cargando) {
    cargando = crear().then(
      (c) => {
        listo = c;
        return c;
      },
      (err: unknown) => {
        cargando = null;
        throw err;
      },
    );
  }
  return cargando.then((c) => c.info);
}

export function infoDetectorPersonas(): InfoDetectorPersonas | null {
  return listo ? { ...listo.info } : null;
}

/**
 * Cada cuánto conviene mirar UNA cámara con las que hay mirando ahora: 1 s
 * mientras todas juntas entren en `PRESUPUESTO_HILO`; si no, más espaciado,
 * con tope debajo de la ventana de confirmar (si no, nadie «aparecería»).
 */
export function intervaloDeteccionMs(): number {
  const ms = listo?.info.msPorDeteccion ?? 0;
  const pedido = (Math.max(1, usuarios) * ms) / PRESUPUESTO_HILO;
  const tope = Math.round(VENTANA_CONFIRMAR_PERSONA_MS / 2);
  return Math.round(Math.min(tope, Math.max(CADA_CUANTO_DETECTAR_MS, pedido)));
}

/** Marca una cámara usando el detector. Devuelve la función para soltarlo (idempotente). */
export function retenerDetectorPersonas(): () => void {
  usuarios++;
  clearTimeout(relojSoltar);
  let suelto = false;
  return () => {
    if (suelto) return;
    suelto = true;
    usuarios--;
    if (usuarios > 0) return;
    relojSoltar = setTimeout(() => {
      if (usuarios > 0 || !cargando) return;
      const p = cargando;
      cargando = null;
      listo = null;
      p.then((c) => c.detector.close()).catch((err: unknown) =>
        logger.warn("[camaras] no se pudo soltar el detector de personas", { error: String(err) }),
      );
    }, SOLTAR_TRAS_MS);
  };
}

/** Personas en la imagen (conviene ≤640 px de ancho: el modelo mira a 320×320). */
export async function detectarPersonas(fuente: TexImageSource): Promise<DeteccionPersonas> {
  await cargarDetectorPersonas();
  const c = listo;
  if (!c) throw new Error("detector de personas no disponible");
  const t0 = performance.now();
  const r = c.detector.detect(fuente);
  const ms = performance.now() - t0;
  const previo = c.info.msPorDeteccion;
  c.info.msPorDeteccion = Math.round((previo === null ? ms : previo * 0.8 + ms * 0.2) * 10) / 10;

  const cajas: CajaPersona[] = [];
  for (const d of r.detections) {
    const cat = d.categories.find((k) => k.categoryName === "person");
    const b = d.boundingBox;
    if (!cat || !b || cat.score < CONFIANZA_MINIMA_PERSONA) continue;
    cajas.push({
      x: b.originX,
      y: b.originY,
      ancho: b.width,
      alto: b.height,
      confianza: cat.score,
    });
  }
  return {
    personas: cajas.length,
    confianza: cajas.reduce((m, k) => Math.max(m, k.confianza), 0),
    cajas,
  };
}

/* ───────────────────────── Cuadros y foto ───────────────────────── */

const ANCHO_DETECCION = 640;
const ANCHO_FOTO = 1280;
const ANCHO_MINIATURA = 240;
/** El lienzo vino negro/vacío: probar `tomarCuadro` y volver a mirar el lienzo pasado este tiempo. */
const REINTENTAR_LIENZO_MS = 30_000;
/** Tantos cuadros idénticos seguidos = el video se trabó (4G caído): no se decide sobre él. */
const CUADROS_PARA_CONGELADO = 3;
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Lienzos reusados por UNA cámara (no se crea uno por cuadro). */
export interface LienzosCuadro {
  /** El cuadro a ≤1280 px: sobre éste se dibuja la foto. */
  foto: HTMLCanvasElement;
  /** El mismo cuadro a ≤640 px: es lo que mira el detector. */
  chico: HTMLCanvasElement;
  /** 16×9 para saber si el lienzo vino negro sin leer el cuadro entero. */
  muestra: HTMLCanvasElement;
  /** Hasta cuándo (ms) se va directo a `tomarCuadro` porque el lienzo no se deja leer. */
  respaldoHasta: number;
  vacios: number;
  /** Los 16×9 del cuadro anterior, para notar el video trabado. */
  previa: Uint8ClampedArray | null;
  repetidos: number;
}

/** `congelado` = el mismo cuadro que los anteriores (video trabado); `null` = no hay cuadro. */
export type CuadroLeido = "nuevo" | "congelado" | null;

export function crearLienzosCuadro(): LienzosCuadro {
  const muestra = document.createElement("canvas");
  muestra.width = 16;
  muestra.height = 9;
  return {
    foto: document.createElement("canvas"),
    chico: document.createElement("canvas"),
    muestra,
    respaldoHasta: 0,
    vacios: 0,
    previa: null,
    repetidos: 0,
  };
}

/** Libera la memoria de los lienzos (Safari no la suelta sólo con perder la referencia). */
export function soltarLienzosCuadro(l: LienzosCuadro): void {
  for (const c of [l.foto, l.chico, l.muestra]) {
    c.width = 0;
    c.height = 0;
  }
}

function medidas(f: HTMLCanvasElement | HTMLVideoElement | ImageBitmap): [number, number] {
  if (f instanceof HTMLVideoElement)
    return f.readyState >= 2 ? [f.videoWidth, f.videoHeight] : [0, 0];
  return [f.width, f.height];
}

function dibujar(
  destino: HTMLCanvasElement,
  fuente: CanvasImageSource,
  ancho: number,
  alto: number,
): void {
  if (destino.width !== ancho) destino.width = ancho;
  if (destino.height !== alto) destino.height = alto;
  destino.getContext("2d")?.drawImage(fuente, 0, 0, ancho, alto);
}

/** Pinta `fuente` en `foto` (≤1280) y `chico` (≤640). */
function pintar(l: LienzosCuadro, fuente: CanvasImageSource, ancho: number, alto: number): void {
  const ef = Math.min(1, ANCHO_FOTO / ancho);
  const fw = Math.max(1, Math.round(ancho * ef));
  const fh = Math.max(1, Math.round(alto * ef));
  dibujar(l.foto, fuente, fw, fh);
  const ec = Math.min(1, ANCHO_DETECCION / fw);
  dibujar(l.chico, l.foto, Math.max(1, Math.round(fw * ec)), Math.max(1, Math.round(fh * ec)));
}

/** El cuadro a 16×9 px. `null` si el lienzo está «sucio» (otro origen: `getImageData` tira SecurityError). */
function muestrear(l: LienzosCuadro): Uint8ClampedArray | null {
  try {
    const ctx = l.muestra.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.clearRect(0, 0, 16, 9);
    ctx.drawImage(l.chico, 0, 0, 16, 9);
    return ctx.getImageData(0, 0, 16, 9).data;
  } catch {
    return null;
  }
}

/**
 * ¿Vino negro o transparente? Pasa con el WebGL de EZUIKit: sin
 * `preserveDrawingBuffer` el búfer ya se borró cuando lo copiamos.
 */
function estaVacio(px: Uint8ClampedArray | null): boolean {
  if (!px) return true;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] > 8 && Math.max(px[i], px[i + 1], px[i + 2]) > 6) return false;
  }
  return true;
}

function iguales(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** El video en vivo siempre tiene ruido: N cuadros idénticos seguidos = trabado. */
function clasificar(l: LienzosCuadro, px: Uint8ClampedArray | null): CuadroLeido {
  l.repetidos = px && l.previa && iguales(px, l.previa) ? l.repetidos + 1 : 0;
  l.previa = px;
  return l.repetidos >= CUADROS_PARA_CONGELADO - 1 ? "congelado" : "nuevo";
}

async function bitmapDeBase64(b64: string): Promise<ImageBitmap | null> {
  const blob = imagenDeBase64(b64);
  if (!blob) return null;
  try {
    return await createImageBitmap(blob);
  } catch (err) {
    logger.warn("[camaras] el cuadro de respaldo no es una imagen", { error: String(err) });
    return null;
  }
}

/**
 * Deja el cuadro actual en `l.foto` y `l.chico`. Primero el lienzo/video del
 * visor (barato); si viene negro o no se deja leer dos veces seguidas,
 * `tomarCuadro` (base64 de EZUIKit, más caro) por `REINTENTAR_LIENZO_MS`.
 */
export async function leerCuadro(
  l: LienzosCuadro,
  leerFuente: () => HTMLCanvasElement | HTMLVideoElement | null,
  tomarCuadro: (() => Promise<string | null>) | undefined,
): Promise<CuadroLeido> {
  if (Date.now() >= l.respaldoHasta) {
    const f = leerFuente();
    const [w, h] = f ? medidas(f) : [0, 0];
    if (f && w && h) {
      pintar(l, f, w, h);
      const px = muestrear(l);
      if (!estaVacio(px)) {
        l.vacios = 0;
        return clasificar(l, px);
      }
      if (++l.vacios >= 2) l.respaldoHasta = Date.now() + REINTENTAR_LIENZO_MS;
    }
  }
  if (!tomarCuadro) return null;
  const b64 = await tomarCuadro();
  const bmp = b64 ? await bitmapDeBase64(b64) : null;
  if (!bmp) return null;
  pintar(l, bmp, bmp.width, bmp.height);
  bmp.close();
  return clasificar(l, muestrear(l));
}

/** «jueves 07/10 · 22:15:03» en hora de Lima (UTC−5 todo el año). */
export function selloLima(ms: number): string {
  const d = new Date(ms - 5 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${DIAS[d.getUTCDay()]} ${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} · ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

/**
 * Dibuja sobre `l.foto` las cajas (vienen en píxeles de `l.chico`) y una banda
 * con cámara + hora, y devuelve el JPEG (0,85) + una miniatura en data URL.
 * `color` = un token del DS ya resuelto (p. ej. `--data-warning-500`).
 */
export async function componerFoto(
  l: LienzosCuadro,
  cajas: CajaPersona[],
  rotulo: string,
  color: string,
): Promise<{ jpeg: Blob; miniatura: string } | null> {
  const ctx = l.foto.getContext("2d");
  if (!ctx || !l.chico.width) return null;
  const { width: w, height: h } = l.foto;
  const k = w / l.chico.width;
  const grosor = Math.max(3, Math.round(w / 320));
  const letra = Math.max(14, Math.round(w / 55));
  ctx.font = `600 ${letra}px system-ui, sans-serif`;
  ctx.textBaseline = "top";
  ctx.lineWidth = grosor;
  if (color) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
  }
  for (const c of cajas) {
    const [x, y] = [c.x * k, c.y * k];
    ctx.strokeRect(x, y, c.ancho * k, c.alto * k);
    const txt = `${Math.round(c.confianza * 100)} %`;
    const ty = Math.max(0, y - letra - 6);
    ctx.fillRect(x - grosor / 2, ty, ctx.measureText(txt).width + 10, letra + 6);
    ctx.save();
    ctx.fillStyle = "black";
    ctx.fillText(txt, x + 5 - grosor / 2, ty + 3);
    ctx.restore();
  }
  const banda = letra + 12;
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(0, h - banda, w, banda);
  ctx.fillStyle = "white";
  ctx.fillText(rotulo, 8, h - banda + 6, w - 16);
  ctx.restore();

  /* La miniatura ANTES del await: si la cámara se cierra mientras se codifica
     el JPEG, los lienzos ya se soltaron. Data URL (≈10 KB) y no object URL: la
     burbuja puede guardar varias sin que nadie tenga que revocarlas. */
  const m = document.createElement("canvas");
  dibujar(m, l.foto, ANCHO_MINIATURA, Math.max(1, Math.round((h * ANCHO_MINIATURA) / w)));
  const miniatura = m.toDataURL("image/jpeg", 0.7);
  m.width = 0;
  m.height = 0;
  const jpeg = await new Promise<Blob | null>((ok) => l.foto.toBlob(ok, "image/jpeg", 0.85));
  return jpeg ? { jpeg, miniatura } : null;
}
