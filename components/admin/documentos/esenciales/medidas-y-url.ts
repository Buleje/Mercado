import { useCallback, useState } from "react";

/**
 * La dirección y las medidas de Documentos › Esenciales. La carpeta elegida
 * viaja en `?esencial=<id>` y la vista grande en `?amplia=1`: el enlace y la
 * recarga vuelven a lo mismo.
 */
export const PARAM_ESENCIAL = "esencial";
export const PARAM_AMPLIA = "amplia";

/** Lee un parámetro de la dirección (`?esencial=`, `?amplia=`). */
export function leerDeLaUrl(param: string): string | null {
  if (typeof window === "undefined") return null;
  return new URL(window.location.href).searchParams.get(param);
}

/** Escribe (o borra con `null`) un parámetro sin sumar una entrada al historial. */
export function escribirEnLaUrl(param: string, valor: string | null): void {
  const url = new URL(window.location.href);
  if (valor) url.searchParams.set(param, valor);
  else url.searchParams.delete(param);
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url.toString());
}

/** Ancho del contenedor con ResizeObserver (ref de React 19 con limpieza). */
export function useAnchoDelContenedor(): [(el: HTMLDivElement | null) => (() => void) | undefined, number] {
  const [ancho, setAncho] = useState(0);
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (!el) return undefined;
    setAncho(Math.round(el.getBoundingClientRect().width));
    // Sin ResizeObserver (tests, navegador viejo): se queda con la primera medida.
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setAncho(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, ancho];
}

