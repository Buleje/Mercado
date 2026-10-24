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


/**
 * Alto visible del contenedor que se desliza alrededor de `el` (la columna de
 * la derecha o el cajón). La columna de detalles del panel ancho va `sticky` y
 * con este alto de tope: así se ve entera aunque la lista de papeles sea larga
 * y aunque el aviso de la agenda ocupe la mitad de arriba de la columna.
 */
export function useAltoDelScroll(): [(el: HTMLDivElement | null) => (() => void) | undefined, number] {
  const [alto, setAlto] = useState(0);
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (!el) return undefined;
    let scroll: HTMLElement | null = el.parentElement;
    while (scroll && !/(auto|scroll)/.test(getComputedStyle(scroll).overflowY)) scroll = scroll.parentElement;
    if (!scroll) return undefined;
    // Sin su relleno de arriba y abajo: así lo fijo entra entero cuando la columna llega al fondo.
    const medir = (s: HTMLElement) => {
      const cs = getComputedStyle(s);
      setAlto(Math.max(0, s.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0)));
    };
    medir(scroll);
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => medir(e.target as HTMLElement));
    ro.observe(scroll);
    return () => ro.disconnect();
  }, []);
  return [ref, alto];
}
