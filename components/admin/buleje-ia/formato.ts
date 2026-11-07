/**
 * Fechas de Buleje IA a la manera del negocio: «hoy 10:30», «ayer», «jueves 10/09».
 * Días y horas en la zona de Pucallpa (America/Lima) y escritos a mano (no
 * `Intl` para el nombre del día: cambia con la versión de ICU).
 */
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const LIMA_MS = -5 * 60 * 60 * 1000;

const enLima = (d: Date) => new Date(d.getTime() + LIMA_MS);
const dosCifras = (n: number) => String(n).padStart(2, "0");
const claveDia = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;

/** «10:30» en hora de Pucallpa. */
export function horaLima(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const l = enLima(d);
  return `${dosCifras(l.getUTCHours())}:${dosCifras(l.getUTCMinutes())}`;
}

/** Para la lista de conversaciones: «10:30» si es hoy, «ayer», si no «jueves 10/09». */
export function fechaCorta(iso: string, ahora = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const l = enLima(d);
  const hoy = enLima(ahora);
  if (claveDia(l) === claveDia(hoy)) return horaLima(iso);
  const ayer = new Date(hoy.getTime() - 24 * 60 * 60 * 1000);
  if (claveDia(l) === claveDia(ayer)) return "ayer";
  return `${DIAS[l.getUTCDay()]} ${dosCifras(l.getUTCDate())}/${dosCifras(l.getUTCMonth() + 1)}`;
}
