/**
 * De dónde salió una guía del Libro TH (pedido de Brandon 07-10: «identificar
 * cuál de las guías está importada, según N° de registro, y cuál está creada
 * manualmente»).
 *
 * No hay columna para esto: la importación (ADR-461) deja su firma en la
 * observación de la guía (`observacionGuia`), y `importacionDeLaGuia` la
 * reconoce letra por letra — la MISMA regla que decide dónde aparece
 * «Deshacer importación». Así la tabla y el botón nunca discrepan.
 *
 *   · serfor    → importada y verificada en SERFOR (trae N° de registro)
 *   · documento → importada desde una foto o PDF, sin verificar en SERFOR
 *   · manual    → emitida o anotada a mano en el panel
 *
 * PURO y client-safe.
 */

import { importacionDeLaGuia } from "./loth-importar-guia-deshacer";

export type OrigenGtf = "serfor" | "documento" | "manual";

export interface OrigenDeGuia {
  origen: OrigenGtf;
  /** N° de registro SERFOR que cita la importación (null si es manual o no lo trae). */
  registro: string | null;
}

export const ETIQUETA_ORIGEN: Record<OrigenGtf, string> = {
  serfor: "Importada de SERFOR",
  documento: "Importada de foto/PDF",
  manual: "Creada a mano",
};

export function origenDeGuia(observations: string | null | undefined): OrigenDeGuia {
  const imp = importacionDeLaGuia(observations);
  if (!imp) return { origen: "manual", registro: null };
  return { origen: imp.verificada ? "serfor" : "documento", registro: imp.registro };
}
