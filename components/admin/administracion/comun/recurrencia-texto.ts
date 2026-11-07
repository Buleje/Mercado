/**
 * La recurrencia dicha en una frase: «Cada lunes y jueves a las 09:00»,
 * «El día 5 de cada mes», «Cada 3 días, hasta el 30/11». La usan la lista de
 * actividades y la vista previa del editor (lo que ves es lo que se guarda).
 */
import type { Recurrencia } from "@/lib/agenda/tipos";
import { DIAS_LARGOS, ORDEN_SEMANA, fechaCorta, fechaLarga } from "./fechas";

/** «lunes», «lunes y jueves», «lunes, miércoles y viernes». */
export function listaDeDias(dias: readonly number[]): string {
  const nombres = ORDEN_SEMANA.filter((d) => dias.includes(d)).map((d) => DIAS_LARGOS[d]);
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

function textoDeDias(dias: readonly number[], prefijo: string): string {
  const set = new Set(dias);
  if (set.size === 0 || set.size === 7) return "Todos los días";
  const iguales = (xs: number[]) => xs.length === set.size && xs.every((d) => set.has(d));
  if (iguales([1, 2, 3, 4, 5, 6])) return "De lunes a sábado";
  if (iguales([1, 2, 3, 4, 5])) return "De lunes a viernes";
  if (iguales([0, 6])) return "Los fines de semana";
  return `${prefijo} ${listaDeDias(dias)}`;
}

export function textoRecurrencia(r: Recurrencia, hora: string | null = null): string {
  let base: string;
  switch (r.frecuencia) {
    case "una_vez":
      base = `Sólo el ${fechaLarga(r.desde)}`;
      break;
    case "diaria":
    case "semanal":
      base = textoDeDias(r.diasSemana, "Cada");
      break;
    case "quincenal":
      base = `Semana por medio: ${r.diasSemana.length ? listaDeDias(r.diasSemana) : "elige los días"}`;
      break;
    case "mensual":
      base = r.diaMes === null ? "Una vez al mes" : r.diaMes >= 31 ? "El último día de cada mes" : `El día ${r.diaMes} de cada mes`;
      break;
    case "cada_n_dias":
      base = !r.cadaN || r.cadaN === 1 ? "Todos los días" : `Cada ${r.cadaN} días`;
      break;
  }
  const conHora = hora ? `${base} a las ${hora}` : base;
  if (r.frecuencia === "una_vez" || !r.hasta) return conHora;
  return `${conHora}, hasta el ${fechaCorta(r.hasta)}`;
}
