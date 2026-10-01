"use client";

/**
 * Los botones de ventana del header de un modal: fijar, maximizar, restaurar.
 *
 * Van a la IZQUIERDA de la X, porque la X es la salida y conviene que no se
 * mueva de lugar entre un modal y otro. Cada botón dice la CONSECUENCIA, no el
 * mecanismo: «deja de cerrarse cuando tocas afuera» se entiende sin saber qué
 * es fijar; «toggle pin» no.
 *
 * Se dibujan sólo cuando la ventana está activa (>= 640 px y variante
 * centrada): en el bottom-sheet del celular mover y estirar no significan nada.
 */

import { Maximize2, Minimize2, Pin, PinOff, RotateCcw } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { VentanaDeModal } from "@/hooks/use-ventana-de-modal";

/** El mismo cuerpo que la X del header, para que la fila se lea pareja. */
const BOTON =
  "h-10 w-10 sm:h-8 sm:w-8 rounded-xl flex items-center justify-center transition-colors shrink-0 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]";
const BOTON_ACTIVO = "bg-primary/10 text-[var(--accent-ink)] dark:bg-primary/20 dark:text-[var(--accent)]";
const ICONO = "h-5 w-5 sm:h-4 sm:w-4";

export function ControlesDeVentana({ ventana }: { ventana: VentanaDeModal }) {
  if (!ventana.activa) return null;
  const { fijado, maximizado, modificada } = ventana;
  const IconoFijar = fijado ? Pin : PinOff;
  const IconoTamano = maximizado ? Minimize2 : Maximize2;

  return (
    <>
      {modificada && !maximizado && (
        <button
          type="button"
          onClick={ventana.restaurar}
          data-ventana-control="true"
          className={BOTON}
          title="Devuelve el modal al centro y a su tamaño de siempre"
          aria-label="Devuelve el modal al centro y a su tamaño de siempre"
        >
          <RotateCcw className={ICONO} strokeWidth={1.75} />
        </button>
      )}
      <button
        type="button"
        onClick={ventana.alternarMaximizado}
        data-ventana-control="true"
        className={BOTON}
        aria-pressed={maximizado}
        title={maximizado ? "Devuelve el modal al tamaño que tenía" : "Agranda el modal a toda la pantalla"}
        aria-label={maximizado ? "Devuelve el modal al tamaño que tenía" : "Agranda el modal a toda la pantalla"}
      >
        <IconoTamano className={ICONO} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        onClick={ventana.alternarFijado}
        data-ventana-control="true"
        className={cn(BOTON, fijado && BOTON_ACTIVO)}
        aria-pressed={fijado}
        title={
          fijado
            ? "Suelta el modal: vuelve a cerrarse cuando tocas afuera"
            : "Fija el modal: deja de cerrarse cuando tocas afuera"
        }
        aria-label={
          fijado
            ? "Suelta el modal: vuelve a cerrarse cuando tocas afuera"
            : "Fija el modal: deja de cerrarse cuando tocas afuera"
        }
      >
        <IconoFijar className={ICONO} strokeWidth={1.75} />
      </button>
    </>
  );
}

/**
 * El tirador de la esquina inferior derecha.
 *
 * Mide 16 px y vive pegado al vértice: el gutter del modal deja 20 px de aire a
 * la derecha y 14 px abajo, así que no le roba el clic al último botón del pie.
 * `aria-hidden` porque es puro mouse — para el teclado están las flechas sobre
 * el asa, y el tamaño se maneja con el botón de maximizar.
 */
export function TiradorDeVentana({ ventana }: { ventana: VentanaDeModal }) {
  if (!ventana.activa || ventana.maximizado) return null;
  return (
    <span
      {...ventana.redimensionProps}
      aria-hidden="true"
      title="Arrastra esta esquina para cambiar el tamaño del modal"
      className="absolute bottom-0 right-0 z-10 h-4 w-4 text-[var(--text-tertiary)] opacity-60 transition-opacity hover:opacity-100"
    >
      <svg viewBox="0 0 16 16" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
        <path d="M15 6 6 15" />
        <path d="M15 11l-4 4" />
      </svg>
    </span>
  );
}

export default ControlesDeVentana;
