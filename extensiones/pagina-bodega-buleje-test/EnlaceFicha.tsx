"use client";

/**
 * El enlace a la ficha de un producto que, con un clic normal, la abre en la
 * ficha rápida (modal) sin salir de la página. El `href` es el de siempre:
 * ctrl/cmd/shift + clic y el clic del medio abren la ficha en otra pestaña, y
 * los buscadores la siguen. Si el modal no está montado, navega.
 *
 * El clic se decide en la CAPTURA de `window`, no en el `onClick` de React:
 * el cargador de navegación del sitio (`components/NavProgress.tsx`) escucha
 * en la captura de `document` —antes que React— y, si el clic no viene
 * cancelado, tapa la página con «Cargando…» esperando una navegación que
 * nunca llega (medido 08-10: el modal quedaba debajo y no se podía tocar).
 * `window` va antes que `document`: cancelado ahí, el cargador lo ignora.
 */
import type { AnchorHTMLAttributes } from "react";
import { useEffect } from "react";
import type { ProductoSalon } from "./datos";
import { abrirFicha, hayFicha } from "./estado-ficha";

/** Qué producto abre cada enlace montado. */
const productos = new WeakMap<HTMLAnchorElement, ProductoSalon>();
let escuchando = false;

function alClic(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element | null)?.closest?.("a");
  const p = a instanceof HTMLAnchorElement ? productos.get(a) : undefined;
  if (!p || !hayFicha()) return;
  e.preventDefault();
  abrirFicha(p);
}

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { p: ProductoSalon };

export function EnlaceFicha({ p, children, ...resto }: Props) {
  useEffect(() => {
    if (escuchando) return;
    escuchando = true;
    window.addEventListener("click", alClic, { capture: true });
  }, []);

  return (
    <a
      ref={(a) => {
        if (a) productos.set(a, p);
      }}
      href={p.href}
      aria-haspopup="dialog"
      {...resto}
    >
      {children}
    </a>
  );
}
