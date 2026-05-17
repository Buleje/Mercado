/**
 * lib/integrations/sunat-ruc.ts
 *
 * SUNAT RUC validation (Registro Único de Contribuyentes — Perú).
 *
 * Audit 2026-05-17 TD-058: complementa lib/integrations/reniec.ts para
 * verificar RUC (11 dígitos, personas jurídicas + algunos casos especiales)
 * contra el padrón de SUNAT. Necesario para vendor onboarding empresarial
 * y para emisión correcta de facturas electrónicas (ya hay lib/integrations/
 * sunat.ts y sunat-nubefact.ts pero esos manejan facturación, NO lookup).
 *
 * Provider selectable via `SUNAT_RUC_PROVIDER` env:
 *   "mock"      (default) — para dev/test
 *   "apisperu"  — APIs.net.pe (free tier 100/día)
 *   "decolecta" — decolecta.com (premium)
 *
 * Devuelve no solo si el RUC existe sino también razón social, estado
 * (ACTIVO/INACTIVO/SUSPENDIDO) y condición (HABIDO/NO HABIDO) — datos
 * críticos para Sub-Tax compliance: si un vendor está NO HABIDO, sus
 * facturas no son deducibles para los compradores.
 */

import "server-only";
import { logger } from "@/lib/logger";
import { cacheStore } from "@/lib/cache";

const CACHE_TTL_SEC = 24 * 60 * 60; // 24h
const SUNAT_TIMEOUT_MS = 5000;

export interface SunatRucResult {
  ok: boolean;
  /** Razón social legal según SUNAT (solo si ok=true) */
  razonSocial?: string;
  /** "ACTIVO" | "BAJA DE OFICIO" | "SUSPENSION TEMPORAL" | ... */
  estado?: string;
  /** "HABIDO" | "NO HABIDO" | "NO HALLADO" — habido es lo correcto para facturar */
  condicion?: string;
  /** Departamento + provincia + distrito (string libre) */
  direccion?: string;
  source: "mock" | "apisperu" | "decolecta" | "cache";
  reason?: string;
}

/**
 * Verifica un RUC peruano contra el provider configurado.
 *
 * @param ruc - 11 dígitos comenzando con 10/15/17/20 (validado por caller)
 */
export async function verifyRuc(ruc: string): Promise<SunatRucResult> {
  if (!/^(10|15|17|20)\d{9}$/.test(ruc)) {
    return { ok: false, source: "mock", reason: "invalid_format" };
  }

  const cacheKey = `sunat:ruc:${ruc}`;
  const cached = cacheStore.get<SunatRucResult>(cacheKey);
  if (cached) {
    return { ...cached, source: "cache" };
  }

  const provider = process.env.SUNAT_RUC_PROVIDER ?? "mock";

  let result: SunatRucResult;
  try {
    if (provider === "apisperu") {
      result = await callApisPeruRuc(ruc);
    } else if (provider === "decolecta") {
      result = await callDecolectaRuc(ruc);
    } else {
      // Default mock: retorna ACTIVO + HABIDO con razón social derivada
      // del primer dígito. Útil para dev sin credenciales.
      result = {
        ok: true,
        razonSocial: `Empresa Mock RUC ${ruc.slice(-4)} S.A.C.`,
        estado: "ACTIVO",
        condicion: "HABIDO",
        source: "mock",
      };
    }
  } catch (err) {
    logger.warn("[sunat-ruc] verification failed — soft-pass", {
      provider,
      rucLast4: ruc.slice(-4),
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: true, source: "mock", reason: "provider_unavailable" };
  }

  if (result.ok) {
    cacheStore.set(cacheKey, result, CACHE_TTL_SEC);
  }
  return result;
}

// ── apis.net.pe ───────────────────────────────────────────────────────────────

interface ApisPeruRucResponse {
  ruc: string;
  razonSocial: string;
  nombreComercial?: string | null;
  estado: string;
  condicion: string;
  direccion?: string;
  departamento?: string;
  provincia?: string;
  distrito?: string;
}

async function callApisPeruRuc(ruc: string): Promise<SunatRucResult> {
  const token = process.env.SUNAT_RUC_API_TOKEN ?? process.env.RENIEC_API_TOKEN;
  if (!token) {
    throw new Error("SUNAT_RUC_API_TOKEN required for apisperu provider");
  }
  const url = `https://api.apis.net.pe/v2/sunat/ruc?numero=${ruc}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SUNAT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Accept": "application/json",
        "User-Agent": "Buleje/1.0 (+https://www.buleje.pe)",
      },
      signal: ctrl.signal,
    });
    if (res.status === 404) return { ok: false, source: "apisperu", reason: "not_found" };
    if (!res.ok) throw new Error(`apisperu http ${res.status}`);
    const data = (await res.json()) as ApisPeruRucResponse;
    const direccionFull = [data.direccion, data.distrito, data.provincia, data.departamento]
      .filter(Boolean)
      .join(", ")
      .trim();
    return {
      ok: !!data.razonSocial,
      razonSocial: data.razonSocial,
      estado: data.estado,
      condicion: data.condicion,
      direccion: direccionFull || undefined,
      source: "apisperu",
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── decolecta.com ─────────────────────────────────────────────────────────────

interface DecolectaRucResponse {
  ruc: string;
  razon_social: string;
  estado: string;
  condicion: string;
  direccion_completa?: string;
}

async function callDecolectaRuc(ruc: string): Promise<SunatRucResult> {
  const token = process.env.SUNAT_RUC_API_TOKEN ?? process.env.RENIEC_API_TOKEN;
  if (!token) {
    throw new Error("SUNAT_RUC_API_TOKEN required for decolecta provider");
  }
  const url = `https://api.decolecta.com/v1/sunat/ruc?numero=${ruc}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SUNAT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Accept": "application/json",
        "User-Agent": "Buleje/1.0 (+https://www.buleje.pe)",
      },
      signal: ctrl.signal,
    });
    if (res.status === 404) return { ok: false, source: "decolecta", reason: "not_found" };
    if (!res.ok) throw new Error(`decolecta http ${res.status}`);
    const data = (await res.json()) as DecolectaRucResponse;
    return {
      ok: !!data.razon_social,
      razonSocial: data.razon_social,
      estado: data.estado,
      condicion: data.condicion,
      direccion: data.direccion_completa,
      source: "decolecta",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Helper de decisión: retorna true si el RUC está apto para
 * recibir y emitir facturas (ACTIVO + HABIDO). Vendor cuyo RUC
 * no cumple debería ser rechazado en onboarding o suspendido si
 * pasa a NO HABIDO durante la operación.
 */
export function isInvoiceable(result: SunatRucResult): boolean {
  return (
    result.ok === true &&
    result.estado === "ACTIVO" &&
    result.condicion === "HABIDO"
  );
}
