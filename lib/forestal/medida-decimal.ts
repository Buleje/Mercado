/**
 * Un campo de medida (Ø, largo, descuento) que se llena como una planilla:
 * texto con teclado decimal, no `type="number"`.
 *
 * `type="number"` tenía dos problemas para moverse con las flechas (Brandon
 * 28-09: «que se pueda mover a los lados al poner la medida… con el teclado»):
 * ↑/↓ SUMAN o RESTAN el paso al valor —una medida que cambia sola al querer ir
 * a la fila de abajo— y el navegador no dice dónde está el cursor
 * (`selectionStart` es `null`), así que no hay forma de saber si ← debe mover
 * el cursor dentro del número o pasar al campo de al lado.
 *
 * Puro a propósito: los tests lo prueban sin montar nada.
 */

/**
 * Lo tipeado, como número decimal escrito: sólo cifras y UN separador. La
 * coma pasa a punto (el teclado de muchos celulares la trae en vez del punto)
 * y lo que no es cifra se descarta.
 */
export function limpiarDecimal(v: string): string {
  const conPunto = v.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const i = conPunto.indexOf(".");
  return i < 0 ? conPunto : conPunto.slice(0, i + 1) + conPunto.slice(i + 1).replace(/\./g, "");
}

/**
 * ¿La flecha sale del campo o mueve el cursor adentro? Convención de planilla:
 * con el valor entero seleccionado (se llegó navegando) o con el cursor en el
 * borde hacia donde apunta la flecha, sale; con un número a medio escribir y
 * el cursor en el medio, se queda.
 */
export function flechaSaleDelCampo(
  sel: { inicio: number | null; fin: number | null; largo: number },
  lado: "izquierda" | "derecha",
): boolean {
  const { inicio, fin, largo } = sel;
  // Sin posición del cursor (un campo que no la informa): sale siempre.
  if (inicio == null || fin == null) return true;
  if (inicio === 0 && fin === largo) return true;
  if (inicio !== fin) return false;
  return lado === "izquierda" ? inicio === 0 : inicio === largo;
}
