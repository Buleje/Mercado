import "server-only";

import { listWhatsAppConfigs, type DbWhatsAppConfig } from "@/lib/db/whatsapp-messages.db";
import { getApprovedTemplates } from "@/lib/whatsapp/templates";
import { logger } from "@/lib/logger";
import {
  PLANTILLA_AVISOS_POR_DEFECTO,
  TOPE_PARAMETRO_PLANTILLA,
  cuerpoPlantillaWa,
  cuerpoTextoWa,
  esFalloTransitorio,
  telefonoParaWa,
  topeDelParametro,
  type EnvioWhatsApp,
  type ViaEnvioWa,
} from "@/lib/whatsapp/aviso-plantilla";

/**
 * WhatsApp que manda EL NEGOCIO (avisos, reportes), con SU número.
 *
 * Hasta el 26-09 los avisos del Libro CTP salían con `sendWhatsAppText`, que
 * lee `WHATSAPP_API_URL`/`WHATSAPP_API_TOKEN` del entorno — y ese token daba
 * 401 «Cannot parse access token». Mientras tanto el negocio tenía en
 * `TenantWhatsAppConfig` (el mismo que usa el bot del webhook, ADR-058) un
 * token de usuario del sistema válido y sin vencimiento. Ahora:
 *
 * 1. **Cuenta**: el primer número ACTIVO del negocio; si no tiene, la del
 *    servidor (entorno), como antes. Sin ninguna → `ok: false`, «no configurado».
 * 2. **Forma**: plantilla si hay una que sirva, si no texto libre.
 *    - Nombre: `opts.plantilla` › `WHATSAPP_PLANTILLA_AVISOS` › «aviso_libro_ctp».
 *    - Con WABA en la config se busca entre las APROBADAS (caché 5 min): se usa
 *      su idioma real y el tope que deja su texto fijo. Con 2+ variables no
 *      sirve (el aviso entero va en `{{1}}`) y queda dicho en `nota`.
 *    - Sin WABA (o la cuenta del servidor), sólo si alguien la NOMBRÓ, a ciegas
 *      con `WHATSAPP_PLANTILLA_IDIOMA` (o `es`): si no existe, Meta lo dice.
 *    - Texto libre → `puedeNoLlegar: true` (fuera de 24 h Meta lo descarta).
 *
 * Nunca tira: devuelve el resultado con el error crudo de Meta SIN el token,
 * para que el llamador lo registre y lo traduzca (`explicarFalloEnvio`).
 */

const GRAPH = "https://graph.facebook.com/v21.0";
const ESPERA_MS = 10_000;

export interface OpcionesEnvioNegocio {
  /** Plantilla a usar; por defecto la de `WHATSAPP_PLANTILLA_AVISOS` o «aviso_libro_ctp». */
  plantilla?: string | null;
  /** Quién manda, para el log del servidor («reporte_diario», «ctp_plazos»). */
  contexto?: string;
  esperaMs?: number;
  /**
   * Reintentos ante fallas PASAJERAS (red, timeout, 5xx, 429), con pausa
   * creciente. Un token malo o un número fuera de la lista no se reintentan.
   * Por defecto 0: los crons ya reintentan al día siguiente.
   */
  reintentos?: number;
  /** Pausa base entre reintentos (se multiplica por el intento). */
  pausaMs?: number;
}

interface Cuenta {
  via: ViaEnvioWa;
  url: string;
  token: string;
  config: DbWhatsAppConfig | null;
}

interface PlantillaElegida {
  nombre: string;
  idioma: string;
  max: number;
}

/** Borra el token (y cualquier cosa con forma de token) de un texto que va a un log o a la base. */
export function sinSecreto(texto: string, token: string | null | undefined): string {
  let s = texto;
  if (token && token.length >= 8) s = s.split(token).join("[token]");
  return s.replace(/Bearer\s+[\w.~+/=-]+/gi, "Bearer [token]").replace(/\bEAA[A-Za-z0-9]{20,}/g, "[token]");
}

async function cuentaParaMandar(tenantId: string, contexto: string | undefined): Promise<Cuenta | null> {
  try {
    const configs = await listWhatsAppConfigs(tenantId);
    const config = configs.find((c) => c.isActive && c.phoneNumberId && c.whatsappToken?.trim());
    if (config) {
      return {
        via: "negocio",
        url: `${GRAPH}/${config.phoneNumberId}/messages`,
        token: config.whatsappToken.trim(),
        config,
      };
    }
  } catch (err) {
    /* Sin poder leer la config del negocio se prueba con la del servidor: un
       aviso que sale por la otra cuenta es mejor que uno que no sale. */
    logger.warn("[whatsapp-negocio] no se pudo leer la cuenta del negocio; se usa la del servidor", {
      tenantId,
      contexto,
      err: String(err).slice(0, 200),
    });
  }
  const url = process.env.WHATSAPP_API_URL?.trim();
  const token = process.env.WHATSAPP_API_TOKEN?.trim();
  return url && token ? { via: "servidor", url, token, config: null } : null;
}

async function elegirPlantilla(
  cuenta: Cuenta,
  pedida: string | null | undefined,
): Promise<{ plantilla: PlantillaElegida | null; nota: string | null }> {
  const nombrada = pedida?.trim() || process.env.WHATSAPP_PLANTILLA_AVISOS?.trim() || "";
  const nombre = nombrada || PLANTILLA_AVISOS_POR_DEFECTO;

  if (cuenta.config?.wabaId) {
    const aprobadas = await getApprovedTemplates(cuenta.config, "").catch(() => null);
    const mismas = (aprobadas ?? []).filter((t) => t.name === nombre);
    const t = mismas.find((x) => x.language.toLowerCase().startsWith("es")) ?? mismas[0];
    if (t) {
      if (t.paramCount !== 1) {
        return {
          plantilla: null,
          nota: `la plantilla «${nombre}» tiene ${t.paramCount} variables; para los avisos lleva una sola ({{1}})`,
        };
      }
      return { plantilla: { nombre, idioma: t.language, max: topeDelParametro(t.body) }, nota: null };
    }
  }
  if (nombrada) {
    const idioma = process.env.WHATSAPP_PLANTILLA_IDIOMA?.trim() || "es";
    return { plantilla: { nombre, idioma, max: TOPE_PARAMETRO_PLANTILLA }, nota: null };
  }
  return { plantilla: null, nota: null };
}

function leerWamid(crudo: string): string | null {
  try {
    const j = JSON.parse(crudo) as { messages?: { id?: string }[] };
    return j.messages?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

function codigoMeta(crudo: string): number | null {
  try {
    return (JSON.parse(crudo) as { error?: { code?: number } }).error?.code ?? null;
  } catch {
    return null;
  }
}

/** Últimos 3 dígitos: suficiente para ubicar el envío sin guardar el número en el log. */
const telefonoTapado = (to: string) => (to.length > 3 ? `…${to.slice(-3)}` : "…");

export async function enviarWhatsAppDelNegocio(
  tenantId: string,
  telefono: string,
  texto: string,
  opts: OpcionesEnvioNegocio = {},
): Promise<EnvioWhatsApp> {
  const vacio: EnvioWhatsApp = {
    ok: false,
    via: null,
    modo: "texto",
    plantilla: null,
    wamid: null,
    puedeNoLlegar: false,
    error: null,
    nota: null,
  };
  const to = telefonoParaWa(telefono);
  if (!to) return { ...vacio, error: "Teléfono vacío: no hay a quién mandarle." };

  const cuenta = await cuentaParaMandar(tenantId, opts.contexto);
  if (!cuenta) {
    return {
      ...vacio,
      error: "WhatsApp no configurado: el negocio no tiene número conectado y el servidor tampoco (faltan WHATSAPP_API_URL / WHATSAPP_API_TOKEN).",
    };
  }

  const { plantilla, nota } = await elegirPlantilla(cuenta, opts.plantilla);
  const base: EnvioWhatsApp = {
    ...vacio,
    via: cuenta.via,
    modo: plantilla ? "plantilla" : "texto",
    plantilla: plantilla?.nombre ?? null,
    puedeNoLlegar: !plantilla,
    nota,
  };
  const cuerpo = plantilla ? cuerpoPlantillaWa(to, plantilla, texto) : cuerpoTextoWa(to, texto);
  const reintentos = Math.max(0, Math.min(opts.reintentos ?? 0, 4));

  let r: EnvioWhatsApp = base;
  for (let intento = 0; intento <= reintentos; intento++) {
    if (intento > 0) await new Promise((ok) => setTimeout(ok, (opts.pausaMs ?? 2000) * intento));
    r = await unIntento(tenantId, cuenta, to, cuerpo, base, opts);
    if (r.ok || !esFalloTransitorio(r.error)) return r;
  }
  return r;
}

async function unIntento(
  tenantId: string,
  cuenta: Cuenta,
  to: string,
  cuerpo: object,
  base: EnvioWhatsApp,
  opts: OpcionesEnvioNegocio,
): Promise<EnvioWhatsApp> {
  try {
    const res = await fetch(cuenta.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cuenta.token}` },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(opts.esperaMs ?? ESPERA_MS),
    });
    const crudo = await res.text().catch(() => "");
    if (!res.ok) {
      const error = sinSecreto(`WhatsApp API error: ${res.status} ${crudo}`, cuenta.token).slice(0, 400);
      logger.warn("[whatsapp-negocio] Meta no lo aceptó", {
        tenantId,
        contexto: opts.contexto,
        via: cuenta.via,
        modo: base.modo,
        plantilla: base.plantilla,
        a: telefonoTapado(to),
        status: res.status,
        codigo: codigoMeta(crudo),
      });
      return { ...base, error };
    }
    return { ...base, ok: true, wamid: leerWamid(crudo) };
  } catch (err) {
    const error = sinSecreto(err instanceof Error ? err.message : String(err), cuenta.token).slice(0, 400);
    logger.warn("[whatsapp-negocio] no se pudo llegar a Meta", {
      tenantId,
      contexto: opts.contexto,
      via: cuenta.via,
      modo: base.modo,
      a: telefonoTapado(to),
      err: error.slice(0, 200),
    });
    return { ...base, error };
  }
}
