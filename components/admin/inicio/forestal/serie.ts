import { fechaConDia, fechaCorta, MESES_CORTOS, partesDeFecha } from "@/lib/admin/inicio/formato-tablero";
import { hayTendencia } from "@/lib/admin/inicio/hay-datos";
import type { InicioForestalCtp } from "@/lib/forestal/inicio-forestal";

export type Paso = InicioForestalCtp["serie"]["paso"];

export const PASO_TXT: Record<Paso, string> = { dia: "por día", semana: "por semana", mes: "por mes" };

/** «28 set» para días y semanas (la semana arranca el lunes); «oct 2026» para meses. */
export function rotulo(fecha: string, paso: Paso): string {
  if (paso !== "mes") return fechaCorta(fecha);
  const p = partesDeFecha(fecha);
  return p ? `${MESES_CORTOS[p.mes - 1]} ${p.anio}` : fecha;
}

/** Qué abarca la barra, para el tooltip: «Semana del 28 set al 04 oct» · «jueves 01/10». */
export function alcance(fecha: string, paso: Paso): string {
  if (paso === "dia") return fechaConDia(fecha);
  if (paso === "mes") return "";
  const p = partesDeFecha(fecha);
  if (!p) return "";
  const domingo = new Date(Date.UTC(p.anio, p.mes - 1, p.dia + 6)).toISOString().slice(0, 10);
  return `Semana del ${fechaCorta(fecha)} al ${fechaCorta(domingo)}`;
}

/**
 * Los tramos de la serie desde el primero con movimiento: con «Año», 30
 * semanas en cero dejaban las barras de un pelo. Los huecos del medio sí
 * quedan (una semana sin ingreso es justo lo que hay que ver) y los totales no
 * cambian: son ceros.
 */
export function tramosConMovimiento(serie: InicioForestalCtp["serie"]): InicioForestalCtp["serie"]["puntos"] {
  const desde = serie.puntos.findIndex((p) => p.ingresoM3 > 0 || p.producido > 0 || p.despachado > 0);
  return desde < 0 ? [] : serie.puntos.slice(desde);
}

/**
 * ¿Se dibuja el gráfico por semana? La misma regla que usa `ForestalCharts`
 * (R2: alguna serie con 2 tramos con movimiento). El tablero la pregunta para
 * saber si la fila de los permisos tiene que cerrar el hueco que deja.
 */
export function hayGraficoForestal(serie: InicioForestalCtp["serie"]): boolean {
  return hayTendencia(tramosConMovimiento(serie), ["ingresoM3", "producido", "despachado"]);
}
