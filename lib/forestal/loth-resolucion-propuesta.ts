/**
 * lib/forestal/loth-resolucion-propuesta.ts — lo leído de la resolución
 * (`loth-resolucion-lectura`) contra lo que el plan guarda hoy: qué cambiaría,
 * campo por campo, y los cuerpos para guardarlo cuando la persona confirma.
 *
 * Nada se pisa sin que se marque: cada fila trae «hoy» y «el papel dice».
 * Viene marcado SÓLO lo que completa un dato vacío (`sugerida`): cambiar un
 * dato que ya está —otro titular, otra fecha, más m³— o agregar una especie
 * lo marca la persona (security 25-10: un PDF plantado en la carpeta del plan
 * no puede llegar con el volumen inflado ya marcado). Un volumen por encima de
 * `TOPE_M3_POR_ESPECIE` no se puede pasar desde acá. Las tolerancias van en
 * la unidad del negocio: 0,001 m³ (el certificado escribe 161.258 y el plan
 * guarda 161.2580: es lo mismo).
 *
 * PURO: sin React, sin fetch.
 */
import { mismaEspecie } from "@/lib/forestal/loth-constants";
import type { LecturaResolucion } from "@/lib/forestal/loth-resolucion-lectura";

export type CampoLeido = "planNumber" | "resolucionNumber" | "resolucionDate" | "vigenciaDesde" | "vigenciaHasta" | "titularName" | "arffs";

/** Lo del plan que la resolución puede corregir. */
export interface PlanParaPropuesta {
  id: string;
  planType: string;
  planNumber?: string | null;
  resolucionNumber?: string | null;
  resolucionDate?: string | Date | null;
  vigenciaDesde?: string | Date | null;
  vigenciaHasta?: string | Date | null;
  titularName?: string | null;
  arffs?: string | null;
}

export interface EspecieParaPropuesta {
  id: string;
  speciesCommon: string;
  speciesScientific?: string | null;
  volumenAutorizadoM3?: number | string | null;
  arbolesAutorizados?: number | null;
}

export interface FilaPropuesta {
  campo: CampoLeido;
  etiqueta: string;
  hoy: string | null;
  leido: string;
  /** Lo leído ya es lo que guarda el plan: viene desmarcada. */
  igual: boolean;
  /** Viene marcada: el plan no tiene ese dato y el papel lo trae. */
  sugerida: boolean;
}

export interface EspeciePropuesta {
  especie: string;
  /** null = la especie no está en el plan: se agrega. */
  idEnPlan: string | null;
  hoyM3: number | null;
  leidoM3: number | null;
  arbolesHoy: number | null;
  arbolesLeido: number | null;
  igual: boolean;
  /** No se puede guardar: una especie nueva sin volumen leído. */
  sinVolumen: boolean;
  /** El papel dice más de `TOPE_M3_POR_ESPECIE`: sale en rojo y no se pasa. */
  sobreTope: boolean;
  /** Viene marcada: es del plan y sólo completa lo que estaba vacío. */
  sugerida: boolean;
}

export interface PropuestaResolucion {
  filas: FilaPropuesta[];
  especies: EspeciePropuesta[];
  /** Todo lo leído ya está en el plan. */
  sinCambios: boolean;
}

const dia = (v: string | Date | null | undefined): string | null => {
  if (!v) return null;
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};
const comparable = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/gi, "").toLowerCase();
const num = (v: number | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const TOLERANCIA_M3 = 0.001;
const vacio = (s: string | null | undefined) => !s?.trim();

/**
 * Tope de cordura del volumen autorizado de UNA especie leído de un papel. El
 * PUT de especies acepta hasta 9.999.999 m³ (un límite de columna, no de
 * negocio); el volumen anual de un PO o una DEMA por especie anda en cientos
 * o pocos miles de m³. Más que esto se escribe a mano en Especies.
 */
export const TOPE_M3_POR_ESPECIE = 50_000;

/** La propuesta campo por campo. Sólo entra lo que el papel trae. */
export function propuestaContraPlan(
  plan: PlanParaPropuesta,
  especiesDelPlan: readonly EspecieParaPropuesta[],
  l: LecturaResolucion,
): PropuestaResolucion {
  const plantacion = plan.planType === "PLANTACION";
  const filas: FilaPropuesta[] = [];
  const fila = (campo: CampoLeido, etiqueta: string, hoy: string | null, leido: string | null, esFecha = false) => {
    if (!leido) return;
    const igual = esFecha ? hoy === leido : comparable(hoy) === comparable(leido);
    filas.push({ campo, etiqueta, hoy, leido, igual, sugerida: !igual && vacio(hoy) });
  };
  if (plantacion) fila("planNumber", "Código del registro", plan.planNumber ?? null, l.codigoRegistro);
  fila("resolucionNumber", plantacion ? "N° de constancia" : "N° de resolución", plan.resolucionNumber ?? null, l.numero ?? l.codigoRegistro);
  fila("resolucionDate", plantacion ? "Fecha de inscripción" : "Fecha de la resolución", dia(plan.resolucionDate), l.fecha, true);
  fila("vigenciaDesde", "Vigencia desde", dia(plan.vigenciaDesde), l.vigenciaDesde, true);
  fila("vigenciaHasta", "Vigencia hasta", dia(plan.vigenciaHasta), l.vigenciaHasta, true);
  fila("titularName", "Titular", plan.titularName ?? null, l.titular);
  fila("arffs", "Autoridad", plan.arffs ?? null, l.autoridad);

  const especies: EspeciePropuesta[] = l.especies.map((e) => {
    const suya = especiesDelPlan.find(
      (s) => mismaEspecie(s.speciesCommon, e.especie) || Boolean(e.cientifico && s.speciesScientific && mismaEspecie(s.speciesScientific, e.cientifico)),
    );
    const hoyM3 = num(suya?.volumenAutorizadoM3);
    const arbolesHoy = suya?.arbolesAutorizados ?? null;
    const mismoVol = e.volumenM3 == null || (hoyM3 != null && Math.abs(hoyM3 - e.volumenM3) < TOLERANCIA_M3);
    const mismosArboles = e.arboles == null || arbolesHoy === e.arboles;
    const sobreTope = e.volumenM3 != null && e.volumenM3 > TOPE_M3_POR_ESPECIE;
    const igual = Boolean(suya) && mismoVol && mismosArboles;
    const sinVolumen = (suya ? hoyM3 : e.volumenM3) == null;
    /* Completa sin cambiar: cada dato distinto estaba vacío en el plan. */
    const soloCompleta = (mismoVol || hoyM3 == null) && (mismosArboles || arbolesHoy == null);
    return {
      especie: suya?.speciesCommon ?? e.especie,
      idEnPlan: suya?.id ?? null,
      hoyM3,
      leidoM3: e.volumenM3,
      arbolesHoy,
      arbolesLeido: e.arboles,
      igual,
      sinVolumen,
      sobreTope,
      sugerida: Boolean(suya) && !igual && !sinVolumen && !sobreTope && soloCompleta,
    };
  });
  return { filas, especies, sinCambios: filas.every((f) => f.igual) && especies.every((e) => e.igual) };
}

/** El cuerpo del PATCH del plan con las filas marcadas, o null si no hay ninguna. */
export function cuerpoPatchPlan(planId: string, filas: readonly FilaPropuesta[]): Record<string, string> | null {
  if (filas.length === 0) return null;
  const cuerpo: Record<string, string> = { id: planId };
  for (const f of filas) cuerpo[f.campo] = f.leido;
  return cuerpo;
}

/**
 * El cuerpo del PUT de especies (carga por lote) con las marcadas. El PUT
 * reescribe volumen Y árboles: lo que no se cambia se manda como está hoy.
 */
export function cuerpoPutEspecies(
  planId: string,
  marcadas: readonly EspeciePropuesta[],
): { planId: string; especies: { speciesCommon: string; volumenAutorizadoM3: number; arbolesAutorizados: number | null }[] } | null {
  const especies = marcadas
    .filter((e) => !e.sinVolumen && !e.sobreTope)
    .map((e) => ({
      speciesCommon: e.especie,
      volumenAutorizadoM3: (e.leidoM3 ?? e.hoyM3) as number,
      arbolesAutorizados: e.arbolesLeido ?? e.arbolesHoy,
    }));
  return especies.length ? { planId, especies } : null;
}
