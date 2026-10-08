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

import { useEffect, useState, type RefObject } from "react";
/* Dependencia de `@radix-ui/react-dialog` (misma copia, 1.1.7, una sola en
   node_modules): la pila de FocusScope tiene que ser LA MISMA que usa el
   diálogo, o la pausa no lo alcanza. El VRT `modal-fijado-fondo-libre` lo
   comprueba con el Tab y el clic en un campo de atrás. */
import { FocusScope } from "@radix-ui/react-focus-scope";
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

/**
 * Lo que un `Dialog` MODAL de Radix no suelta solo cuando la ventana se fija.
 *
 * Fijar es «lo dejo abierto y sigo trabajando atrás» (ADR-420). Radix, mientras
 * el diálogo es modal, hace tres cosas que lo impiden y que no se apagan sin
 * desmontarlo:
 *   · bloquea el scroll (`RemoveScroll`, que vive en el `Overlay`) — eso lo
 *     resuelve el llamador NO pintando el `Overlay` mientras está fijado;
 *   · atrapa el foco (`FocusScope trapped`): un clic en un campo de atrás
 *     devolvía el foco al modal y el Tab daba vueltas adentro;
 *   · esconde la página al lector de pantalla (`aria-hidden` en todo lo demás).
 *
 * `modal={false}` lo resolvería, pero Radix pinta OTRO componente
 * (`DialogContentNonModal`): React desmonta el contenido y se pierde lo tipeado.
 *
 * Este hook devuelve `true` un cuadro después de fijar —cuando el contenido del
 * portal ya está montado— y mientras tanto le saca el `aria-hidden` a la
 * página. Con ese `true`, el llamador pinta `PausaDeFocoRadix` adentro del
 * contenido. Vive en el COMPONENTE del modal y no en el contenido a propósito:
 * al cerrar estando fijado, su limpieza corre antes de que Radix desmonte el
 * contenido y deshaga su `aria-hidden`, así que lo devuelve en orden.
 */
export function useFondoLibreAlFijar(fijado: boolean, contenidoRef: RefObject<HTMLElement | null>): boolean {
  const [listo, setListo] = useState(false);
  useEffect(() => {
    if (!fijado) return;
    const cuadro = requestAnimationFrame(() => setListo(true));
    return () => {
      cancelAnimationFrame(cuadro);
      setListo(false);
    };
  }, [fijado]);

  useEffect(() => {
    if (!fijado || !listo) return;
    const contenido = contenidoRef.current;
    if (!contenido) return;
    /* Con otro MODAL abierto (uno anidado, o un modal a mano debajo) el
       `aria-hidden` es de los dos y no se puede repartir: se deja como está.
       Cuenta sólo el que se ve y es modal (`data-state="open"` de Radix o
       `aria-modal`): el panel tiene diálogos montados y ocultos todo el tiempo,
       y contarlos dejaba la página escondida siempre (medido en Fiados). */
    const otro = [...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')].some(
      (d) =>
        d !== contenido &&
        !contenido.contains(d) &&
        !d.contains(contenido) &&
        d.getClientRects().length > 0 &&
        (d.getAttribute("data-state") === "open" || d.getAttribute("aria-modal") === "true"),
    );
    if (otro) return;
    const ocultos = [...document.querySelectorAll<HTMLElement>("[data-aria-hidden]")].filter(
      (el) => el.getAttribute("aria-hidden") === "true" && !el.contains(contenido),
    );
    for (const el of ocultos) el.removeAttribute("aria-hidden");
    return () => {
      /* Sólo si Radix todavía lo tiene marcado: si ya lo soltó, devolverlo
         dejaría la página escondida para siempre. */
      for (const el of ocultos) if (el.isConnected && el.hasAttribute("data-aria-hidden")) el.setAttribute("aria-hidden", "true");
    };
  }, [fijado, listo, contenidoRef]);

  return fijado && listo;
}

/**
 * Pausa la trampa de foco del diálogo que la contiene.
 *
 * Radix lleva una pila de `FocusScope`: el que se monta último manda y pausa
 * al de abajo (así funcionan los diálogos anidados). Un `FocusScope` vacío y
 * sin trampa, montado DESPUÉS del diálogo, lo pausa sin tocar ningún evento:
 * los `onFocus`/`onBlur` de la página y del modal siguen llegando. Al
 * desmontarse (desfijar) el diálogo vuelve a mandar y a atrapar el Tab.
 */
export function PausaDeFocoRadix({ activa }: { activa: boolean }) {
  if (!activa) return null;
  return (
    <FocusScope asChild onMountAutoFocus={(e) => e.preventDefault()} onUnmountAutoFocus={(e) => e.preventDefault()}>
      <span hidden data-pausa-foco="" />
    </FocusScope>
  );
}

export default ControlesDeVentana;
