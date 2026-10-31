/**
 * Las columnas derivadas de la tabla GTF del Libro TH (Brandon, 07-10: «N° de
 * permiso o resolución», «a qué tipo pertenece (Plantación, PO, DEMA…)» y «en
 * estados saber si la guía se registró al CTP o está por ingresar»).
 *
 * PURO y client-safe: la tabla, su autofiltro y las pruebas leen lo mismo.
 */

import { leerGtfDatos } from "./ctp-gtf-datos";
import { guiaEsDePlantacion } from "./loth-guia-despacho";
import { siglaDePlan } from "./loth-tipos-plan";

/** Lo que la tabla necesita del plan de manejo de la guía. */
export interface PlanDeLaGuia {
  planType: string | null;
  resolucionNumber: string | null;
}

/**
 * A qué tipo de plan pertenece la guía, en sigla («PO», «DEMA», «Plantación»):
 *   1. el tipo del plan al que está atada la guía (`planId`);
 *   2. sin plan: «Plantación» si sus casilleros dicen plantación (casilla (5)
 *      cruzada o código REG-PLT en el (6) o en el título habilitante);
 *   3. si no, lo que diga su casillero (9) «tipo de plan de manejo»;
 *   4. nada de eso → `null` (la celda dice «—»).
 */
export function tipoPlanDeGuia(
  plan: PlanDeLaGuia | null | undefined,
  gtfDatos: unknown,
  tituloHabilitante?: string | null,
): string | null {
  const delPlan = siglaDePlan(plan?.planType);
  if (delPlan) return delPlan;
  const d = gtfDatos == null ? null : leerGtfDatos(gtfDatos);
  /* El código del título también delata la plantación (REG-PLT) en la guía
     anotada a mano, que no tiene casilleros: misma lectura que su impreso. */
  const plantacion =
    (d != null && guiaEsDePlantacion(d)) || guiaEsDePlantacion({ titulos: [tituloHabilitante ?? ""], guia: d?.guia ?? null });
  if (plantacion) return siglaDePlan("PLANTACION");
  return (d && siglaDePlan(d.guia.planManejoTipo)) || null;
}

/** La resolución que aprobó el título: la del plan o, si no, la del casillero (8). */
export function resolucionDeGuia(plan: PlanDeLaGuia | null | undefined, gtfDatos: unknown): string | null {
  const delPlan = plan?.resolucionNumber?.trim();
  if (delPlan) return delPlan;
  if (gtfDatos == null) return null;
  return leerGtfDatos(gtfDatos).guia.resolucion.trim() || null;
}

/** Dónde está la guía respecto del Libro CTP (lo calcula el servidor con `?conCtp=1`). */
export type EstadoCtpGuia = "ingresada" | "por_ingresar" | "otra_empresa";

export const ETIQUETA_ESTADO_GTF = {
  emitida: "Emitida",
  anulada: "Anulada",
  ingresada: "Ingresada al CTP",
  por_ingresar: "Por ingresar al CTP",
  otra_empresa: "Va a otra empresa",
} as const;

export type EstadoGtf = keyof typeof ETIQUETA_ESTADO_GTF;

/**
 * Los estados de una guía, en el orden en que se pintan: Emitida/Anulada y,
 * para las de trozas vivas, dónde está en el CTP. No son excluyentes: una
 * guía es «Emitida» Y «Por ingresar al CTP» a la vez.
 */
export function estadosDeGuia(g: { status: string; tipo: string; ctp?: EstadoCtpGuia | null }): EstadoGtf[] {
  if (g.status === "anulada") return ["anulada"];
  if (g.tipo === "producto" || !g.ctp) return ["emitida"];
  return ["emitida", g.ctp];
}
