/**
 * fecha-vencimiento — sacar "hasta cuándo vale" del texto, sin depender de la IA.
 *
 * La fecha de vencimiento es lo que dispara el aviso ("te avisamos 7 días
 * antes"), o sea lo que evita la multa. Pedírsela al modelo funciona con los
 * grandes, pero un modelo chico —los que corren en tu propia máquina— suele
 * transcribir bien "VÁLIDA HASTA: 15/01/2027" y dejar el campo vacío igual.
 *
 * Esto la busca en el texto con reglas: no inventa nada, sólo lee lo que está
 * escrito. Se usa como RESPALDO de la IA, nunca la pisa.
 *
 * Fechas al modo peruano: 15/01/2027 es 15 de enero, no 1 de marzo.
 */

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

/** Las palabras que anuncian un vencimiento (no una fecha de emisión). */
const ANUNCIOS =
  "(?:v[áa]lid[oa]\\s+hasta|vence(?:\\s+el)?|vencimiento|caduca(?:\\s+el)?|caducidad|fecha\\s+de\\s+vencimiento|vigente\\s+hasta|hasta\\s+el)";

const sinTildes = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Arma la fecha si es real (rechaza 31/02) y la deja al mediodía UTC. */
function fecha(d: number, m: number, a: number): string | null {
  if (a < 1900 || a > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = new Date(Date.UTC(a, m - 1, d, 12));
  if (iso.getUTCMonth() !== m - 1 || iso.getUTCDate() !== d) return null; // 31 de febrero
  return iso.toISOString();
}

/** Un año de 2 dígitos es de este siglo: "27" → 2027. */
const anio = (s: string) => (s.length === 2 ? 2000 + Number(s) : Number(s));

/**
 * La fecha de vencimiento escrita en el texto, o null.
 * Sólo devuelve algo si viene DESPUÉS de una palabra que anuncia vencimiento:
 * "Emitida: 15/01/2026 · Válida hasta: 15/01/2027" tiene que dar 2027.
 */
export function fechaDeVencimientoEnTexto(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const t = sinTildes(texto).replace(/\s+/g, " ");

  // 15/01/2027 · 15-01-2027 · 15.01.27
  const numerica = new RegExp(`${ANUNCIOS}\\s*[:\\-]?\\s*(\\d{1,2})[/\\-.](\\d{1,2})[/\\-.](\\d{2,4})`, "i");
  const n = numerica.exec(t);
  if (n) {
    const f = fecha(Number(n[1]), Number(n[2]), anio(n[3]));
    if (f) return f;
  }

  // 2027-01-15 (ISO, por si el documento ya viene normalizado)
  const iso = new RegExp(`${ANUNCIOS}\\s*[:\\-]?\\s*(\\d{4})-(\\d{1,2})-(\\d{1,2})`, "i").exec(t);
  if (iso) {
    const f = fecha(Number(iso[3]), Number(iso[2]), Number(iso[1]));
    if (f) return f;
  }

  // 15 de enero de 2027
  const enLetras = new RegExp(`${ANUNCIOS}\\s*[:\\-]?\\s*(\\d{1,2})\\s+de\\s+([a-z]+)\\s+(?:de\\s+|del\\s+)?(\\d{4})`, "i").exec(t);
  if (enLetras) {
    const mes = MESES[enLetras[2]];
    if (mes) {
      const f = fecha(Number(enLetras[1]), mes, Number(enLetras[3]));
      if (f) return f;
    }
  }

  return null;
}
