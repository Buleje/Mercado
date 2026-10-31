/**
 * Costo escrito en la fila del inventario → céntimos enteros.
 *
 * Es plata: el margen y la ganancia salen de este número. Por eso la cuenta
 * se hace con texto y enteros (nunca `parseFloat`, que da 2.8 * 100 = 279.99…)
 * y las reglas son estrictas:
 *   · vacío = sin costo (`null`), NUNCA 0 — un 0 inflaría el margen al 100 %;
 *   · negativo, 0, letras o más de 2 decimales = error con su frase;
 *   · se acepta «2.80», «2,80», «S/ 2.80» y «1,250.50» (es-PE usa punto
 *     decimal; la coma sola con 1-2 cifras se lee como decimal);
 *   · coma + 3 cifras SIN punto («0,500», «2,805») = error: quien escribe la
 *     coma decimal guardaría 1000 veces el costo si se leyera como miles.
 */

/** Tope sano para el costo de una unidad (la columna es Decimal(12,2)). */
export const COSTO_MAXIMO_CENTIMOS = 100_000_000; // S/ 1 000 000

export type LecturaDeCosto =
  | { ok: true; centimos: number | null }
  | { ok: false; error: string };

export function leerCostoEnCentimos(texto: string): LecturaDeCosto {
  let t = texto.trim().replace(/^s\/\.?\s*/i, "").replace(/\s+/g, "");
  if (t === "") return { ok: true, centimos: null };
  if (t.startsWith("-")) return { ok: false, error: "El costo no puede ser negativo" };

  if (t.includes(",")) {
    if (t.includes(".")) t = t.replace(/,/g, ""); // 1,250.50 → miles con coma
    else if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(",", "."); // 2,80 → decimal
    else if (/^\d+,\d{3,}$/.test(t)) return { ok: false, error: "¿Miles o céntimos? Escribe 2805 o 2.80" };
    else return { ok: false, error: "Escribe el costo como 2.80" };
  }

  const m = /^(\d*)(?:\.(\d*))?$/.exec(t);
  if (!m || (m[1] === "" && !m[2])) return { ok: false, error: "Escribe el costo como 2.80" };
  const decimales = m[2] ?? "";
  if (decimales.length > 2) return { ok: false, error: "Usa hasta 2 decimales (céntimos)" };

  const soles = m[1] === "" ? 0 : Number(m[1]);
  const centimos = soles * 100 + Number(decimales.padEnd(2, "0"));
  if (!Number.isSafeInteger(centimos)) return { ok: false, error: "Ese costo es demasiado grande" };
  if (centimos === 0) return { ok: false, error: "El costo es mayor que 0; si no lo sabes, déjalo vacío" };
  if (centimos > COSTO_MAXIMO_CENTIMOS) return { ok: false, error: "Ese costo es demasiado grande" };
  return { ok: true, centimos };
}

/** Costo guardado (soles, puede llegar como texto por ser Decimal) → céntimos, o null si no tiene. */
export function centimosDelCosto(costPrice: number | string | null | undefined): number | null {
  if (costPrice == null || costPrice === "") return null;
  const n = Number(costPrice);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/** Céntimos → texto para la casilla («2.80»), sin símbolo ni miles. */
export function textoDeCentimos(centimos: number | null): string {
  if (centimos == null) return "";
  return `${Math.floor(centimos / 100)}.${String(centimos % 100).padStart(2, "0")}`;
}
