"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

/** La barra fija de abajo del panel en el celular (AdminMobileBottomBar). */
const BARRA_DE_ABAJO = 'nav[aria-label="Navegación rápida"]';
const MARGEN = 24;
const MINIMO = 420;

/**
 * Alto de la tarjeta del chat para que el campo de escribir quede en la primera
 * pantalla y POR ENCIMA de la barra de abajo del celular.
 *
 * Se mide en vez de restar una constante al `100dvh`: lo que hay arriba de la
 * tarjeta cambia (el aviso de alertas aparece y se cierra, la cabecera del hub
 * parte en dos filas a 400 px) y con la constante el campo quedaba debajo de la
 * barra de abajo a 400 px (medido 10-10: campo en y=810, barra desde y≈833).
 * El alto no depende del propio alto de la tarjeta: observar el body no entra
 * en bucle (mismo valor = React no vuelve a pintar).
 */
export function useAltoDelChat(ref: RefObject<HTMLElement | null>, activo: boolean): number | null {
  const [alto, setAlto] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!activo) return;
    const medir = () => {
      const el = ref.current;
      if (!el) return;
      const arriba = el.getBoundingClientRect().top + window.scrollY;
      const barra = document.querySelector<HTMLElement>(BARRA_DE_ABAJO);
      const reserva = (barra && barra.offsetHeight > 0 ? barra.offsetHeight : 0) + MARGEN;
      setAlto(Math.max(MINIMO, Math.round(window.innerHeight - arriba - reserva)));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(document.body);
    window.addEventListener("resize", medir);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, [ref, activo]);

  return activo ? alto : null;
}
