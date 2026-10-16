"use client";

/**
 * Las fotos de la carga que se midieron por foto (16-10, F1 de «Medir por foto»):
 * la original (comprimida) y la anotada (la cara enderezada con los N° de cada
 * troza). Viven en memoria hasta que la guía se registra; recién ahí van a los
 * papeles de la guía, casillero «Otros» (`/api/admin/forestal/guias/documentos`).
 * Antes de registrar no hay guía a la que colgarlas, y el despacho no se escribe
 * hasta que el operador lo confirma: por eso no se suben antes.
 *
 * Si no se registra (se cierra el modal), las fotos se pierden: guardarlas en el
 * monte antes de la guía es la F3 (cargas medidas en KV).
 */
import { useCallback, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { MAX_DOCS_POR_CASILLERO } from "@/lib/forestal/documentos-guia";

const RUTA_DOCS = "/api/admin/forestal/guias/documentos";
/** Una medición = original + anotada; el casillero aguanta 12. */
const FOTOS_MAX = Math.floor(MAX_DOCS_POR_CASILLERO / 2);

export interface FotoDeLaCarga {
  original: Blob;
  anotada: Blob | null;
  /** Cuántas trozas se pasaron a la guía desde esta foto (para el nombre del archivo). */
  trozas: number;
}

export interface EstadoFotosCarga {
  subiendo: boolean;
  subidas: number;
  error: string | null;
}

const SIN_SUBIR: EstadoFotosCarga = { subiendo: false, subidas: 0, error: null };

async function subirUna(gtf: string, blob: Blob, nombre: string): Promise<string | null> {
  const form = new FormData();
  form.set("gtf", gtf);
  form.set("casillero", "otros");
  form.set("file", new File([blob], nombre, { type: blob.type || "image/jpeg" }));
  try {
    const res = await fetch(RUTA_DOCS, { method: "POST", credentials: "include", headers: csrfHeaders(), body: form });
    if (res.ok) return null;
    const j = (await res.json().catch(() => null)) as { message?: string } | null;
    return res.status === 413 ? "La foto de la carga es muy grande." : (j?.message ?? "No se pudo guardar la foto de la carga.");
  } catch {
    return "Sin señal: la foto de la carga no subió.";
  }
}

export function useFotosDeLaCarga() {
  const [fotos, setFotos] = useState<FotoDeLaCarga[]>([]);
  const [estado, setEstado] = useState<EstadoFotosCarga>(SIN_SUBIR);
  /* `subir` corre dentro de `registrar`: lee la lista por ref para no re-crear el callback. */
  const vivas = useRef<FotoDeLaCarga[]>([]);

  const agregar = useCallback((f: FotoDeLaCarga) => {
    setFotos((prev) => {
      const sig = [...prev, f].slice(-FOTOS_MAX);
      vivas.current = sig;
      return sig;
    });
  }, []);

  const descartar = useCallback(() => {
    vivas.current = [];
    setFotos([]);
    setEstado(SIN_SUBIR);
  }, []);

  /** Sube todas a los papeles de la guía recién registrada. No lanza: el error queda en `estado`. */
  const subir = useCallback(async (gtf: string) => {
    const lista = vivas.current;
    if (!lista.length || !gtf) return;
    setEstado({ subiendo: true, subidas: 0, error: null });
    let subidas = 0;
    let error: string | null = null;
    for (const [i, f] of lista.entries()) {
      const n = lista.length > 1 ? `-${i + 1}` : "";
      for (const [blob, tipo] of [
        [f.original, "foto"],
        [f.anotada, "medida"],
      ] as const) {
        if (!blob) continue;
        const e = await subirUna(gtf, blob, `carga-${tipo}${n}-${gtf}.jpg`);
        if (e) error = e;
        else subidas += 1;
      }
    }
    if (error) logger.warn("[fotos-carga] no subieron todas las fotos de la carga", { gtf, subidas, error });
    setEstado({ subiendo: false, subidas, error });
  }, []);

  return { fotos, agregar, descartar, subir, estado };
}

export type FotosDeLaCarga = ReturnType<typeof useFotosDeLaCarga>;
