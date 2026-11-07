/**
 * trabajador-del-adelanto.ts — la marca «Trabajador · se descuenta el sábado»
 * de Mi Plata (25-10, Brandon: el adelanto que se da desde la asistencia
 * «también se pondrá en Adelantos … vinculándose»).
 *
 * Un adelanto es «de un trabajador» si es descuento por planilla y su cuenta
 * está unida a un colaborador de RRHH (`Colaborador.beneficiarioId`). La lista
 * y la ficha lo reciben ya resuelto (`trabajador`), en una consulta para toda la
 * lista; acá sólo se pega y se dice.
 */

import { etiquetaCorta } from "@/lib/rrhh/fechas";
import { limaDateKey } from "@/lib/utils";

export interface TrabajadorDelAdelanto {
  colaboradorId: string;
  nombre: string;
}

/** Adónde lleva «Ver en Equipo»: la asistencia, donde se le paga el sábado. */
export const HREF_EQUIPO_ASISTENCIA = "/admin?tab=rrhh&vista=asistencia";

interface AdelantoConCuenta {
  modalidad: string;
  beneficiarioId: string;
}

/** Las cuentas a buscar: sólo las de los adelantos por planilla. */
export function cuentasDePlanilla(adelantos: readonly AdelantoConCuenta[]): string[] {
  return [...new Set(adelantos.filter((a) => a.modalidad === "DESCUENTO_PLANILLA").map((a) => a.beneficiarioId))];
}

/** Pega el trabajador a cada adelanto por planilla de una cuenta unida (el resto, `null`). */
export function conTrabajador<T extends AdelantoConCuenta>(
  adelantos: readonly T[],
  mapa: ReadonlyMap<string, TrabajadorDelAdelanto>,
): (T & { trabajador: TrabajadorDelAdelanto | null })[] {
  return adelantos.map((a) => ({
    ...a,
    trabajador: a.modalidad === "DESCUENTO_PLANILLA" ? (mapa.get(a.beneficiarioId) ?? null) : null,
  }));
}

/**
 * «se descuenta el sábado 31/10» con la fecha de cobro; sin fecha, la frase
 * general. Si la fecha cae en otro día que sábado (cobra por mes, o la cambiaron
 * a mano en «Fecha de cobro»), se dice ese día.
 */
export function cuandoSeDescuenta(fechaVencimiento: string | null | undefined): string {
  if (!fechaVencimiento) return "se descuenta en su pago del sábado";
  const dia = limaDateKey(fechaVencimiento);
  if (!dia) return "se descuenta en su pago del sábado";
  const esSabado = new Date(`${dia}T12:00:00Z`).getUTCDay() === 6;
  return esSabado ? `se descuenta el sábado ${etiquetaCorta(dia)}` : `se descuenta el ${etiquetaCorta(dia)}`;
}
