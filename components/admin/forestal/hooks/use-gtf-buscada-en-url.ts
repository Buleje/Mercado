"use client";

/**
 * La guía del LO-TH que ⌘K pide ubicar: `?gtf=<N° de GTF>`. Se consume una vez
 * (el parámetro sale de la URL) y se entrega como el `focusGtf` que la lista de
 * guías ya sabe resaltar y desplazar (`LothGtfGuias`, `LothGtfBajas`), con su
 * aviso si la guía no figura. Si otra pantalla ya pide una (`focusGtf` de «Por
 * árbol»), gana la de la pantalla.
 */

import { useCallback, useEffect, useState } from "react";
import { useFichaEnUrl } from "@/hooks/use-ficha-en-url";

export const PARAM_GTF_BUSCADA = "gtf";

export function useGtfBuscadaEnUrl(focusGtf: string | null | undefined, onFocusHandled: (() => void) | undefined) {
  const { id, cerrar } = useFichaEnUrl(PARAM_GTF_BUSCADA);
  const [buscada, setBuscada] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    setBuscada(id);
    cerrar();
  }, [id, cerrar]);
  const alAtender = useCallback(() => {
    onFocusHandled?.();
    setBuscada(null);
  }, [onFocusHandled]);
  return { focusGtf: focusGtf ?? buscada, onFocusHandled: alAtender, focoDeBusqueda: !focusGtf && !!buscada };
}
