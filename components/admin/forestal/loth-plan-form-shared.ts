/**
 * Tipos y constantes del formulario del plan (`LothPlanForm`): el formulario
 * vacío, el plan guardado vuelto formulario y los ids que comparten el hook,
 * el envío y el componente.
 */

import type { Plan } from "./loth-plan-shared";
import type { TipoPlan } from "@/lib/forestal/loth-tipos-plan";

/** Con lo que arranca el campo Región: nadie lo eligió, así que se puede completar. */
export const REGION_POR_DEFECTO = "Ucayali";

/** Id estable de este formulario para los campos personalizados (ADR-427). */
export const FORMULARIO = "forestal.plan";

/** El formulario vacío: un alta arranca acá. Exportado para el test que
 *  verifica que la edición no pierde ningún campo. */
export function formularioVacio() {
  return {
    planType: "PO" as TipoPlan,
    planNumber: "", tituloHabilitante: "", resolucionNumber: "", resolucionDate: "",
    titularName: "", representanteLegal: "", arffs: "", region: REGION_POR_DEFECTO, parcelaCorta: "",
    areaHa: "", uitRef: "5350", vigenciaDesde: "", vigenciaHasta: "",
    regenteName: "", regenteRegistro: "", regenteEspecialidad: "maderable",
    // Lo que el modelo ya guardaba y el alta no preguntaba (ADR-425 · ronda 2).
    costoExtraccionM3: "", costoTransformacionM3: "", costoFleteM3: "",
    estado: "vigente", notes: "",
    // Cómo se reconoce y dónde queda (ADR-426).
    alias: "", propietarioNombre: "", propietarioDocTipo: "DNI", propietarioDoc: "",
    provincia: "", distrito: "", sector: "", cuenca: "", contratoId: "",
  };
}

export type FormularioPlan = ReturnType<typeof formularioVacio>;

/** `2026-01-15T00:00:00.000Z` → `2026-01-15`, que es lo que come un input date. */
const soloFecha = (v: string | null | undefined) => (v ?? "").slice(0, 10);
const txt = (v: string | null | undefined) => v ?? "";

/**
 * Un plan guardado, vuelto formulario.
 *
 * Copia campo por campo desde el tipo `Plan` y no con un spread: es el mismo
 * error que costó dos rondas en RRHH y en el Directorio —una copia a mano que
 * se queda corta **borra** al guardar, porque lo que no llega viaja como
 * `null`—. Si mañana se agrega un campo al plan, hay que sumarlo acá.
 */
export function desdePlan(p: Plan): FormularioPlan {
  return {
    ...formularioVacio(),
    planType: (p.planType as TipoPlan) ?? "PO",
    planNumber: txt(p.planNumber),
    tituloHabilitante: txt(p.tituloHabilitante),
    resolucionNumber: txt(p.resolucionNumber),
    resolucionDate: soloFecha(p.resolucionDate),
    titularName: p.titularName ?? "",
    representanteLegal: txt(p.representanteLegal),
    arffs: txt(p.arffs),
    region: txt(p.region),
    parcelaCorta: txt(p.parcelaCorta),
    areaHa: txt(p.areaHa),
    uitRef: txt(p.uitRef),
    vigenciaDesde: soloFecha(p.vigenciaDesde),
    vigenciaHasta: soloFecha(p.vigenciaHasta),
    regenteName: txt(p.regenteName),
    regenteRegistro: txt(p.regenteRegistro),
    regenteEspecialidad: p.regenteEspecialidad || "maderable",
    costoExtraccionM3: txt(p.costoExtraccionM3),
    costoTransformacionM3: txt(p.costoTransformacionM3),
    costoFleteM3: txt(p.costoFleteM3),
    estado: p.estado || "vigente",
    notes: txt(p.notes),
    alias: txt(p.alias),
    propietarioNombre: txt(p.propietarioNombre),
    propietarioDocTipo: p.propietarioDocTipo || "DNI",
    propietarioDoc: txt(p.propietarioDoc),
    provincia: txt(p.provincia),
    distrito: txt(p.distrito),
    sector: txt(p.sector),
    cuenca: txt(p.cuenca),
    contratoId: txt(p.contratoId),
  };
}
