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
/**
 * La especie de los indicadores (ADR-400). Parámetro PROPIO y no `especie`:
 * aquella es el recorte de la capacidad —multi, del cliente— y ésta viaja al
 * servidor de a una. Eran dos filtros con el mismo nombre y distinto alcance;
 * compartir la clave de la URL haría que uno pise al otro. Antes ni siquiera
 * estaba en la URL y se perdía al recargar.
 */
export const PARAM_ESPECIE_KPI = "especieKpi";
export const PARAMS_DE_FILTRO = ["permiso", "especie", "guia"] as const;

/**
 * Varios valores en un mismo parámetro van separados por coma —
 * `?permiso=CON-25-UCA-0142,CON-25-PAS-0033`—, que es como se leen los links de
 * este panel cuando alguien los pega en un chat. Ni los códigos de título
 * habilitante ni las guías ni las especies llevan comas; si algún día las
 * llevaran, este es el lugar donde cambiar el separador.
 */
export const SEP_FILTRO = ",";

/** Lo que la URL dice hoy, validado. Puro, para poder testearlo. */
export function leerParams<S extends string>(
  search: string,
  secciones: readonly S[],
): { seccion: S | null; filtros: FiltrosCapacidad; especieKpi: string } {
  const p = new URLSearchParams(search);
  const s = p.get(PARAM_SECCION);
  const filtros: FiltrosCapacidad = {};
  for (const k of PARAMS_DE_FILTRO) {
    /* Sin duplicados y sin vacíos: `permiso=A,,A` es un link tipeado a mano y
       tiene que dar el mismo recorte que `permiso=A`. */
    const valores = [
      ...new Set(
        (p.get(k) ?? "")
          .split(SEP_FILTRO)
          .map((v) => v.trim())
          .filter(Boolean),
      ),
    ];
    if (valores.length > 0) filtros[k] = valores;
  }
  return {
    seccion: s && (secciones as readonly string[]).includes(s) ? (s as S) : null,
    filtros,
    especieKpi: (p.get(PARAM_ESPECIE_KPI) ?? "").trim(),
  };
}

/** Escribe sobre una URL lo que hay; borra lo que está vacío. Puro. */
export function escribirParams(
  url: URL,
  seccion: string,
  filtros: FiltrosCapacidad,
  especieKpi?: string,
): URL {
  url.searchParams.set(PARAM_SECCION, seccion);
  /* `undefined` = quien llama no maneja la especie de los KPIs: no se toca. */
  if (especieKpi !== undefined) {
    if (especieKpi.trim()) url.searchParams.set(PARAM_ESPECIE_KPI, especieKpi.trim());
    else url.searchParams.delete(PARAM_ESPECIE_KPI);
  }
  for (const k of PARAMS_DE_FILTRO) {
    const valores = (filtros[k] ?? []).map((v) => v.trim()).filter(Boolean);
    if (valores.length > 0) url.searchParams.set(k, valores.join(SEP_FILTRO));
    else url.searchParams.delete(k);
  }
  return url;
}

export function useParamsDeSaldos<S extends string>(secciones: readonly S[], porDefecto: S) {
  const [estado, setEstado] = useState<{
    seccion: S;
    filtros: FiltrosCapacidad;
    especieKpi: string;
  }>(() => {
    if (typeof window === "undefined") return { seccion: porDefecto, filtros: {}, especieKpi: "" };
    const { seccion, filtros, especieKpi } = leerParams(window.location.search, secciones);
    return { seccion: seccion ?? porDefecto, filtros, especieKpi };
  });

  /* Cada cambio va a la URL. Se escribe también al montar, para que el link
     sea copiable aunque la sección venga del default. */
  useEffect(() => {
    try {
      const url = escribirParams(
        new URL(window.location.href),
        estado.seccion,
        estado.filtros,
        estado.especieKpi,
      );
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

  const setEspecieKpi = useCallback(
    (v: string) => setEstado((e) => (e.especieKpi === v ? e : { ...e, especieKpi: v })),
    [],
  );

  return {
    seccion: estado.seccion,
    filtros: estado.filtros,
    especieKpi: estado.especieKpi,
    setSeccion,
    setFiltros,
    setEspecieKpi,
  };
}
