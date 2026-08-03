/**
 * ¿El volumen declarado de un ingreso coincide con el de sus piezas?
 *
 * POR QUÉ VIVE APARTE. La respuesta se da en dos pantallas —la tabla del libro
 * (una fila por ingreso) y la lista de trozas dentro del ingreso— y si cada una
 * la calcula por su cuenta terminan discrepando: la tabla diría "cuadra" y el
 * detalle "faltan 5 m³" del mismo ingreso. Es el mismo problema que ya pasó con
 * los faltantes de casilleros, que contestaban 2 y 15 según dónde se miraran.
 *
 * LA TOLERANCIA es 0.001 m³ a propósito: es el redondeo con el que SERFOR
 * publica los volúmenes (cuatro decimales), el mismo que usa
 * `volumenSegunDimensiones()`. No es un margen para que las cosas "pasen"; una
 * diferencia de 0.002 es una diferencia real y hay que verla.
 *
 * ⚠️ Sólo cuentan las trozas MADRE. Un retrozo es un pedazo de una troza ya
 * contada (ADR-313): sumarlos juntos es declarar la misma madera dos veces.
 * Quien alimente `trozasM3` tiene que haber filtrado `trozaOrigenId = null`.
 */

/** El redondeo de SERFOR (4 decimales), no un margen de cortesía. */
export const TOLERANCIA_M3 = 0.001;

export type Cuadre =
  | { estado: "sin-piezas" }
  | { estado: "cuadra"; brecha: 0 }
  | { estado: "faltan"; brecha: number; aviso: string }
  | { estado: "sobran"; brecha: number; aviso: string };

/**
 * @param volumenDeclarado m³ con que está registrado el ingreso (casillero 8).
 * @param trozasM3 suma de las piezas madre, o `null` si ninguna trae volumen.
 * @param trozasCount cuántas piezas hay cargadas.
 */
export function cuadreDeIngreso(
  volumenDeclarado: number | null | undefined,
  trozasM3: number | null | undefined,
  trozasCount: number,
): Cuadre {
  // Sin piezas cargadas no hay nada que contrastar. Un ingreso viejo cargado a
  // mano no tiene lista de trozas y NO está mal por eso: gritarle descuadre a
  // todos los que no tienen detalle convierte el aviso en ruido y deja de
  // mirarse justo cuando aparece uno de verdad.
  if (!trozasCount || volumenDeclarado == null || volumenDeclarado <= 0 || trozasM3 == null) {
    return { estado: "sin-piezas" };
  }

  const brecha = Number((volumenDeclarado - trozasM3).toFixed(4));
  if (Math.abs(brecha) <= TOLERANCIA_M3) return { estado: "cuadra", brecha: 0 };

  return brecha > 0
    ? { estado: "faltan", brecha, aviso: `faltan ${brecha.toFixed(4)} m³ por detallar` }
    : {
        estado: "sobran",
        brecha,
        aviso: `${Math.abs(brecha).toFixed(4)} m³ de más en las piezas`,
      };
}

/** Atajo para las pantallas que sólo quieren saber si hay que mostrar alarma. */
export function descuadra(c: Cuadre): c is Extract<Cuadre, { estado: "faltan" | "sobran" }> {
  return c.estado === "faltan" || c.estado === "sobran";
}
