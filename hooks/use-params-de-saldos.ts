"use client";

/**
 * useParamsDeSaldos — la pestaña y los filtros de Saldos, en la URL.
 *
 * Sin esto, al recargar o al volver de otra vista se perdían la pestaña y el
 * recorte permiso/especie/guía: «mirá la capacidad del permiso X» era mandar
 * un link a Saldos y explicar de palabra tres clicks.
 *
 * `replaceState`, no `pushState`: cambiar un filtro no es navegar. Si cada
 * combinación dejara una entrada, el botón «atrás» tendría que recorrer los
 * ocho filtros que se probaron antes de salir del módulo. La pestaña de la
 * vista (`?vista=`) sí va al historial, y de eso se ocupa `useVistaModulo`.
 *
 * Los parámetros se limpian al cambiar de módulo — `navigateTab` borra todo
 * `PARAMS_DE_VISTA`, y estos están ahí — para que un `?permiso=` no viaje a un
 * módulo que no sabe qué es.
 */

import { useCallback, useEffect, useState } from "react";
import type { FiltrosCapacidad } from "@/lib/forestal/capacidad-de-planta";

export const PARAM_SECCION = "seccion";
export const PARAMS_DE_FILTRO = ["permiso", "especie", "guia"] as const;

/** Lo que la URL dice hoy, validado. Puro, para poder testearlo. */
export function leerParams<S extends string>(
  search: string,
  secciones: readonly S[],
): { seccion: S | null; filtros: FiltrosCapacidad } {
  const p = new URLSearchParams(search);
  const s = p.get(PARAM_SECCION);
  const filtros: FiltrosCapacidad = {};
  for (const k of PARAMS_DE_FILTRO) {
    const v = p.get(k)?.trim();
    if (v) filtros[k] = v;
  }
  return { seccion: s && (secciones as readonly string[]).includes(s) ? (s as S) : null, filtros };
}

/** Escribe sobre una URL lo que hay; borra lo que está vacío. Puro. */
export function escribirParams(url: URL, seccion: string, filtros: FiltrosCapacidad): URL {
  url.searchParams.set(PARAM_SECCION, seccion);
  for (const k of PARAMS_DE_FILTRO) {
    const v = filtros[k]?.trim();
    if (v) url.searchParams.set(k, v);
    else url.searchParams.delete(k);
  }
  return url;
}

export function useParamsDeSaldos<S extends string>(secciones: readonly S[], porDefecto: S) {
  const [estado, setEstado] = useState<{ seccion: S; filtros: FiltrosCapacidad }>(() => {
    if (typeof window === "undefined") return { seccion: porDefecto, filtros: {} };
    const { seccion, filtros } = leerParams(window.location.search, secciones);
    return { seccion: seccion ?? porDefecto, filtros };
  });

  /* Cada cambio va a la URL. Se escribe también al montar, para que el link
     sea copiable aunque la sección venga del default. */
  useEffect(() => {
    try {
      const url = escribirParams(new URL(window.location.href), estado.seccion, estado.filtros);
      if (url.toString() !== window.location.href)
        window.history.replaceState(null, "", url.toString());
    } catch {
      // history no disponible: sin link copiable, sin bug
    }
  }, [estado]);

  const setSeccion = useCallback(
    (s: S) => setEstado((e) => (e.seccion === s ? e : { ...e, seccion: s })),
    [],
  );
  const setFiltros = useCallback(
    (f: FiltrosCapacidad) => setEstado((e) => ({ ...e, filtros: f })),
    [],
  );

  return { seccion: estado.seccion, filtros: estado.filtros, setSeccion, setFiltros };
}
