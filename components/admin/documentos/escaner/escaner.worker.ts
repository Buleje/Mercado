/// <reference lib="webworker" />
/**
 * Worker del escáner de documentos (tipo CamScanner): carga OpenCV.js UNA vez
 * (13 MB, mismo `/opencv/opencv.js` que el resto) sólo al abrir el editor, y
 * atiende dos pedidos: detectar el borde del documento y enderezar la
 * perspectiva. El procesamiento pesado no bloquea la UI. Mismo patrón que
 * `camaras/testas.worker.ts`.
 */
import type { Cuadrilatero } from "@/lib/documentos/escaner/geometria";
import { detectarDocumento, enderezarDocumento, type OpenCvDoc } from "./escaner-cv";

export type PedidoEscaner =
  | { tipo: "cargar"; ruta: string }
  | { tipo: "detectar"; id: number; imagen: ImageData }
  | { tipo: "enderezar"; id: number; imagen: ImageData; quad: Cuadrilatero; ancho: number; alto: number };

export type RespuestaEscaner =
  | { tipo: "listo"; cargaMs: number }
  | { tipo: "fallo-carga"; error: string }
  | { tipo: "detectado"; id: number; quad: Cuadrilatero | null }
  | { tipo: "enderezada"; id: number; imagen: ImageData }
  | { tipo: "fallo"; id: number; error: string };

const yo = self as unknown as DedicatedWorkerGlobalScope;
let cv: OpenCvDoc | null = null;

function enviar(r: RespuestaEscaner, transferir: Transferable[] = []): void {
  yo.postMessage(r, transferir);
}

/** Igual que los otros workers: módulo fuera del bundler; si no, el texto evaluado. */
async function cargarOpenCv(ruta: string): Promise<OpenCvDoc> {
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
  const mod = (crudo instanceof Promise ? await crudo : crudo) as Partial<OpenCvDoc> & { onRuntimeInitialized?: () => void };
  if (!mod.Mat) await new Promise<void>((ok) => (mod.onRuntimeInitialized = () => ok()));
  return mod as OpenCvDoc;
}

yo.onmessage = async (ev: MessageEvent<PedidoEscaner>) => {
  const p = ev.data;
  if (p.tipo === "cargar") {
    const t0 = performance.now();
    try {
      cv = await cargarOpenCv(p.ruta);
      enviar({ tipo: "listo", cargaMs: performance.now() - t0 });
    } catch (e) {
      enviar({ tipo: "fallo-carga", error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }
  if (!cv) {
    enviar({ tipo: "fallo", id: p.id, error: "OpenCV no está cargado" });
    return;
  }
  try {
    if (p.tipo === "detectar") {
      const quad = detectarDocumento(cv, p.imagen);
      enviar({ tipo: "detectado", id: p.id, quad });
    } else if (p.tipo === "enderezar") {
      const imagen = enderezarDocumento(cv, p.imagen, p.quad, p.ancho, p.alto);
      enviar({ tipo: "enderezada", id: p.id, imagen }, [imagen.data.buffer]);
    }
  } catch (e) {
    enviar({ tipo: "fallo", id: p.id, error: e instanceof Error ? e.message : String(e) });
  }
};
