/**
 * Puente con `escaner.worker.ts` desde la UI: carga OpenCV perezoso (sólo al
 * abrir el editor), expone detectar-borde y enderezar, y suelta el worker un
 * minuto después de cerrar. Si OpenCV no carga, las funciones avisan con `null`
 * y el editor degrada a recorte rectangular (sin perspectiva). Mismo patrón
 * que `camaras/motor-testas.ts`.
 */
import { logger } from "@/lib/logger";
import { RUTA_OPENCV } from "@/components/admin/forestal/camaras/motor-marcadores";
import type { Cuadrilatero } from "@/lib/documentos/escaner/geometria";
import type { PedidoEscaner, RespuestaEscaner } from "./escaner.worker";

const SOLTAR_TRAS_MS = 60_000;
const TOPE_CARGA_MS = 120_000;
const TOPE_OP_MS = 45_000;

type Respuesta = Extract<RespuestaEscaner, { tipo: "detectado" | "enderezada" }>;
interface Pendiente {
  ok: (r: Respuesta) => void;
  mal: (err: Error) => void;
  reloj: ReturnType<typeof setTimeout>;
}

let worker: Worker | null = null;
let cargando: Promise<number> | null = null;
let rechazarCarga: ((err: Error) => void) | null = null;
let usuarios = 0;
let relojSoltar: ReturnType<typeof setTimeout> | undefined;
let siguienteId = 1;
const pendientes = new Map<number, Pendiente>();

function cerrar(motivo: string): void {
  worker?.terminate();
  worker = null;
  cargando = null;
  rechazarCarga?.(new Error(motivo));
  rechazarCarga = null;
  for (const [id, p] of pendientes) {
    clearTimeout(p.reloj);
    p.mal(new Error(motivo));
    pendientes.delete(id);
  }
}

/** Avisa que el editor lo va a usar; devuelve con qué soltarlo al cerrar. */
export function retenerMotorEscaner(): () => void {
  usuarios++;
  clearTimeout(relojSoltar);
  let suelto = false;
  return () => {
    if (suelto) return;
    suelto = true;
    usuarios = Math.max(0, usuarios - 1);
    if (usuarios === 0) relojSoltar = setTimeout(() => cerrar("escáner soltado"), SOLTAR_TRAS_MS);
  };
}

export function cargarMotorEscaner(): Promise<number> {
  if (cargando) return cargando;
  cargando = new Promise<number>((ok, mal) => {
    let w: Worker;
    try {
      w = new Worker(new URL("./escaner.worker.ts", import.meta.url), { type: "module" });
    } catch (err) {
      mal(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    worker = w;
    rechazarCarga = mal;
    const reloj = setTimeout(() => cerrar("OpenCV tardó demasiado en cargar"), TOPE_CARGA_MS);
    w.onmessage = (ev: MessageEvent<RespuestaEscaner>) => {
      const r = ev.data;
      if (r.tipo === "listo") {
        clearTimeout(reloj);
        rechazarCarga = null;
        ok(r.cargaMs);
        return;
      }
      if (r.tipo === "fallo-carga") {
        clearTimeout(reloj);
        cerrar(`OpenCV no cargó: ${r.error}`);
        return;
      }
      const p = pendientes.get(r.id);
      if (!p) return;
      pendientes.delete(r.id);
      clearTimeout(p.reloj);
      if (r.tipo === "fallo") p.mal(new Error(r.error));
      else p.ok(r);
    };
    w.onerror = (ev) => {
      logger.warn("[escaner] el worker se cayó", { error: ev.message });
      cerrar("el escáner se cayó");
    };
    w.postMessage({ tipo: "cargar", ruta: RUTA_OPENCV } satisfies PedidoEscaner);
  });
  cargando.catch((err: unknown) => {
    logger.warn("[escaner] OpenCV no cargó", { error: String(err) });
    cargando = null;
  });
  return cargando;
}

function pedir(p: PedidoEscaner & { id: number }, transferir: Transferable[] = []): Promise<Respuesta> {
  const w = worker;
  if (!w) return Promise.reject(new Error("el escáner no está listo"));
  return new Promise<Respuesta>((ok, mal) => {
    const reloj = setTimeout(() => {
      pendientes.delete(p.id);
      mal(new Error("la operación tardó demasiado"));
    }, TOPE_OP_MS);
    pendientes.set(p.id, { ok, mal, reloj });
    w.postMessage(p, transferir);
  });
}

/** Detecta el borde del documento; `null` si OpenCV no está o no lo encontró. */
export async function detectarBorde(imagen: ImageData): Promise<Cuadrilatero | null> {
  try {
    await cargarMotorEscaner();
    const r = await pedir({ tipo: "detectar", id: siguienteId++, imagen });
    return r.tipo === "detectado" ? r.quad : null;
  } catch (err) {
    logger.warn("[escaner] detección no disponible", { error: String(err) });
    return null;
  }
}

/** Endereza la perspectiva; `null` si OpenCV no está (el editor hace recorte simple). */
export async function enderezarConOpenCv(
  imagen: ImageData,
  quad: Cuadrilatero,
  ancho: number,
  alto: number,
): Promise<ImageData | null> {
  try {
    await cargarMotorEscaner();
    const r = await pedir({ tipo: "enderezar", id: siguienteId++, imagen, quad, ancho, alto });
    return r.tipo === "enderezada" ? r.imagen : null;
  } catch (err) {
    logger.warn("[escaner] enderezado no disponible", { error: String(err) });
    return null;
  }
}
