"use client";

/**
 * Los papeles del Archivo que coinciden con lo escrito en el buscador del
 * panel (⌘K). Pide pocos (`limite`) y sin las fotos de las cámaras, con el
 * mismo debounce que los demás grupos remotos. Si la persona no tiene el
 * Archivo (`habilitado` = false) no pide nada.
 *
 * Las carpetas se piden una vez por minuto y se comparten entre búsquedas:
 * sólo sirven para escribir «Personal › DNI» bajo el nombre.
 */

import { useEffect, useState } from "react";
import { logger } from "@/lib/logger";
import { TAGS_FOTOS_DE_MAQUINA } from "@/lib/documents/fotos-de-maquina";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import { LIMITE_PEDIDO, papelesComoResultados } from "./papeles-del-buscador";
import type { SearchResult } from "./indice-modulos";

const DEBOUNCE_MS = 300;
const VIGENCIA_CARPETAS_MS = 60_000;

let carpetasEn = 0;
let carpetasCache: DbDocumentFolder[] = [];

async function pedir<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function carpetasDelArchivo(): Promise<DbDocumentFolder[]> {
  if (Date.now() - carpetasEn < VIGENCIA_CARPETAS_MS) return carpetasCache;
  try {
    const { folders } = await pedir<{ folders: DbDocumentFolder[] }>("/api/admin/documents/folders");
    carpetasCache = folders;
    carpetasEn = Date.now();
  } catch (err) {
    /* Sin carpetas el papel igual se abre; sólo pierde la ruta bajo el nombre. */
    logger.warn("[buscador] carpetas del Archivo no llegaron", { error: String(err) });
  }
  return carpetasCache;
}

export interface PapelesEncontrados {
  /** Para qué consulta son (mientras llega lo nuevo, queda lo anterior). */
  q: string;
  filas: SearchResult[];
}

export function usePapelesDelArchivo(q: string, habilitado: boolean): PapelesEncontrados | null {
  const [encontrados, setEncontrados] = useState<PapelesEncontrados | null>(null);

  useEffect(() => {
    if (!habilitado || q.length < 2) {
      setEncontrados(null);
      return;
    }
    let vigente = true;
    const t = setTimeout(() => {
      const qs = new URLSearchParams({
        q,
        excluir: TAGS_FOTOS_DE_MAQUINA.join(","),
        limite: String(LIMITE_PEDIDO),
      });
      Promise.all([pedir<{ documents: DbDocument[] }>(`/api/admin/documents?${qs.toString()}`), carpetasDelArchivo()])
        .then(([res, carpetas]) => ({ q, filas: papelesComoResultados(q, res.documents ?? [], carpetas) }))
        .catch((err: unknown) => {
          logger.warn("[buscador] papeles del Archivo fallaron", { error: String(err) });
          return { q, filas: [] as SearchResult[] };
        })
        .then((res) => {
          /* Una respuesta vieja no pisa a la nueva. */
          if (vigente) setEncontrados(res);
        });
    }, DEBOUNCE_MS);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [q, habilitado]);

  return encontrados;
}
