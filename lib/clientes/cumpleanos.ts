/**
 * Un solo cumpleaños por cliente (09-10).
 *
 * `Customer` guarda la fecha en DOS columnas por historia:
 *   - `birthday` (timestamp): la escribe la tienda y la leen el cupón de
 *     cumpleaños, el saludo, las campañas «cumpleañeros del mes» y el asistente.
 *   - `fechaNacimiento` (date): la escribía SOLO la ficha del panel.
 * Resultado: el cumpleaños que cargaba el cajero nunca disparaba el cupón.
 *
 * Sin tocar el schema: al GUARDAR desde el panel se escriben las dos
 * (`cumpleParaGuardar`) y al LEER se usa la que tenga dato (`cumpleDe`).
 * Puro (sin server-only): lo usan la ficha del panel y los db/rutas.
 */

export type ConCumple = {
  birthday?: Date | string | null;
  fechaNacimiento?: Date | string | null;
};

const YMD = /^(\d{4})-(\d{2})-(\d{2})/;

/** "AAAA-MM-DD" de una fecha guardada, o null. Usa el día UTC: las dos columnas
 *  se guardan a medianoche o a mediodía UTC, nunca con la hora local. */
export function aYmd(valor: Date | string | null | undefined): string | null {
  if (valor == null || valor === "") return null;
  if (typeof valor === "string") {
    const m = YMD.exec(valor.trim());
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mes}-${dia}`;
}

/**
 * El cumpleaños del cliente ("AAAA-MM-DD") o null.
 * Prioridad: `birthday`. Desde este cambio el panel escribe las dos columnas,
 * así que si difieren es porque el cliente la cambió después en la tienda
 * (la tienda sólo escribe `birthday`): esa es la más nueva.
 */
export function cumpleDe(c: ConCumple | null | undefined): string | null {
  if (!c) return null;
  return aYmd(c.birthday) ?? aYmd(c.fechaNacimiento);
}

/**
 * Date para guardar en las DOS columnas desde "AAAA-MM-DD".
 * Mediodía UTC: `getMonth()/getDate()` del cron da el mismo día en Lima (−5)
 * y en el servidor (UTC); a medianoche UTC, en Lima caía el día anterior.
 * Fecha vacía o inválida → null (borra el cumpleaños).
 */
export function cumpleParaGuardar(ymd: string | null | undefined): Date | null {
  const limpio = aYmd(ymd ?? null);
  if (!limpio) return null;
  const d = new Date(`${limpio}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** «12/05» (día/mes) para mostrar; el año no suma en la ficha. */
export function cumpleCorto(ymd: string | null | undefined): string | null {
  const m = ymd ? YMD.exec(ymd) : null;
  return m ? `${m[3]}/${m[2]}` : null;
}
