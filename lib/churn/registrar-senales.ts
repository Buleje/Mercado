import "server-only";

import { SuperadminChurnSignalsDB, type AlertaRegistrada } from "@/lib/db/superadmin-churn-signals.db";
import type { ChurnSignalDetected, RiskLevel } from "./health-scorer";
import { debeCerrarAusentes, unirSenalesPorTipo } from "./signal-merge";

export type AlertaDelDia = AlertaRegistrada & { signal: ChurnSignalDetected };

/**
 * Guarda SIEMPRE las alertas de abandono del día (con o sin CHURN_AUTORUN):
 * una abierta por negocio y tipo. Si el negocio ya no está en riesgo alto,
 * cierra («auto») las abiertas que hoy no aparecieron.
 *
 * Antes la alerta sólo se guardaba dentro de `executePlaybook`, que el cron
 * salta en modo prueba: con CHURN_AUTORUN apagado no quedaba ninguna (la última
 * era del 09-05-2026 aunque el cron marcaba 18 negocios en riesgo en 2 días).
 */
export async function registrarSenales(
  tenantId: string,
  signals: ChurnSignalDetected[],
  riskLevel: RiskLevel,
): Promise<{ alertas: AlertaDelDia[]; cerradas: number }> {
  const unidas = unirSenalesPorTipo(signals);
  const alertas: AlertaDelDia[] = [];
  for (const signal of unidas) {
    const registrada = await SuperadminChurnSignalsDB.registrarAbierta(tenantId, signal);
    alertas.push({ ...registrada, signal });
  }
  const cerradas = debeCerrarAusentes(riskLevel)
    ? await SuperadminChurnSignalsDB.cerrarAusentes(
        tenantId,
        unidas.map((s) => s.signalType),
      )
    : 0;
  return { alertas, cerradas };
}
