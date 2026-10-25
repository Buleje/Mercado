/**
 * Los pasos del alta (y la edición) de un plan de manejo: una cosa a la vez
 * (Brandon 24-10: «organízalo en secciones para ir bloque a bloque»). Antes
 * eran 7 bloques apilados en 2,9 pantallas; ahora se ve un paso y la barra de
 * arriba dice cuáles están completos y cuál falta.
 *
 * Nada se movió de sitio dentro de cada bloque: el paso sólo decide cuál se ve.
 * Puro (lo prueban sin navegador): qué pasos tiene cada tipo, en qué paso vive
 * cada esencial y cómo está cada paso.
 */
import type { CampoEsencial, Esencial } from "./loth-plan-esenciales";
import type { CampoPlanRelleno } from "./loth-plan-relleno";

export type PasoPlan = "tipo" | "documento" | "especies" | "titular" | "area" | "mas" | "archivos";

export interface PasoDelPlan {
  id: PasoPlan;
  /** El rótulo corto de la barra (entra en un botón angosto). */
  corto: string;
}

/** Dónde se escribe cada esencial: el contador y «Crear» llevan a ese paso. */
export const PASO_DEL_ESENCIAL: Record<CampoEsencial, PasoPlan> = {
  titularName: "titular",
  regenteName: "titular",
  planNumber: "documento",
  vigenciaHasta: "area",
  especies: "especies",
};

/** Dónde se escribe cada campo que se revisa por relleno: «Crear» lleva al paso del primero. */
export const PASO_DEL_RELLENO: Record<CampoPlanRelleno, PasoPlan> = {
  planNumber: "documento",
  tituloHabilitante: "documento",
  resolucionNumber: "documento",
  arffs: "documento",
  titularName: "titular",
  representanteLegal: "titular",
  regenteName: "titular",
  regenteRegistro: "titular",
  propietarioNombre: "titular",
  propietarioDoc: "titular",
  alias: "titular",
  parcelaCorta: "area",
  sector: "area",
  cuenca: "area",
};

/** Los pasos de este tipo de documento, en orden. Las especies, sólo en una plantación. */
export function pasosDelPlan(esPlantacion: boolean): PasoDelPlan[] {
  return [
    { id: "tipo", corto: "Tipo" },
    { id: "documento", corto: esPlantacion ? "Registro" : "Documento" },
    ...(esPlantacion ? [{ id: "especies" as const, corto: "Especies" }] : []),
    { id: "titular", corto: esPlantacion ? "Titular y encargado" : "Titular y regente" },
    { id: "area", corto: esPlantacion ? "Dónde" : "Dónde y vigencia" },
    { id: "mas", corto: "Costeo y más" },
    { id: "archivos", corto: "Archivos" },
  ];
}

/**
 * · `completo`: todo lo esencial del paso está lleno (el tipo siempre lo está).
 * · `falta`: algo esencial vacío y ya se intentó crear (o el obligatorio vacío).
 * · `pendiente`: tiene esenciales vacíos, todavía sin intento.
 * · `opcional`: el paso no tiene nada esencial (costeo, archivos).
 */
export type EstadoDelPaso = "completo" | "falta" | "pendiente" | "opcional";

export function estadoDelPaso(paso: PasoPlan, esenciales: readonly Esencial[], intento: boolean): EstadoDelPaso {
  if (paso === "tipo") return "completo";
  const suyos = esenciales.filter((e) => PASO_DEL_ESENCIAL[e.campo] === paso);
  if (suyos.length === 0) return "opcional";
  const vacios = suyos.filter((e) => !e.lleno);
  if (vacios.length === 0) return "completo";
  return intento ? "falta" : "pendiente";
}

/** El paso de antes y el de después del actual (null en los extremos). */
export function vecinosDelPaso(pasos: readonly PasoDelPlan[], actual: PasoPlan): { anterior: PasoDelPlan | null; siguiente: PasoDelPlan | null } {
  const i = pasos.findIndex((p) => p.id === actual);
  return { anterior: i > 0 ? pasos[i - 1]! : null, siguiente: i >= 0 && i < pasos.length - 1 ? pasos[i + 1]! : null };
}

/** El paso que se ve: si el actual ya no existe (se cambió de plantación a PO estando en Especies), el que le sigue. */
export function pasoVisible(pasos: readonly PasoDelPlan[], actual: PasoPlan): PasoPlan {
  if (pasos.some((p) => p.id === actual)) return actual;
  return actual === "especies" ? "titular" : (pasos[0]?.id ?? "tipo");
}
