/**
 * Plazo de un fiado (auditoría 15-10, H03/M31/M33): la antigüedad (desde que
 * se abrió) y el vencimiento (la fecha acordada) son dos cosas. Un fiado sin
 * fecha no está «al día»: no tiene plazo. Puro, sin DB: lo usan la ruta PATCH
 * y la pantalla.
 */
import { limaDateKey } from "@/lib/utils";
import { tramoDe, type TramoId } from "@/lib/fiados/gestion-cobranza";
import type { BaseDeAtraso } from "@/lib/fiados/urgencia-cobranza";

/** Hasta dónde se puede poner un plazo: un año desde hoy. */
const MAX_DIAS_PLAZO = 365;

/**
 * El plazo nuevo va de hoy a un año. Hacia atrás no: un fiado de hace 70 días
 * con fecha «el día que se abrió» quedaría vencido hace 70 y bloquearía al
 * cliente (>60 días, `validateForNewFiado`) sin que nadie lo haya decidido.
 */
export function validarPlazoNuevo(dia: string, hoy: string = limaDateKey()): string | null {
  const t = Date.parse(`${dia}T00:00:00.000Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== dia) return "Fecha inválida";
  const dHoy = Date.parse(`${hoy}T00:00:00.000Z`);
  if (t < dHoy) return "La fecha de vencimiento no puede ser anterior a hoy";
  if (t > dHoy + MAX_DIAS_PLAZO * 86_400_000) return "La fecha de vencimiento no puede pasar de un año";
  return null;
}

/** Cajón de la lista «Quién debe»: los tramos de atraso, más uno para quien no tiene plazo. */
export type CajonDeudor = TramoId | "sinplazo";

/**
 * Los tramos 1-30/31-60/… cuentan días DESPUÉS del vencimiento. Quien no tiene
 * ninguna fecha caía en ellos por los días desde que se abrió: un fiado de 40
 * días sin plazo salía «31 a 60», como si llevara 40 días de mora. Ahora va
 * aparte, a «Sin plazo».
 */
export function cajonDelDeudor(d: { base: BaseDeAtraso; dias: number }): CajonDeudor {
  return d.base === "antiguedad" ? "sinplazo" : tramoDe(d.dias);
}

export const SIN_PLAZO = {
  id: "sinplazo",
  label: "Sin plazo",
  detalle: "no tienen fecha de vencimiento: los días son desde que se abrió el fiado",
  tono: "var(--text-tertiary)",
} as const;
