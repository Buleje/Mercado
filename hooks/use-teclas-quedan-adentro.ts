"use client";

/**
 * use-teclas-quedan-adentro — mientras un modal está arriba, ninguna tecla sube
 * a los oyentes de `window` de la pantalla de atrás.
 *
 * En Producción del Libro CTP la tabla escucha en `window`: `/` abre el libro,
 * `N` el menú de lotes, `R` recarga. Con un modal abierto y el foco en un
 * botón, esas teclas actuaban detrás. Radix y `useModalAccesible` escuchan en
 * `document` en captura, y React en su raíz: todos ya corrieron cuando el
 * evento llega al corte.
 *
 * Marca-y-corta y no un oyente que se prende con el modal: el Escape de Radix
 * cierra el modal DENTRO del mismo evento, y un oyente atado al «abierto» ya no
 * está cuando el evento sube a `document` (medido 28-09 en «Guías sin
 * registrar», que tiene la misma guarda). La marca se pone en la captura de
 * `window`, que corre antes que nadie, con el modal todavía abierto.
 */
import { useEffect, useRef } from "react";

export function useTeclasQuedanAdentro(activo: boolean): void {
  const activoRef = useRef(activo);
  useEffect(() => {
    activoRef.current = activo;
  }, [activo]);
  useEffect(() => {
    const marcados = new WeakSet<Event>();
    const marcar = (e: KeyboardEvent) => {
      if (activoRef.current) marcados.add(e);
    };
    const cortar = (e: KeyboardEvent) => {
      if (marcados.has(e)) e.stopPropagation();
    };
    window.addEventListener("keydown", marcar, true);
    document.addEventListener("keydown", cortar);
    return () => {
      window.removeEventListener("keydown", marcar, true);
      document.removeEventListener("keydown", cortar);
    };
  }, []);
}
