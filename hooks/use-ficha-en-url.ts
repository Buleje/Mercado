"use client";

/**
 * useFichaEnUrl — la ficha abierta de una pantalla, en `?<param>=<id>`.
 *
 * La versión genérica de `ficha-del-permiso-url` (ADR-432) para que cada cosa
 * de `lib/admin/enlaces-panel.ts` abra su ficha al llegar por enlace:
 *
 *   const ficha = useFichaEnUrl("persona");
 *   …onClick={() => ficha.abrir(c.id)}
 *   {ficha.id && <Ficha id={ficha.id} onClose={ficha.cerrar} />}
 *
 *  - `id`: lo que pide la URL (llegar por enlace, por QR o con «atrás»).
 *  - `abrir`: `pushState`, así el «atrás» del navegador cierra la ficha. Con
 *    otra ficha ya abierta (mismo parámetro) la reemplaza: no se apilan.
 *  - `cerrar`: si la ficha se abrió ENCIMA de la URL a la que se vuelve (la
 *    abrió este hook o un enlace del mismo módulo, `irAEnlace`), es un
 *    «atrás» (la entrada de la ficha queda adelante, como en cualquier sitio);
 *    si se llegó con el parámetro en el link o desde otro módulo, se borra con
 *    `replaceState`. En los dos casos el parámetro sale de la URL: volver al
 *    módulo no reabre la ficha vieja, y no quedan dos entradas iguales (el
 *    «atrás» siguiente siempre hace algo).
 *
 * El parámetro también va en `PARAMS_DE_VISTA` (`hooks/use-vista-modulo.ts`)
 * para que `navigateTab` lo borre al cambiar de módulo.
 */

import { useCallback, useRef, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { MARCA_FICHA_DESDE } from "@/components/admin/shared/ir-a-enlace";

/** Lo dispara `abrir`/`cerrar`: las otras instancias del hook (y ésta) releen la URL. */
const EVENTO_FICHA = "panel:ficha-en-url";

function suscribir(avisar: () => void): () => void {
  window.addEventListener("popstate", avisar);
  window.addEventListener(EVENTO_FICHA, avisar);
  return () => {
    window.removeEventListener("popstate", avisar);
    window.removeEventListener(EVENTO_FICHA, avisar);
  };
}

const avisarCambio = () => window.dispatchEvent(new Event(EVENTO_FICHA));

/** La URL que `cerrar` dejó con `history.back()` (asíncrono): hasta que llegue
 *  el `popstate` sigue siendo la actual, y un 2.º `cerrar` (un formulario que
 *  llama `onSaved(); onClose();`, dos instancias) sería un 2.º «atrás» que saca
 *  del módulo. Compartida entre instancias: el historial es uno solo. */
let atrasEnCurso: { href: string } | null = null;

function irAtras(): void {
  const este = { href: window.location.href };
  atrasEnCurso = este;
  const soltar = () => {
    if (atrasEnCurso === este) atrasEnCurso = null;
    window.removeEventListener("popstate", soltar);
  };
  window.addEventListener("popstate", soltar);
  // Si el «atrás» no llega (historial sin entrada previa), no bloquear el próximo cierre.
  window.setTimeout(soltar, 1500);
  window.history.back();
}

/** La misma URL escrita igual: query re-serializada y en orden (borrar y volver a poner un param lo manda al final). */
function normalizar(href: string): string {
  const u = new URL(href);
  u.searchParams.sort();
  return u.toString();
}

/** La URL de la que salió la ficha, si esta entrada la marcó (`irAEnlace` o `abrir`). */
function desdeDeLaEntrada(): string | null {
  const estado: unknown = window.history.state;
  if (!estado || typeof estado !== "object") return null;
  const desde = (estado as Record<string, unknown>)[MARCA_FICHA_DESDE];
  return typeof desde === "string" ? desde : null;
}

export interface FichaEnUrl {
  /** El id que pide la URL, o `null`. */
  id: string | null;
  /** Abre la ficha de ese id (entrada nueva en el historial). `extra` viaja en la misma entrada. */
  abrir: (id: string, extra?: Readonly<Record<string, string>>) => void;
  /** Cierra la ficha y saca el parámetro de la URL. */
  cerrar: () => void;
}

export interface OpcionesFichaEnUrl {
  /** Parámetros que son de la ficha (su sección, su pestaña): se van con ella al cerrar. */
  tambien?: readonly string[];
}

function leer(param: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(param)?.trim() || null;
}

export function useFichaEnUrl(param: string, opciones?: OpcionesFichaEnUrl): FichaEnUrl {
  /* El valor sale de `window` (el de Next llega una transición después). Next
     sincroniza `useSearchParams` con cada `pushState`/`replaceState`: llamarlo
     re-renderiza cuando OTRO cambia la URL; el `popstate` cubre el «atrás» y
     los enlaces del panel. En el servidor y al hidratar, `null`: la ficha
     aparece recién montada, como cuando la abría un efecto. */
  useSearchParams();
  const id = useSyncExternalStore(
    suscribir,
    () => leer(param),
    () => null,
  );

  const tambienRef = useRef(opciones?.tambien);
  tambienRef.current = opciones?.tambien;
  /** La URL que dejó `abrir`: si seguimos ahí, cerrar = «atrás». */
  const empujada = useRef<string | null>(null);

  const abrir = useCallback(
    (id: string, extra?: Readonly<Record<string, string>>) => {
      const limpio = id.trim();
      if (!limpio) return;
      try {
        const url = new URL(window.location.href);
        const otraAbierta = url.searchParams.has(param);
        url.searchParams.set(param, limpio);
        for (const [k, v] of Object.entries(extra ?? {})) url.searchParams.set(k, v);
        if (url.toString() === window.location.href) return;
        atrasEnCurso = null;
        if (otraAbierta) {
          /* Cambiar de ficha (expandir B con A abierta) no apila: el «atrás» y
             `cerrar` siguen yendo a la URL sin ficha. Con `pushState` volvían a
             `?<param>=A` y el lector la reabría. La marca de la entrada se queda. */
          const desde = desdeDeLaEntrada();
          const eraEmpujada = empujada.current === window.location.href;
          window.history.replaceState(desde ? { [MARCA_FICHA_DESDE]: desde } : null, "", url.toString());
          if (eraEmpujada) empujada.current = window.location.href;
        } else {
          window.history.pushState({ [MARCA_FICHA_DESDE]: window.location.href }, "", url.toString());
          empujada.current = window.location.href;
        }
      } catch {
        // Sin history: no queda en el link, pero la URL tampoco miente.
      }
      avisarCambio();
    },
    [param],
  );

  const cerrar = useCallback(() => {
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has(param)) return;
      // Ya se pidió el «atrás» y todavía no llegó: un 2.º saldría del módulo.
      if (atrasEnCurso?.href === window.location.href) return;
      url.searchParams.delete(param);
      for (const p of tambienRef.current ?? []) url.searchParams.delete(p);
      const desde = desdeDeLaEntrada();
      /* `empujada`: la abrió este hook (con `extra` que quizá no se van con
         ella). `desde`: la entrada de atrás es justo la URL sin la ficha. */
      if (empujada.current === window.location.href || (desde && normalizar(desde) === normalizar(url.toString()))) {
        empujada.current = null;
        irAtras();
        return;
      }
      window.history.replaceState(null, "", url.toString());
    } catch {
      // Sin history: nada que borrar.
    }
    avisarCambio();
  }, [param]);

  return { id, abrir, cerrar };
}
