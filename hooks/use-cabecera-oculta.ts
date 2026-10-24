"use client";

import { useSyncExternalStore } from "react";

/**
 * Encabezado del panel oculto o a la vista (Brandon 24-10: «en la barra lateral,
 * al lado del logo, poder ocultar el encabezado y mostrarlo»). Lo cambia el
 * botón de la barra lateral y lo lee `AdminTopHeader`; se recuerda en este
 * navegador. Sólo desde `md`: en el celular no hay barra lateral y la
 * hamburguesa vive en el encabezado, así que ahí no se oculta nunca.
 */
const LLAVE = "admin-cabecera-oculta";
const EVENTO = "admin-cabecera-oculta-change";
/** Sin localStorage (modo privado, sin espacio) el botón igual funciona mientras dure la carga. */
let enMemoria = false;

/** Para quien lo mira fuera de React (el atajo Ctrl+K del buscador). */
export function cabeceraOcultaAhora(): boolean {
  try {
    return localStorage.getItem(LLAVE) === "1";
  } catch {
    return enMemoria;
  }
}

function suscribir(avisar: () => void): () => void {
  window.addEventListener(EVENTO, avisar);
  window.addEventListener("storage", avisar);
  return () => {
    window.removeEventListener(EVENTO, avisar);
    window.removeEventListener("storage", avisar);
  };
}

export function fijarCabeceraOculta(oculta: boolean): void {
  enMemoria = oculta;
  try {
    if (oculta) localStorage.setItem(LLAVE, "1");
    else localStorage.removeItem(LLAVE);
  } catch {
    /* sin almacenamiento: queda en memoria */
  }
  window.dispatchEvent(new Event(EVENTO));
}

export function useCabeceraOculta(): boolean {
  return useSyncExternalStore(suscribir, cabeceraOcultaAhora, () => false);
}
