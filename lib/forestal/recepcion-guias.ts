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

/**
 * La guía tiene EVIDENCIA FÍSICA de que la madera llegó: se fechó el ingreso
 * (ADR-335) o se decidió pieza por pieza (ADR-325/336).
 *
 * Es el subconjunto «duro» de `estaRecepcionada()`: los dos actos que sólo
 * puede hacer alguien que estuvo en el patio. Validar —el tercer acto— es una
 * decisión del LIBRO: un tilde que se puede dar en bloque a veinte guías sin
 * mirar un solo tronco.
 *
 * Por eso el **score de cumplimiento** pregunta por ésta y no por la otra
 * (ADR-418): medido en el libro real, «Validar todas» pasaba 21 guías a
 * validadas dejándolas con `fechaRecepcion NULL` y 0 piezas decididas, y el
 * puntaje saltaba 25 puntos sin que la madera se hubiera tocado.
 *
 * La BANDEJA sigue usando `estaRecepcionada()`: ahí el criterio laxo es el
 * correcto —una guía que el patio ya resolvió no puede volver a la cola— y es
 * el que replica `RECEPCION_CERRADA_SQL` en `wood-entries.db.ts`. Las dos
 * lecturas salen de las MISMAS piezas: `estaRecepcionada = validada ∨ ésta`.
 */
export function recepcionVerificada(g: GuiaParaRecepcion): boolean {
  if (g.fechaRecepcion) return true;
  return piezasDecididas(g);
}

export function estaRecepcionada(g: GuiaParaRecepcion): boolean {
  if (g.status === "validado") return true;
  return recepcionVerificada(g);
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

// ─── Recibir la madera ≠ salir de la bandeja ───────────────────────────────

/**
 * `estaRecepcionada()` contesta *«¿sigue en la bandeja?»*. Esto contesta otra
 * cosa: *«¿queda madera de este papel por recibir?»*.
 *
 * No son lo mismo y confundirlas dejó el patio trabado (medido el 2026-09-15 en
 * el tenant forestal): **validar** alcanza para salir de la bandeja, pero NO
 * fecha ni el ingreso ni las piezas — y una troza sin `fechaRecepcion` no se
 * puede llevar a la sierra. Una guía validada a mano se iba a «GTF ingresadas»,
 * donde el botón de recepcionar ni existía, y sus trozas quedaban atrapadas sin
 * que ninguna pantalla lo dijera.
 *
 * Es exactamente lo que `WoodEntriesDB.recepcionar()` todavía tendría para
 * hacer: fechar el ingreso si le falta, fechar las piezas sin decisión.
 */
export interface GuiaParaRecibir {
  status?: string | null;
  /** Los asientos del papel — una GTF de dos especies son dos (ADR-312). */
  lineas?: readonly { fechaRecepcion?: string | Date | null }[];
  trozasCount?: number | null;
  trozasDecididas?: number | null;
}

/** Una guía anulada o rechazada no se recibe: se corrige con motivo. */
const recibible = (status?: string | null) => status !== "anulado" && status !== "rechazado";

export function faltaRecibirMadera(g: GuiaParaRecibir): boolean {
  if (!recibible(g.status)) return false;
  const lineas = g.lineas ?? [];
  if (lineas.length > 0 && lineas.some((l) => !l.fechaRecepcion)) return true;
  const total = Number(g.trozasCount ?? 0);
  return total > 0 && Number(g.trozasDecididas ?? 0) < total;
}

/**
 * Qué se va a fechar al apretar el botón, en palabras del patio. Vacío si no
 * queda nada: el botón dice lo que hace, no «recepcionar» a secas.
 */
export function loQueFaltaRecibir(g: GuiaParaRecibir): string[] {
  if (!faltaRecibirMadera(g)) return [];
  const falta: string[] = [];
  const sinFecha = (g.lineas ?? []).filter((l) => !l.fechaRecepcion).length;
  if (sinFecha > 0) {
    falta.push(
      sinFecha === (g.lineas ?? []).length
        ? "sin fecha de recepción"
        : `${sinFecha} asiento${sinFecha === 1 ? "" : "s"} sin fecha`,
    );
  }
  const total = Number(g.trozasCount ?? 0);
  const decididas = Number(g.trozasDecididas ?? 0);
  if (total > 0 && decididas < total) {
    const n = total - decididas;
    falta.push(`${n} troza${n === 1 ? "" : "s"} sin fechar`);
  }
  return falta;
}
