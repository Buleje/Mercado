/**
 * «Cambió una reserva del patio», avisado por evento de ventana (2026-09-23).
 *
 * Una reserva (ADR-418) se ve en DOS lugares montados a la vez: la tabla de
 * Productos disponibles y la campana de avisos del libro. Borrar el caché de GET
 * (`invalidarCtp`) no alcanza: una pantalla ya montada no vuelve a pedir sola.
 * Medido en QA: tras «Liberar» desde la campana, la tabla de atrás seguía
 * diciendo «venció hace 4 días» de una reserva que ya no existía.
 *
 * Mismo patrón que `patio-cola.ts` (`EVENTO_CAMBIO`): el que escribe avisa, el
 * que muestra escucha y vuelve a leer.
 */

export const EVENTO_APARTADOS = "ctp-apartados-cambio";

/** Lo llama quien acaba de apartar, cambiar o liberar una reserva con éxito. */
export function avisarApartadosCambiaron(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENTO_APARTADOS));
}

/** Suscribe `alCambiar`; devuelve la baja, lista para el `return` de un `useEffect`. */
export function alCambiarApartados(alCambiar: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EVENTO_APARTADOS, alCambiar);
  return () => window.removeEventListener(EVENTO_APARTADOS, alCambiar);
}
