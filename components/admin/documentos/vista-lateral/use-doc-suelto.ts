"use client";

/**
 * Para pantallas que conocen un papel del drive sólo por su id (los papeles de
 * una GTF o del plan en Forestal): trae el documento completo y lleva cuál se ve
 * al costado y la lista por la que pasan ‹ ›. Lo mismo que `useDocAlCostado`,
 * pero sin la lista viva del drive.
 */

import { useCallback, useEffect, useState } from "react";
import { getDocumentDetail } from "@/hooks/use-documents";
import type { DbDocument } from "@/lib/types/documents";
import { logger } from "@/lib/logger";
import type { NavPrevia } from "./PiezasPrevia";

const ESPERA_MS = 150;

/** El documento completo por id (`null` = cargando; `falla` = no se pudo leer). */
export function useDocSuelto(id: string | null): { doc: DbDocument | null; falla: boolean } {
  const [estado, setEstado] = useState<{ id: string | null; doc: DbDocument | null; falla: boolean }>({ id: null, doc: null, falla: false });
  useEffect(() => {
    if (!id) return;
    let vivo = true;
    const t = window.setTimeout(() => {
      getDocumentDetail(id)
        .then((r) => vivo && setEstado({ id, doc: r.document, falla: false }))
        .catch((err: unknown) => {
          logger.warn("[papel-al-costado] detalle", { error: String(err) });
          if (vivo) setEstado({ id, doc: null, falla: true });
        });
    }, ESPERA_MS);
    return () => { vivo = false; window.clearTimeout(t); };
  }, [id]);
  if (!id || estado.id !== id) return { doc: null, falla: false };
  return { doc: estado.doc, falla: estado.falla };
}

/** Cuál papel se ve al costado y por qué lista pasan ‹ ›. */
export function usePapelAlCostado() {
  const [estado, setEstado] = useState<{ id: string; lista: string[] } | null>(null);
  const abrir = useCallback((id: string, de?: readonly string[]) => setEstado({ id, lista: de && de.length > 0 ? [...de] : [id] }), []);
  const cerrar = useCallback(() => setEstado(null), []);
  const i = estado ? estado.lista.indexOf(estado.id) : -1;
  const ir = (id: string) => setEstado((e) => (e ? { ...e, id } : e));

  const nav = (volver: string): NavPrevia => ({
    anterior: estado && i > 0 ? () => ir(estado.lista[i - 1]) : undefined,
    siguiente: estado && i >= 0 && i < estado.lista.length - 1 ? () => ir(estado.lista[i + 1]) : undefined,
    posicion: estado && i >= 0 ? { actual: i + 1, total: estado.lista.length } : null,
    onCerrar: cerrar,
    cerrarTitulo: volver,
    volver,
  });
  return { id: estado?.id ?? null, abrir, cerrar, nav };
}
