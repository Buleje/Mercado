"use client";

/**
 * Casilla — la ÚNICA casilla de verificación del panel (contrato de diseño, ADR-489).
 *
 * Es un checkbox nativo (el navegador ya resuelve teclado, formulario y lector
 * de pantalla) con UN tamaño (16 px) y el color de marca por token
 * (`accent-color: var(--accent)`, que cambia solo en oscuro). Reemplaza a los
 * ~250 checkbox del panel con 5 tamaños y 6 acentos (codemod
 * `scripts/codemods/casilla.mjs`, ola 5).
 *
 * - Todos los props de un `<input>` pasan tal cual (`checked`, `onChange`,
 *   `disabled`, `name`, `aria-*`…); `type` lo pone la casilla.
 * - `indeterminada`: el estado «algunas elegidas» de una casilla de cabecera.
 * - `etiqueta`: la envuelve en un `<label>` de 48 px de alto (`ALTURA_CONTROL`,
 *   el de todo control del panel: toda la fila marca). Sin ella, la casilla va
 *   sola (dentro del `<label>` de quien la usa).
 */
import { forwardRef, useCallback, useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/** Las clases de la casilla. Exportadas para el codemod y para medirla en el navegador. */
export const CLASE_CASILLA =
  "h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)] align-middle " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export interface CasillaProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** «Algunas elegidas»: la raya del medio en vez del tilde. */
  indeterminada?: boolean;
  /** Texto al lado; con él, la casilla y el texto son un solo `<label>` de 48 px. */
  etiqueta?: React.ReactNode;
}

export const Casilla = forwardRef<HTMLInputElement, CasillaProps>(function Casilla(
  { className, indeterminada = false, etiqueta, onChange, ...rest },
  ref,
) {
  const interna = useRef<HTMLInputElement | null>(null);
  const conRef = useCallback(
    (el: HTMLInputElement | null) => {
      interna.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
    },
    [ref],
  );

  /* `indeterminate` no es un atributo HTML: sólo se pone por la propiedad, y el
     navegador la apaga con cada clic. Por eso se vuelve a poner en CADA render
     (sin dependencias) y justo después del cambio: si la prop sigue en «algunas»
     y nadie re-dibuja, la raya vuelve igual, como React hace con `checked`. */
  useLayoutEffect(() => {
    if (interna.current) interna.current.indeterminate = indeterminada;
  });
  const alCambiar = onChange
    ? (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(e);
        if (interna.current) interna.current.indeterminate = indeterminada;
      }
    : undefined;

  const casilla = (
    <input
      ref={conRef}
      type="checkbox"
      className={cn(CLASE_CASILLA, !etiqueta && className)}
      onChange={alCambiar}
      {...rest}
    />
  );
  if (!etiqueta) return casilla;

  return (
    <label
      className={cn(
        "inline-flex min-h-12 items-center gap-2.5 text-sm text-[var(--text-primary)]",
        rest.disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        className,
      )}
    >
      {casilla}
      <span className="min-w-0">{etiqueta}</span>
    </label>
  );
});
