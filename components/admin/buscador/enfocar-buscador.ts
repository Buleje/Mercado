/**
 * Pedirle al buscador de la cabecera que tome el foco (Brandon 20-10: «quita
 * este modal de buscar en todo el panel y solo el campo de buscar módulos ahí
 * mismo se pueda buscar»). Ctrl/⌘+K ya no abre una ventana: enfoca el campo.
 *
 * Archivo aparte (sin React) para que quien lo pida —los atajos del panel,
 * `AdminGlobalModals`— no arrastre el índice del buscador.
 */

export const EVENTO_ENFOCAR_BUSCADOR = "admin:enfocar-buscador";

export function enfocarBuscadorPanel(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENTO_ENFOCAR_BUSCADOR));
}
