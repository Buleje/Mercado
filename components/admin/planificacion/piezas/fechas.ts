/**
 * piezas/fechas.ts — cómo se escriben las fechas del plan (ADR-497).
 *
 * Claves `AAAA-MM-DD` sin hora, aritmética en UTC; el «hoy» lo pasa quien
 * llama (`limaDateKey()`). Días y meses escritos a mano: `Intl` cambia según
 * la versión de ICU del navegador.
 */

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"] as const;

const esClave = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** «jueves 10/09» este año; «10/09/2027» otro año. Vacío si no hay fecha. */
export function fechaCorta(clave: string, hoy: string): string {
  if (!esClave(clave)) return "";
  const [a, m, d] = clave.split("-");
  if (a !== hoy.slice(0, 4)) return `${d}/${m}/${a}`;
  const dia = new Date(`${clave}T00:00:00Z`).getUTCDay();
  return `${DIAS[dia]} ${d}/${m}`;
}

/** `2027-T1` → «ene–mar 2027»; `sin-fecha` → «Sin fecha». */
export function nombreTrimestre(clave: string): string {
  const m = /^(\d{4})-T([1-4])$/.exec(clave);
  if (!m) return "Sin fecha";
  const t = Number(m[2]);
  return `${MESES_CORTOS[(t - 1) * 3]}–${MESES_CORTOS[(t - 1) * 3 + 2]} ${m[1]}`;
}

/** El trimestre de una clave de fecha, `AAAA-Tn`. */
export function trimestreDeFecha(clave: string): string {
  return `${clave.slice(0, 4)}-T${Math.ceil(Number(clave.slice(5, 7)) / 3)}`;
}

/** El trimestre que sigue a `AAAA-Tn`. */
export function trimestreSiguiente(clave: string): string {
  const a = Number(clave.slice(0, 4));
  const t = Number(clave.slice(6));
  return t === 4 ? `${a + 1}-T1` : `${a}-T${t + 1}`;
}

/** `clave` + `meses`, sin pasarse del último día del mes (31/01 + 1 = 28/02). */
export function sumarMeses(clave: string, meses: number): string {
  const [a, m, d] = clave.split("-").map(Number);
  const total = a * 12 + (m - 1) + meses;
  const anio = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${anio}-${String(mes).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}
