/**
 * loth-chequeo-tipos — el contrato del chequeo avanzado del Libro TH (26-10,
 * Brandon: «que todo se cumpla, mande advertencias de inconsistencias … para
 * evitar multas»). Lo sirve `GET /api/admin/forestal/loth/chequeo` y lo pinta
 * Cumplimiento › Chequeo, por secciones.
 *
 * Sólo tipos y constantes: lo importa el cliente sin arrastrar Prisma. Las
 * cuentas viven en `loth-chequeo-guias` / `loth-chequeo-arboles` (puras) y el
 * texto de cada chequeo en `loth-chequeo-catalogo`.
 */

import type { LothCheck } from "./loth-compliance";

/** Las secciones de la vista, en el orden en que se leen. */
export type LothSeccion = "guias" | "saldos" | "plan" | "plazos" | "libro";

/**
 * Desde cuántos días se avisa de una GTF preliminar sin registrar. Igual que
 * `DIAS_AVISO_REGISTRO` (10 de 15) del aviso de plazos: el test lo amarra.
 */
export const DIAS_PRELIMINAR_DEFECTO = 10;

/** Lo que la persona puede ajustar del chequeo (se recuerda en su navegador). */
export interface AjustesChequeo {
  /** Desde cuántos días avisar una GTF preliminar sin registrar (1 a 14). */
  diasPreliminar: number;
  /** ¿Pedir el brevete del conductor en cada guía? (el puesto de control lo pide). */
  pedirLicencia: boolean;
}

export const AJUSTES_CHEQUEO_DEFECTO: AjustesChequeo = { diasPreliminar: DIAS_PRELIMINAR_DEFECTO, pedirLicencia: true };

/** Una GTF del libro con lo que el chequeo mira. Fechas AAAA-MM-DD. */
export interface GuiaChequeo {
  id: string;
  gtfNumber: string;
  fecha: string | null;
  /** `trozas` | `producto`. */
  tipo: string;
  /** `emitida` | `anulada`. */
  status: string;
  planId: string | null;
  placa: string | null;
  conductor: string | null;
  licencia: string | null;
}

/** Una línea registrada del libro, lo justo para cruzar fechas y árboles. */
export interface LineaChequeo {
  section: string;
  lineNo: number;
  /** AAAA-MM-DD. */
  fecha: string;
  planId: string | null;
  treeCode: string | null;
  trozaCode: string | null;
  gtfNumber: string | null;
  /** ¿La línea trae GPS? */
  gps: boolean;
  /** Tala bajo el DMC con su justificación escrita en el libro («[Tala bajo DMC justificada: …]»). */
  justificadaDmc?: boolean;
}

/** Un árbol talado bajo el diámetro mínimo de corta (T8, `arbolesBajoDmc`). */
export interface BajoDmcChequeo {
  planId: string;
  treeCode: string;
  especie: string;
  dapCm: number;
  dmcCm: number;
}

/** Un plan vivo. Fechas AAAA-MM-DD. */
export interface PlanChequeo {
  id: string;
  nombre: string;
  planType: string | null;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
}

/** Un árbol del censo (sólo los talados en el libro). */
export interface ArbolCensoChequeo {
  planId: string;
  treeCode: string;
  conCoordenadas: boolean;
}

/** Una GTF preliminar pendiente, con su plan. */
export interface PreliminarChequeo {
  numeroGtf: string;
  /** AAAA-MM-DD de la guía; `null` = no se anotó. */
  fecha: string | null;
  /** AAAA-MM-DD (Lima) de cuando se anotó. */
  anotadaEl: string;
  plan: string;
}

/** La respuesta del GET. */
export interface ChequeoAvanzado {
  /** Los chequeos nuevos, con su sección, su norma y sus casos. */
  checks: LothCheck[];
  /** Lo que no se pudo leer: no se da por bueno («los papeles de PO 12»). */
  sinLeer: string[];
  /** Planes vivos revisados. */
  planes: number;
  /** AAAA-MM-DD de Lima con que se contó. */
  hoy: string;
}
