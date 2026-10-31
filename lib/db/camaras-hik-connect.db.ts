import "server-only";

import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { cifrarSecreto, descifrarSecreto, hayClaveDeCifrado } from "@/lib/cripto-secretos";
import {
  esRegion,
  REGIONES_HIK,
  ultimos4,
  type CamaraHik,
  type RegionHik,
} from "@/lib/camaras/hik-connect-api";
import type { CredencialesHik } from "@/lib/camaras/hik-connect-api.server";

/**
 * La cuenta de Hik-Connect for Teams del negocio y qué cámara del sistema es
 * cuál de Hikvision (ADR-471).
 *
 * POR QUÉ KV y no columnas: mismo criterio que `CamarasDB` (ADR-308 §4) —
 * una cuenta y unas pocas cámaras por negocio, sin migración. La clave es
 * `interno:` para que NUNCA viaje en `PlatformSettingsDB.getAll()` (lo lee el
 * layout de toda la plataforma) aunque esté cifrada.
 *
 * ## Secretos
 *
 * AppKey, SecretKey y el código de verificación de cada cámara entran cifrados
 * con `cifrarSecreto` (AES-256-GCM sobre `AUTH_SECRET`, el mismo de la clave
 * ISAPI de las cámaras). A la pantalla sólo llega `estadoParaPantalla`: si está
 * vinculado, la región y los últimos 4 de la AppKey.
 */

const CLAVE = (tenantId: string) => `interno:camaras-hik-connect:${tenantId}`;
const TX_KV = { maxWait: 10_000, timeout: 10_000 } as const;

export interface EnlaceHik {
  resourceId: string;
  deviceSerial: string;
  nombreHik: string;
  /** Código de verificación (etiqueta de la cámara), cifrado. Sin él, el video cifrado no se ve. */
  codigoCifrado?: string;
  enlazadoAt: string;
}

export interface CuentaHikGuardada {
  appKeyCifrada: string;
  secretKeyCifrada: string;
  region: RegionHik;
  ultimos4: string;
  vinculadoAt: string;
  vinculadoPor: string;
  /** camaraId (del sistema) → cámara de Hikvision. */
  enlaces: Record<string, EnlaceHik>;
}

export interface EstadoHikPantalla {
  vinculado: boolean;
  region: RegionHik | null;
  regionNombre: string | null;
  ultimos4: string | null;
  vinculadoAt: string | null;
  /** Sin claves ni serie completa: el nombre en Hikvision y si tiene código cargado. */
  enlaces: Record<string, { nombreHik: string; serieFinal: string; conCodigo: boolean }>;
}

function cuentaDe(raw: unknown): CuentaHikGuardada | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const c = raw as Partial<CuentaHikGuardada>;
  if (
    typeof c.appKeyCifrada !== "string" ||
    typeof c.secretKeyCifrada !== "string" ||
    !esRegion(c.region)
  )
    return null;
  return {
    appKeyCifrada: c.appKeyCifrada,
    secretKeyCifrada: c.secretKeyCifrada,
    region: c.region,
    ultimos4: typeof c.ultimos4 === "string" ? c.ultimos4 : "",
    vinculadoAt: typeof c.vinculadoAt === "string" ? c.vinculadoAt : "",
    vinculadoPor: typeof c.vinculadoPor === "string" ? c.vinculadoPor : "",
    enlaces: c.enlaces && typeof c.enlaces === "object" ? { ...c.enlaces } : {},
  };
}

export function estadoParaPantalla(c: CuentaHikGuardada | null): EstadoHikPantalla {
  if (!c)
    return {
      vinculado: false,
      region: null,
      regionNombre: null,
      ultimos4: null,
      vinculadoAt: null,
      enlaces: {},
    };
  const enlaces: EstadoHikPantalla["enlaces"] = {};
  for (const [id, e] of Object.entries(c.enlaces)) {
    enlaces[id] = {
      nombreHik: e.nombreHik,
      serieFinal: ultimos4(e.deviceSerial),
      conCodigo: !!e.codigoCifrado,
    };
  }
  return {
    vinculado: true,
    region: c.region,
    regionNombre: REGIONES_HIK[c.region].nombre,
    ultimos4: c.ultimos4,
    vinculadoAt: c.vinculadoAt,
    enlaces,
  };
}

function auditar(
  tenantId: string,
  accion: string,
  detalle: string,
  user: string,
  entidadId?: string,
) {
  logActivity(accion, "camara", detalle, entidadId, user, undefined, tenantId).catch((err) =>
    logger.error("[hik-connect] no se pudo auditar", { error: String(err), tenantId, accion }),
  );
}

type Cambio<R> = (actual: CuentaHikGuardada | null) => { valor?: CuentaHikGuardada; resultado: R };

async function mutar<R>(tenantId: string, user: string, cambio: Cambio<R>): Promise<R> {
  if (!tenantId) throw new Error("tenantId is required");
  return PlatformSettingsDB.actualizar<unknown, R>(
    CLAVE(tenantId),
    (raw) => cambio(cuentaDe(raw)),
    user,
    TX_KV,
  );
}

export type ResultadoHik<T = EstadoHikPantalla> =
  | { ok: true; valor: T }
  | { ok: false; motivo: string };

export const CamarasHikConnectDB = {
  async leer(tenantId: string): Promise<CuentaHikGuardada | null> {
    if (!tenantId) throw new Error("tenantId is required");
    return cuentaDe(await PlatformSettingsDB.get<unknown>(CLAVE(tenantId)));
  },

  async estado(tenantId: string): Promise<EstadoHikPantalla> {
    return estadoParaPantalla(await this.leer(tenantId));
  },

  /** Las claves en claro, sólo para hablar con Hikvision. `null` = no vinculado o ilegible. */
  async credenciales(tenantId: string): Promise<ResultadoHik<CredencialesHik>> {
    const c = await this.leer(tenantId);
    if (!c)
      return { ok: false, motivo: "Todavía no vinculaste la cuenta de Hik-Connect for Teams." };
    const appKey = descifrarSecreto(c.appKeyCifrada);
    const secretKey = descifrarSecreto(c.secretKeyCifrada);
    if (!appKey || !secretKey)
      return {
        ok: false,
        motivo:
          "Las claves guardadas ya no se pueden leer (cambió AUTH_SECRET). Vuelve a vincular la cuenta.",
      };
    return { ok: true, valor: { appKey, secretKey, region: c.region } };
  },

  /**
   * Guarda la cuenta YA PROBADA por quien llama. Si es la misma AppKey de
   * antes, conserva los enlaces y códigos; si es otra cuenta, los borra (sus
   * `resourceId` no existen en la cuenta nueva).
   */
  async vincular(
    tenantId: string,
    entrada: { appKey: string; secretKey: string; region: RegionHik },
    user: string,
  ): Promise<ResultadoHik> {
    if (!hayClaveDeCifrado())
      return {
        ok: false,
        motivo: "Falta AUTH_SECRET en el servidor: no hay con qué cifrar las claves.",
      };
    const estado = await mutar(tenantId, user, (actual) => {
      const misma = actual ? descifrarSecreto(actual.appKeyCifrada) === entrada.appKey : false;
      const valor: CuentaHikGuardada = {
        appKeyCifrada: cifrarSecreto(entrada.appKey),
        secretKeyCifrada: cifrarSecreto(entrada.secretKey),
        region: entrada.region,
        ultimos4: ultimos4(entrada.appKey),
        vinculadoAt: new Date().toISOString(),
        vinculadoPor: user,
        enlaces: misma && actual ? actual.enlaces : {},
      };
      return { valor, resultado: estadoParaPantalla(valor) };
    });
    auditar(
      tenantId,
      "camara.hik_connect_vincular",
      `Vinculó Hik-Connect for Teams (${REGIONES_HIK[entrada.region].nombre}, AppKey •••• ${ultimos4(entrada.appKey)})`,
      user,
    );
    return { ok: true, valor: estado };
  },

  /** Borra claves, enlaces y códigos. Las fotos y las cámaras del sistema no se tocan. */
  async desvincular(tenantId: string, user: string): Promise<void> {
    if (!tenantId) throw new Error("tenantId is required");
    await PlatformSettingsDB.delete(CLAVE(tenantId));
    auditar(
      tenantId,
      "camara.hik_connect_desvincular",
      "Desvinculó Hik-Connect for Teams (claves y enlaces borrados)",
      user,
    );
  },

  /** Enlaza una cámara del sistema con una de Hikvision (los datos vienen de la lista de Hikvision, no del cliente). */
  async enlazar(
    tenantId: string,
    camaraId: string,
    hik: CamaraHik,
    codigo: string | null | undefined,
    user: string,
  ): Promise<ResultadoHik> {
    if (codigo && !hayClaveDeCifrado())
      return {
        ok: false,
        motivo: "Falta AUTH_SECRET en el servidor: no hay con qué cifrar el código.",
      };
    const r = await mutar<ResultadoHik>(tenantId, user, (actual) => {
      if (!actual)
        return {
          resultado: { ok: false, motivo: "Primero vincula la cuenta de Hik-Connect for Teams." },
        };
      const previo = actual.enlaces[camaraId];
      /* El mismo `resourceId` no puede quedar en dos cámaras del sistema: se mueve. */
      const enlaces = Object.fromEntries(
        Object.entries(actual.enlaces).filter(([, e]) => e.resourceId !== hik.resourceId),
      );
      const mismoRecurso = previo?.resourceId === hik.resourceId;
      const codigoCifrado =
        codigo === null
          ? undefined
          : codigo
            ? cifrarSecreto(codigo)
            : mismoRecurso
              ? previo?.codigoCifrado
              : undefined;
      enlaces[camaraId] = {
        resourceId: hik.resourceId,
        deviceSerial: hik.deviceSerial,
        nombreHik: hik.nombre,
        ...(codigoCifrado && { codigoCifrado }),
        enlazadoAt: new Date().toISOString(),
      };
      const valor = { ...actual, enlaces };
      return { valor, resultado: { ok: true, valor: estadoParaPantalla(valor) } };
    });
    if (r.ok)
      auditar(
        tenantId,
        "camara.hik_connect_enlazar",
        `Enlazó la cámara con «${hik.nombre}» de Hik-Connect`,
        user,
        camaraId,
      );
    return r;
  },

  async desenlazar(tenantId: string, camaraId: string, user: string): Promise<ResultadoHik> {
    const r = await mutar<ResultadoHik>(tenantId, user, (actual) => {
      if (!actual) return { resultado: { ok: true, valor: estadoParaPantalla(null) } };
      if (!actual.enlaces[camaraId])
        return { resultado: { ok: true, valor: estadoParaPantalla(actual) } };
      const enlaces = { ...actual.enlaces };
      delete enlaces[camaraId];
      const valor = { ...actual, enlaces };
      return { valor, resultado: { ok: true, valor: estadoParaPantalla(valor) } };
    });
    if (r.ok)
      auditar(
        tenantId,
        "camara.hik_connect_desenlazar",
        "Quitó el enlace con Hik-Connect",
        user,
        camaraId,
      );
    return r;
  },

  /** El enlace de una cámara con su código en claro (sólo para armar la URL del video). */
  async enlaceParaVideo(
    tenantId: string,
    camaraId: string,
  ): Promise<{ resourceId: string; deviceSerial: string; codigo: string | null } | null> {
    const c = await this.leer(tenantId);
    const e = c?.enlaces[camaraId];
    if (!e) return null;
    return {
      resourceId: e.resourceId,
      deviceSerial: e.deviceSerial,
      codigo: e.codigoCifrado ? descifrarSecreto(e.codigoCifrado) : null,
    };
  },
};
