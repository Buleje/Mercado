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
 *
 * F3 (16-10): las cargas medidas en el monte que se usaron en esta guía
 * («Cargas medidas › Usar en esta guía») quedan anotadas acá y viajan en el
 * registro (`cargas`): el servidor las marca `usada` ANTES de escribir el
 * libro, así la misma carga no sale en dos guías (security 16-10; antes se
 * marcaban acá después y la 2.ª guía quedaba escrita). Sus fotos ya están en
 * el Drive y el registro las pasa a los papeles de la guía: si alguna no
 * entra, se AVISA en pantalla.
 */
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { MAX_DOCS_POR_CASILLERO } from "@/lib/forestal/documentos-guia";

/** Lo que responde el registro sobre las cargas del monte (`cerrarCargasDeGuia`). */
export interface CierreCargasDelRegistro {
  usadas: number;
  fotos: { pasadas: number; sinLugar: number; fallidas: number };
}

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
  /** Las cargas del monte que se pasaron a esta guía (se marcan usadas al registrar). */
  const [cargas, setCargas] = useState<string[]>([]);
  const cargasVivas = useRef<string[]>([]);

  const usarCarga = useCallback((id: string) => {
    setCargas((prev) => {
      const sig = prev.includes(id) ? prev : [...prev, id];
      cargasVivas.current = sig;
      return sig;
    });
  }, []);

  const soltarCarga = useCallback((id: string) => {
    setCargas((prev) => {
      const sig = prev.filter((x) => x !== id);
      cargasVivas.current = sig;
      return sig;
    });
  }, []);

  const agregar = useCallback((f: FotoDeLaCarga) => {
    setFotos((prev) => {
      const sig = [...prev, f].slice(-FOTOS_MAX);
      vivas.current = sig;
      return sig;
    });
  }, []);

  const descartar = useCallback(() => {
    vivas.current = [];
    cargasVivas.current = [];
    setFotos([]);
    setCargas([]);
    setEstado(SIN_SUBIR);
  }, []);

  /**
   * Tras registrar la guía: avisa si fotos de las cargas del monte no pasaron
   * a sus papeles (el registro ya las marcó usadas) y sube las fotos medidas
   * en la oficina. No lanza: lo que falla queda en `estado` y sale en un aviso.
   */
  const subir = useCallback(async (gtf: string, cierre: CierreCargasDelRegistro | null = null) => {
    if (!gtf) return;
    if (cargasVivas.current.length) {
      const sinPasar = cierre ? cierre.fotos.sinLugar + cierre.fotos.fallidas : 0;
      if (sinPasar > 0) {
        logger.warn("[fotos-carga] fotos de las cargas del monte sin pasar a la guía", { gtf, ...cierre?.fotos });
        toast.warning(`${sinPasar === 1 ? "1 foto" : `${sinPasar} fotos`} de la carga del monte no pasaron a los papeles de la guía: siguen en el Drive, carpeta «Cargas medidas».`);
      }
      cargasVivas.current = [];
      setCargas([]);
    }
    const lista = vivas.current;
    if (!lista.length) return;
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
    if (error) {
      logger.warn("[fotos-carga] no subieron todas las fotos de la carga", { gtf, subidas, error });
      toast.error(`La guía ${gtf} quedó registrada, pero la foto de la carga no subió: ${error} Súbela en los papeles de la guía.`, { duration: 15_000 });
    }
    setEstado({ subiendo: false, subidas, error });
  }, []);

  return { fotos, agregar, descartar, subir, estado, cargas, usarCarga, soltarCarga };
}

export type FotosDeLaCarga = ReturnType<typeof useFotosDeLaCarga>;
