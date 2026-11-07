import "server-only";
import { logger } from "@/lib/logger";
import { ColaboradoresDB } from "@/lib/db/rrhh-colaboradores.db";
import { conTrabajador, cuentasDePlanilla, type TrabajadorDelAdelanto } from "./trabajador-del-adelanto";

/**
 * Pega `trabajador` a los adelantos por planilla de una cuenta unida a RRHH
 * (una consulta para toda la lista). Si la consulta falla, la lista sale igual
 * sin la marca: la marca es un aviso, no el dato.
 */
export async function marcarTrabajadores<T extends { modalidad: string; beneficiarioId: string }>(
  tenantId: string,
  adelantos: readonly T[],
): Promise<(T & { trabajador: TrabajadorDelAdelanto | null })[]> {
  let mapa: ReadonlyMap<string, TrabajadorDelAdelanto> = new Map();
  const cuentas = cuentasDePlanilla(adelantos);
  if (cuentas.length > 0) {
    try {
      mapa = await ColaboradoresDB.trabajadoresDeCuentas(tenantId, cuentas);
    } catch (err) {
      logger.warn("[adelantos] no se pudo leer qué cuentas son de trabajadores", { error: String(err) });
    }
  }
  return conTrabajador(adelantos, mapa);
}
