/**
 * loth-chequeo-secciones — el resumen del chequeo del Libro TH (puntaje,
 * bloqueos, desglose) y el reparto por sección de la vista (26-10). PURO.
 *
 * `resumirChequeo` salió de `computeLothCompliance` tal cual (mismo orden,
 * mismo puntaje): ahí sumaba los 11 chequeos de siempre; ahora suma también
 * los avanzados. El panel y el PDF lo siguen leyendo del MISMO resultado.
 */

import type { LothCheck, LothComplianceResult, LothComplianceTone } from "./loth-compliance";
import type { LothSeccion } from "./loth-chequeo-tipos";

export interface SeccionMeta {
  id: LothSeccion;
  label: string;
}

/** En el orden en que se leen: de lo que viaja por la carretera a los datos del libro. */
export const SECCIONES: readonly SeccionMeta[] = [
  { id: "guias", label: "Guías" },
  { id: "saldos", label: "Árboles y saldos" },
  { id: "plan", label: "Plan y papeles" },
  { id: "plazos", label: "Plazos" },
  { id: "libro", label: "Datos del libro" },
];

/** La sección y la norma de los chequeos de siempre (los de `computeLothCompliance`). */
const DE_SIEMPRE: Record<string, { seccion: LothSeccion; norma?: string }> = {
  gtf_fantasma: { seccion: "guias", norma: "Ley 29763, art. 124: la GTF ampara el transporte" },
  exceso: { seccion: "saldos", norma: "Plan aprobado (D.S. 018-2015-MINAGRI): volumen por especie" },
  especieNoAutorizada: { seccion: "saldos", norma: "Plan aprobado (D.S. 018-2015-MINAGRI): especies autorizadas" },
  saldoBajo: { seccion: "saldos" },
  cites: { seccion: "plan", norma: "CITES: legal con el permiso archivado (no resta)" },
  plazo: { seccion: "plazos", norma: "RDE 264-2019: el libro se asienta en 15 días" },
  caratula: { seccion: "libro", norma: "RDE 264-2019: carátula del libro" },
  trozadoTala: { seccion: "libro", norma: "RDE 264-2019: cadena tala → trozado" },
  trozaFantasma: { seccion: "libro", norma: "RDE 264-2019: cadena trozado → despacho" },
  rendAserrio: { seccion: "libro" },
  especies_ambiguas: { seccion: "libro" },
};

export const seccionDe = (c: LothCheck): LothSeccion => c.seccion ?? DE_SIEMPRE[c.key]?.seccion ?? "libro";
export const normaDe = (c: LothCheck): string | undefined => c.norma ?? DE_SIEMPRE[c.key]?.norma;

const errorPrimero = (a: LothCheck, b: LothCheck) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1);

/** El veredicto de una lista de chequeos (lo que antes cerraba `computeLothCompliance`). */
export function resumirChequeo(checks: LothCheck[]): LothComplianceResult {
  const problemas = checks.filter((c) => c.count > 0).sort(errorPrimero);
  const enOrden = checks.filter((c) => c.count <= 0);
  const bloqueos = problemas.filter((c) => c.severity === "error").length;
  const advertencias = problemas.filter((c) => c.severity === "warning").length;

  const totalRestado = problemas.reduce((a, c) => a + c.penalty, 0);
  const score = Math.max(0, Math.min(100, 100 - totalRestado));
  const tone: LothComplianceTone = bloqueos > 0 ? "error" : advertencias > 0 ? "warning" : "success";
  const readiness = bloqueos > 0 ? "error" : advertencias > 0 ? "warning" : "ready";

  // El label sigue al estado: con casos activos va el título del PROBLEMA, no el
  // del alta. Con `okTitle` fijo, el desglose decía «Todas las guías declaradas
  // están emitidas · −25 pts (2 casos)» — una línea que se contradice sola.
  const breakdown = checks
    .filter((c) => c.penalty > 0)
    .map((c) => ({ key: c.key, label: c.count > 0 ? c.title : c.okTitle, puntos: c.count > 0 ? c.penalty : 0, casos: c.count }));

  return { score, tone, checks, problemas, enOrden, bloqueos, advertencias, readiness, breakdown };
}

/** «multa» = `error`, «advertencia» = `warning` (como lo dice Brandon). */
export type FiltroSeveridad = "todas" | "multa" | "advertencia";

export interface SeccionDelChequeo extends SeccionMeta {
  /** Con casos, multas primero (y filtrados por severidad). */
  problemas: LothCheck[];
  /** Sin casos: se pliegan. No dependen del filtro. */
  enOrden: LothCheck[];
  multas: number;
  advertencias: number;
}

const pasaFiltro = (c: LothCheck, f: FiltroSeveridad) =>
  f === "todas" || (f === "multa" ? c.severity === "error" : c.severity === "warning");

/** Las cinco secciones, cada una con sus problemas (según el filtro) y lo que está en orden. */
export function agruparPorSeccion(checks: readonly LothCheck[], filtro: FiltroSeveridad): SeccionDelChequeo[] {
  return SECCIONES.map((s) => {
    const deAca = checks.filter((c) => seccionDe(c) === s.id);
    const conCasos = deAca.filter((c) => c.count > 0);
    return {
      ...s,
      problemas: conCasos.filter((c) => pasaFiltro(c, filtro)).sort(errorPrimero),
      enOrden: deAca.filter((c) => c.count <= 0),
      multas: conCasos.filter((c) => c.severity === "error").length,
      advertencias: conCasos.filter((c) => c.severity === "warning").length,
    };
  });
}

/** Cuántos problemas hay de cada severidad (para el filtro). */
export function cuentaPorSeveridad(checks: readonly LothCheck[]): Record<FiltroSeveridad, number> {
  const con = checks.filter((c) => c.count > 0);
  const multa = con.filter((c) => c.severity === "error").length;
  return { todas: con.length, multa, advertencia: con.length - multa };
}
