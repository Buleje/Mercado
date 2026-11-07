"use client";

/**
 * useLothMapaEscape — lo que hace Escape en el mapa del Libro TH, sacado de
 * `LothMapaMarco` tal cual (cuando pasó las 300 líneas con el planificador):
 *
 *   · sale de «Elegir varios» (limpia lo marcado, como cerrar el modo);
 *   · saca de pantalla completa — salvo que lo haya usado otro (un menú abierto
 *     lo marca con `preventDefault`, un diálogo encima lo necesita él).
 *     «Encima» = con tamaño: el menú móvil del panel es un `role="dialog"` que
 *     vive montado a 0×0 aunque esté cerrado, y contarlo dejaba Escape muerto.
 */

import { useEffect } from "react";

export function useLothMapaEscape(o: {
  eligiendoVarios: boolean;
  salirDeVarios: () => void;
  fullscreen: boolean;
  setFullscreen: (v: boolean) => void;
}): void {
  const { eligiendoVarios, salirDeVarios, fullscreen, setFullscreen } = o;

  useEffect(() => {
    if (!eligiendoVarios) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      salirDeVarios();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [eligiendoVarios, salirDeVarios]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const dialogos = document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]');
      if ([...dialogos].some((d) => d.getBoundingClientRect().width > 0)) return;
      setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, setFullscreen]);
}
