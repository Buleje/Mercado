"use client";

/**
 * «Al lado» del mosaico «Ver todas en vivo» (Brandon 2026-10-09: «mover en un
 * lado la cámara y en el otro lado poner la ventana de otros modales, por
 * ejemplo el de asistencia, para poner asistencia según lo que yo veo»).
 *
 * Acoplado, el mosaico deja de ser un modal: ocupa una franja de alto completo
 * a la izquierda o a la derecha, y el panel ENTERO se corre al otro lado — la
 * pestaña que sea, con sus modales — y se sigue usando. El reparto lo hace
 * globals.css (§ «Cámaras al lado») a partir de dos marcas en `<html>`:
 * `data-mosaico-acoplado` y `--mosaico-ancho`. Así ninguna pantalla ni modal
 * tiene que saber que el mosaico existe.
 *
 * Sólo desde 1024 px: debajo, media pantalla no deja ver ni la cámara ni el
 * formulario. Minimizado no se reparte nada (el panel vuelve a su ancho) y se
 * reparte otra vez al expandir.
 */

import { useCallback, useEffect, useState, type RefObject } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";

export type LadoAcople = "izquierda" | "derecha";

/** Ancho de la franja de las cámaras, en % de la ventana. */
export const ANCHO_MIN = 28;
export const ANCHO_MAX = 72;
const ANCHO_INICIAL = 42;
const PANTALLA_ANCHA = "(min-width: 1024px)";

/** La hoja de asistencia del día: atajo del menú y acción del aviso «apareció alguien». */
export const HREF_ASISTENCIA_HOY = "/admin?tab=rrhh&vista=asistencia";

interface Preferencia {
  /** `null` = al centro, como modal. */
  lado: LadoAcople | null;
  /** El último lado elegido: «Al lado» vuelve a ése. Arranca a la derecha (la barra del panel queda a la vista). */
  ultimoLado: LadoAcople;
  ancho: number;
}

const INICIAL: Preferencia = { lado: null, ultimoLado: "derecha", ancho: ANCHO_INICIAL };

export const limitarAncho = (n: number) => Math.round(Math.min(ANCHO_MAX, Math.max(ANCHO_MIN, n)));

function usePantallaAncha(): boolean {
  const [ancha, setAncha] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(PANTALLA_ANCHA);
    setAncha(mql.matches);
    const cambio = (e: MediaQueryListEvent) => setAncha(e.matches);
    mql.addEventListener?.("change", cambio);
    return () => mql.removeEventListener?.("change", cambio);
  }, []);
  return ancha;
}

export interface AcopleMosaico {
  /** ¿Se puede acoplar? (pantalla ≥ 1024 px y mosaico del panel). */
  disponible: boolean;
  /** El lado en que está acoplado AHORA (`null` = modal centrado). */
  lado: LadoAcople | null;
  ancho: number;
  acoplar: (lado?: LadoAcople) => void;
  centrar: () => void;
  setAncho: (n: number) => void;
  /** Suma (o resta) puntos al ancho guardado: las flechas repetidas no leen un ancho viejo. */
  moverAncho: (delta: number) => void;
}

/**
 * @param habilitado mosaico del panel (con burbuja). Fuera de él —Modo TV— no hay panel que correr.
 * @param visible expandido: minimizado, el panel recupera todo el ancho.
 */
export function useAcopleMosaico(habilitado: boolean, visible: boolean): AcopleMosaico {
  const [pref, setPref] = useLocalStorage<Preferencia>("camaras:mosaico-acople", INICIAL);
  const ancha = usePantallaAncha();
  const disponible = habilitado && ancha;
  const lado = disponible ? pref.lado : null;
  const ancho = limitarAncho(pref.ancho ?? ANCHO_INICIAL);

  useEffect(() => {
    if (!lado || !visible) return;
    const html = document.documentElement;
    html.dataset.mosaicoAcoplado = lado;
    html.style.setProperty("--mosaico-ancho", `${ancho}vw`);
    return () => {
      delete html.dataset.mosaicoAcoplado;
      html.style.removeProperty("--mosaico-ancho");
    };
  }, [lado, visible, ancho]);

  const acoplar = useCallback(
    (l?: LadoAcople) => setPref((p) => ({ ...p, lado: l ?? p.ultimoLado, ultimoLado: l ?? p.ultimoLado })),
    [setPref],
  );
  const centrar = useCallback(() => setPref((p) => ({ ...p, lado: null })), [setPref]);
  const setAncho = useCallback((n: number) => setPref((p) => ({ ...p, ancho: limitarAncho(n) })), [setPref]);
  const moverAncho = useCallback(
    (d: number) => setPref((p) => ({ ...p, ancho: limitarAncho((p.ancho ?? ANCHO_INICIAL) + d) })),
    [setPref],
  );

  return { disponible, lado, ancho, acoplar, centrar, setAncho, moverAncho };
}

/**
 * La rueda y el dedo siguen desplazando las cámaras con un modal abierto al
 * otro lado. El `RemoveScroll` de Radix escucha en `document` y cancela todo
 * lo que no sea su modal (medido: 229 px sin modal, 0 con «Conectar» abierto);
 * cortando la propagación en el panel, el evento nunca le llega.
 */
export function useRuedaLibre(panel: RefObject<HTMLElement | null>, activo: boolean) {
  useEffect(() => {
    const el = panel.current;
    if (!activo || !el) return;
    const cortar = (e: Event) => e.stopPropagation();
    el.addEventListener("wheel", cortar, { passive: true });
    el.addEventListener("touchmove", cortar, { passive: true });
    return () => {
      el.removeEventListener("wheel", cortar);
      el.removeEventListener("touchmove", cortar);
    };
  }, [panel, activo]);
}
