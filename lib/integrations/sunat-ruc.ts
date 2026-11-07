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
 *   "auto"      (default) — v1 pública de apis.net.pe, SIN token; mock si cae
 *   "apisperu"  — APIs.net.pe v2 (free tier 100/día, pide token)
 *   "decolecta" — decolecta.com (premium)
 *   "mock"      — datos de demostración, sin salir a la red (dev/test)
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
  /** Dirección completa, ya armada con el ubigeo (para mostrar de un vistazo) */
  direccion?: string;
  /**
   * El ubigeo SEPARADO.
   *
   * La ficha de una persona guarda departamento, provincia y distrito en
   * columnas propias —así se filtra y se imprime en un comprobante— y
   * volver a partir un string «Jr. X, Miraflores, Lima, Lima» es adivinar.
   * El proveedor ya los manda por separado: sólo había que no pegarlos.
   */
  departamento?: string;
  provincia?: string;
  distrito?: string;
  /** Sólo la calle, sin el ubigeo pegado atrás. */
  direccionSimple?: string;
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

  /**
   * Sin variable puesta el default es `auto`, NO `mock`: primero se prueba la
   * v1 pública, que no pide token y devuelve datos REALES. Es la razón por la
   * que «SUNAT no funcionaba» — todo el código apuntaba a la v2, que exige
   * credenciales.
   *
   * `mock` quedó como opt-in EXPLÍCITO y sin red. Cuando era el default, pedir
   * el mock terminaba pegándole a internet: los tests unitarios salían a la
   * red y fallaban, porque la API real contesta «no existe» a un RUC inventado
   * como 15123456789. Un modo que se llama mock tiene que no depender de nadie.
   */
  const provider = process.env.SUNAT_RUC_PROVIDER ?? "auto";

  if (provider === "mock") {
    const demo = mockRuc(ruc);
    cacheStore.set(cacheKey, demo, CACHE_TTL_SEC);
    return demo;
  }

  let result: SunatRucResult;
  try {
    if (provider === "apisperu") {
      result = await callApisPeruRuc(ruc);
    } else if (provider === "decolecta") {
      result = await callDecolectaRuc(ruc);
    } else {
      result = await callApisPeruV1Ruc(ruc);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    /**
     * Token vencido o mal puesto: es un problema de CONFIGURACIÓN, no del RUC
     * que se consultó. Se distingue para que la pantalla pueda decir qué
     * arreglar en vez de «no se pudo consultar», que manda a nadie a ningún
     * lado.
     */
    const credenciales = /http 401|http 403|token/i.test(msg);
    logger.warn("[sunat-ruc] verification failed — cae al mock", {
      provider,
      rucLast4: ruc.slice(-4),
      credenciales,
      err: msg,
    });
    /**
     * Antes de rendirse: la v1 pública no pide token, así que un token vencido
     * no tiene por qué dejar al negocio sin datos reales. Sólo tiene sentido
     * si el que falló era un proveedor CON credenciales — en `auto` la pública
     * ya era el intento que acaba de fallar, y repetirlo es perder otro
     * segundo para llegar al mismo lugar.
     */
    if (provider === "apisperu" || provider === "decolecta") {
      try {
        const publica = await callApisPeruV1Ruc(ruc);
        if (publica.ok) {
          cacheStore.set(cacheKey, publica, CACHE_TTL_SEC);
          return { ...publica, reason: credenciales ? "fallback_publica" : undefined };
        }
      } catch {
        // la pública tampoco: se sigue al mock, que al menos no rompe la pantalla
      }
    }
    /* Se responde con el mock y se DECLARA que es de demostración: la pantalla
       muestra la fuente, así nadie confunde un dato inventado con SUNAT. */
    return { ...mockRuc(ruc), reason: credenciales ? "bad_credentials" : "provider_unavailable" };
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
      direccionSimple: data.direccion || undefined,
      departamento: data.departamento || undefined,
      provincia: data.provincia || undefined,
      distrito: data.distrito || undefined,
      source: "apisperu",
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── apis.net.pe v1 (PÚBLICA, sin token) ──────────────────────────────────────

/**
 * La respuesta de la v1. Trae la dirección DESARMADA (tipo de vía, número,
 * manzana…) además del ubigeo, que es más de lo que da la v2.
 */
interface ApisPeruV1RucResponse {
  nombre?: string;
  estado?: string;
  condicion?: string;
  direccion?: string;
  /** Código de ubigeo INEI de 6 dígitos, ej. "150101". */
  ubigeo?: string;
  distrito?: string;
  provincia?: string;
  departamento?: string;
}

/**
 * La v1 de apis.net.pe: pública, sin token, con datos reales del padrón.
 *
 * Es el proveedor por defecto. La v2 (con token) sigue estando para quien tenga
 * credenciales —tiene mejores garantías de disponibilidad— pero no hace falta
 * pagar ni registrarse para que la ficha de una persona se complete sola.
 *
 * El caché de 24 h de `verifyRuc` la protege: un servicio público y gratuito no
 * se golpea una vez por tecla.
 */
async function callApisPeruV1Ruc(ruc: string): Promise<SunatRucResult> {
  const url = `https://api.apis.net.pe/v1/ruc?numero=${ruc}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SUNAT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Buleje/1.0 (+https://www.buleje.pe)" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (res.status === 404 || res.status === 422) return { ok: false, source: "apisperu", reason: "not_found" };
    if (!res.ok) throw new Error(`apisperu v1 http ${res.status}`);
    const data = (await res.json()) as ApisPeruV1RucResponse;
    const razonSocial = data.nombre?.trim();
    if (!razonSocial) return { ok: false, source: "apisperu", reason: "not_found" };
    const calle = data.direccion?.trim();
    const completa = [calle, data.distrito, data.provincia, data.departamento].filter(Boolean).join(", ").trim();
    return {
      ok: true,
      razonSocial,
      /* Un DNI consultado como RUC10 devuelve estado/condición vacíos: se
         omiten en vez de mostrar un chip sin texto. */
      estado: data.estado?.trim() || undefined,
      condicion: data.condicion?.trim() || undefined,
      direccion: completa || undefined,
      direccionSimple: calle || undefined,
      departamento: data.departamento?.trim() || undefined,
      provincia: data.provincia?.trim() || undefined,
      distrito: data.distrito?.trim() || undefined,
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
  direccion?: string;
  direccion_completa?: string;
  departamento?: string;
  provincia?: string;
  distrito?: string;
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
      direccion: data.direccion_completa ?? data.direccion,
      direccionSimple: data.direccion,
      departamento: data.departamento,
      provincia: data.provincia,
      distrito: data.distrito,
      source: "decolecta",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Un RUC de mentira, con la MISMA forma que uno real.
 *
 * Sirve para desarrollar y demostrar sin credenciales, y para no dejar la
 * pantalla muerta cuando el proveedor no contesta. Devuelve ubigeo real de
 * Ciudad Constitución (Pasco) porque es donde opera el negocio: un dato de
 * demo con forma equivocada esconde los bugs de layout que se supone que
 * tiene que mostrar.
 */
function mockRuc(ruc: string): SunatRucResult {
  const distrito = "CONSTITUCION";
  const provincia = "OXAPAMPA";
  const departamento = "PASCO";
  const calle = `AV. MARGINAL NRO ${ruc.slice(-3)}`;
  return {
    ok: true,
    razonSocial: `EMPRESA DEMO ${ruc.slice(-4)} S.A.C.`,
    estado: "ACTIVO",
    condicion: "HABIDO",
    direccion: [calle, distrito, provincia, departamento].join(", "),
    direccionSimple: calle,
    departamento,
    provincia,
    distrito,
    source: "mock",
  };
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
