/**
 * ¿Cuánto de un despacho tiene corrida de origen declarada?
 *
 * POR QUÉ EXISTE. La respuesta se da en dos lugares —la fila de la tabla de
 * Despacho y la ficha de trazabilidad del despacho— y si cada uno la calcula por
 * su cuenta terminan discrepando, que es exactamente lo que ya pasó con los
 * casilleros faltantes y con el cuadre de las trozas.
 *
 * LA REGLA ES `≤`, NUNCA `==`. La atribución parcial está PERMITIDA a propósito
 * (invariante I4): obligar a atribuir el 100% para poder guardar empuja a
 * inventar un origen, que es justo el fraude que el libro previene. Lo que no
 * puede pasar es que la falta sea invisible: el faltante se declara, se ve en la
 * fila, y bloquea el CERTIFICADO — nunca el guardado.
 *
 * La tolerancia es el redondeo de SERFOR (4 decimales), igual que el cuadre de
 * las trozas.
 */

export const TOLERANCIA_ATRIBUCION = 0.001;

export type EstadoAtribucion =
  | { estado: "sin-cantidad" }
  | { estado: "completa" }
  | { estado: "sin-atribucion"; sinAtribuir: number; aviso: string }
  | { estado: "parcial"; sinAtribuir: number; aviso: string };

/**
 * @param declarado cantidad que declara el despacho (casillero 11).
 * @param atribuido suma de lo atribuido a corridas de producción.
 * @param unidad para el texto — un despacho puede ir en pt, kg o m³.
 */
export function atribucionDeDespacho(
  declarado: number | null | undefined,
  atribuido: number | null | undefined,
  unidad = "m³",
): EstadoAtribucion {
  // Sin cantidad no hay nada contra qué medir. No es "sin atribuir": es un
  // despacho al que le falta el dato de arriba, y decir "faltan 0" confunde.
  if (declarado == null || declarado <= 0) return { estado: "sin-cantidad" };

  const puesto = atribuido ?? 0;
  const sinAtribuir = Number((declarado - puesto).toFixed(4));
  if (sinAtribuir <= TOLERANCIA_ATRIBUCION) return { estado: "completa" };

  // Nada atribuido y algo atribuido son distintos para quien tiene que
  // arreglarlo: uno es "falta hacerlo", el otro "quedó a medias".
  return puesto <= TOLERANCIA_ATRIBUCION
    ? {
        estado: "sin-atribucion",
        sinAtribuir,
        aviso: `sin origen declarado (${sinAtribuir.toFixed(4)} ${unidad})`,
      }
    : {
        estado: "parcial",
        sinAtribuir,
        aviso: `${sinAtribuir.toFixed(4)} ${unidad} sin origen`,
      };
}

/** Para las pantallas que sólo quieren saber si hay que mostrar alarma. */
export function faltaAtribuir(
  e: EstadoAtribucion,
): e is Extract<EstadoAtribucion, { estado: "parcial" | "sin-atribucion" }> {
  return e.estado === "parcial" || e.estado === "sin-atribucion";
}
