/**
 * El worker de OpenCV.js que lee los marcadores de troza (ADR-480,
 * 2026-10-08), compartido por quien lo pida: «Contar ahora», «Probar con una
 * foto» y, cuando se cablee, el vigía del mosaico (`lector-marcadores-vivo`).
 *
 * Se crea con el primer pedido y se suelta un minuto después del último
 * (13 MB de WASM en RAM no se quedan por las dudas: la PC de Brandon ya anda
 * justa con D-FINE). `leerMarcadoresDe` recibe cualquier imagen del navegador
 * (un lienzo, un `<img>`, un archivo) y la manda ENTERA al worker: a 5 m el
 * marcador ocupa ~20 px y achicar el cuadro lo borra.
 */
import type { LecturaMarcador } from "@/lib/camaras/marcadores";
import { logger } from "@/lib/logger";
import type { PedidoMarcadores, RespuestaMarcadores } from "./marcadores.worker";

export const RUTA_OPENCV = "/opencv/opencv.js";
const SOLTAR_TRAS_MS = 60_000;
/** 13 MB por 4G pueden tardar: la primera carga tiene tope largo. */
const TOPE_CARGA_MS = 120_000;
const TOPE_LECTURA_MS = 20_000;
/** Más ancho que esto no ayuda y pesa (las fotos de la cámara llegan a 2560). */
const ANCHO_MAX = 2560;

export interface LeidoDeCuadro {
  lecturas: LecturaMarcador[];
  ancho: number;
  alto: number;
  ms: number;
}

interface Pendiente {
  ok: (r: LeidoDeCuadro) => void;
  mal: (err: Error) => void;
  reloj: ReturnType<typeof setTimeout>;
  at: number;
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
export function retenerMotorMarcadores(): () => void {
  usuarios++;
  clearTimeout(relojSoltar);
  let suelto = false;
  return () => {
    if (suelto) return;
    suelto = true;
    usuarios = Math.max(0, usuarios - 1);
    if (usuarios === 0) relojSoltar = setTimeout(() => cerrar("motor de marcadores soltado"), SOLTAR_TRAS_MS);
  };
}

/** Carga OpenCV en el worker (una vez). Devuelve cuánto tardó la carga, en ms. */
export function cargarMotorMarcadores(): Promise<number> {
  if (cargando) return cargando;
  cargando = new Promise<number>((ok, mal) => {
    let w: Worker;
    try {
      w = new Worker(new URL("./marcadores.worker.ts", import.meta.url), { type: "module" });
    } catch (err) {
      mal(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    worker = w;
    rechazarCarga = mal;
    const reloj = setTimeout(() => cerrar("OpenCV tardó demasiado en cargar"), TOPE_CARGA_MS);
    w.onmessage = (ev: MessageEvent<RespuestaMarcadores>) => {
      const r = ev.data;
      if (r.tipo === "listo") {
        clearTimeout(reloj);
        rechazarCarga = null;
        ok(r.cargaMs);
      } else if (r.tipo === "fallo-carga") {
        clearTimeout(reloj);
        cerrar(`OpenCV no cargó: ${r.error}`);
      } else {
        const p = pendientes.get(r.id);
        if (!p) return;
        pendientes.delete(r.id);
        clearTimeout(p.reloj);
        if (r.tipo === "fallo") p.mal(new Error(r.error));
        else
          p.ok({
            ancho: r.ancho,
            alto: r.alto,
            ms: r.ms,
            lecturas: r.lecturas.map((l) => ({ ...l, at: p.at })),
          });
      }
    };
    w.onerror = (ev) => {
      logger.warn("[camaras] el worker de marcadores se cayó", { error: ev.message });
      cerrar("el lector de marcadores se cayó");
    };
    w.postMessage({ tipo: "cargar", ruta: RUTA_OPENCV } satisfies PedidoMarcadores);
  });
  /* Un fallo de carga deja libre el camino para reintentar. */
  cargando.catch(() => {
    cargando = null;
  });
  return cargando;
}

/** Lee los marcadores de una imagen. `at` = cuándo se tomó (ms), para confirmar después. */
export async function leerMarcadoresDe(
  fuente: ImageBitmapSource,
  at: number = Date.now(),
): Promise<LeidoDeCuadro> {
  await cargarMotorMarcadores();
  let bmp = await createImageBitmap(fuente);
  if (bmp.width > ANCHO_MAX) {
    const alto = Math.round((bmp.height * ANCHO_MAX) / bmp.width);
    const chico = await createImageBitmap(bmp, { resizeWidth: ANCHO_MAX, resizeHeight: alto, resizeQuality: "high" });
    bmp.close();
    bmp = chico;
  }
  const w = worker;
  if (!w) {
    bmp.close();
    throw new Error("el lector de marcadores no está listo");
  }
  const id = siguienteId++;
  return new Promise<LeidoDeCuadro>((ok, mal) => {
    const reloj = setTimeout(() => {
      pendientes.delete(id);
      mal(new Error("la lectura tardó demasiado"));
    }, TOPE_LECTURA_MS);
    pendientes.set(id, { ok, mal, reloj, at });
    w.postMessage({ tipo: "leer", id, imagen: bmp } satisfies PedidoMarcadores, [bmp]);
  });
}
