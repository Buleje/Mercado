/**
 * Abrir el «Cerrar día» (CierreDiarioModal) desde cualquier pantalla del panel.
 *
 * El modal vive en la página del panel (`AdminGlobalModals`) y hasta ahora sólo
 * lo abrían la barra superior y Ctrl+Shift+C. Con este evento, un estado vacío
 * («Sin cierres de caja») trae su propio botón. Lo escucha `useKeyboardShortcuts`,
 * que ya tiene el setter del modal.
 */
export const EVENTO_ABRIR_CIERRE_DIARIO = "admin:abrir-cierre-diario";

export function abrirCierreDiario(): void {
  window.dispatchEvent(new Event(EVENTO_ABRIR_CIERRE_DIARIO));
}
