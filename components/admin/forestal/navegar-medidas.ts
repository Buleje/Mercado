/**
 * Moverse con el teclado entre los campos de medida (Tala, Trozado y Trozado
 * múltiple), como en una planilla (Brandon 28-09: «que se pueda mover a los
 * lados al poner la medida de diámetro, largo, etc., con el teclado»):
 *
 *  · ←/→ pasan al campo vecino cuando el cursor está en el borde (o el valor
 *    entero seleccionado); con un número a medio escribir, mueven el cursor.
 *  · ↑/↓ van al campo de la fila de arriba/abajo que está más cerca en
 *    horizontal — por POSICIÓN en pantalla, no por orden del DOM: a 400 px las
 *    secciones se apilan y «abajo» es otro campo que a 1280.
 *  · Enter va al siguiente (Shift+Enter al anterior) y nunca envía el
 *    formulario; en el último, `alTerminar` o el primer control del bloque
 *    que sigue.
 *
 * Al llegar, el valor queda seleccionado: lo que se tipea lo reemplaza. No hay
 * `tabindex` itinerante ni `aria-activedescendant`: el foco es el de siempre,
 * Tab sigue igual y el lector de pantalla anuncia el campo al que se llega.
 *
 * Se engancha UNA vez en el contenedor (`onKeyDown`); los campos se marcan con
 * `data-medida` (`CampoMedida` ya lo trae).
 */

import type { KeyboardEvent } from "react";
import { flechaSaleDelCampo } from "@/lib/forestal/medida-decimal";

export const SELECTOR_MEDIDA = "input[data-medida]";

/** Lo que el navegador tabula (el mismo criterio que `useModalAccesible`). */
const ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Sin layout (jsdom) todo mide 0: ahí no se descarta nada por invisible. */
const visible = (el: HTMLElement, hayLayout: boolean) => !hayLayout || el.offsetWidth > 0 || el.offsetHeight > 0;

export function enfocarMedida(el: HTMLInputElement | null | undefined): boolean {
  if (!el) return false;
  el.focus();
  el.select();
  return true;
}

/** El campo de la fila de arriba (−1) o de abajo (+1) más cercano en horizontal. */
function vecinoVertical(campos: HTMLInputElement[], actual: HTMLInputElement, dir: 1 | -1): HTMLInputElement | null {
  const r = actual.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  const cy = r.top + r.height / 2;
  const cx = r.left + r.width / 2;
  const candidatos = campos
    .filter((c) => c !== actual)
    .map((c) => ({ c, rc: c.getBoundingClientRect() }))
    .filter(({ rc }) => rc.width > 0 || rc.height > 0)
    .map(({ c, rc }) => ({ c, dy: (rc.top + rc.height / 2 - cy) * dir, dx: Math.abs(rc.left + rc.width / 2 - cx) }))
    // Media altura de margen: lo que está en la misma fila no cuenta.
    .filter((x) => x.dy > r.height / 2);
  if (candidatos.length === 0) return null;
  const filaMasCerca = Math.min(...candidatos.map((x) => x.dy));
  const deEsaFila = candidatos.filter((x) => x.dy <= filaMasCerca + r.height / 2);
  return deEsaFila.reduce((a, b) => (b.dx < a.dx ? b : a)).c;
}

/**
 * El primer control enfocable DESPUÉS del contenedor, dentro del diálogo. Se
 * saltan los que abren algo (`aria-expanded`: el ⓘ, un menú): medido 28-09 en
 * Tala, Enter caía en el ⓘ de «Marcado del código», que con foco de teclado
 * abre su cartel encima del formulario.
 */
function siguienteFuera(contenedor: HTMLElement): HTMLElement | null {
  const raiz = contenedor.closest<HTMLElement>('[role="dialog"]') ?? document.body;
  const hayLayout = contenedor.offsetWidth > 0 || contenedor.offsetHeight > 0;
  return (
    [...raiz.querySelectorAll<HTMLElement>(ENFOCABLES)].find(
      (el) =>
        !contenedor.contains(el) &&
        Boolean(contenedor.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) &&
        !el.hasAttribute("aria-expanded") &&
        visible(el, hayLayout),
    ) ?? null
  );
}

/**
 * El manejador del contenedor. `alTerminar` decide adónde va Enter en el
 * último campo (el botón de guardar, «Agregar troza»…); si devuelve `false` o
 * no está, va al bloque que sigue.
 */
export function moverEntreMedidas(e: KeyboardEvent<HTMLElement>, alTerminar?: () => boolean): void {
  const el = e.target;
  if (!(el instanceof HTMLInputElement) || !el.matches(SELECTOR_MEDIDA)) return;
  // Atajos del sistema (Ctrl+← salta palabras) y el teclado de un IME: no se tocan.
  if (e.altKey || e.ctrlKey || e.metaKey || e.nativeEvent.isComposing) return;
  const contenedor = e.currentTarget;
  const campos = [...contenedor.querySelectorAll<HTMLInputElement>(SELECTOR_MEDIDA)].filter((c) => !c.disabled);
  const i = campos.indexOf(el);
  const sel = { inicio: el.selectionStart, fin: el.selectionEnd, largo: el.value.length };

  switch (e.key) {
    case "Enter": {
      // Nunca envía el formulario a medio medir.
      e.preventDefault();
      if (e.shiftKey) {
        enfocarMedida(campos[i - 1]);
        return;
      }
      if (enfocarMedida(campos[i + 1])) return;
      if (alTerminar?.()) return;
      siguienteFuera(contenedor)?.focus();
      return;
    }
    case "ArrowRight":
    case "ArrowLeft": {
      // Shift+flecha selecciona texto: es del campo.
      const lado = e.key === "ArrowLeft" ? "izquierda" : "derecha";
      if (e.shiftKey || !flechaSaleDelCampo(sel, lado)) return;
      const destino = campos[lado === "izquierda" ? i - 1 : i + 1];
      if (!destino) return;
      e.preventDefault();
      enfocarMedida(destino);
      return;
    }
    case "ArrowDown":
    case "ArrowUp": {
      if (e.shiftKey) return;
      const destino = vecinoVertical(campos, el, e.key === "ArrowDown" ? 1 : -1);
      if (!destino) return;
      e.preventDefault();
      enfocarMedida(destino);
      return;
    }
    default:
      return;
  }
}
