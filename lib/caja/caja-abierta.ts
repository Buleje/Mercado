/**
 * lib/caja/caja-abierta.ts — cuánto hace que la caja sigue abierta, en días de Lima.
 *
 * Una bodega abre y cierra caja en el día (el cron la cierra pasadas 16 horas):
 * una caja abierta desde un día anterior es un arqueo que no se hizo, y todo lo
 * que entra después (ventas, adelantos, liquidaciones) cae en ese cuadre viejo.
 * Medido 2026-09-14: el negocio real tenía una caja abierta desde el 11/06, 95 días.
 *
 * Los días son de CALENDARIO en America/Lima, no bloques de 24 h en UTC: una caja
 * abierta a las 23:30 y vista a las 08:00 ya es «desde ayer». Puro, para testearlo.
 */

const ZONA = "America/Lima";
const CLAVE_DIA = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" });
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function aFecha(v: string | Date): Date | null {
  const d = typeof v === "string" ? new Date(v) : v;
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Días de calendario de Lima entre `desde` y `ahora` (0 = el mismo día). */
export function diasCalendarioLima(desde: string | Date, ahora: Date = new Date()): number | null {
  const d = aFecha(desde);
  if (!d) return null;
  const inicio = Date.parse(`${CLAVE_DIA.format(d)}T00:00:00Z`);
  const fin = Date.parse(`${CLAVE_DIA.format(ahora)}T00:00:00Z`);
  return Math.round((fin - inicio) / 86_400_000);
}

/** «jueves 11/06», en la zona de Lima. */
export function fechaCortaLima(v: string | Date): string {
  const d = aFecha(v);
  if (!d) return "";
  const [anio, mes, dia] = CLAVE_DIA.format(d).split("-");
  const diaSemana = DIAS_SEMANA[new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(dia))).getUTCDay()];
  return `${diaSemana} ${dia}/${mes}`;
}

export interface AvisoCajaAbierta {
  /** Incluye la fecha de apertura: descartar el aviso de una caja no oculta el de la siguiente. */
  id: string;
  dias: number;
  severidad: "warning" | "urgent";
  titulo: string;
  detalle: string;
}

/** `null` si no hay caja abierta, la fecha no sirve o se abrió hoy (en Lima). */
export function avisoCajaAbierta(desde: string | Date | null | undefined, ahora: Date = new Date()): AvisoCajaAbierta | null {
  if (!desde) return null;
  const d = aFecha(desde);
  const dias = d ? diasCalendarioLima(d, ahora) : null;
  if (!d || dias === null || dias < 1) return null;
  return {
    id: `caja-abierta-${CLAVE_DIA.format(d)}`,
    dias,
    severidad: dias >= 7 ? "urgent" : "warning",
    titulo: dias === 1 ? "La caja quedó abierta desde ayer" : `La caja está abierta hace ${dias} días`,
    detalle: `Se abrió el ${fechaCortaLima(d)}. Cuenta el efectivo y ciérrala: las ventas, adelantos y liquidaciones siguen cayendo en ese cuadre.`,
  };
}
