/**
 * lib/integrations/reniec.ts
 *
 * RENIEC DNI validation (Registro Nacional de Identificación y Estado Civil — Perú).
 *
 * Audit 2026-05-17 TD-058: vendor onboarding registra DNI/RUC pero NO los
 * verifica contra fuentes oficiales — Ley 29733 + DS 003-2013-JUS exigen
 * verificación si se procesan datos personales con propósito comercial.
 *
 * Este módulo expone:
 *   - `verifyDni(dni)` → { ok, fullName?, mockSource? }
 *   - Cache 24h por DNI (RENIEC cobra por consulta — minimizar API calls)
 *   - Provider selectable via `RENIEC_PROVIDER` env:
 *       "mock"      (default) — para dev/test, NO consulta nada
 *       "apisperu"  — APIs.net.pe (token gratis hasta 100 consultas/día)
 *       "decolecta" — decolecta.com (premium, recomendado para prod)
 *
 * Workflow para activar verificación real:
 *   1. Setear RENIEC_PROVIDER="apisperu" (o "decolecta") en Vercel env
 *   2. Setear RENIEC_API_TOKEN con el token correspondiente
 *   3. En stores/apply, llamar `verifyDni(dni)` y rechazar si !ok
 *
 * NOTA: NO almacenamos el nombre devuelto por RENIEC en DB — solo se usa
 * para comparar contra el ownerName del form (anti-suplantación). El
 * cache vive en memoria (Redis si configurado) con TTL 24h.
 */

import "server-only";
import { logger } from "@/lib/logger";
import { cacheStore } from "@/lib/cache";

const CACHE_TTL_SEC = 24 * 60 * 60; // 24h
const RENIEC_TIMEOUT_MS = 5000;

export interface ReniecResult {
  /** true si DNI existe y es válido en RENIEC */
  ok: boolean;
  /** Nombre completo según RENIEC (solo si ok=true). NO persistir en DB. */
  fullName?: string;
  /** Provider que respondió (mock|apisperu|decolecta) */
  source: "mock" | "apisperu" | "decolecta" | "cache";
  /** Razón del fallo si !ok */
  reason?: string;
}

/**
 * Verifica un DNI peruano contra el provider configurado.
 *
 * @param dni - 8 dígitos (validado por caller con regex /^\d{8}$/)
 * @returns ReniecResult con ok=true si el DNI existe
 */
export async function verifyDni(dni: string): Promise<ReniecResult> {
  if (!/^\d{8}$/.test(dni)) {
    return { ok: false, source: "mock", reason: "invalid_format" };
  }

  const cacheKey = `reniec:dni:${dni}`;
  const cached = cacheStore.get<ReniecResult>(cacheKey);
  if (cached) {
    return { ...cached, source: "cache" };
  }

  const provider = process.env.RENIEC_PROVIDER ?? "mock";

  let result: ReniecResult;
  try {
    if (provider === "apisperu") {
      result = await callApisPeru(dni);
    } else if (provider === "decolecta") {
      result = await callDecolecta(dni);
    } else {
      // Default: mock — no DB hit, no network, retorna ok para cualquier DNI
      // de 8 dígitos. Útil para dev/test sin credenciales reales.
      result = { ok: true, source: "mock" };
    }
  } catch (err) {
    logger.warn("[reniec] verification failed — defaulting to soft-pass", {
      provider,
      dniLast4: dni.slice(-4),
      err: err instanceof Error ? err.message : String(err),
    });
    // Soft-fail: si el provider externo cae, NO bloqueamos onboarding.
    // El admin puede verificar manualmente desde panel superadmin.
    return { ok: true, source: "mock", reason: "provider_unavailable" };
  }

  // Solo cachear resultados positivos — un DNI que no existe puede ser
  // typo del usuario, no queremos cachear el "no existe".
  if (result.ok) {
    cacheStore.set(cacheKey, result, CACHE_TTL_SEC);
  }
  return result;
}

// ── apis.net.pe (free tier 100/day) ───────────────────────────────────────────

interface ApisPeruDniResponse {
  numero: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
}

async function callApisPeru(dni: string): Promise<ReniecResult> {
  const token = process.env.RENIEC_API_TOKEN;
  if (!token) {
    throw new Error("RENIEC_API_TOKEN required for apisperu provider");
  }
  const url = `https://api.apis.net.pe/v2/reniec/dni?numero=${dni}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), RENIEC_TIMEOUT_MS);
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
    const data = (await res.json()) as ApisPeruDniResponse;
    const fullName = [data.nombres, data.apellidoPaterno, data.apellidoMaterno]
      .filter(Boolean)
      .join(" ")
      .trim();
    return { ok: !!fullName, source: "apisperu", fullName };
  } finally {
    clearTimeout(timer);
  }
}

// ── decolecta.com (premium provider) ──────────────────────────────────────────

interface DecolectaDniResponse {
  full_name: string;
  first_name: string;
  first_last_name: string;
  second_last_name: string;
  document_number: string;
}

async function callDecolecta(dni: string): Promise<ReniecResult> {
  const token = process.env.RENIEC_API_TOKEN;
  if (!token) {
    throw new Error("RENIEC_API_TOKEN required for decolecta provider");
  }
  const url = `https://api.decolecta.com/v1/reniec/dni?numero=${dni}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), RENIEC_TIMEOUT_MS);
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
    const data = (await res.json()) as DecolectaDniResponse;
    return { ok: !!data.full_name, source: "decolecta", fullName: data.full_name };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Compara el nombre devuelto por RENIEC contra el ownerName del form.
 * Tolerante a diferencias de orden, acentos, y mayúsculas (typo común).
 * Retorna true si parecen ser la misma persona.
 */
export function namesMatch(reniecName: string, ownerName: string): boolean {
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(" ");
  const a = normalize(reniecName);
  const b = normalize(ownerName);
  if (!a || !b) return false;
  // Match exacto (sin orden) o subconjunto >=70% (toleramos apellido faltante)
  if (a === b) return true;
  const aTokens = new Set(a.split(" "));
  const bTokens = new Set(b.split(" "));
  const overlap = [...bTokens].filter((t) => aTokens.has(t)).length;
  const minSize = Math.min(aTokens.size, bTokens.size);
  return minSize > 0 && overlap / minSize >= 0.7;
}
