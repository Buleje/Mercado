/**
 * lib/feature-flags/fiado-digital.ts
 *
 * Feature flags específicos de Fiado Digital Ola 2.
 *
 * Ver `docs/fiado-digital-ola2-plan.md` §8–9 y ADR-021 §8 para el rollout
 * gradual por fases. Cada fase es **deployable independiente**. Apagar un
 * flag debe reversar la feature sin romper estado preexistente.
 *
 * ### Variables de entorno
 *
 * - `FIADO_DIGITAL_V2_PHASE1` = "true" | "false" | undefined → default false
 * - `FIADO_DIGITAL_V2_PHASE2` = "true" | "false" | undefined → default false
 * - `FIADO_DIGITAL_V2_PHASE3` = "true" | "false" | undefined → default false
 *
 * ### Reglas de combinación
 *
 * Phase 2 requiere Phase 1 activa (lo enforza `isFiadoDigitalPhase2Enabled`).
 * Phase 3 requiere Phase 1 + Phase 2 activas.
 *
 * ### Separado de `lib/feature-flags.ts`
 *
 * No se agrega al enum global del proyecto para evitar que un desarrollador
 * active las 3 fases con un solo toggle. El control granular es intencional.
 * Cuando Ola 2 llegue a prod-100% se puede considerar colapsar en un solo
 * flag global `fiado-digital-v2`.
 */

import "server-only";

// ─── Env var keys ─────────────────────────────────────────────────────────────

export const FIADO_DIGITAL_V2_PHASE1 = "FIADO_DIGITAL_V2_PHASE1" as const;
export const FIADO_DIGITAL_V2_PHASE2 = "FIADO_DIGITAL_V2_PHASE2" as const;
export const FIADO_DIGITAL_V2_PHASE3 = "FIADO_DIGITAL_V2_PHASE3" as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parser estricto: acepta "true" | "1" como true; todo lo demás es false. */
function parseBoolFlag(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Fase 1 — Foundation + transparencia.
 *
 * Habilita: RENIEC client + score history + UI admin timeline + UI cliente
 * transparency banner + endpoint POST /api/credit/reniec/verify +
 * GET /api/credit/score-history/[customerId].
 *
 * Requiere: TD-030 `LoyaltyTransaction` en prod (ADR-020). Sin TD-030 el flag
 * puede estar on pero los endpoints retornan 503 porque el schema no existe.
 */
export function isFiadoDigitalPhase1Enabled(): boolean {
  return parseBoolFlag(process.env[FIADO_DIGITAL_V2_PHASE1]);
}

/**
 * Fase 2 — Automatización (cron + reminders + reporte semanal).
 *
 * Requiere Phase 1 activa.
 */
export function isFiadoDigitalPhase2Enabled(): boolean {
  return (
    isFiadoDigitalPhase1Enabled() &&
    parseBoolFlag(process.env[FIADO_DIGITAL_V2_PHASE2])
  );
}

/**
 * Fase 3 — Fiado familiar + integración checkout.
 *
 * Requiere Phase 1 + Phase 2 activas. **Zona de peligro**: toca `CheckoutModal`.
 * Skill `checkout-flow` obligatorio antes de encender en prod.
 */
export function isFiadoDigitalPhase3Enabled(): boolean {
  return (
    isFiadoDigitalPhase2Enabled() &&
    parseBoolFlag(process.env[FIADO_DIGITAL_V2_PHASE3])
  );
}

/**
 * Snapshot de todos los flags de Fiado Digital v2. Útil para dashboards
 * de observabilidad, endpoints de debug y logs de arranque.
 */
export function getFiadoDigitalFlags(): {
  phase1: boolean;
  phase2: boolean;
  phase3: boolean;
} {
  return {
    phase1: isFiadoDigitalPhase1Enabled(),
    phase2: isFiadoDigitalPhase2Enabled(),
    phase3: isFiadoDigitalPhase3Enabled(),
  };
}
