/**
 * Utilidades de horario para tiendas del marketplace.
 *
 * `computeIsOpenNow` lee un array de 7 elementos (uno por día de la semana
 * empezando en domingo) y decide si la tienda está abierta en el momento
 * de la llamada. Espejea la lógica del endpoint /api/marketplace/stores
 * para que páginas server-side puedan calcular el mismo estado sin pegar
 * al endpoint.
 */

export interface DayHours {
  open: number;
  openMin: number;
  close: number;
  closeMin: number;
}

export const DEFAULT_OPEN_HOURS: DayHours[] = Array.from({ length: 7 }, () => ({
  open: 7,
  openMin: 0,
  close: 23,
  closeMin: 0,
}));

export function computeIsOpenNow(hours: DayHours[] | null = null): boolean {
  const dayHours = hours ?? DEFAULT_OPEN_HOURS;
  const now = new Date();
  const today = dayHours[now.getDay()];
  if (!today) return false;
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const open = today.open * 60 + today.openMin;
  const close = today.close * 60 + today.closeMin;
  return minutesNow >= open && minutesNow < close;
}
