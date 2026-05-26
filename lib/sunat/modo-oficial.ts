import "server-only";
import { TenantFeatureFlagDB } from "@/lib/db/tenant-feature-flag.db";
import { SunatDB } from "@/lib/db/sunat.db";
import { verifyRuc, isInvoiceable } from "@/lib/integrations/sunat-ruc";
import {
  SUNAT_OFICIAL_FLAG,
  type SunatActivationBlocker,
  type SunatModoOficialState,
} from "./modo-oficial.types";

/**
 * Helpers del Modo SUNAT Oficial. Ver ADR-123 + `modo-oficial.types.ts`.
 */

/** ¿El tenant tiene el modo oficial activado? Usado como guard en emisión. */
export async function isSunatOficial(tenantId: string): Promise<boolean> {
  return TenantFeatureFlagDB.isEnabled(tenantId, SUNAT_OFICIAL_FLAG);
}

/**
 * Calcula los bloqueos de activación + metadata de config. NO consulta el flag,
 * solo la preparación fiscal (config + RUC).
 */
export async function computeBlockers(tenantId: string): Promise<{
  bloqueos: SunatActivationBlocker[];
  configReady: boolean;
  rucVerificado: boolean;
  ambiente: "beta" | "produccion";
}> {
  const config = await SunatDB.getConfig(tenantId);
  if (!config) {
    return { bloqueos: ["sin_config"], configReady: false, rucVerificado: false, ambiente: "beta" };
  }

  const bloqueos: SunatActivationBlocker[] = [];
  if (!config.nubefactToken) bloqueos.push("sin_token");

  let rucVerificado = false;
  if (!/^\d{11}$/.test(config.ruc)) {
    bloqueos.push("ruc_invalido");
  } else {
    // verifyRuc puede caer a "mock" (siempre válido) si no hay provider real;
    // ante error de red lo tratamos como no verificado (no bloquea duro, pero
    // se refleja en rucVerificado=false para que el superadmin lo sepa).
    const rucRes = await verifyRuc(config.ruc).catch(() => null);
    rucVerificado = rucRes ? isInvoiceable(rucRes) : false;
    if (rucRes && !rucVerificado) bloqueos.push("ruc_invalido");
  }

  return {
    bloqueos,
    configReady: bloqueos.length === 0,
    rucVerificado,
    ambiente: config.isProduction ? "produccion" : "beta",
  };
}

/** Estado completo (flag + bloqueos) para la UI. */
export async function getModoOficialState(tenantId: string): Promise<SunatModoOficialState> {
  const [enabled, meta] = await Promise.all([
    isSunatOficial(tenantId),
    computeBlockers(tenantId),
  ]);
  return {
    enabled,
    configReady: meta.configReady,
    rucVerificado: meta.rucVerificado,
    ambiente: meta.ambiente,
    bloqueos: meta.bloqueos,
  };
}
