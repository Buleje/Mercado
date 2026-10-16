/**
 * Cambiar el plan de «Despachar con guía» con datos ya escritos (15-10).
 *
 * Al cambiar de plan (el selector, o «Usar el permiso» de un árbol del censo)
 * la guía se vuelve a sembrar con la identidad del permiso nuevo. Antes eso
 * borraba todo lo escrito: destinatario, transporte, llegada y el N°.
 *
 *   · Lo que sale del permiso (titular, título, autoridad, ubicación del plan,
 *     partida, N° de lista) se toma SIEMPRE del nuevo: es otro bosque.
 *   · Lo demás que la persona cambió respecto de la siembra anterior se queda.
 *   · El N° se queda si el talonario es el mismo (misma serie y mismo dueño,
 *     `esDelDueno`); si no, es de otro titular y no vale: se avisa ANTES.
 *
 * PURO: lo usa `use-despacho-guia-loth`.
 */
import { llegadaDelDestinatario, mismaUbicacion, type GtfDatos } from "./ctp-gtf-datos";
import { identidadDelTitulo, type CaratulaParaGuia, type PermisoParaGuia, type PlanParaGuia } from "./loth-guia-despacho";
import { esDelDueno, talonarioDelPlan, type DuenoDelTalonario, type GtfUsadaLoth } from "./loth-talonario";

/** Rutas de `GtfDatos` que dicta el permiso: nunca se arrastran de otro plan. */
const DEL_PERMISO = new Set([
  "propietario",
  "titulos",
  "guia.autoridad",
  "guia.planManejoTipo",
  "guia.origenRecurso",
  "guia.resolucion",
  "guia.representanteLegal",
  "guia.departamento",
  "guia.provincia",
  "guia.distrito",
  "guia.listaTrozasNro",
  "traslado.partida",
  "traslado.puntoPartida",
]);

const esObjeto = (v: unknown): v is Record<string, unknown> => v != null && typeof v === "object" && !Array.isArray(v);
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function mezclar(nueva: unknown, actual: unknown, sembrada: unknown, ruta: string): unknown {
  if (DEL_PERMISO.has(ruta)) return nueva;
  if (esObjeto(nueva) && esObjeto(actual) && esObjeto(sembrada)) {
    const r: Record<string, unknown> = { ...nueva };
    for (const k of Object.keys(nueva)) r[k] = mezclar(nueva[k], actual[k], sembrada[k], ruta ? `${ruta}.${k}` : k);
    return r;
  }
  return igual(actual, sembrada) ? nueva : actual;
}

/**
 * La guía sembrada para el plan nuevo (`nueva`) con lo que la persona escribió
 * encima de la siembra anterior (`actual` vs `sembrada`). El propietario se
 * queda sólo si dejó de ser el titular («Es el titular» apagado): si no, es
 * el titular del permiso nuevo.
 */
export function conservarLoEscrito(nueva: GtfDatos, actual: GtfDatos, sembrada: GtfDatos): GtfDatos {
  const r = mezclar(nueva, actual, sembrada, "") as GtfDatos;
  const propio = actual.propietario.esElCtp === false && !igual(actual.propietario, sembrada.propietario);
  return { ...r, propietario: propio ? actual.propietario : nueva.propietario };
}

/**
 * Lo que el traslado toma como «sembrado» tras el cambio (`alSembrar`): si la
 * llegada que quedó sigue al destinatario (o es la de la siembra nueva), vale
 * `final` y la llegada sigue al destinatario; si es una escrita a mano, vale
 * `nueva`, así sigue contando como escrita y no la pisa un destinatario nuevo.
 */
export function sembradaParaElTraslado(final: GtfDatos, nueva: GtfDatos): GtfDatos {
  const llegada = final.traslado.llegada;
  const automatica =
    mismaUbicacion(llegada, nueva.traslado.llegada) || mismaUbicacion(llegada, llegadaDelDestinatario(final));
  return automatica ? final : nueva;
}

export interface TalonarioDeLaGuia {
  serie: string | null;
  dueno: DuenoDelTalonario;
}

/** ¿El N° escrito para uno sirve para el otro? Misma serie y mismo dueño. */
export function mismoTalonario(a: TalonarioDeLaGuia, b: TalonarioDeLaGuia): boolean {
  return (a.serie ?? "") === (b.serie ?? "") && esDelDueno(a.dueno, b.dueno) && esDelDueno(b.dueno, a.dueno);
}

/** El talonario que tendría la guía con otro plan (lo mismo que siembra el hook). */
export function talonarioDeOtroPlan(
  prep: {
    caratula: CaratulaParaGuia | null;
    planes: readonly (PlanParaGuia & { id: string })[];
    permisos: Record<string, PermisoParaGuia | null>;
    talonario: { usadas: readonly GtfUsadaLoth[] };
  },
  planId: string | null,
): TalonarioDeLaGuia {
  const plan = prep.planes.find((p) => p.id === planId) ?? null;
  const id = identidadDelTitulo({ caratula: prep.caratula, plan, permiso: planId ? (prep.permisos[planId] ?? null) : null });
  const dueno = { titular: id.titular, permiso: id.tituloHabilitante, planId };
  return { serie: talonarioDelPlan({ ubigeo: id, dueno }, prep.talonario.usadas).serie, dueno };
}
