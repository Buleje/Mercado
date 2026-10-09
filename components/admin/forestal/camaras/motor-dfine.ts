/**
 * El worker de D-FINE compartido por todas las cámaras del mosaico (ADR-475,
 * 2026-10-08): se crea con la primera que mira y se suelta un minuto después
 * de la última (mismo criterio que el detector de MediaPipe).
 *
 * `detectarEnRecortes` recibe recortes en fracciones del cuadro, los reduce a
 * `lado`×`lado` en este hilo (`createImageBitmap`, barato) y los transfiere;
 * devuelve las cajas ya llevadas a fracciones del cuadro entero.
 *
 * Para forzar el procesador (si la tarjeta gráfica diera cajas raras):
 * `localStorage["camaras:detector-cpu"] = "1"`.
 *
 * Revisión del 08-10: tres miradas fallidas seguidas (WebGPU perdido al
 * suspender la PC, worker colgado) o un worker caído cierran el motor y lo
 * ponen en pausa `PAUSA_TRAS_FALLOS_MS`; el vigía de cada cámara pasa al
 * detector liviano en vez de quedar «mirando» sin ver.
 */
import type { DeteccionPersona } from "@/lib/camaras/seguimiento";
import type { CajaFraccion } from "@/lib/camaras/vigia";
import { logger } from "@/lib/logger";
import type { CajaRecorte, PedidoDfine, RespuestaDfine } from "./detector-dfine.worker";

export const RUTA_MODELO_DFINE = "/modelos/dfine_s_obj2coco.onnx";
export const RUTA_MOTOR_ONNX = "/onnxruntime/";
const SOLTAR_TRAS_MS = 60_000;
/** Una mirada que tarda más que esto se da por perdida (worker colgado). */
const TOPE_DETECCION_MS = 30_000;
const FALLOS_PARA_PAUSA = 3;
const PAUSA_TRAS_FALLOS_MS = 60_000;

export interface InfoMotorDfine {
  backend: "webgpu" | "wasm";
  cargaMs: number;
}

interface Pendiente {
  ok: (cajas: CajaRecorte[][]) => void;
  mal: (err: Error) => void;
  reloj: ReturnType<typeof setTimeout>;
}

let worker: Worker | null = null;
let cargando: Promise<InfoMotorDfine> | null = null;
let info: InfoMotorDfine | null = null;
let usuarios = 0;
let relojSoltar: ReturnType<typeof setTimeout> | undefined;
let siguienteId = 1;
const pendientes = new Map<number, Pendiente>();
/** El `reject` de la carga en curso: `cerrar()` lo llama para que nadie espere para siempre. */
let rechazarCarga: ((err: Error) => void) | null = null;
let fallosSeguidos = 0;
let pausaHasta = 0;

/**
 * Sin tarjeta gráfica útil, se recuerda 7 días y no se vuelve a preguntar
 * (Brandon 2026-10-09: la consola decía «No available adapters.» en cada carga;
 * lo imprime Chrome cuando `requestAdapter()` no encuentra GPU). Pasada la
 * semana se prueba de nuevo, por si cambió el equipo o el driver.
 */
const CLAVE_SIN_GPU = "camaras:detector-sin-gpu-hasta";
const RECORDAR_SIN_GPU_MS = 7 * 24 * 60 * 60 * 1000;

function forzarCpu(): boolean {
  try {
    if (localStorage.getItem("camaras:detector-cpu") === "1") return true;
    return Number(localStorage.getItem(CLAVE_SIN_GPU) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

function recordarSinGpu(): void {
  try {
    localStorage.setItem(CLAVE_SIN_GPU, String(Date.now() + RECORDAR_SIN_GPU_MS));
  } catch (err) {
    logger.warn("[camaras] no se pudo recordar que no hay GPU", { error: String(err) });
  }
}

function cerrar(motivo: string): void {
  worker?.terminate();
  worker = null;
  cargando = null;
  info = null;
  rechazarCarga?.(new Error(motivo));
  rechazarCarga = null;
  for (const [id, p] of pendientes) {
    clearTimeout(p.reloj);
    p.mal(new Error(motivo));
    pendientes.delete(id);
  }
}

/** ¿D-FINE está en pausa por fallos seguidos? (el vigía pasa al detector liviano) */
export function motorDfineEnPausa(): boolean {
  return Date.now() < pausaHasta;
}

function anotarFallo(motivo: string): void {
  if (++fallosSeguidos < FALLOS_PARA_PAUSA) return;
  fallosSeguidos = 0;
  pausaHasta = Date.now() + PAUSA_TRAS_FALLOS_MS;
  logger.warn("[camaras] D-FINE falló seguido: queda en pausa 1 min", { motivo });
  cerrar(motivo);
}

/** Crea el worker y carga el modelo. Si falla, la próxima llamada reintenta (salvo en pausa). */
export function cargarMotorDfine(): Promise<InfoMotorDfine> {
  if (cargando) return cargando;
  if (motorDfineEnPausa()) return Promise.reject(new Error("D-FINE en pausa tras fallos seguidos"));
  cargando = new Promise<InfoMotorDfine>((ok, mal) => {
    rechazarCarga = mal;
    let w: Worker;
    try {
      w = new Worker(new URL("./detector-dfine.worker.ts", import.meta.url), { type: "module" });
    } catch (err) {
      mal(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    worker = w;
    const forzado = forzarCpu();
    w.onmessage = (e: MessageEvent<RespuestaDfine>) => {
      const r = e.data;
      if (r.tipo === "listo") {
        /* Eligió el procesador sin que se lo pidieran: no hay GPU (o es más lenta). */
        if (r.backend === "wasm" && !forzado) recordarSinGpu();
        info = { backend: r.backend, cargaMs: r.cargaMs };
        rechazarCarga = null;
        ok(info);
      } else if (r.tipo === "fallo-carga") {
        mal(new Error(r.error));
      } else {
        const p = pendientes.get(r.id);
        if (!p) return;
        pendientes.delete(r.id);
        clearTimeout(p.reloj);
        if (r.tipo === "fallo") {
          p.mal(new Error(r.error));
          anotarFallo(r.error);
          return;
        }
        fallosSeguidos = 0;
        p.ok(r.cajas);
      }
    };
    w.onerror = (e) => {
      const msg = e.message || "el worker del detector se cayó";
      /* Caído (no un pedido que falló): pausa directa, sin recargar en cada vuelta. */
      pausaHasta = Date.now() + PAUSA_TRAS_FALLOS_MS;
      cerrar(msg);
    };
    const pedido: PedidoDfine = {
      tipo: "cargar",
      modelo: new URL(RUTA_MODELO_DFINE, location.origin).href,
      motor: new URL(RUTA_MOTOR_ONNX, location.origin).href,
      forzarCpu: forzado,
    };
    w.postMessage(pedido);
  }).catch((err: unknown) => {
    cerrar(String(err));
    throw err;
  });
  return cargando;
}

export function infoMotorDfine(): InfoMotorDfine | null {
  return info ? { ...info } : null;
}

/** Marca una cámara usando el motor. Devuelve la función para soltarlo (idempotente). */
export function retenerMotorDfine(): () => void {
  usuarios++;
  clearTimeout(relojSoltar);
  let suelto = false;
  return () => {
    if (suelto) return;
    suelto = true;
    usuarios--;
    if (usuarios > 0) return;
    relojSoltar = setTimeout(() => {
      if (usuarios === 0) cerrar("detector soltado");
    }, SOLTAR_TRAS_MS);
  };
}

export interface RecortePedido extends CajaFraccion {
  /** Lado en píxeles al que se reduce el recorte antes de mirarlo. */
  lado: number;
}

/**
 * Personas en `recortes` de `fuente` (fracciones del cuadro). Devuelve TODAS
 * las cajas ≥ `umbral` en fracciones del cuadro; las repetidas entre recortes
 * que se pisan las junta quien llama.
 */
export async function detectarEnRecortes(
  fuente: HTMLCanvasElement,
  recortes: readonly RecortePedido[],
  umbral: number,
): Promise<DeteccionPersona[]> {
  await cargarMotorDfine();
  const w = worker;
  if (!w || recortes.length === 0) return [];
  const { width: W, height: H } = fuente;
  const imagenes = await Promise.all(
    recortes.map((r) =>
      createImageBitmap(
        fuente,
        Math.round(r.x * W),
        Math.round(r.y * H),
        Math.max(1, Math.round(r.ancho * W)),
        Math.max(1, Math.round(r.alto * H)),
        { resizeWidth: r.lado, resizeHeight: r.lado, resizeQuality: "high" },
      ),
    ),
  );
  const id = siguienteId++;
  const cajas = await new Promise<CajaRecorte[][]>((ok, mal) => {
    const reloj = setTimeout(() => {
      pendientes.delete(id);
      logger.warn("[camaras] el detector D-FINE no contestó a tiempo", { recortes: recortes.length });
      mal(new Error("el detector tardó demasiado"));
      /* Si todavía está en la fila del worker, que no lo mire: nadie lo espera. */
      const cancelar: PedidoDfine = { tipo: "cancelar", id };
      w.postMessage(cancelar);
      anotarFallo("el detector tardó demasiado");
    }, TOPE_DETECCION_MS);
    pendientes.set(id, { ok, mal, reloj });
    const pedido: PedidoDfine = {
      tipo: "detectar",
      id,
      umbral,
      recortes: imagenes.map((imagen, i) => ({ imagen, lado: recortes[i].lado })),
    };
    w.postMessage(pedido, imagenes);
  });
  const out: DeteccionPersona[] = [];
  cajas.forEach((lista, i) => {
    const r = recortes[i];
    for (const c of lista)
      out.push({
        x: r.x + c.x * r.ancho,
        y: r.y + c.y * r.alto,
        ancho: c.ancho * r.ancho,
        alto: c.alto * r.alto,
        confianza: c.confianza,
      });
  });
  return out;
}
