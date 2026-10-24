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

const DESDE_MD = "(min-width: 768px)";
/* Sin `matchMedia` (jsdom) cuenta como celular: la campana se queda en el encabezado. */
const desdeMd = () => typeof window.matchMedia === "function" && window.matchMedia(DESDE_MD).matches;
function suscribirMd(avisar: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const mql = window.matchMedia(DESDE_MD);
  mql.addEventListener("change", avisar);
  return () => mql.removeEventListener("change", avisar);
}

/**
 * La campana, los mensajes y la cuenta van en la barra lateral mientras el
 * encabezado está oculto (Brandon 24-10: «que no se pierdan los avisos» y
 * «mensajes y cuenta en la barra»). Una sola copia montada a la vez: la campana
 * tiene sonido, avisos flotantes y la tecla N, y dos se pisarían.
 */
export function useCabeceraEnBarra(): boolean {
  const oculta = useCabeceraOculta();
  const md = useSyncExternalStore(suscribirMd, desdeMd, () => false);
  return oculta && md;
}
