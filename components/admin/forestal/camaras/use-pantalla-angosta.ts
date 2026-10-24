"use client";

/**
 * ¿Pantalla de celular (< 640 px)? Con guarda: donde no hay `matchMedia`
 * (jsdom de los tests, un navegador viejo) contesta «no» en vez de romper la
 * pantalla entera — `useMediaQuery` de `hooks/` lo llama sin preguntar y tiraba
 * `CamarasView` en `carga-vieja-camaras-view.test.tsx`.
 */

import { useEffect, useState } from "react";

const CONSULTA = "(max-width: 639px)";

export function usePantallaAngosta(): boolean {
  const [angosta, setAngosta] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(CONSULTA);
    setAngosta(mql.matches);
    const cambio = (e: MediaQueryListEvent) => setAngosta(e.matches);
    mql.addEventListener?.("change", cambio);
    return () => mql.removeEventListener?.("change", cambio);
  }, []);
  return angosta;
}
