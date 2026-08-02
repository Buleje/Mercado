/**
 * Qué contestarle al operario que pregunta por una pieza en el patio.
 *
 * La pregunta real, parado frente a la pila, es *"¿la 118 la puedo mandar a la
 * sierra?"*. No es la misma pregunta que hace el libro —ahí interesa el
 * casillero— y por eso la respuesta se arma acá y no reusando el badge de la
 * tabla: en el patio la respuesta útil es **sí / no y por qué**, en una línea
 * que se lee de lejos y con sol.
 *
 * Las reglas de bloqueo NO se re-escriben: salen de `motivoBloqueo()`, la misma
 * que usa el picker y que el servidor espeja al guardar (T1, ADR-326). Si acá
 * dijera algo distinto, el patio y el libro se contradirían sobre la misma pieza.
 */

import { LABEL_BLOQUEO, motivoBloqueo, type TrozaConsumible } from "./consumo-trozas";

export type TonoPatio = "libre" | "bloqueada" | "ausente";

export interface FichaPatio {
  /** Cómo pintarla: verde = se puede usar, gris = no, rojo = no llegó. */
  tono: TonoPatio;
  /** La respuesta en dos palabras, para leerla de lejos. */
  titulo: string;
  /** El porqué, cuando no se puede. */
  detalle: string | null;
  /** El número por el que se preguntó — el de planta manda sobre el del bosque. */
  codigo: string;
  /** El otro código, si existe, para casar con la guía. */
  codigoAlterno: string | null;
}

/**
 * `noRecepcionada` se mira ANTES que el resto: una pieza que nunca bajó del
 * camión no está "bloqueada", está ausente, y mandar a alguien a buscarla a la
 * pila es hacerle perder el viaje. Es el único motivo que cambia de tono.
 */
export function fichaDeTroza(t: TrozaConsumible): FichaPatio {
  const codigo = t.codigoPlanta?.trim() || t.codificacion?.trim() || "sin código";
  const codigoAlterno =
    t.codigoPlanta?.trim() && t.codificacion?.trim() ? t.codificacion.trim() : null;

  if (t.noRecepcionada) {
    return {
      tono: "ausente",
      titulo: "No llegó al patio",
      detalle: "Figura en la guía pero nunca bajó del camión. No la busques en la pila.",
      codigo,
      codigoAlterno,
    };
  }

  const bloqueo = motivoBloqueo(t);
  if (bloqueo) {
    return {
      tono: "bloqueada",
      titulo: "No se puede usar",
      detalle: LABEL_BLOQUEO[bloqueo],
      codigo,
      codigoAlterno,
    };
  }

  return {
    tono: "libre",
    titulo: "Lista para la sierra",
    detalle: null,
    codigo,
    codigoAlterno,
  };
}

/**
 * Cuánto le falta a una guía para estar recibida.
 *
 * "Recibida" no es un flag: es haber pasado por cada pieza y decir si llegó y
 * con qué número se la marcó. Una guía a la que le faltan códigos de planta está
 * a medio recibir aunque nadie haya marcado nada como faltante — y es
 * exactamente la que hay que terminar antes de que el camión siguiente tape la
 * pila.
 *
 * Los retrozos no cuentan: un pedazo es la misma madera de su madre (ADR-313) y
 * no se recibe aparte.
 */
export interface PendienteGuia {
  total: number;
  conCodigo: number;
  faltan: number;
  noLlegaron: number;
  /** Sin ninguna pieza marcada: la guía no se tocó todavía. */
  sinEmpezar: boolean;
  completa: boolean;
}

export function pendienteDeRecepcion(
  trozas: ReadonlyArray<{
    codigoPlanta?: string | null;
    noRecepcionada?: boolean | null;
    trozaOrigenId?: string | null;
  }>,
): PendienteGuia {
  const madres = trozas.filter((t) => !t.trozaOrigenId);
  const noLlegaron = madres.filter((t) => t.noRecepcionada).length;
  // A la que no llegó no se le exige código: no está en la pila para marcarla.
  const esperadas = madres.filter((t) => !t.noRecepcionada);
  const conCodigo = esperadas.filter((t) => (t.codigoPlanta ?? "").trim()).length;
  const faltan = esperadas.length - conCodigo;

  return {
    total: madres.length,
    conCodigo,
    faltan,
    noLlegaron,
    sinEmpezar: conCodigo === 0 && noLlegaron === 0 && madres.length > 0,
    // Una guía sin piezas cargadas no está "completa": no hay nada que recibir.
    completa: madres.length > 0 && faltan === 0,
  };
}
