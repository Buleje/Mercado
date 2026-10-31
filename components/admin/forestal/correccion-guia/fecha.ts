/**
 * Fechas de un pedido de corrección como las dice Brandon: «jueves 10/09».
 * Sin dependencias (lo importan el panel y la bandeja del superadmin).
 */

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

/** «2026-09-10» (date-only, como la fecha de la guía) → «jueves 10/09». Aritmética en UTC: sin corrimiento de un día. */
export function diaDeLaGuia(ymd: string | null | undefined): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}/.test(ymd)) return ymd ?? "";
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return ymd;
  return `${DIAS[d.getUTCDay()]} ${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
}

/** Un instante (ISO) → «jueves 10/09» en la hora de Lima (el pedido no es date-only). */
export function diaDelPedido(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return diaDeLaGuia(d.toLocaleDateString("en-CA", { timeZone: "America/Lima" }));
}
