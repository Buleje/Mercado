/**
 * Ponerle control a un adelanto ya dado: la fecha para devolverlo y el permiso
 * al que pertenece.
 *
 * EL CASO QUE LO PIDIÓ (Blas, 2026-09-30). 5 adelantos abiertos sin fecha por
 * S/ 25 690; el mayor, S/ 17 000 del 03/08, sin contrato. Las dos cosas sólo se
 * podían cargar al CREAR: el aviso «sin control» señalaba el hueco y no había
 * dónde taparlo.
 *
 * LA FECHA VIAJA COMO DÍA, SE GUARDA COMO INSTANTE. La pantalla manda
 * «2026-10-15» (el día de Lima que eligió la persona). Guardarlo con
 * `new Date("2026-10-15")` es medianoche UTC = 19:00 del 14 en Pucallpa, y
 * `limaDateKey` lo leería como el día 14. Se guarda el MEDIODÍA de Lima
 * (`T12:00:00-05:00`; Perú no tiene horario de verano): ningún corrimiento de
 * horas lo saca de su día.
 *
 * Vive fuera de la DB class y de la ruta: decide qué fecha se le reclama a
 * alguien, y se prueba sin base.
 */

import { limaDateKey } from "@/lib/utils";

/** Un día escrito como lo manda `<input type="date">`. */
export const PATRON_DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * «2026-10-15» → el instante del mediodía de ese día en Lima. `null` si no es
 * un día del calendario (2026-02-30, 2026-13-01) o está fuera de 2000–2100.
 */
export function instanteDeVencimiento(dia: string): Date | null {
  if (!PATRON_DIA.test(dia)) return null;
  const [y, m, d] = dia.split("-").map(Number);
  if (y < 2000 || y > 2100) return null;
  /* Date.UTC normaliza el 30/02 al 02/03: si al volver no es el mismo día, no existía. */
  const u = new Date(Date.UTC(y, m - 1, d));
  if (u.getUTCFullYear() !== y || u.getUTCMonth() !== m - 1 || u.getUTCDate() !== d) return null;
  return new Date(`${dia}T12:00:00-05:00`);
}

/** «2026-08-03» → «03/08/2026». A mano: `Intl` cambia de formato según la versión de ICU. */
export function diaCorto(clave: string): string {
  if (!clave) return "—";
  const [y, m, d] = clave.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Por qué no vale esta fecha de devolución, o `null` si vale.
 *
 * Sólo una regla de negocio: no puede ser antes del día en que se dio la plata.
 * Una fecha ya pasada SÍ vale (el acuerdo fue ese y ya se venció: el aviso lo
 * dirá como «vencido», que es la verdad).
 *
 * @param fechaAdelanto el INSTANTE en que se dio (la fila de la base), nunca
 *   una clave de día: `limaDateKey("2026-08-03")` devuelve el día 2.
 */
export function problemaDeVencimiento(dia: string, fechaAdelanto: Date | string): string | null {
  if (!instanteDeVencimiento(dia)) return "Esa fecha no existe. Elígela del calendario.";
  const diaDado = limaDateKey(fechaAdelanto);
  if (diaDado && dia < diaDado) {
    return `La fecha para devolverlo no puede ser antes del día en que se dio (${diaCorto(diaDado)}).`;
  }
  return null;
}

export interface EstadoControl {
  /** Instante guardado, o `null` sin fecha. */
  fechaVencimiento: Date | string | null;
  /** Código del permiso (no el id: el rastro se lee por gente). */
  contrato: string | null;
}

/**
 * La línea de la auditoría: sólo lo que cambió, antes → después. Vacía si nada
 * cambió (un reintento no deja rastro repetido).
 */
export function detalleDelControl(codigo: string, antes: EstadoControl, despues: EstadoControl): string {
  const dia = (v: Date | string | null) => (v ? diaCorto(limaDateKey(v)) : "sin fecha");
  const partes: string[] = [];
  if (dia(antes.fechaVencimiento) !== dia(despues.fechaVencimiento)) {
    partes.push(`vence ${dia(antes.fechaVencimiento)} → ${dia(despues.fechaVencimiento)}`);
  }
  if ((antes.contrato ?? null) !== (despues.contrato ?? null)) {
    partes.push(`permiso ${antes.contrato ?? "ninguno"} → ${despues.contrato ?? "ninguno"}`);
  }
  return partes.length ? `${codigo}: ${partes.join("; ")}.` : "";
}
