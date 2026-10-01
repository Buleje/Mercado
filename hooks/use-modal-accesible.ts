"use client";

/**
 * Lo que le falta a un modal escrito a mano para ser usable sin mouse.
 *
 * Medido en el módulo forestal (2026-09-09): **15 modales** con `role="dialog"`
 * propio y ninguno atrapaba el foco. Comprobado en vivo sobre uno de ellos: al
 * abrir, el foco se quedaba en el botón de atrás; había **56 controles
 * enfocables detrás** del modal (con Tab te vas a la pantalla de abajo sin
 * darte cuenta); y Escape no cerraba.
 *
 * Este hook lo arregla sin reescribir el markup —que es lo que hace que la
 * deuda no se pague nunca—: se le pasa el `ref` del contenedor del diálogo y se
 * encarga de:
 *
 *  · **Foco al abrir** — al primer control del modal; si no hay ninguno, al
 *    contenedor (que se hace enfocable con `tabIndex={-1}`).
 *  · **Trampa de Tab** — el foco cicla dentro del diálogo, en los dos sentidos.
 *  · **Escape cierra** — salvo que quien lo use diga que no (un formulario a
 *    medio llenar puede querer confirmar antes).
 *  · **Devolver el foco** — al cerrar, vuelve al elemento que lo abrió: quien
 *    navega con teclado no queda en el principio de la página.
 *  · **Scroll bloqueado** — el fondo no se mueve detrás del modal.
 *
 * No usa Radix a propósito: migrar quince modales a otro componente es un
 * refactor que nadie termina. Esto son tres líneas por modal.
 */
import { useEffect, useRef, type RefObject } from "react";

/** Lo que el navegador considera enfocable, en el orden en que lo tabula. */
const ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModalAccesible(
  ref: RefObject<HTMLElement | null>,
  opciones: { onCerrar?: () => void; cerrarConEscape?: boolean; activo?: boolean } = {},
) {
  const { onCerrar, cerrarConEscape = true, activo = true } = opciones;

  /**
   * La ÚLTIMA versión de `onCerrar`, sin que sea dependencia del efecto.
   *
   * Antes el efecto dependía de `onCerrar`: un llamador que lo pasaba inline
   * (`onClose={() => setX(null)}`) creaba una función nueva en cada render del
   * padre, el efecto se desmontaba y se volvía a montar, y el foco saltaba al
   * primer control **mientras el usuario tipeaba** (revisión 2026-09-12: el
   * motivo de anulación de un adelanto, el filtro de columna de la hoja, las
   * carpetas inteligentes). Pedirle `useCallback` a cada llamador es una regla
   * que se olvida; guardarla en un ref la vuelve imposible de romper.
   */
  const onCerrarRef = useRef(onCerrar);
  useEffect(() => {
    onCerrarRef.current = onCerrar;
  });

  useEffect(() => {
    if (!activo) return;
    const caja = ref.current;
    if (!caja) return;

    /* Quién tenía el foco antes: ahí vuelve al cerrar. */
    const previo = document.activeElement as HTMLElement | null;

    /**
     * ¿Se abrió otro diálogo ENCIMA de éste?
     *
     * Un modal que abre otro modal deja de mandar. Sin esto, el de abajo sigue
     * escuchando el teclado en fase de **captura** —o sea, antes que nadie— y
     * hace dos cosas visiblemente rotas en el de arriba: Tab devuelve el foco
     * al de abajo (no se puede tipear en el de arriba) y **Escape cierra el de
     * abajo**, que es el que tiene el trabajo a medio hacer. Le pasaba al
     * catálogo de especies abierto desde «Producir sin lote».
     *
     * El criterio es el orden del DOM: un diálogo que se abre después se monta
     * después —un portal de Radix se agrega al final de `body`— así que el
     * último es el de arriba. Si el último NO es éste, éste se calla.
     *
     * `alertdialog` cuenta igual: la confirmación del panel (`useConfirm`) es un
     * AlertDialog de Radix. Sin él, un «¿Eliminar?» abierto desde un modal a
     * mano perdía el Tab y su Escape cerraba el modal de abajo.
     */
    /* Un `role="dialog"` DENTRO de esta caja que no es modal (el detalle flotante
       de un día, un popover de celda) no está encima: es parte de este modal.
       Contarlo como otro diálogo apagaba el Tab de este modal mientras el panel
       estaba abierto y el foco se iba a la página de atrás (lo reprodujo un
       revisor el 2026-09-14). Un modal de verdad anidado adentro sí manda. */
    const hayOtroDialogoEncima = () => {
      const dialogos = document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]');
      const ultimo = dialogos[dialogos.length - 1];
      if (!ultimo || ultimo === caja) return false;
      return !caja.contains(ultimo) || ultimo.getAttribute("aria-modal") === "true";
    };

    const enfocables = () =>
      [...caja.querySelectorAll<HTMLElement>(ENFOCABLES)].filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement,
      );

    /* Foco adentro. `requestAnimationFrame` porque el contenido puede montarse
       en el mismo tick (un cubicador entero, por ejemplo). */
    const id = requestAnimationFrame(() => {
      const lista = enfocables();
      (lista[0] ?? caja).focus?.();
    });

    const onKey = (e: KeyboardEvent) => {
      /* Hay otro modal arriba: el teclado es suyo. */
      if (hayOtroDialogoEncima()) return;
      if (e.key === "Escape" && cerrarConEscape && onCerrarRef.current) {
        e.stopPropagation();
        onCerrarRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const lista = enfocables();
      if (lista.length === 0) {
        e.preventDefault();
        caja.focus?.();
        return;
      }
      const primero = lista[0];
      const ultimo = lista[lista.length - 1];
      const activoAhora = document.activeElement as HTMLElement | null;
      /* Fuera del modal (o en el contenedor): volver adentro. */
      if (!activoAhora || !caja.contains(activoAhora)) {
        e.preventDefault();
        (e.shiftKey ? ultimo : primero).focus();
        return;
      }
      if (e.shiftKey && activoAhora === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && activoAhora === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };

    /* Captura: el modal decide antes que los atajos de la pantalla de atrás. */
    document.addEventListener("keydown", onKey, true);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflowPrevio;
      /* Devolver el foco sólo si sigue en el documento: si la acción del modal
         borró la fila que lo abrió, forzarlo tira un error silencioso. */
      if (previo && document.contains(previo)) previo.focus?.();
    };
  }, [ref, cerrarConEscape, activo]);
}
