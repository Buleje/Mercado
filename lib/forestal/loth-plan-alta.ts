/**
 * Alta de un plan de manejo: lo que se repite del plan anterior y lo que no.
 *
 * ## Por qué
 *
 * Brandon (2026-09-21): «en el nuevo modal de plan de manejo, que tenga más
 * campos para poder aprovecharse mejor la información y rellenar los campos».
 *
 * Un titular no carga un plan en la vida: carga el PO de este año, y el año que
 * viene otro. Entre uno y otro **cambia el documento** —su número, su
 * resolución, su parcela, su vigencia— y **no cambia el mundo alrededor**: la
 * misma ARFFS, la misma región, el mismo regente, la misma UIT de referencia y
 * los mismos costos por m³. Tipear eso de nuevo es trabajo que ya se hizo, y
 * cada vez que se tipea de nuevo se escribe distinto (medido: la misma
 * autoridad figura de tres formas en el tenant).
 *
 * Lo que NO se copia nunca es lo que identifica al documento. Copiar el número
 * de resolución del plan anterior sería declarar un papel que no es el que se
 * está cargando.
 *
 * PURO: sin React, sin fetch, sin Prisma.
 */

import type { FormularioDePlan } from "./permisos-de-parte";

/** El plan del que se copia — subconjunto de `ForestPlan` que hace falta. */
export interface PlanPrevio {
  id: string;
  planNumber: string | null;
  planType: string | null;
  titularName: string;
  representanteLegal?: string | null;
  arffs: string | null;
  region: string | null;
  regenteName?: string | null;
  regenteRegistro?: string | null;
  regenteEspecialidad?: string | null;
  uitRef?: string | number | null;
  costoExtraccionM3?: string | number | null;
  costoTransformacionM3?: string | number | null;
  costoFleteM3?: string | number | null;
}

/** Los campos del alta que además del permiso puede llenar un plan anterior. */
export interface FormularioDePlanCompleto extends FormularioDePlan {
  regenteName: string;
  regenteRegistro: string;
  regenteEspecialidad: string;
  uitRef: string;
  costoExtraccionM3: string;
  costoTransformacionM3: string;
  costoFleteM3: string;
}

const txt = (v: string | number | null | undefined): string =>
  v == null ? "" : typeof v === "number" ? String(v) : v;

/**
 * Cómo se llama un plan en un selector: su número, o el tipo y el titular
 * cuando no tiene número cargado. Nunca «—»: un ítem sin nombre no se elige.
 */
export function etiquetaPlanPrevio(p: PlanPrevio): string {
  const numero = (p.planNumber ?? "").trim();
  const tipo = (p.planType ?? "").trim();
  if (numero) return tipo ? `${tipo} ${numero}` : numero;
  return `${tipo || "Plan"} de ${p.titularName}`;
}

/**
 * Completa el formulario con lo que se repite del plan anterior — y dice qué
 * completó.
 *
 * Misma regla que traer del Directorio: **nunca pisa lo que alguien escribió**.
 * La cuenta de rótulos se arma acá y no dentro de un `setState`: React invoca
 * los updaters dos veces en desarrollo y el aviso salía repetido.
 */
export function copiarDePlanPrevio<T extends FormularioDePlanCompleto>(
  prev: T,
  plan: PlanPrevio,
  opts: { regionPorDefecto: string },
): { campos: T; completados: string[] } {
  const completados: string[] = [];
  const sinPisar = (actual: string, nuevo: string | number | null | undefined, rotulo: string): string => {
    if (actual.trim()) return actual;
    const v = txt(nuevo).trim();
    if (v) completados.push(rotulo);
    return txt(nuevo);
  };
  /* La región y la UIT arrancan con un valor por defecto que nadie eligió: para
     esta copia cuentan como vacías. */
  const comoVacio = (valor: string, porDefecto: string) => (valor === porDefecto ? "" : valor);

  return {
    campos: {
      ...prev,
      titularName: sinPisar(prev.titularName, plan.titularName, "titular"),
      representanteLegal: sinPisar(prev.representanteLegal, plan.representanteLegal, "representante legal"),
      arffs: sinPisar(prev.arffs, plan.arffs, "ARFFS"),
      region: sinPisar(comoVacio(prev.region, opts.regionPorDefecto), plan.region, "región") || prev.region,
      regenteName: sinPisar(prev.regenteName, plan.regenteName, "regente"),
      regenteRegistro: sinPisar(prev.regenteRegistro, plan.regenteRegistro, "registro del regente"),
      // La especialidad viene con un valor propuesto por el tipo de documento;
      // la del plan anterior sólo entra si el regente lo trajo esta copia.
      regenteEspecialidad: plan.regenteEspecialidad && !prev.regenteName.trim()
        ? String(plan.regenteEspecialidad)
        : prev.regenteEspecialidad,
      uitRef: sinPisar(comoVacio(prev.uitRef, ""), plan.uitRef, "UIT de referencia") || prev.uitRef,
      costoExtraccionM3: sinPisar(prev.costoExtraccionM3, plan.costoExtraccionM3, "costo de extracción"),
      costoTransformacionM3: sinPisar(prev.costoTransformacionM3, plan.costoTransformacionM3, "costo de transformación"),
      costoFleteM3: sinPisar(prev.costoFleteM3, plan.costoFleteM3, "costo de flete"),
    },
    completados,
  };
}
