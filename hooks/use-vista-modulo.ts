"use client";

/**
 * useVistaModulo — la sub-vista activa de un módulo del panel, direccionable.
 *
 * EL PROBLEMA QUE RESUELVE. Dieciocho módulos del admin guardaban su sub-vista
 * SÓLO en `localStorage["admin-last-tab-<id>"]`. Con el Libro CTP (18 vistas) o
 * el de Títulos Habilitantes eso significaba que la mayoría de los destinos
 * reales del panel:
 *
 *   · no se podían compartir — mandar «mirá los Saldos de este período» era
 *     mandar un link al módulo y explicar de palabra dónde hacer click;
 *   · no respondían al botón «atrás» — entrar a cinco vistas y querer volver
 *     una sacaba del módulo entero;
 *   · eran invisibles para el buscador global (`GlobalSearch` tiene el campo
 *     `subtabs` desde siempre y nada lo llenaba: no había a dónde navegar);
 *   · se peleaban entre pestañas — dos pestañas del panel abiertas escribían
 *     la misma key y la última en cambiar mandaba sobre las dos.
 *
 * CÓMO. La URL manda (`?vista=`), localStorage queda de memoria para cuando la
 * URL no dice nada — que es lo que hace útil «retomar donde estabas» al abrir
 * el módulo desde el sidebar. Los cambios de vista van al historial con
 * `pushState`, así que el atrás recorre las vistas del módulo antes de salir.
 *
 * El parámetro se limpia al cambiar de módulo (lo hace `navigateTab`): sin eso
 * un `?vista=saldos` viajaría a un módulo que no tiene esa vista.
 *
 * DOS NIVELES. Algunos módulos se renderizan DENTRO de otro —Contratos vive en
 * Documentos, el Drive también— y no pueden usar `?vista=`: se lo pisarían al
 * padre en cada click. Para esos está `useSubvistaModulo`, idéntico pero sobre
 * `?sub=`. Más profundidad no hay: un tercer nivel es señal de que el módulo
 * quiere ser un módulo.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** Nivel 1: la vista del módulo. Nivel 2: la del módulo anidado adentro. */
const PARAM_VISTA = "vista";
const PARAM_SUB = "sub";

/** Todos los parámetros de navegación interna, para que `navigateTab` los limpie
 *  de una: si borrara sólo `vista`, un `?sub=` huérfano sobreviviría al salto. */
export const PARAMS_DE_VISTA = [PARAM_VISTA, PARAM_SUB] as const;

/** Lee la vista que pide la URL, validada contra las que el módulo declara. */
function vistaDeUrl(validas: readonly string[], param: string): string | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get(param);
  return v && validas.includes(v) ? v : null;
}

export interface UseVistaModuloResult<T extends string> {
  vista: T;
  /** Cambia de vista: estado + URL (historial) + memoria. */
  irA: (v: string) => void;
}

export function useVistaModulo<T extends string>(
  moduleId: string,
  validas: readonly T[],
  porDefecto: T,
  /**
   * Vista impuesta por el módulo, que gana sobre TODO (URL y memoria).
   *
   * Es el mecanismo de los tabs alias del panel: `?tab=fiados` renderiza el
   * módulo de Finanzas ya parado en Fiados. Gana sobre la MEMORIA —caer en
   * "donde quedaste" dentro de un tab cuyo nombre promete otra cosa es un
   * salto— pero NO sobre un `?vista=` explícito.
   *
   * Que la URL le gane no es un detalle: varios hubs (Equipo, Mensajes,
   * Crecimiento…) SÓLO se abren por tabs alias, así que si `forzada` ganara
   * siempre, moverse dentro del módulo escribiría un `?vista=` que al recargar
   * o al volver atrás se ignoraría — el link diría una cosa y la pantalla otra.
   * Y no hay contradicción real: `navigateTab` borra el `?vista=` al cambiar de
   * módulo, así que sólo sobrevive el que se eligió DENTRO de este.
   */
  forzada?: string,
): UseVistaModuloResult<T> {
  return useVistaEnParam(moduleId, validas, porDefecto, forzada, PARAM_VISTA);
}

/**
 * Igual que `useVistaModulo` pero sobre `?sub=`: para el módulo que se renderiza
 * DENTRO de otro y no puede tocar el parámetro del padre.
 */
export function useSubvistaModulo<T extends string>(
  moduleId: string,
  validas: readonly T[],
  porDefecto: T,
  forzada?: string,
  /**
   * Si además se recuerda entre visitas. Por defecto sí, como el resto del
   * panel. El Drive lo apaga: nunca tuvo memoria y reabrirlo en «Papelera» o
   * «Sincronización» porque ahí quedaste la vez pasada sería una sorpresa, no
   * una comodidad.
   */
  opciones?: { recordar?: boolean },
): UseVistaModuloResult<T> {
  return useVistaEnParam(moduleId, validas, porDefecto, forzada, PARAM_SUB, opciones?.recordar ?? true);
}

function useVistaEnParam<T extends string>(
  moduleId: string,
  validas: readonly T[],
  porDefecto: T,
  forzada: string | undefined,
  param: string,
  recordar = true,
): UseVistaModuloResult<T> {
  const storageKey = `admin-last-tab-${moduleId}`;

  const [vista, setVista] = useState<T>(() => {
    if (typeof window === "undefined") {
      return forzada && (validas as readonly string[]).includes(forzada) ? (forzada as T) : porDefecto;
    }
    // 1. La URL manda: un link compartido tiene que abrir SIEMPRE lo mismo,
    //    sin importar dónde quedó esta persona la última vez.
    const deUrl = vistaDeUrl(validas, param);
    if (deUrl) return deUrl as T;
    // 2. La vista que impone el tab alias.
    if (forzada && (validas as readonly string[]).includes(forzada)) return forzada as T;
    // 3. Memoria del módulo: reabrirlo desde el sidebar retoma donde estabas.
    if (!recordar) return porDefecto;
    try {
      const guardada = localStorage.getItem(storageKey);
      if (guardada && (validas as readonly string[]).includes(guardada)) return guardada as T;
    } catch {
      // localStorage puede fallar (modo privado): sin memoria, sin bug.
    }
    return porDefecto;
  });

  // La memoria se escribe siempre, venga la vista de donde venga.
  useEffect(() => {
    if (!recordar) return;
    try {
      localStorage.setItem(storageKey, vista);
    } catch {
      // sin persistencia, sin bug
    }
  }, [storageKey, vista, recordar]);

  /**
   * Al montar con una vista que NO viene de la URL (memoria o default), se
   * escribe la URL con `replace`: deja el link copiable sin inventar una
   * entrada de historial que el usuario nunca pidió.
   */
  const sincronizado = useRef(false);
  useEffect(() => {
    if (sincronizado.current) return;
    sincronizado.current = true;
    // Si la URL ya trae una vista válida, no hay nada que sincronizar; si la
    // decidió el tab alias o la memoria, se escribe para que el link sea copiable.
    if (vistaDeUrl(validas, param)) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set(param, vista);
      window.history.replaceState(null, "", url.toString());
    } catch {
      // history no disponible
    }
    // Sólo al montar: las navegaciones posteriores las maneja `irA`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const irA = useCallback(
    (v: string) => {
      if (!(validas as readonly string[]).includes(v)) return;
      setVista(v as T);
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.get(param) === v) return;
        url.searchParams.set(param, v);
        window.history.pushState(null, "", url.toString());
      } catch {
        // history no disponible
      }
    },
    [validas, param],
  );

  /** Atrás/adelante → seguir a la URL. Sin esto el historial mentiría. */
  useEffect(() => {
    const onPop = () => {
      const deUrl = vistaDeUrl(validas, param);
      if (deUrl) setVista(deUrl as T);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [validas, param]);

  return { vista, irA };
}
