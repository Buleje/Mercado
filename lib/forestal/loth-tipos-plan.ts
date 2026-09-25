/**
 * Los documentos de gestión forestal, con lo que cada uno exige.
 *
 * El formulario de «nuevo plan» ofrecía tres siglas en un `<select>` —PO, PMFI,
 * DEMA— y los mismos doce campos para las tres. Pero no son variantes de lo
 * mismo: **cada una corresponde a un título habilitante distinto**, y quien
 * llena el formulario (un ingeniero o un regente) ya sabe cuál le toca por el
 * tipo de bosque en el que trabaja, no por la sigla.
 *
 * Verificado 2026-09-21 contra la **Directiva de Supervisión de Títulos
 * Habilitantes con Fines Maderables** (RJ N° 001-2018-OSINFOR) y el
 * **Reglamento para la Gestión Forestal** (D.S. 018-2015-MINAGRI):
 *
 *   · PGMF → Concesiones forestales con fines maderables (el marco, largo plazo)
 *   · PO   → el año operativo DENTRO de una concesión
 *   · PMFI → Permisos de aprovechamiento en predios privados
 *   · DEMA → Permisos en comunidades nativas y campesinas
 *
 * Y el registro de **plantaciones forestales**, que no es un plan de manejo de
 * bosque natural pero se gestiona desde la misma pantalla.
 *
 * El **regente forestal** es «el profesional responsable de la elaboración e
 * implementación del Plan de Manejo» y está inscrito en el Registro Nacional
 * de Regentes que conduce SERFOR; se subdivide en maderables, no maderables y
 * plantaciones. El informe de ejecución lo firman el titular **y** el regente.
 */

export const TIPOS_PLAN = ["PGMF", "PO", "PMFI", "DEMA", "PLANTACION"] as const;
export type TipoPlan = (typeof TIPOS_PLAN)[number];

export interface MetaTipoPlan {
  key: TipoPlan;
  /** La sigla como la dice la norma. */
  sigla: string;
  nombre: string;
  /** Para qué título habilitante es. Lo que el ingeniero reconoce. */
  para: string;
  /** Una línea de ayuda al elegir. */
  ayuda: string;
  /** ¿La norma espera un regente forestal a cargo? */
  regente: "obligatorio" | "segun_caso" | "no_aplica";
  /** Campos que para este tipo no tienen sentido y no se piden. */
  ocultar: readonly ("parcelaCorta" | "tituloHabilitante")[];
  /** Vigencia típica, sólo como ayuda al cargar (nunca se autocompleta sola). */
  vigenciaTipicaAnios: number | null;
}

export const TIPOS_PLAN_META: Record<TipoPlan, MetaTipoPlan> = {
  PGMF: {
    key: "PGMF",
    sigla: "PGMF",
    nombre: "Plan General de Manejo Forestal",
    para: "Concesiones forestales con fines maderables",
    ayuda: "El marco de largo plazo de la concesión. Dentro de él se aprueba un Plan Operativo por año.",
    regente: "obligatorio",
    ocultar: ["parcelaCorta"],
    vigenciaTipicaAnios: 20,
  },
  PO: {
    key: "PO",
    sigla: "PO",
    nombre: "Plan Operativo",
    para: "El año operativo de una concesión maderable",
    ayuda: "La zafra: qué parcela de corta se aprovecha este año, con su censo y su volumen autorizado.",
    regente: "obligatorio",
    ocultar: [],
    vigenciaTipicaAnios: 2,
  },
  PMFI: {
    key: "PMFI",
    sigla: "PMFI",
    nombre: "Plan de Manejo Forestal Intermedio",
    para: "Permisos de aprovechamiento en predios privados",
    ayuda: "Para predios privados titulados. Combina el marco y la operación en un solo documento.",
    regente: "obligatorio",
    ocultar: [],
    vigenciaTipicaAnios: 5,
  },
  DEMA: {
    key: "DEMA",
    sigla: "DEMA",
    nombre: "Declaración de Manejo",
    para: "Permisos en comunidades nativas y campesinas",
    ayuda: "Requiere el acuerdo de la asamblea comunal. El registro en el libro NO aplica a DEMA para las secciones de tala (RDE 264-2019).",
    regente: "segun_caso",
    ocultar: [],
    vigenciaTipicaAnios: 5,
  },
  PLANTACION: {
    key: "PLANTACION",
    sigla: "Plantación",
    nombre: "Registro de plantación forestal",
    para: "Plantaciones forestales con fines de producción",
    ayuda: "No es un plan de bosque natural: se registra la plantación y su titular. El regente es de la especialidad «plantaciones».",
    regente: "segun_caso",
    // Una plantación no tiene parcela de corta anual ni título habilitante de
    // bosque: tiene su propio registro.
    ocultar: ["parcelaCorta", "tituloHabilitante"],
    vigenciaTipicaAnios: null,
  },
};

export const TIPOS_PLAN_LISTA: readonly MetaTipoPlan[] = TIPOS_PLAN.map((k) => TIPOS_PLAN_META[k]);

/** Las especialidades del Registro Nacional de Regentes (SERFOR). */
export const ESPECIALIDADES_REGENTE = [
  { key: "maderable", label: "Productos forestales maderables" },
  { key: "no_maderable", label: "Productos forestales no maderables" },
  { key: "plantaciones", label: "Plantaciones forestales" },
] as const;

export type EspecialidadRegente = (typeof ESPECIALIDADES_REGENTE)[number]["key"];

/** La especialidad que le corresponde por defecto a este tipo de documento. */
export function especialidadSugerida(tipo: TipoPlan): EspecialidadRegente {
  return tipo === "PLANTACION" ? "plantaciones" : "maderable";
}

export function metaDe(tipo: string | null | undefined): MetaTipoPlan {
  const k = (tipo ?? "").trim().toUpperCase() as TipoPlan;
  return TIPOS_PLAN_META[k] ?? TIPOS_PLAN_META.PO;
}

/** ¿Este tipo pide este campo? */
export function pideCampo(tipo: string | null | undefined, campo: MetaTipoPlan["ocultar"][number]): boolean {
  return !metaDe(tipo).ocultar.includes(campo);
}

// ─── Informe de ejecución: el plazo que nadie recuerda ─────────────────────

/**
 * «Se presenta a la ARFFS y al OSINFOR **dentro de los cuarenta y cinco días
 * calendario** de culminado el año operativo; es suscrito por el titular del
 * título habilitante y el regente» (Directiva RJ 001-2018-OSINFOR).
 *
 * Es un plazo que corre solo, desde una fecha que el sistema ya conoce.
 */
export const DIAS_INFORME_EJECUCION = 45;

export interface PlazoInforme {
  /** Último día para presentarlo. */
  vence: Date;
  /** Días que faltan; negativo si ya pasó. */
  diasRestantes: number;
  estado: "en_plazo" | "por_vencer" | "vencido";
}

/**
 * Cuándo vence el informe de ejecución de un año operativo que terminó.
 * `null` si el período todavía no terminó: no hay plazo que contar.
 */
export function plazoInformeEjecucion(
  finDelAnioOperativo: string | Date | null | undefined,
  hoy: Date = new Date(),
): PlazoInforme | null {
  if (!finDelAnioOperativo) return null;
  const fin = new Date(finDelAnioOperativo);
  if (Number.isNaN(fin.getTime())) return null;

  const dia = 86_400_000;
  const finUTC = Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth(), fin.getUTCDate());
  const hoyUTC = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
  if (hoyUTC < finUTC) return null; // el año operativo sigue corriendo

  const vence = new Date(finUTC + DIAS_INFORME_EJECUCION * dia);
  const diasRestantes = Math.round((vence.getTime() - hoyUTC) / dia);
  return {
    vence,
    diasRestantes,
    estado: diasRestantes < 0 ? "vencido" : diasRestantes <= 10 ? "por_vencer" : "en_plazo",
  };
}
