"use client";

import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";

/** Lo que tapa el borde de abajo en el celular: la barra del panel y la de cobro (0 px si no se ven). */
const BARRAS_DE_ABAJO = ['nav[aria-label="Navegación rápida"]', "[data-pos-barra-cobro]"];
const MARGEN = 16;

/**
 * Alto del mostrador (10-10): la grilla y el carrito llegan justo hasta el borde de la ventana.
 *
 * Antes la grilla y el carrito medían `calc(100vh - 14rem)` sin importar dónde empezaban: a 1280×900
 * el carrito arrancaba en y=264 y terminaba en 940, así que «Cobrar» quedaba debajo del borde y había
 * que bajar la página para cobrar. Ahora se mide dónde empieza la zona y se le da lo que queda.
 *
 * En escritorio el alto es de la fila (grilla y carrito lado a lado); debajo, sólo de la grilla. Se
 * descuenta lo que tapa el borde de abajo (mismo criterio que `useAltoDelChat`): en celular, la barra
 * del panel y la de cobro cuando hay carrito, para que el último renglón no quede escondido detrás.
 */
export function useAltoDelMostrador(ref: RefObject<HTMLElement | null>) {
  const esEscritorio = useMediaQuery("(min-width: 1024px)");
  const [alto, setAlto] = useState<number | null>(null);

  // Cada render del POS (agregar al carrito, abrir los indicadores) puede mover la zona: se re-mide.
  useLayoutEffect(() => {
    const nuevo = medir(ref.current);
    if (nuevo != null) setAlto((v) => (v != null && Math.abs(v - nuevo) < 2 ? v : nuevo));
  });

  useEffect(() => {
    let marco = 0;
    const alCambiar = () => {
      cancelAnimationFrame(marco);
      marco = requestAnimationFrame(() => {
        const nuevo = medir(ref.current);
        if (nuevo != null) setAlto((v) => (v != null && Math.abs(v - nuevo) < 2 ? v : nuevo));
      });
    };
    window.addEventListener("resize", alCambiar);
    // Lo de arriba cambia de alto sin que el POS se vuelva a dibujar (el aviso que se cierra, la barra
    // de pestañas que parte en dos renglones). El valor no depende del alto propio: no entra en bucle.
    const obs = new ResizeObserver(alCambiar);
    obs.observe(document.body);
    return () => {
      cancelAnimationFrame(marco);
      window.removeEventListener("resize", alCambiar);
      obs.disconnect();
    };
  }, [ref]);

  return { alto, esEscritorio };
}

function medir(el: HTMLElement | null): number | null {
  if (!el) return null;
  /* En «Pantalla completa» se desplaza el contenedor fijo (data-pos-scroll), no la ventana:
     con window.scrollY la grilla crecía lo que habías bajado en cada redibujo (revisión 10-10). */
  const sc = el.closest<HTMLElement>("[data-pos-scroll]");
  const arriba = el.getBoundingClientRect().top + (sc ? sc.scrollTop - sc.getBoundingClientRect().top : window.scrollY);
  const abajo = BARRAS_DE_ABAJO.reduce((s, sel) => s + (document.querySelector<HTMLElement>(sel)?.offsetHeight ?? 0), 0);
  const minimo = window.innerWidth < 640 ? 320 : 400;
  return Math.max(minimo, Math.round(window.innerHeight - arriba - MARGEN - abajo));
}
