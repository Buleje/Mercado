/**
 * Reglas puras de cómo se guardan las alertas de abandono (sin base, testeables).
 *
 * `detectSignals` puede devolver la misma señal varias veces en una corrida
 * (`login_drop` sale por «cayeron los logins», «7 días sin entrar» y «score
 * crítico»). Se guarda UNA alerta abierta por negocio y tipo: la severidad más
 * alta y los motivos juntos.
 */
import type { ChurnSignalDetected, RiskLevel } from "./health-scorer";
import { ORDEN_SEVERIDAD } from "./playbook-catalog";

export function unirSenalesPorTipo(signals: ChurnSignalDetected[]): ChurnSignalDetected[] {
  const porTipo = new Map<string, ChurnSignalDetected>();
  for (const s of signals) {
    const prev = porTipo.get(s.signalType);
    if (!prev) {
      porTipo.set(s.signalType, { ...s });
      continue;
    }
    porTipo.set(s.signalType, {
      signalType: s.signalType,
      severity: ORDEN_SEVERIDAD[s.severity] > ORDEN_SEVERIDAD[prev.severity] ? s.severity : prev.severity,
      detail: prev.detail.includes(s.detail) ? prev.detail : `${prev.detail} · ${s.detail}`,
    });
  }
  return [...porTipo.values()];
}

/**
 * Las alertas abiertas que hoy NO aparecieron se cierran solas sólo si el negocio
 * ya salió del riesgo alto. Las caídas (logins, pedidos) se miden contra la
 * corrida anterior y no se repiten al día siguiente: cerrarlas sólo por no
 * repetirse borraría la alerta de un negocio que sigue mal.
 */
export function debeCerrarAusentes(riskLevel: RiskLevel): boolean {
  return riskLevel === "low" || riskLevel === "medium";
}
