/**
 * OCR en el navegador, sin subir nada (ADR-397).
 *
 * Para leer una CAPTURA DE PANTALLA —texto impreso, nítido— no hace falta un
 * modelo de visión: tesseract.js lo lee en el propio navegador, gratis, sin
 * clave de API y sin internet. Los tres archivos que necesita (worker, core
 * WASM e idioma) se sirven desde `/public/tesseract/` (los copia
 * `scripts/copy-tesseract-assets.mjs` en `postinstall`) porque la CSP del
 * panel sólo permite el propio origen.
 *
 * Medido con la captura real del SNIFFS (1415 px de ancho): a escala 1× el
 * OCR pierde puntos decimales («9753» por «9.753»); a 2× lee la tabla entera
 * sin un error (confianza 91). Por eso toda imagen menor a 2400 px se amplía
 * antes de leerla.
 *
 * Fotos de celular de un papel o de una pantalla ajena son otra cosa: ahí sí
 * hace falta un modelo de visión (`lib/ai/vision-extract.ts`). Este módulo
 * es para lo que ya está en píxeles limpios.
 */

import type { Worker } from "tesseract.js";

export interface ProgresoOcr {
  /** Qué está haciendo: cargando el motor, el idioma, reconociendo… */
  etapa: string;
  /** 0–1 dentro de la etapa. */
  progreso: number;
}

const RUTA = "/tesseract";
let workerVivo: Promise<Worker> | null = null;
let avisarProgreso: ((p: ProgresoOcr) => void) | null = null;

const ETAPAS: Record<string, string> = {
  "loading tesseract core": "Cargando el motor de lectura",
  "initializing tesseract": "Preparando el motor",
  "loading language traineddata": "Cargando el idioma",
  "initializing api": "Preparando la lectura",
  "recognizing text": "Leyendo la captura",
};

async function obtenerWorker(): Promise<Worker> {
  if (!workerVivo) {
    workerVivo = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker("spa", 1, {
        workerPath: `${RUTA}/worker.min.js`,
        corePath: `${RUTA}/core`,
        langPath: `${RUTA}/lang`,
        /* Un worker desde blob: lo bloquea la CSP; desde /public es 'self'. */
        workerBlobURL: false,
        logger: (m: { status: string; progress: number }) => {
          avisarProgreso?.({ etapa: ETAPAS[m.status] ?? m.status, progreso: m.progress });
        },
      });
    })().catch((e) => {
      workerVivo = null;
      throw e;
    });
  }
  return workerVivo;
}

/**
 * La imagen ampliada a un ancho que el OCR lea bien. Devuelve la misma si ya
 * es grande. Se amplía con el canvas del navegador: no hace falta librería.
 */
async function ampliar(imagen: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(imagen);
  const w = bitmap.width;
  const escala = w >= 2400 ? 1 : w >= 1200 ? 2 : 3;
  if (escala === 1) {
    bitmap.close();
    return imagen;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return imagen;
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No pude preparar la imagen."))), "image/png");
  });
}

/**
 * El texto de una imagen, línea por línea como lo ve el OCR.
 *
 * `confianza` es la del motor (0–100): sirve para avisar, no para decidir —
 * la decisión la toma el operador mirando las filas.
 */
export async function leerTextoDeImagen(
  imagen: Blob,
  onProgreso?: (p: ProgresoOcr) => void,
): Promise<{ texto: string; confianza: number }> {
  avisarProgreso = onProgreso ?? null;
  try {
    onProgreso?.({ etapa: "Preparando la imagen", progreso: 0 });
    const lista = await ampliar(imagen);
    const worker = await obtenerWorker();
    const { data } = await worker.recognize(lista);
    return { texto: data.text ?? "", confianza: data.confidence ?? 0 };
  } finally {
    avisarProgreso = null;
  }
}

/** Suelta el worker (≈50 MB). Se llama al cerrar el modal que lo usó. */
export async function liberarOcr(): Promise<void> {
  const w = workerVivo;
  workerVivo = null;
  if (!w) return;
  try {
    await (await w).terminate();
  } catch {
    /* Ya estaba muerto o nunca llegó a cargar: no hay nada que soltar. */
  }
}
