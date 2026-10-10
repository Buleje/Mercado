/// <reference lib="webworker" />
/**
 * Worker del detector de personas D-FINE-S (ADR-475, 2026-10-08). Corre fuera
 * del hilo de la pantalla: una mirada en el procesador tarda 0,3-1,3 s y en el
 * hilo principal trabaría el panel entero.
 *
 * - Motor: `onnxruntime-web/webgpu` (tarjeta gráfica si el navegador la da; si
 *   no, WASM en un hilo: sin aislamiento de origen no hay hilos). El `.wasm` y
 *   el modelo se sirven desde el mismo origen (`scripts/copy-onnx-assets.mjs`).
 * - Cada pedido trae recortes YA reducidos a `lado`×`lado` (ImageBitmap
 *   transferido). Devuelve, por recorte, las cajas de persona en fracciones del
 *   RECORTE: quien pidió las lleva al cuadro.
 * - D-FINE: entrada [1,3,lado,lado] en 0-1 (sin normalizar), salida `logits`
 *   [1,300,80] (sigmoide; clase 0 = persona en COCO) y `pred_boxes` [1,300,4]
 *   (cx, cy, ancho, alto en fracciones).
 * - Los pedidos van en fila: dos `run` a la vez sobre la misma sesión fallan.
 */
import * as ort from "onnxruntime-web/webgpu";

export interface CajaRecorte {
  x: number;
  y: number;
  ancho: number;
  alto: number;
  confianza: number;
}

export type PedidoDfine =
  | { tipo: "cargar"; modelo: string; motor: string; forzarCpu: boolean }
  | {
      tipo: "detectar";
      id: number;
      recortes: { imagen: ImageBitmap; lado: number }[];
      umbral: number;
    }
  | { tipo: "cancelar"; id: number };

export type RespuestaDfine =
  | { tipo: "listo"; backend: "webgpu" | "wasm"; cargaMs: number }
  | { tipo: "fallo-carga"; error: string }
  | { tipo: "resultado"; id: number; cajas: CajaRecorte[][]; ms: number }
  | { tipo: "fallo"; id: number; error: string };

const yo = self as unknown as DedicatedWorkerGlobalScope;
let sesion: ort.InferenceSession | null = null;
let fila: Promise<unknown> = Promise.resolve();
/** Pedidos que vencieron del lado de la pantalla: si todavía están en la fila, no se miran. */
const cancelados = new Set<number>();
const lienzos = new Map<number, OffscreenCanvasRenderingContext2D>();

function enviar(r: RespuestaDfine): void {
  yo.postMessage(r);
}

/** Una mirada en la tarjeta gráfica que tarda más que esto: mejor el procesador. */
const TOPE_PRUEBA_GPU_MS = 2_500;

/**
 * ¿Hay una tarjeta gráfica de verdad? Sin GPU, Chrome ofrece WebGPU emulado
 * por software (SwiftShader, `isFallbackAdapter`): medido 08-10, una mirada
 * pasó los 30 s. Ahí conviene el WASM.
 */
async function hayGpuReal(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    const a = (await gpu.requestAdapter()) as { info?: { isFallbackAdapter?: boolean; architecture?: string } } | null;
    if (!a) return false;
    return !a.info?.isFallbackAdapter && !/swiftshader/i.test(a.info?.architecture ?? "");
  } catch {
    return false;
  }
}

/**
 * Dos miradas de prueba (cuadro vacío a 320): la primera compila los shaders
 * de la tarjeta gráfica y sólo calienta; se mide la segunda.
 */
async function probar(s: ort.InferenceSession): Promise<number> {
  const lado = 320;
  const correr = async () => {
    const entrada = new ort.Tensor("float32", new Float32Array(3 * lado * lado), [1, 3, lado, lado]);
    const out = await s.run({ [s.inputNames[0]]: entrada });
    for (const t of Object.values(out)) t.dispose();
  };
  await correr();
  const t0 = performance.now();
  await correr();
  return performance.now() - t0;
}

async function cargar(modelo: string, motor: string, forzarCpu: boolean): Promise<void> {
  const t0 = performance.now();
  ort.env.wasm.wasmPaths = motor;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  const conGpu = !forzarCpu && (await hayGpuReal());
  const intentos: ("webgpu" | "wasm")[] = conGpu ? ["webgpu", "wasm"] : ["wasm"];
  let ultimo: unknown = null;
  for (const backend of intentos) {
    let s: ort.InferenceSession | null = null;
    try {
      s = await ort.InferenceSession.create(modelo, { executionProviders: [backend] });
      const ms = await probar(s);
      if (backend === "webgpu" && ms > TOPE_PRUEBA_GPU_MS) {
        ultimo = new Error(`la tarjeta gráfica tardó ${Math.round(ms)} ms en la prueba`);
        await s.release();
        continue;
      }
      sesion = s;
      enviar({ tipo: "listo", backend, cargaMs: Math.round(performance.now() - t0) });
      return;
    } catch (err) {
      ultimo = err;
      // Liberar la sesión que falló es limpieza: si también falla, manda el error de arriba.
      await s?.release().catch((e: unknown) => console.warn("[detector-dfine] no se liberó la sesión", e));
    }
  }
  enviar({ tipo: "fallo-carga", error: String(ultimo) });
}

function contexto(lado: number): OffscreenCanvasRenderingContext2D {
  let ctx = lienzos.get(lado);
  if (!ctx) {
    const c = new OffscreenCanvas(lado, lado);
    const nuevo = c.getContext("2d", { willReadFrequently: true });
    if (!nuevo) throw new Error("sin lienzo en el worker");
    ctx = nuevo;
    lienzos.set(lado, ctx);
  }
  return ctx;
}

async function mirarRecorte(s: ort.InferenceSession, imagen: ImageBitmap, lado: number, umbral: number) {
  const ctx = contexto(lado);
  ctx.drawImage(imagen, 0, 0, lado, lado);
  imagen.close();
  const px = ctx.getImageData(0, 0, lado, lado).data;
  const n = lado * lado;
  const f = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    f[i] = px[i * 4] / 255;
    f[n + i] = px[i * 4 + 1] / 255;
    f[2 * n + i] = px[i * 4 + 2] / 255;
  }
  const out = await s.run({ [s.inputNames[0]]: new ort.Tensor("float32", f, [1, 3, lado, lado]) });
  const logits = out.logits ?? out[s.outputNames[0]];
  const cajas = out.pred_boxes ?? out[s.outputNames[1]];
  const L = (await logits.getData()) as Float32Array;
  const B = (await cajas.getData()) as Float32Array;
  const [, consultas, clases] = logits.dims;
  const res: CajaRecorte[] = [];
  for (let q = 0; q < consultas; q++) {
    const confianza = 1 / (1 + Math.exp(-L[q * clases]));
    if (confianza < umbral) continue;
    const [cx, cy, w, h] = [B[q * 4], B[q * 4 + 1], B[q * 4 + 2], B[q * 4 + 3]];
    res.push({ x: cx - w / 2, y: cy - h / 2, ancho: w, alto: h, confianza });
  }
  logits.dispose();
  cajas.dispose();
  return res;
}

async function detectar(p: Extract<PedidoDfine, { tipo: "detectar" }>): Promise<void> {
  const s = sesion;
  if (cancelados.delete(p.id) || !s) {
    for (const r of p.recortes) r.imagen.close();
    if (!s) enviar({ tipo: "fallo", id: p.id, error: "el detector no está cargado" });
    return;
  }
  const t0 = performance.now();
  let i = 0;
  try {
    const cajas: CajaRecorte[][] = [];
    for (; i < p.recortes.length; i++) {
      const r = p.recortes[i];
      cajas.push(await mirarRecorte(s, r.imagen, r.lado, p.umbral));
    }
    enviar({ tipo: "resultado", id: p.id, cajas, ms: Math.round(performance.now() - t0) });
  } catch (err) {
    /* `mirarRecorte` cierra el suyo apenas lo dibuja; los que quedaban, acá. */
    for (const r of p.recortes.slice(i + 1)) r.imagen.close();
    enviar({ tipo: "fallo", id: p.id, error: String(err) });
  }
}

yo.onmessage = (e: MessageEvent<PedidoDfine>) => {
  const p = e.data;
  if (p.tipo === "cancelar") {
    cancelados.add(p.id);
    return;
  }
  fila = fila.then(() =>
    p.tipo === "cargar" ? cargar(p.modelo, p.motor, p.forzarCpu) : detectar(p),
  );
};
