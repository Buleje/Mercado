/**
 * Aviso «Pasar lista» (30-10, Brandon): a las 9:00 de Lima, de lunes a sábado y sin
 * feriados, si hay gente que debería venir y nadie tiene marca hoy, se avisa.
 * Lo usa el endpoint del timer local y el banner del panel: una sola regla.
 * Puro — sin base ni reloj: todo entra por parámetro.
 */
import { feriadoDe } from "@/lib/feriados-peru";
import type { ColaboradorMinDTO, FechaKey } from "./tipos";

/** Cuántos días hacia atrás se mira para decir «último día marcado» (si no hay marca en la ventana, no se dice). */
export const VENTANA_ULTIMO_MARCADO_DIAS = 60;

/** Hora desde la que toca avisar (9:00 de Lima). */
export const HORA_AVISO_LISTA_MIN = 9 * 60;

export type MotivoAvisoLista = "avisar" | "domingo" | "feriado" | "temprano" | "sin_personal" | "ya_hay_marcas";

/** Quién debería venir ese día: activo, ya ingresado, no retirado y fijo (el eventual sólo sale si viene). */
export function esperadosEseDia(colaboradores: readonly ColaboradorMinDTO[], fecha: FechaKey): ColaboradorMinDTO[] {
  return colaboradores.filter(
    (c) => c.estado === "ACTIVO" && !c.eventual && !(c.fechaIngreso && c.fechaIngreso > fecha) && !(c.fechaCese && c.fechaCese < fecha),
  );
}

/** 0 = domingo. La fecha es del calendario de Lima, sin zona horaria de por medio. */
function diaDeLaSemana(fecha: FechaKey): number {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay();
}

export function decidirAvisoLista(p: {
  fecha: FechaKey;
  /** Minutos desde las 0:00 de Lima. */
  minutosLima: number;
  esperados: number;
  marcasHoy: number;
}): { avisar: boolean; motivo: MotivoAvisoLista } {
  if (diaDeLaSemana(p.fecha) === 0) return { avisar: false, motivo: "domingo" };
  if (feriadoDe(p.fecha)) return { avisar: false, motivo: "feriado" };
  if (p.minutosLima < HORA_AVISO_LISTA_MIN) return { avisar: false, motivo: "temprano" };
  if (p.esperados <= 0) return { avisar: false, motivo: "sin_personal" };
  if (p.marcasHoy > 0) return { avisar: false, motivo: "ya_hay_marcas" };
  return { avisar: true, motivo: "avisar" };
}

/** Último día ANTERIOR a `antesDe` con alguna marca (la que sea: presente, falta, permiso…), o null si no hay ninguna. */
export function ultimoDiaMarcado(fechasConMarca: readonly FechaKey[], antesDe: FechaKey): FechaKey | null {
  let ultimo: FechaKey | null = null;
  for (const f of fechasConMarca) if (f < antesDe && (ultimo === null || f > ultimo)) ultimo = f;
  return ultimo;
}

/** Días de calendario entre dos fechas de Lima (hasta − desde). */
export function diasEntre(desde: FechaKey, hasta: FechaKey): number {
  return Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000);
}

export function textoAvisoLista(nombre: string, esperados: number, enlace: string, ultimoMarcado?: { fecha: FechaKey; hoy: FechaKey } | null): string {
  const gente = esperados === 1 ? "1 trabajador" : `${esperados} trabajadores`;
  let detalle = gente;
  if (ultimoMarcado) {
    const n = diasEntre(ultimoMarcado.fecha, ultimoMarcado.hoy);
    const [, mes, dia] = ultimoMarcado.fecha.split("-");
    detalle += `; último día marcado: ${dia}-${mes}, hace ${n} ${n === 1 ? "día" : "días"}`;
  }
  return `Hoy nadie marcó asistencia en ${nombre} (${detalle}). Pasar lista: ${enlace}`;
}

/** Minutos desde las 0:00 en Lima (UTC-5 todo el año, sin horario de verano). */
export function minutosDeLima(ahora: Date): number {
  const m = (ahora.getUTCHours() * 60 + ahora.getUTCMinutes() - 5 * 60 + 24 * 60) % (24 * 60);
  return m;
}
