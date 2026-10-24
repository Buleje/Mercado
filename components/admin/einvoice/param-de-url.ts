"use client";

/**
 * Parámetros de «una sola vez» en la URL (`?emitir=`, `?buscar=`, `?estado=`):
 * otra pantalla los pone para abrir algo acá. Se leen al montar Y en cada
 * `popstate` —`irAEnlace` dentro del mismo módulo hace `pushState` + `popstate`
 * sin desmontar la vista—, se entregan una vez y se borran de la URL, así un
 * F5 no repite la acción.
 */
import { useEffect, useRef } from "react";

export function useParamsDeUnaVez(nombres: readonly string[], alLeer: (valores: Partial<Record<string, string>>) => void) {
  const cb = useRef(alLeer);
  useEffect(() => {
    cb.current = alLeer;
  });
  const clave = nombres.join("|");
  useEffect(() => {
    const lista = clave.split("|");
    const leer = () => {
      const url = new URL(window.location.href);
      const valores: Partial<Record<string, string>> = {};
      let hay = false;
      for (const n of lista) {
        const v = url.searchParams.get(n);
        if (v) {
          valores[n] = v;
          url.searchParams.delete(n);
          hay = true;
        }
      }
      if (!hay) return;
      window.history.replaceState(window.history.state, "", url);
      cb.current(valores);
    };
    leer();
    window.addEventListener("popstate", leer);
    return () => window.removeEventListener("popstate", leer);
  }, [clave]);
}
