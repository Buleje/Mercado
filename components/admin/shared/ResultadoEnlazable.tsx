"use client";

/**
 * Una fila del buscador del panel (⌘K) que lleva a algún lado.
 *
 * Con `href` es un `<a>` de verdad: ctrl/cmd + clic, clic con la rueda y «abrir
 * en otra pestaña» funcionan solos; el clic normal llama `onElegir` (que navega
 * SIN recargar: el video de las cámaras no se corta). Sin `href` (una acción
 * con su propio callback) es un botón.
 */

import type { MouseEvent, ReactNode } from "react";

interface ResultadoEnlazableProps {
  href: string | null;
  onElegir: () => void;
  className?: string;
  children: ReactNode;
}

/** ¿Clic que el navegador tiene que manejar solo? (otra pestaña, ventana, descarga, botón no principal). */
const esClicDelNavegador = (e: MouseEvent<HTMLAnchorElement>) =>
  e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;

export function ResultadoEnlazable({ href, onElegir, className, children }: ResultadoEnlazableProps) {
  if (!href) {
    return (
      <button type="button" onClick={onElegir} className={className}>
        {children}
      </button>
    );
  }
  const alClic = (e: MouseEvent<HTMLAnchorElement>) => {
    if (esClicDelNavegador(e)) return;
    e.preventDefault();
    onElegir();
  };
  return (
    <a href={href} onClick={alClic} className={className}>
      {children}
    </a>
  );
}

export default ResultadoEnlazable;
