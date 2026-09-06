/**
 * recepcion-trozas.ts — el acto de RECIBIR la madera, que no es lo mismo que la
 * guía (ADR-325).
 *
 * La GTF declara 25 trozas; al patio llegan 23. Hasta ahora el libro sólo sabía
 * lo que decía el documento, así que dos trozas que nunca llegaron figuraban
 * como existencia — y una existencia que no existe es exactamente lo que un
 * fiscalizador encuentra al contar la pila.
 *
 * Tres datos por troza, que son del CENTRO y no del documento:
 *
 * - **parcela**: de qué parcela de corta del POA salió el árbol. Es el cruce que
 *   hace OSINFOR pieza por pieza contra el plan del título habilitante.
 * - **codigoPlanta**: el número que el CTP marca con pintura sobre la testa. Es
 *   por lo que se pregunta en el patio ("traeme la 118"), no por la codificación
 *   del bosque.
 * - **noRecepcionada**: la que no llegó. Se marca, no se borra: el documento
 *   dice que existe y borrarla sería alterar el acta.
 *
 * PURO y client-safe.
 */

import { fmtM3 } from "./cubicacion-formato";

/** Una troza, con lo que hace falta para cerrar su recepción. */
export interface TrozaRecepcion {
  id: string;
  codificacion?: string | null;
  codigoPlanta?: string | null;
  parcela?: string | null;
  volumenM3?: number | null;
  noRecepcionada?: boolean | null;
  recepcionObs?: string | null;
  /** Cuándo bajó ESTA pieza del camión, `YYYY-MM-DD` (ADR-336). */
  fechaRecepcion?: string | null;
  /** Los pedazos, si ya se retrozó: cuentan como la misma madera de la madre. */
  trozaOrigenId?: string | null;
}

/** El estado de recepción de una guía, para mostrarlo arriba de la lista. */
export interface BalanceRecepcion {
  /** Trozas que la guía declara (sin contar los pedazos de un retrozado). */
  declaradas: number;
  recibidas: number;
  faltantes: number;
  /** m³ que declara el documento. */
  volumenDeclarado: number;
  /** m³ que efectivamente llegaron. */
  volumenRecibido: number;
  /** Lo declarado menos lo recibido. Positivo = falta madera. */
  brechaM3: number;
  /** Cuántas piezas ya tienen su código de planta marcado. */
  conCodigoPlanta: number;
  /** Cuántas declaran su parcela de corta (el cruce con el POA). */
  conParcela: number;
  /** `true` cuando todas llegaron: la recepción no tiene nada pendiente. */
  completa: boolean;
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * Balance de la recepción de una guía.
 *
 * Los **retrozos no se cuentan**: un pedazo es la misma madera de su madre, y
 * sumarlo duplicaría el volumen recibido (mismo criterio que el Cuadro Resumen 1
 * del formato, donde el retrozado no mueve el saldo).
 */
export function balanceRecepcion(trozas: readonly TrozaRecepcion[]): BalanceRecepcion {
  const madres = trozas.filter((t) => !t.trozaOrigenId);
  const recibidas = madres.filter((t) => !t.noRecepcionada);
  const volumenDeclarado = r4(madres.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0));
  const volumenRecibido = r4(recibidas.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0));
  return {
    declaradas: madres.length,
    recibidas: recibidas.length,
    faltantes: madres.length - recibidas.length,
    volumenDeclarado,
    volumenRecibido,
    brechaM3: r4(volumenDeclarado - volumenRecibido),
    conCodigoPlanta: recibidas.filter((t) => (t.codigoPlanta ?? "").trim()).length,
    conParcela: recibidas.filter((t) => (t.parcela ?? "").trim()).length,
    completa: madres.length > 0 && madres.every((t) => !t.noRecepcionada),
  };
}

/** Lo que el operador puede cambiar de una troza al recibirla. */
export interface CambioRecepcion {
  id: string;
  codigoPlanta?: string | null;
  parcela?: string | null;
  /** Cuándo bajó ESTA pieza del camión, `YYYY-MM-DD` (ADR-336). `null` la borra. */
  fechaRecepcion?: string | null;
  noRecepcionada?: boolean | null;
  recepcionObs?: string | null;
}

/**
 * Qué avisos deja la recepción tal como quedó.
 *
 * No bloquean nada —el libro admite huecos, el certificado no— pero se muestran
 * arriba: si el ingreso quedó con volumen de más porque dos trozas no llegaron,
 * eso hay que verlo al cerrar la guía y no tres meses después contando la pila.
 */
export function avisosRecepcion(b: BalanceRecepcion, volumenDelIngreso: number | null): string[] {
  const avisos: string[] = [];
  if (b.declaradas === 0) return avisos;

  if (b.faltantes > 0) {
    avisos.push(
      `${b.faltantes} de ${b.declaradas} troza${b.declaradas === 1 ? "" : "s"} no llegó al patio ` +
        `(${fmtM3(b.brechaM3)} m³ menos de lo que declara la guía).`,
    );
  }
  // El volumen del ingreso es el que manda en los saldos (I2). Si la recepción
  // dice otra cosa, el operador tiene que decidir: se corrige el ingreso o se
  // explica la diferencia. El sistema no lo cambia solo.
  if (volumenDelIngreso != null && b.volumenRecibido > 0) {
    const dif = r4(volumenDelIngreso - b.volumenRecibido);
    if (Math.abs(dif) > 0.001) {
      avisos.push(
        `El ingreso está registrado con ${fmtM3(volumenDelIngreso)} m³ y lo recibido suma ` +
          `${fmtM3(b.volumenRecibido)} m³. Corregí el volumen del ingreso o explicá la diferencia.`,
      );
    }
  }
  const sinCodigo = b.recibidas - b.conCodigoPlanta;
  if (sinCodigo > 0) {
    avisos.push(
      `${sinCodigo} troza${sinCodigo === 1 ? "" : "s"} sin código de planta: en el patio se busca por ese número.`,
    );
  }
  const sinParcela = b.recibidas - b.conParcela;
  if (sinParcela > 0) {
    avisos.push(
      `${sinParcela} troza${sinParcela === 1 ? "" : "s"} sin parcela de corta declarada: es el cruce que hace OSINFOR contra el POA.`,
    );
  }
  return avisos;
}
