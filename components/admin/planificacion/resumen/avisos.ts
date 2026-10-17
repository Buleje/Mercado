/**
 * Qué del plan pide atención y a dónde ir a arreglarlo (ADR-497). Puro: lo
 * lee el Resumen y se prueba sin pantalla. Cada aviso lleva la vista y el
 * `?sub=` donde se arregla.
 */
import { diasEntre, estadoLicencia, objetivoAtrasado, participacion } from "@/lib/planificacion/calculos";
import type { DatosPlan, SeccionPlan } from "@/lib/planificacion/secciones";
import { chipLicencia } from "../empresa/licencias-util";

/** Dónde vive cada sección: la vista del módulo y su `?sub=`. */
export const DESTINO: Record<SeccionPlan, { vista: string; sub: string }> = {
  ficha: { vista: "empresa", sub: "ficha" },
  identidad: { vista: "empresa", sub: "identidad" },
  lienzo: { vista: "empresa", sub: "lienzo" },
  licencias: { vista: "empresa", sub: "licencias" },
  socios: { vista: "socios", sub: "socios" },
  inversion: { vista: "socios", sub: "inversion" },
  foda: { vista: "foda", sub: "foda" },
  estrategias: { vista: "foda", sub: "estrategias" },
  objetivos: { vista: "objetivos", sub: "lista" },
  organizacion: { vista: "organizacion", sub: "organigrama" },
  espacios: { vista: "organizacion", sub: "espacios" },
  politicas: { vista: "politicas", sub: "politicas" },
};

export type TonoAviso = "error" | "aviso" | "info";

export interface AvisoPlan {
  id: string;
  tono: TonoAviso;
  texto: string;
  /** Qué se hace para que desaparezca (va en el ⓘ). */
  arreglo: string;
  seccion: SeccionPlan;
}

const ORDEN_TONO: Record<TonoAviso, number> = { error: 0, aviso: 1, info: 2 };

function dias(n: number): string {
  return `${n} ${n === 1 ? "día" : "días"}`;
}

export function avisosDelPlan(plan: Partial<DatosPlan>, hoy: string): AvisoPlan[] {
  const avisos: AvisoPlan[] = [];

  let pendientes = 0;
  for (const l of plan.licencias?.items ?? []) {
    const { estado, dias: d } = estadoLicencia(l, hoy);
    if (estado === "pendiente") pendientes += 1;
    if (estado !== "vencida" && estado !== "por-vencer") continue;
    avisos.push({
      id: `licencia-${l.id}`,
      tono: estado === "vencida" ? "error" : "aviso",
      texto: `${l.nombre}: ${chipLicencia(estado, d).label.toLowerCase()}`,
      arreglo: "Renuévala y anota la nueva fecha de vencimiento en Licencias.",
      seccion: "licencias",
    });
  }
  if (pendientes > 0) {
    avisos.push({
      id: "licencias-pendientes",
      tono: "info",
      texto: pendientes === 1 ? "1 licencia por tramitar" : `${pendientes} licencias por tramitar`,
      arreglo: "Cuando la tengas, ábrela en Licencias y marca «Ya la tienes» con su número y fecha.",
      seccion: "licencias",
    });
  }

  for (const o of plan.objetivos?.items ?? []) {
    if (!objetivoAtrasado(o, hoy)) continue;
    const atraso = diasEntre(o.fin, hoy);
    avisos.push({
      id: `objetivo-${o.id}`,
      tono: "error",
      texto: `${o.titulo || "Un objetivo"}: atrasado ${dias(atraso)}`,
      arreglo: "Cierra el objetivo si ya se cumplió, cámbiale la fecha o páusalo.",
      seccion: "objetivos",
    });
  }

  const socios = plan.socios?.items ?? [];
  if (socios.length > 0) {
    const p = participacion(socios);
    if (!p.cuadra) {
      avisos.push({
        id: "participacion",
        tono: "aviso",
        texto: `La participación de los socios suma ${Number.isInteger(p.total) ? p.total : p.total.toFixed(2)} %, no 100 %`,
        arreglo: "Corrige el porcentaje de algún socio o déjalo vacío para que se reparta según su aporte.",
        seccion: "socios",
      });
    }
  }

  for (const pol of plan.politicas?.items ?? []) {
    if (!pol.revisar || pol.revisar > hoy) continue;
    avisos.push({
      id: `politica-${pol.id}`,
      tono: "aviso",
      texto: `Toca revisar la política «${pol.titulo || pol.categoria}»`,
      arreglo: "Léela, ajústala si cambió algo y ponle una nueva fecha de revisión.",
      seccion: "politicas",
    });
  }

  return avisos.sort((a, b) => ORDEN_TONO[a.tono] - ORDEN_TONO[b.tono]);
}
