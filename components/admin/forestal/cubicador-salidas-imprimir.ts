/**
 * Imprime la constancia de salida de un viaje en una ventana propia (mismo
 * patrón que `imprimirPlanilla`: la ventana se abre en el MISMO clic, antes de
 * cualquier `await`, o el navegador la bloquea como pop-up — ADR-436).
 */
import { htmlDeConstanciaDeSalida, type DatosDeLaConstancia } from "@/lib/forestal/cubicacion-salida-papel";
import { ponerBarra } from "./planillas/imprimir-planilla";

export function imprimirConstanciaDeSalida(datos: DatosDeLaConstancia): void {
  const w = window.open("", "_blank", "width=900,height=900");
  if (!w) throw new Error("El navegador bloqueó la ventana. Permite ventanas emergentes para imprimir la constancia.");
  w.document.open();
  w.document.write(htmlDeConstanciaDeSalida(datos));
  w.document.close();
  ponerBarra(w);
  w.focus();
}
