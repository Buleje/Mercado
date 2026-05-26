/**
 * Modo SUNAT Oficial — toggle por tenant (formal vs informal).
 *
 * ON  = negocio formal: emite boletas/facturas electrónicas reales validadas
 *       por SUNAT (vía Nubefact). RUC + token obligatorios (gate de activación).
 * OFF = negocio informal (default): el sistema NO emite comprobantes electrónicos;
 *       las ventas son tickets internos.
 *
 * El control de activación es MANUAL por superadmin (decisión de negocio 2026-05-26).
 * Ver ADR-123.
 */

/** Clave del flag en la tabla `TenantFeatureFlag`. */
export const SUNAT_OFICIAL_FLAG = "sunat-modo-oficial" as const;

/** Razones por las que NO se puede activar el modo oficial. */
export type SunatActivationBlocker =
  | "sin_config" // no existe TenantSunatConfig para el tenant
  | "ruc_invalido" // RUC ausente, mal formado, o no ACTIVO+HABIDO en SUNAT
  | "sin_token"; // falta el token de Nubefact

/** Estado completo del modo oficial para un tenant. */
export interface SunatModoOficialState {
  /** Si el toggle está encendido. */
  enabled: boolean;
  /** Si la configuración fiscal está completa (sin bloqueos). */
  configReady: boolean;
  /** Si el RUC del negocio fue verificado como ACTIVO+HABIDO. */
  rucVerificado: boolean;
  /** Ambiente de emisión: beta (sandbox Nubefact) o produccion (válido ante SUNAT). */
  ambiente: "beta" | "produccion";
  /** Lista de bloqueos pendientes para poder activar. */
  bloqueos: SunatActivationBlocker[];
}

/** Payload del toggle (PUT superadmin). */
export interface SunatModoOficialToggleRequest {
  enabled: boolean;
}

/** Texto legible por bloqueo (para checklist en UI). */
export const SUNAT_BLOCKER_LABEL: Record<SunatActivationBlocker, string> = {
  sin_config: "Falta configurar los datos fiscales (RUC, razón social, token Nubefact).",
  ruc_invalido: "El RUC no es válido o no está ACTIVO y HABIDO en SUNAT.",
  sin_token: "Falta el token de Nubefact para emitir comprobantes.",
};
