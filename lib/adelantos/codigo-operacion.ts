/**
 * El código con el que se habla de un adelanto (ADR-329).
 *
 * POR QUÉ NO ALCANZA EL `id`. Es un cuid de 25 caracteres
 * (`cmsdqdweb004803vz0pa3scj9`). Nadie lo dicta por teléfono, nadie lo escribe
 * en el recibo de papel, y buscarlo obliga a copiar y pegar desde otra pantalla.
 * El negocio necesita un número corto que se pueda decir en voz alta: «el
 * adelanto ADL-2026-0007».
 *
 * FORMA. `ADL-<año>-<correlativo de 4 dígitos>`, correlativo **por tenant y por
 * año**. Se reinicia cada año como cualquier talonario, y el año adentro evita
 * el problema clásico de «el 0007 ¿de cuál año?».
 *
 * NO ES EL RECIBO DE PAPEL. `reciboManual` es el número del talonario que firma
 * la persona; éste lo pone el sistema. Se guardan los dos porque cuando no
 * cuadran, saber cuál es cuál es justamente el trabajo.
 */

/** Prefijo del módulo. Corto a propósito: se dicta por teléfono. */
export const PREFIJO_ADELANTO = "ADL";

/** Cuántos dígitos tiene el correlativo. 4 = 9.999 adelantos por año y tenant. */
const DIGITOS = 4;

export interface CodigoOperacion {
  codigo: string;
  anio: number;
  correlativo: number;
}

/** Arma el código a partir del año y el correlativo. */
export function formatearCodigo(anio: number, correlativo: number): string {
  return `${PREFIJO_ADELANTO}-${anio}-${String(correlativo).padStart(DIGITOS, "0")}`;
}

/**
 * Lee un código ya emitido. Devuelve `null` si no tiene la forma esperada —un
 * texto cualquiera guardado a mano no debe hacerse pasar por correlativo.
 */
export function leerCodigo(codigo: string | null | undefined): CodigoOperacion | null {
  if (!codigo) return null;
  const m = /^([A-Z]{2,5})-(\d{4})-(\d{1,8})$/.exec(codigo.trim().toUpperCase());
  if (!m || m[1] !== PREFIJO_ADELANTO) return null;
  return { codigo: codigo.trim().toUpperCase(), anio: Number(m[2]), correlativo: Number(m[3]) };
}

/**
 * El próximo código, dado lo que YA existe para ese tenant y año.
 *
 * Se calcula sobre los códigos emitidos y no sobre `count(*)`: si un adelanto se
 * cancela o se borra, el contador no puede retroceder y reusar un número que ya
 * anda escrito en un papel.
 *
 * @param emitidos códigos ya usados por el tenant (de cualquier año).
 * @param anio año del adelanto nuevo.
 */
export function siguienteCodigo(emitidos: readonly (string | null | undefined)[], anio: number): string {
  let mayor = 0;
  for (const c of emitidos) {
    const leido = leerCodigo(c);
    if (leido?.anio === anio && leido.correlativo > mayor) mayor = leido.correlativo;
  }
  return formatearCodigo(anio, mayor + 1);
}

/**
 * ¿Este texto que alguien escribió en el buscador es un código de operación?
 *
 * Tolera que lo escriban sin prefijo («2026-7»), en minúsculas o con espacios:
 * quien lo dicta por teléfono no dicta ceros a la izquierda. Devuelve el código
 * normalizado para poder buscarlo, o `null` si no se parece a uno.
 */
export function normalizarBusquedaCodigo(texto: string): string | null {
  const t = texto.trim().toUpperCase().replace(/\s+/g, "");
  if (!t) return null;

  const conPrefijo = leerCodigo(t);
  if (conPrefijo) return formatearCodigo(conPrefijo.anio, conPrefijo.correlativo);

  // «2026-7» → ADL-2026-0007
  const sinPrefijo = /^(\d{4})-(\d{1,8})$/.exec(t);
  if (sinPrefijo) return formatearCodigo(Number(sinPrefijo[1]), Number(sinPrefijo[2]));

  return null;
}
