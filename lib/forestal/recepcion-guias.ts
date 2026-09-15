/**
 * recepcion-guias.ts — cuándo una guía dejó de estar «por recepcionar».
 *
 * El patio trabaja con una bandeja: llegan guías, se reciben, y la bandeja se
 * vacía. El libro, en cambio, guarda TODO el período. Las dos cosas conviven si
 * hay un criterio único de «esta guía ya se recepcionó», y ése es el que vive
 * acá (ADR-339).
 *
 * **Tres actos cierran la recepción**, porque tres son los que el operador hace
 * de verdad según cómo entró la guía:
 *
 * 1. **Validarla** — el acto explícito de aceptar el ingreso en el libro.
 * 2. **Fecharla** — `fechaRecepcion` del ingreso (ADR-335): el día que bajó del
 *    camión.
 * 3. **Decidir sus piezas** — cada troza fechada o marcada como no llegada
 *    (ADR-325/336). Una guía con su lista completa ya dice todo lo que hay que
 *    saber, aunque nadie haya tocado el botón de validar.
 *
 * Cualquiera de los tres alcanza. Exigir los tres dejaría la bandeja llena de
 * guías que el patio ya resolvió —medido en el tenant real: **0 de 22 ingresos
 * tenían `fechaRecepcion`** y 15 estaban validados—, y una bandeja que no se
 * vacía se ignora.
 *
 * PURO y client-safe: lo usan el filtro del servidor, la tabla y los KPIs.
 */

export interface GuiaParaRecepcion {
  /** `validado` = el operador ya la aceptó en el libro. */
  status?: string | null;
  /** Cuándo bajó del camión (ADR-335). */
  fechaRecepcion?: string | Date | null;
  /** Cuántas piezas declara la guía. 0 = no trae lista. */
  trozasCount?: number | null;
  /** Cuántas de esas piezas ya tienen decisión: fechadas o marcadas no llegadas. */
  trozasDecididas?: number | null;
}

export type EstadoRecepcion = "ingresada" | "por-recepcionar";

/** Las piezas de la guía están todas decididas (y la guía trae lista). */
export function piezasDecididas(g: GuiaParaRecepcion): boolean {
  const total = Number(g.trozasCount ?? 0);
  return total > 0 && Number(g.trozasDecididas ?? 0) >= total;
}

export function estaRecepcionada(g: GuiaParaRecepcion): boolean {
  if (g.status === "validado") return true;
  if (g.fechaRecepcion) return true;
  return piezasDecididas(g);
}

export function estadoRecepcion(g: GuiaParaRecepcion): EstadoRecepcion {
  return estaRecepcionada(g) ? "ingresada" : "por-recepcionar";
}

/**
 * Qué le falta a la guía para salir de la bandeja, en palabras del patio.
 *
 * Vacío = ya está recepcionada. No es una lista de errores: es lo que hay que
 * hacer, que es distinto de decir «incompleta» y dejar al operador buscando.
 */
export function faltaParaRecepcionar(g: GuiaParaRecepcion): string[] {
  if (estaRecepcionada(g)) return [];
  const falta: string[] = [];
  if (g.status !== "validado") falta.push("sin validar");
  if (!g.fechaRecepcion) falta.push("sin fecha de recepción");
  const total = Number(g.trozasCount ?? 0);
  const decididas = Number(g.trozasDecididas ?? 0);
  if (total > 0 && decididas < total) {
    const pendientes = total - decididas;
    falta.push(`${pendientes} pieza${pendientes === 1 ? "" : "s"} sin decidir`);
  }
  return falta;
}

export interface ResumenRecepcion {
  total: number;
  ingresadas: number;
  porRecepcionar: number;
  /** Piezas que ya se pueden llevar a la sierra: las de las guías recepcionadas. */
  piezasDisponibles: number;
}

export function resumenRecepcion(guias: readonly GuiaParaRecepcion[]): ResumenRecepcion {
  let ingresadas = 0;
  let piezasDisponibles = 0;
  for (const g of guias) {
    if (!estaRecepcionada(g)) continue;
    ingresadas += 1;
    piezasDisponibles += Number(g.trozasCount ?? 0);
  }
  return {
    total: guias.length,
    ingresadas,
    porRecepcionar: guias.length - ingresadas,
    piezasDisponibles,
  };
}
