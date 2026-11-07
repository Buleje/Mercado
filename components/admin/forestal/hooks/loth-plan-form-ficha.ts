/**
 * La ficha del plan mientras se escribe (Brandon 24-10, opción B «Ficha del
 * plan completa»). Cuenta lo mismo que la cabecera del plan guardado
 * (`fichaDelPlan`): el RUC o DNI sale del permiso elegido, del permiso al que
 * ya está atado el plan o, si no, del propietario del predio. Las especies:
 * las del alta de una plantación o las que el plan ya tiene al editar; el alta
 * de un bosque no las pide (salen del censo), así que no se cuentan (`null`).
 */

import type { Contrato } from "@/lib/forestal/contratos";
import { fichaDelPlan, type FichaDelPlan } from "@/lib/forestal/loth-plan-ficha";
import { docDelTitularDe, docsDelTitular } from "@/lib/forestal/loth-plan-semaforo-libro";
import type { FormularioPlan } from "../loth-plan-form-shared";
import type { Plan } from "../loth-plan-shared";

export function fichaDelFormulario(
  f: FormularioPlan,
  o: {
    plan?: Plan | null;
    permiso: Contrato | null;
    contratos: readonly Contrato[];
    especiesConVolumen: number | null;
  },
): FichaDelPlan {
  const delPermiso = o.permiso?.titularDoc?.trim() || null;
  const atado = docDelTitularDe(docsDelTitular(o.contratos), {
    id: o.plan?.id ?? "",
    contratoId: f.contratoId || o.plan?.contratoId || null,
  });
  return fichaDelPlan({
    planType: f.planType,
    tituloHabilitante: f.tituloHabilitante,
    resolucionNumber: f.resolucionNumber,
    resolucionDate: f.resolucionDate || null,
    vigenciaHasta: f.vigenciaHasta || null,
    titularName: f.titularName,
    titularDoc: delPermiso ?? atado ?? (f.propietarioDoc.trim() || null),
    areaHa: f.areaHa,
    region: f.region,
    provincia: f.provincia,
    distrito: f.distrito,
    regenteName: f.regenteName,
    regenteRegistro: f.regenteRegistro,
    especiesConVolumen: o.especiesConVolumen,
  });
}
