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
 *
 * **Fijado** (ADR-420, `useVentanaDeModal`): mientras la ventana lleva la
 * marca `ATRIBUTO_FIJADA`, la página de atrás está en uso — el Tab no se
 * atrapa, el scroll se suelta y Escape cierra sólo si el foco está DENTRO del
 * modal (afuera, la tecla es de la página). Al desfijar vuelve todo.
 */
import { useEffect, useRef, type RefObject } from "react";
import { ATRIBUTO_FIJADA, ventanaFijadaEn } from "@/hooks/use-ventana-de-modal";

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
    /* Un diálogo FIJADO encima no manda: se fijó para trabajar en lo de abajo
       (o sea, en éste). Manda sólo si el foco está en él — eso lo mira
       `focoEnOtroFijado`. */
    const hayOtroDialogoEncima = () => {
      const dialogos = [...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')].filter(
        (d) => d === caja || !d.hasAttribute(ATRIBUTO_FIJADA),
      );
      const ultimo = dialogos[dialogos.length - 1];
      if (!ultimo || ultimo === caja) return false;
      return !caja.contains(ultimo) || ultimo.getAttribute("aria-modal") === "true";
    };
    const focoEnOtroFijado = () => {
      const fijado = document.activeElement?.closest?.(`[${ATRIBUTO_FIJADA}]`);
      return !!fijado && fijado !== caja && !caja.contains(fijado);
    };
    const fijada = () => ventanaFijadaEn(caja);

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
      if (hayOtroDialogoEncima() || focoEnOtroFijado()) return;
      if (e.key === "Escape" && cerrarConEscape && onCerrarRef.current) {
        /* Fijado y con el foco en la página de atrás: el Escape es de ella. */
        if (fijada() && !caja.contains(document.activeElement)) return;
        e.stopPropagation();
        onCerrarRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      /* Fijado: el Tab entra y sale del modal como en cualquier página. */
      if (fijada()) return;
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
    /* Scroll bloqueado, salvo mientras la ventana está fijada. La marca la pone
       `useVentanaDeModal` en la caja (o en la ventana que vive adentro): se
       escucha para soltar y volver a bloquear en el acto. */
    const overflowPrevio = document.body.style.overflow;
    const aplicarScroll = () => {
      document.body.style.overflow = fijada() ? overflowPrevio : "hidden";
    };
    aplicarScroll();
    const observador = new MutationObserver(aplicarScroll);
    observador.observe(caja, { attributes: true, attributeFilter: [ATRIBUTO_FIJADA], subtree: true });

    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("keydown", onKey, true);
      observador.disconnect();
      document.body.style.overflow = overflowPrevio;
      /* Devolver el foco sólo si sigue en el documento: si la acción del modal
         borró la fila que lo abrió, forzarlo tira un error silencioso. */
      if (previo && document.contains(previo)) previo.focus?.();
    };
  }, [ref, cerrarConEscape, activo]);
}
