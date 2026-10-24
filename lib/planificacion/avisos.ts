/**
 * Qué del plan pide atención y a dónde ir a arreglarlo (ADR-497). Puro: lo
 * leen el Resumen de la pantalla y el cron `planificacion-avisos` (campana),
 * así los dos dicen LO MISMO. Cada aviso lleva la vista y el `?sub=` donde se
 * arregla.
 */
import { diasEntre, estadoLicencia, objetivoAtrasado, participacion } from "@/lib/planificacion/calculos";
import type { DatosPlan, SeccionPlan } from "@/lib/planificacion/secciones";

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

/** El enlace del panel a la sección (lo usa el aviso de la campana). */
export function enlaceDeSeccion(seccion: SeccionPlan): string {
  const d = DESTINO[seccion];
  return `/admin?tab=planificacion&vista=${d.vista}&sub=${d.sub}`;
}

export type TonoAviso = "error" | "aviso" | "info";

export interface AvisoPlan {
  id: string;
  tono: TonoAviso;
  texto: string;
  /** Qué se hace para que desaparezca (va en el ⓘ). */
  arreglo: string;
  seccion: SeccionPlan;
  /**
   * La etapa del problema (sólo los que van a la campana). Cambia cuando el
   * problema empeora o cuando se edita la fecha: una etapa nueva es un aviso
   * nuevo; la misma etapa ya avisada no se repite.
   */
  etapa?: string;
}

const ORDEN_TONO: Record<TonoAviso, number> = { error: 0, aviso: 1, info: 2 };

function dias(n: number): string {
  return `${n} ${n === 1 ? "día" : "días"}`;
}

/**
 * «vencida hace 3 días» / «vence hoy» / «vence en 12 días»: la pastilla de la
 * tabla de Licencias (`chipLicencia`) en minúscula. Un test cuida que no se separen.
 */
export function textoVencimientoLicencia(estado: "vencida" | "por-vencer", d: number | null): string {
  if (estado === "vencida") return `vencida hace ${dias(Math.abs(d ?? 0))}`;
  return d === 0 ? "vence hoy" : `vence en ${dias(d ?? 0)}`;
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
      texto: `${l.nombre}: ${textoVencimientoLicencia(estado, d)}`,
      arreglo: "Renuévala y anota la nueva fecha de vencimiento en Licencias.",
      seccion: "licencias",
      // A 30 días, a 7 y al vencer: tres avisos como mucho por cada fecha.
      etapa: `${l.vence}:${estado === "vencida" ? "vencida" : (d ?? 0) <= 7 ? "7" : "30"}`,
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
      // Al atrasarse, a la semana y al mes; cambiarle la fecha arranca de nuevo.
      etapa: `${o.fin}:${atraso >= 30 ? "30" : atraso >= 7 ? "7" : "1"}`,
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
      etapa: pol.revisar,
    });
  }

  return avisos.sort((a, b) => ORDEN_TONO[a.tono] - ORDEN_TONO[b.tono]);
}

// ── Campana ─────────────────────────────────────────────────────────────────

/**
 * Las secciones que avisan en la campana (Brandon 16-10): licencias por vencer
 * o vencidas, objetivos atrasados y políticas por revisar. Socios e inversión
 * no salen del Resumen (plata y DNI: la campana la ven más roles).
 */
export const TIPO_AVISO_PLAN = {
  licencias: "PLAN_LICENCIA",
  objetivos: "PLAN_OBJETIVO",
  politicas: "PLAN_POLITICA",
} as const satisfies Partial<Record<SeccionPlan, string>>;

type SeccionConAviso = keyof typeof TIPO_AVISO_PLAN;
export const SECCIONES_CON_AVISO = Object.keys(TIPO_AVISO_PLAN) as SeccionConAviso[];

/** Los `type` de Notification del plan: sólo los ve quien puede arreglarlos (gestión). */
export const TIPOS_AVISO_PLAN: readonly string[] = Object.values(TIPO_AVISO_PLAN);

const ETIQUETA_ACCION: Record<SeccionConAviso, string> = {
  licencias: "Ver licencias",
  objetivos: "Ver objetivos",
  politicas: "Ver políticas",
};

export interface AvisoCampanaPlan {
  type: string;
  severity: "HIGH" | "MEDIUM";
  title: string;
  body: string;
  actionUrl: string;
  actionLabel: string;
  /** `licencia-<id>@<vence>:<etapa>`: única por problema y etapa. */
  entityId: string;
}

const esSeccionConAviso = (s: SeccionPlan): s is SeccionConAviso => s in TIPO_AVISO_PLAN;

/** Los avisos del Resumen que van a la campana, con el mismo texto y su enlace. */
export function avisosParaCampana(plan: Partial<DatosPlan>, hoy: string): AvisoCampanaPlan[] {
  const out: AvisoCampanaPlan[] = [];
  for (const a of avisosDelPlan(plan, hoy)) {
    if (!a.etapa || !esSeccionConAviso(a.seccion)) continue;
    out.push({
      type: TIPO_AVISO_PLAN[a.seccion],
      severity: a.tono === "error" ? "HIGH" : "MEDIUM",
      title: a.texto.slice(0, 200),
      body: a.arreglo,
      actionUrl: enlaceDeSeccion(a.seccion),
      actionLabel: ETIQUETA_ACCION[a.seccion],
      entityId: `${a.id}@${a.etapa}`,
    });
  }
  return out;
}
