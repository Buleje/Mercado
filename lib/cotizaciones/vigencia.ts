/**
 * Vigencia de una cotización: el DÍA que vale, en Pucallpa.
 *
 * El formulario elige un día («2026-10-22») y antes viajaba como
 * `new Date("2026-10-22").toISOString()` = medianoche UTC = 19:00 del 21 en
 * Lima: la lista mostraba «21 oct.» y la cotización vencía cinco horas antes
 * del día que leyó el cliente. Ahora se guarda el último instante del día en
 * Lima (Perú no cambia de hora) y lo guardado antes a medianoche UTC se lee
 * como ese mismo día. Puro: lo usan el panel y la ruta de convertir.
 */
import { limaDateKey } from "@/lib/utils";

const DIA_MS = 86_400_000;
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

type FechaVigencia = string | Date | null | undefined;

/** «2026-10-22» del día que vale la cotización. */
export function diaDeVigencia(v: FechaVigencia): string | null {
  if (!v) return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  if (!Number.isFinite(t)) return null;
  const iso = new Date(t).toISOString();
  if (iso.endsWith("T00:00:00.000Z")) return iso.slice(0, 10);
  return limaDateKey(t);
}

/** Lo que se guarda para «vale hasta el 22»: el último instante del 22 en Lima. */
export const finDelDiaLima = (dia: string): string => `${dia}T23:59:59.999-05:00`;

/** Hoy en Pucallpa («2026-10-17»): a las 20:00 el UTC ya es mañana. */
export const hoyLima = (ahora: Date | number = Date.now()): string => limaDateKey(ahora);

const mediodia = (dia: string) => Date.parse(`${dia}T12:00:00Z`);

/** Días de hoy al día de vigencia: 0 = vence hoy, negativo = ya venció. */
export function diasParaVencer(v: FechaVigencia, ahora: Date | number = Date.now()): number | null {
  const dia = diaDeVigencia(v);
  if (!dia) return null;
  return Math.round((mediodia(dia) - mediodia(hoyLima(ahora))) / DIA_MS);
}

/** Pasó el día entero de vigencia (vence al terminar el día, no a la hora en que se guardó). */
export function vigenciaVencida(v: FechaVigencia, ahora: Date | number = Date.now()): boolean {
  const dias = diasParaVencer(v, ahora);
  return dias != null && dias < 0;
}

/** «yyyy-mm-dd» de hoy + n días en Lima, para el `<input type="date">`. */
export function diaEnDias(n: number, ahora: Date | number = Date.now()): string {
  return new Date(mediodia(hoyLima(ahora)) + n * DIA_MS).toISOString().slice(0, 10);
}

/** «jueves 22/10». */
export function textoDia(v: FechaVigencia): string {
  const dia = diaDeVigencia(v);
  if (!dia) return "—";
  const d = new Date(mediodia(dia));
  return `${DIAS[d.getUTCDay()]} ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

/** «vence hoy» · «queda 1 día» · «quedan 5 días» · «venció hace 2 días». */
export function textoQuedan(v: FechaVigencia, ahora: Date | number = Date.now()): string {
  const d = diasParaVencer(v, ahora);
  if (d == null) return "";
  if (d === 0) return "vence hoy";
  if (d > 0) return d === 1 ? "queda 1 día" : `quedan ${d} días`;
  return d === -1 ? "venció ayer" : `venció hace ${-d} días`;
}

/**
 * La fecha que llega al servidor: un día («2026-10-22») vale hasta el final
 * de ese día en Lima; un instante ISO se respeta tal cual. `null` = inválida.
 */
export function vigenciaDesdeEntrada(v: string): Date | null {
  const t = /^\d{4}-\d{2}-\d{2}$/.test(v) ? Date.parse(finDelDiaLima(v)) : Date.parse(v);
  return Number.isFinite(t) ? new Date(t) : null;
}
