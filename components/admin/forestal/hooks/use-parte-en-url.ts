"use client";

/**
 * La ficha de una parte del Directorio, direccionable: `?parte=<id>`.
 *
 * El proveedor de una guía, el destinatario de un despacho o el titular de un
 * permiso llegan por enlace (`lib/admin/enlaces-panel.ts`, cosa `parte`) a SU
 * ficha, y la ficha que se abre a mano deja el enlace en la URL. La ficha sale
 * de la URL (no de un estado aparte): el «atrás» la cierra sin más.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFichaEnUrl } from "@/hooks/use-ficha-en-url";
import type { Parte } from "@/lib/forestal/directorio";

export const PARAM_PARTE = "parte";

export interface ParteEnUrl {
  /** La parte que pide la URL, ya encontrada en el directorio; `null` si no pide o todavía no llegó. */
  parte: Parte | null;
  /** La URL pide una parte que el directorio (ya cargado) no tiene. */
  noEsta: boolean;
  abrir: (id: string) => void;
  cerrar: () => void;
}

/**
 * `alLlegar` corre UNA vez por parte abierta (para poner su pestaña detrás de la
 * ficha), no en cada render ni cuando el directorio se relee.
 */
export function useParteEnUrl(partes: readonly Parte[], cargando: boolean, alLlegar: (p: Parte) => void): ParteEnUrl {
  const url = useFichaEnUrl(PARAM_PARTE);
  const parte = useMemo(() => (url.id ? partes.find((p) => p.id === url.id) ?? null : null), [url.id, partes]);

  const alLlegarRef = useRef(alLlegar);
  useEffect(() => {
    alLlegarRef.current = alLlegar;
  });
  const llegada = useRef<string | null>(null);
  useEffect(() => {
    if (!parte) {
      llegada.current = null;
      return;
    }
    if (llegada.current === parte.id) return;
    llegada.current = parte.id;
    alLlegarRef.current(parte);
  }, [parte]);

  /* Directorio vacío = todavía sin leer (el hook arranca con `cargando: false` y la lista vacía). */
  const noEsta = !!url.id && !parte && !cargando && partes.length > 0;
  return { parte, noEsta, abrir: url.abrir, cerrar: url.cerrar };
}
