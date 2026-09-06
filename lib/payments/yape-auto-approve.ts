/**
 * lib/payments/yape-auto-approve.ts
 *
 * Decisión PURA (sin DB, sin I/O) de si un comprobante Yape ya verificado por
 * Vision puede auto-aprobarse, eliminando el cuello de botella de revisión
 * manual para los casos limpios.
 *
 * SEGURIDAD (dinero): el caller SÓLO debe invocar esto sobre approvals que
 * `setVisionResult` dejó en `pending` — es decir, monto dentro de ±5% y
 * `yapeOpCode` NO reusado (la reutilización ya cae en review_required). Esta
 * función aplica un bar MÁS ESTRICTO encima (delta exacto + confianza alta +
 * recencia) y está apagada por default (`enabled: false`).
 */

export interface AutoApproveConfig {
  /** Master switch. Apagado por default — habilitar vía YAPE_AUTO_APPROVE=1. */
  enabled: boolean;
  /** Delta máximo monto detectado vs esperado (0 = match exacto). */
  maxDeltaPct: number;
  /** Antigüedad máxima del comprobante en horas (0 = sin chequeo). */
  maxAgeHours: number;
  /** Exigir confianza "high" de Vision (true = no auto-aprobar medium/low). */
  requireHighConfidence: boolean;
}

export interface AutoApproveInput {
  expectedAmount: number;
  detectedAmount: number | null;
  yapeOpCode: string | null;
  yapeDate: Date | null;
  confidence: "high" | "medium" | "low";
  /** Date.now() del caller (inyectado para testear determinista). */
  now: number;
}

export interface AutoApproveDecision {
  autoApprove: boolean;
  /** Motivo legible — siempre se loguea (aprobado o no). */
  reason: string;
}

const HOUR_MS = 3_600_000;

function parseNum(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Lee la política de auto-aprobación del entorno. Default = APAGADO + estricto. */
export function getAutoApproveConfig(
  env: Record<string, string | undefined> = process.env,
): AutoApproveConfig {
  return {
    enabled: env.YAPE_AUTO_APPROVE === "1",
    maxDeltaPct: parseNum(env.YAPE_AUTO_APPROVE_MAX_DELTA_PCT, 0),
    maxAgeHours: parseNum(env.YAPE_AUTO_APPROVE_MAX_AGE_HOURS, 24),
    requireHighConfidence: env.YAPE_AUTO_APPROVE_ALLOW_MEDIUM !== "1",
  };
}

/**
 * Decide si auto-aprobar. Conservador por diseño: cualquier duda → false con
 * un motivo, y el comprobante queda para revisión manual.
 */
export function decideAutoApprove(
  input: AutoApproveInput,
  config: AutoApproveConfig,
): AutoApproveDecision {
  const no = (reason: string): AutoApproveDecision => ({ autoApprove: false, reason });

  if (!config.enabled) return no("auto-aprobación deshabilitada");
  if (input.detectedAmount == null) return no("sin monto detectado");
  if (!input.yapeOpCode) return no("sin código de operación");
  if (config.requireHighConfidence && input.confidence !== "high") {
    return no(`confianza ${input.confidence} (se exige high)`);
  }

  const delta = Math.abs(input.detectedAmount - input.expectedAmount);
  const pct =
    input.expectedAmount > 0 ? delta / input.expectedAmount : delta > 0 ? 1 : 0;
  if (pct > config.maxDeltaPct) {
    return no(`delta de monto ${(pct * 100).toFixed(1)}% supera el umbral`);
  }

  if (config.maxAgeHours > 0) {
    if (!input.yapeDate) return no("sin fecha de operación");
    const ageH = (input.now - input.yapeDate.getTime()) / HOUR_MS;
    if (ageH < -1) return no("fecha de operación en el futuro");
    if (ageH > config.maxAgeHours) {
      return no(`comprobante de hace ${ageH.toFixed(0)}h (máx ${config.maxAgeHours}h)`);
    }
  }

  return {
    autoApprove: true,
    reason: `monto OK (Δ${(pct * 100).toFixed(1)}%), op ${input.yapeOpCode}, confianza ${input.confidence}`,
  };
}
