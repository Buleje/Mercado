import "server-only";

/**
 * Dispositivos que reciben los avisos de cámaras por Web Push (2026-10-10).
 *
 * Vive en el KV de configuración, en una clave por negocio
 * (`interno:camaras-celulares:<tenantId>`): el aislamiento es la clave misma,
 * y un negocio nunca lee la lista de otro. NO va a la tabla `PushSubscription`
 * a propósito: esa es la de los clientes de la tienda y la recorren los envíos
 * masivos por negocio (`broadcastPush`, ofertas de la zona); el celular del
 * dueño recibiría las promociones de su propia tienda, y los avisos de una
 * cámara no tienen nada que ver con un cliente.
 *
 * `interno:` porque se escribe desde los avisos (la pausa de 10 min): no viaja
 * en `getAll()` ni invalida la foto global de configuración.
 */

import { createHash } from "node:crypto";
import { PlatformSettingsDB } from "./platform-settings.db";
import {
  MAX_CELULARES,
  MAX_CELULARES_POR_USUARIO,
  type CelularSuscrito,
  type ClavesPush,
  type CuandoCelular,
  type EstadoCelulares,
} from "@/lib/camaras/avisar-push";

const CLAVE = (tenantId: string) => `interno:camaras-celulares:${tenantId}`;
const TX = { maxWait: 10_000, timeout: 10_000 } as const;

/** Mismo cálculo que `idDeEndpoint` del navegador, sincrónico. */
export function idDeEndpointServidor(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex").slice(0, 16);
}

function estadoDe(valor: unknown): EstadoCelulares {
  const v = valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Partial<EstadoCelulares>) : {};
  const dispositivos = Array.isArray(v.dispositivos)
    ? v.dispositivos.filter(
        (d): d is CelularSuscrito =>
          !!d && typeof d.endpoint === "string" && typeof d.id === "string" && !!d.keys && typeof d.usuario === "string",
      )
    : [];
  const ultimoPush =
    v.ultimoPush && typeof v.ultimoPush === "object" && !Array.isArray(v.ultimoPush) ? { ...v.ultimoPush } : {};
  return { dispositivos: dispositivos.map((d) => ({ ...d, camaras: { ...(d.camaras ?? {}) } })), ultimoPush };
}

function exigirTenant(tenantId: string): void {
  if (!tenantId) throw new Error("tenantId is required");
}

export type ResultadoSuscribir = { ok: true; estado: EstadoCelulares } | { ok: false; motivo: string };

export const CamarasCelularesDB = {
  async listar(tenantId: string): Promise<EstadoCelulares> {
    exigirTenant(tenantId);
    return estadoDe(await PlatformSettingsDB.get<unknown>(CLAVE(tenantId)));
  },

  /**
   * Prende los avisos de una cámara en un navegador. Si el navegador ya estaba
   * (otra cámara, o lo prendió otro usuario en la misma PC), se actualizan sus
   * claves y pasa a ser de quien lo prendió ahora.
   */
  async suscribir(
    tenantId: string,
    camaraId: string,
    entrada: { endpoint: string; keys: ClavesPush; usuario: string; dispositivo: string; cuando: CuandoCelular },
    ahora: Date = new Date(),
  ): Promise<ResultadoSuscribir> {
    exigirTenant(tenantId);
    const id = idDeEndpointServidor(entrada.endpoint);
    return PlatformSettingsDB.actualizar<unknown, ResultadoSuscribir>(
      CLAVE(tenantId),
      (actual) => {
        const estado = estadoDe(actual);
        const previo = estado.dispositivos.find((d) => d.id === id);
        if (!previo && estado.dispositivos.length >= MAX_CELULARES) {
          return {
            resultado: {
              ok: false,
              motivo: `Ya hay ${MAX_CELULARES} dispositivos recibiendo avisos. Quita alguno que ya no uses.`,
            },
          };
        }
        /* El que se reasigna (mismo navegador, otro usuario) cuenta para el nuevo dueño. */
        const delUsuario = estado.dispositivos.filter((d) => d.id !== id && d.usuario === entrada.usuario).length;
        if (delUsuario >= MAX_CELULARES_POR_USUARIO) {
          return {
            resultado: {
              ok: false,
              motivo: `Ya tienes ${MAX_CELULARES_POR_USUARIO} dispositivos recibiendo avisos. Quita alguno que ya no uses.`,
            },
          };
        }
        const nuevo: CelularSuscrito = {
          id,
          endpoint: entrada.endpoint,
          keys: entrada.keys,
          usuario: entrada.usuario,
          dispositivo: entrada.dispositivo,
          camaras: { ...(previo?.camaras ?? {}), [camaraId]: entrada.cuando },
          creadoEn: previo?.creadoEn ?? ahora.toISOString(),
        };
        const siguiente: EstadoCelulares = {
          ...estado,
          dispositivos: previo ? estado.dispositivos.map((d) => (d.id === id ? nuevo : d)) : [...estado.dispositivos, nuevo],
        };
        return { valor: siguiente, resultado: { ok: true, estado: siguiente } };
      },
      entrada.usuario,
      TX,
    );
  },

  /**
   * Apaga una cámara en un dispositivo (`camaraId`) o el dispositivo entero
   * (`null`). Un dispositivo sin cámaras se borra: no se guardan claves que no
   * avisan nada.
   */
  async quitar(tenantId: string, id: string, camaraId: string | null, usuario: string): Promise<EstadoCelulares> {
    exigirTenant(tenantId);
    return PlatformSettingsDB.actualizar<unknown, EstadoCelulares>(
      CLAVE(tenantId),
      (actual) => {
        const estado = estadoDe(actual);
        if (!estado.dispositivos.some((d) => d.id === id)) return { resultado: estado };
        const dispositivos = estado.dispositivos
          .map((d) => {
            if (d.id !== id) return d;
            if (camaraId === null) return null;
            const camaras = { ...d.camaras };
            delete camaras[camaraId];
            return { ...d, camaras };
          })
          .filter((d): d is CelularSuscrito => !!d && Object.keys(d.camaras).length > 0);
        const siguiente = { ...estado, dispositivos };
        return { valor: siguiente, resultado: siguiente };
      },
      usuario,
      TX,
    );
  },

  /** Borra los que el servicio de push dio por muertos (404/410): el navegador se desuscribió. */
  async olvidarEndpoints(tenantId: string, endpoints: readonly string[]): Promise<void> {
    exigirTenant(tenantId);
    if (endpoints.length === 0) return;
    const fuera = new Set(endpoints);
    await PlatformSettingsDB.actualizar<unknown, null>(
      CLAVE(tenantId),
      (actual) => {
        const estado = estadoDe(actual);
        const dispositivos = estado.dispositivos.filter((d) => !fuera.has(d.endpoint));
        if (dispositivos.length === estado.dispositivos.length) return { resultado: null };
        return { valor: { ...estado, dispositivos }, resultado: null };
      },
      "camara",
      TX,
    );
  },

  /**
   * Toma el turno de avisar de una cámara bajo candado: «apareció» y «llegó
   * otra» llegan con 1-2 s de diferencia, y con el mosaico abierto en dos
   * pantallas cada una sube su foto. Sin esto, dos pushes por la misma persona.
   */
  async reservarTurno(
    tenantId: string,
    camaraId: string,
    ahora: Date,
    puede: (estado: EstadoCelulares, previo: string | null) => boolean,
  ): Promise<{ ok: true; estado: EstadoCelulares; previo: string | null } | { ok: false }> {
    exigirTenant(tenantId);
    const en = ahora.toISOString();
    return PlatformSettingsDB.actualizar<
      unknown,
      { ok: true; estado: EstadoCelulares; previo: string | null } | { ok: false }
    >(
      CLAVE(tenantId),
      (actual) => {
        const estado = estadoDe(actual);
        const previo = estado.ultimoPush[camaraId] ?? null;
        if (!puede(estado, previo)) return { resultado: { ok: false } };
        const siguiente = { ...estado, ultimoPush: { ...estado.ultimoPush, [camaraId]: en } };
        return { valor: siguiente, resultado: { ok: true, estado: siguiente, previo } };
      },
      "camara",
      TX,
    );
  },

  /** Devuelve el turno si no salió ningún push — sólo si nadie lo tomó después. */
  async liberarTurno(tenantId: string, camaraId: string, reservadoEn: Date, previo: string | null): Promise<void> {
    exigirTenant(tenantId);
    const en = reservadoEn.toISOString();
    await PlatformSettingsDB.actualizar<unknown, null>(
      CLAVE(tenantId),
      (actual) => {
        const estado = estadoDe(actual);
        if (estado.ultimoPush[camaraId] !== en) return { resultado: null };
        const ultimoPush = { ...estado.ultimoPush };
        if (previo) ultimoPush[camaraId] = previo;
        else delete ultimoPush[camaraId];
        return { valor: { ...estado, ultimoPush }, resultado: null };
      },
      "camara",
      TX,
    );
  },
};
