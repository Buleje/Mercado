"use client";

/**
 * Ancho de la barra lateral ajustable (Brandon 2026-10-20: «la barra lateral
 * quiero que se pueda achicar y anchar más»).
 *
 * Un solo dueño del ancho: la variable `--admin-sidebar-w` que ya leen la
 * barra, el margen del contenido (app/admin/page.tsx) y el buscador. Mientras
 * se arrastra sólo se escribe la variable en <html> (un cuadro por
 * requestAnimationFrame, sin renders de React); al soltar se guarda.
 * Sin valor guardado manda el de fábrica de globals.css (276/296/312 según
 * el monitor), por eso «restablecer» borra la propiedad en vez de escribir 276.
 */
import * as React from "react";

export const ANCHO_MIN = 208;
export const ANCHO_MAX = 400;
const CLAVE = "admin-sidebar-width";
const VARIABLE = "--admin-sidebar-w";
/** Mientras está puesto, el <style> de TiradorAncho apaga las transiciones del ancho. */
export const ATRIBUTO_ARRASTRE = "data-barra-arrastre";

export function acotarAncho(px: number): number {
  return Math.min(ANCHO_MAX, Math.max(ANCHO_MIN, Math.round(px)));
}

function leerGuardado(): number | null {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (crudo === null) return null;
    const n = Number(crudo);
    return Number.isFinite(n) ? acotarAncho(n) : null;
  } catch {
    return null;
  }
}

/** Ancho vigente (guardado o de fábrica), leído de la variable ya resuelta. */
export function anchoActual(): number {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(VARIABLE));
  return Number.isFinite(v) ? Math.round(v) : 276;
}

export function aplicarAncho(px: number | null): void {
  const raiz = document.documentElement.style;
  if (px === null) raiz.removeProperty(VARIABLE);
  else raiz.setProperty(VARIABLE, `${px}px`);
}

/** Cambia el ancho sin la animación del margen (al cargar, con teclado, al restablecer). */
export function aplicarSinAnimar(px: number | null): void {
  const html = document.documentElement;
  html.setAttribute(ATRIBUTO_ARRASTRE, "teclado");
  aplicarAncho(px);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (html.getAttribute(ATRIBUTO_ARRASTRE) === "teclado") html.removeAttribute(ATRIBUTO_ARRASTRE);
  }));
}

export function guardarAncho(px: number | null): void {
  try {
    if (px === null) localStorage.removeItem(CLAVE);
    else localStorage.setItem(CLAVE, String(px));
  } catch {
    /* sin almacenamiento: vale hasta recargar */
  }
}

/**
 * Aplica el ancho guardado al montar y devuelve el vigente para `aria-valuenow`.
 * `fijar` cambia y guarda (teclado, doble clic); el arrastre escribe la
 * variable directo y llama a `fijar` al soltar.
 */
export function useAnchoBarra() {
  const [ancho, setAncho] = React.useState<number | null>(null);

  React.useLayoutEffect(() => {
    const guardado = leerGuardado();
    if (guardado !== null) aplicarSinAnimar(guardado);
    setAncho(anchoActual());
  }, []);

  const fijar = React.useCallback((px: number | null, animar = false) => {
    const valor = px === null ? null : acotarAncho(px);
    if (animar) aplicarAncho(valor);
    else aplicarSinAnimar(valor);
    guardarAncho(valor);
    setAncho(anchoActual());
  }, []);

  return { ancho, fijar };
}
