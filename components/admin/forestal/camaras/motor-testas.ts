/**
 * El worker de «Medir por foto» (16-10): se crea cuando el operador elige una
 * foto y se suelta un minuto después de cerrar la ventana (13 MB de WASM no
 * se quedan por las dudas). Mismo patrón que `motor-marcadores.ts`.
 *
 * La foto va casi ENTERA: la hoja de escala tiene que quedar con ≥100 px de
 * lado (`LADO_MIN_HOJA_PX`) y a 4 m, en una foto de 12 MP, ocupa ~200.
 * Achicar a 2560 como los marcadores la deja en el límite.
 */
import type { CaraMedida, TestaPropuesta } from "@/lib/forestal/testas-medicion";
import { logger } from "@/lib/logger";
import { RUTA_OPENCV } from "./motor-marcadores";
import type { PedidoTestas, RespuestaTestas } from "./testas.worker";

const SOLTAR_TRAS_MS = 60_000;
const TOPE_CARGA_MS = 120_000;
const TOPE_MEDIDA_MS = 45_000;
const LADO_MAX = 4096;

export type MedidaDeFoto =
  | { ok: true; cara: CaraMedida; enderezada: Blob; otrosIds: number[]; ms: number }
  | { ok: false; motivo: "sin_hoja"; otrosIds: number[] };

type Respuesta = Exclude<RespuestaTestas, { tipo: "listo" } | { tipo: "fallo-carga" }>;
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

/** Avisa que alguien lo va a usar; devuelve con qué soltarlo. */
export function retenerMotorTestas(): () => void {
  usuarios++;
  clearTimeout(relojSoltar);
  let suelto = false;
  return () => {
    if (suelto) return;
    suelto = true;
    usuarios = Math.max(0, usuarios - 1);
    worker?.postMessage({ tipo: "soltar" } satisfies PedidoTestas);
    if (usuarios === 0) relojSoltar = setTimeout(() => cerrar("motor de testas soltado"), SOLTAR_TRAS_MS);
  };
}

/** Carga OpenCV en el worker (una vez). Devuelve cuánto tardó, en ms. */
export function cargarMotorTestas(): Promise<number> {
  if (cargando) return cargando;
  cargando = new Promise<number>((ok, mal) => {
    let w: Worker;
    try {
      w = new Worker(new URL("./testas.worker.ts", import.meta.url), { type: "module" });
    } catch (err) {
      mal(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    worker = w;
    rechazarCarga = mal;
    const reloj = setTimeout(() => cerrar("OpenCV tardó demasiado en cargar"), TOPE_CARGA_MS);
    w.onmessage = (ev: MessageEvent<RespuestaTestas>) => {
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
      logger.warn("[testas] el worker de testas se cayó", { error: ev.message });
      cerrar("el medidor de testas se cayó");
    };
    w.postMessage({ tipo: "cargar", ruta: RUTA_OPENCV } satisfies PedidoTestas);
  });
  /* Un fallo de carga deja libre el camino para reintentar. */
  cargando.catch((err: unknown) => {
    logger.warn("[testas] OpenCV no cargó", { error: String(err) });
    cargando = null;
  });
  return cargando;
}

function pedir(p: PedidoTestas & { id: number }, transferir: Transferable[] = []): Promise<Respuesta> {
  const w = worker;
  if (!w) return Promise.reject(new Error("el medidor de testas no está listo"));
  return new Promise<Respuesta>((ok, mal) => {
    const reloj = setTimeout(() => {
      pendientes.delete(p.id);
      mal(new Error("la medición tardó demasiado"));
    }, TOPE_MEDIDA_MS);
    pendientes.set(p.id, { ok, mal, reloj });
    w.postMessage(p, transferir);
  });
}

/** Mide la cara de la carga en la foto (con la orientación del EXIF). */
export async function medirTestasDe(foto: Blob, cara: CaraMedida["cara"] = "atras"): Promise<MedidaDeFoto> {
  await cargarMotorTestas();
  let bmp = await createImageBitmap(foto, { imageOrientation: "from-image" });
  const lado = Math.max(bmp.width, bmp.height);
  if (lado > LADO_MAX) {
    const k = LADO_MAX / lado;
    const chico = await createImageBitmap(bmp, {
      resizeWidth: Math.round(bmp.width * k),
      resizeHeight: Math.round(bmp.height * k),
      resizeQuality: "high",
    });
    bmp.close();
    bmp = chico;
  }
  const r = await pedir({ tipo: "medir", id: siguienteId++, imagen: bmp, cara }, [bmp]);
  if (r.tipo === "sin-hoja") return { ok: false, motivo: "sin_hoja", otrosIds: r.otrosIds };
  if (r.tipo !== "medida") throw new Error("respuesta inesperada del medidor");
  return { ok: true, cara: r.cara, enderezada: r.enderezada, otrosIds: r.otrosIds, ms: r.ms };
}

/** La testa donde tocó el operador (px de la enderezada); `null` = no hay borde claro. */
export async function testaDondeToco(x: number, y: number, rRef: number, testaId: string): Promise<TestaPropuesta | null> {
  const r = await pedir({ tipo: "agregar", id: siguienteId++, x, y, rRef, testaId });
  if (r.tipo !== "agregada") throw new Error("respuesta inesperada del medidor");
  return r.testa;
}
