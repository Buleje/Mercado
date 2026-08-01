/**
 * lote-ventana.ts — la ventana de trabajo de un lote y su dueño (ADR-327).
 *
 * Del ERP forestal de referencia, donde el lote lleva fecha de inicio y de fin y
 * su estado se LEE de ahí en vez de tildarse a mano.
 *
 * ## Dos ejes, no uno
 *
 * El `status` del lote es **comercial**: abierto (admite corridas) · cerrado
 * (congelado para vender) · despachado · anulado. La ventana es **operativa**:
 * cuándo la planta trabaja ese lote.
 *
 * Son independientes y confundirlos sería el error: un lote puede estar
 * comercialmente abierto y operativamente terminado (se dejó de aserrar pero
 * todavía se le agregan corridas de otra línea), o cerrado y programado para la
 * semana que viene.
 *
 * PURO y client-safe: recibe el "hoy" para poder testearse sin congelar el reloj.
 */

export type EstadoOperativo = "programado" | "en_proceso" | "finalizado" | "sin_fecha";

export interface VentanaLote {
  fechaInicio?: string | Date | null;
  fechaFin?: string | Date | null;
}

export const LABEL_OPERATIVO: Record<EstadoOperativo, string> = {
  programado: "Programado",
  en_proceso: "En proceso",
  finalizado: "Finalizado",
  sin_fecha: "Sin fechas",
};

function aDia(v: string | Date | null | undefined): number | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  // Se compara por DÍA en UTC: las fechas del libro son date-only y a las 19:00
  // de Lima un `getTime()` crudo ya está en el día siguiente (bug off-by-one).
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * En qué anda el lote según su ventana.
 *
 * Los extremos son INCLUSIVOS: un lote que empieza y termina hoy está en
 * proceso, no finalizado. Con `<` en vez de `<=` un lote de un solo día nacería
 * terminado.
 */
export function estadoOperativo(lote: VentanaLote, hoy: Date = new Date()): EstadoOperativo {
  const ini = aDia(lote.fechaInicio);
  const fin = aDia(lote.fechaFin);
  const hoyDia = aDia(hoy);
  if (hoyDia == null || (ini == null && fin == null)) return "sin_fecha";
  if (ini != null && hoyDia < ini) return "programado";
  if (fin != null && hoyDia > fin) return "finalizado";
  // Con inicio pasado y sin fin declarado, sigue en proceso: no se adivina que
  // terminó porque nadie escribió la fecha.
  return "en_proceso";
}

/** Días que dura la ventana, contando los dos extremos. `null` si falta una punta. */
export function diasDeVentana(lote: VentanaLote): number | null {
  const ini = aDia(lote.fechaInicio);
  const fin = aDia(lote.fechaFin);
  if (ini == null || fin == null) return null;
  return Math.floor((fin - ini) / 86_400_000) + 1;
}

/**
 * Qué tiene de raro la ventana. No bloquea: avisa antes de guardar.
 *
 * Una ventana al revés casi siempre es un typo en el año, y descubrirlo al mes
 * siguiente —cuando el lote aparece "programado" para 2025— cuesta más que un
 * cartel ahora.
 */
export function avisosVentana(lote: VentanaLote): string[] {
  const ini = aDia(lote.fechaInicio);
  const fin = aDia(lote.fechaFin);
  const avisos: string[] = [];
  if (ini != null && fin != null && fin < ini) {
    avisos.push("La fecha de fin es anterior a la de inicio: revisá el año.");
  }
  const dias = diasDeVentana(lote);
  if (dias != null && dias > 365) {
    avisos.push(`La ventana dura ${dias} días: un lote de más de un año suele ser un error de carga.`);
  }
  if (ini == null && fin != null) {
    avisos.push("Hay fecha de fin sin fecha de inicio.");
  }
  return avisos;
}

/**
 * El titular de la madera, para mostrar.
 *
 * Prioriza el nombre guardado en el lote —es el acta— sobre el del directorio:
 * si la ficha se corrigió después, lo que se certificó no cambia.
 */
export function titularDeLote(lote: {
  titularNombre?: string | null;
  titular?: { nombre?: string | null; docNumero?: string | null } | null;
}): { nombre: string; doc: string | null } | null {
  const nombre = (lote.titularNombre ?? "").trim() || (lote.titular?.nombre ?? "").trim();
  if (!nombre) return null;
  return { nombre, doc: (lote.titular?.docNumero ?? "").trim() || null };
}
