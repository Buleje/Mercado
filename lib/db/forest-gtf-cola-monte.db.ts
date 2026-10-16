import "server-only";
import { randomUUID } from "node:crypto";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { ForestGtfDB } from "@/lib/db/forest-gtf.db";
import {
  aplicarAccion,
  cerrarPorGuiaCaida,
  crearTrabajo,
  esVivo,
  normalizarAlmacen,
  type AccionTrabajo,
  type AlmacenCola,
  type DatosNuevoTrabajo,
  type ResultadoAccion,
  type ResultadoCrear,
} from "@/lib/forestal/gtf-cola-monte";

/**
 * ForestGtfColaMonteDB — la cola «Por imprimir» del monte, por tenant (16-10).
 *
 * POR QUÉ KV: es un pedido de impresión con vida de días (se manda, se imprime,
 * se confirma con la foto), no un movimiento del libro; la guía y su foto ya
 * viven en `ForestGtf` y en los documentos de la guía (ADR-482). Mismo patrón
 * que el talonario de la matricial (`gtf-talonario:<tenantId>`): un
 * `PlatformSetting` por tenant, lectura fresca y escritura con bloqueo por
 * clave (ADR-445) — dos celulares que confirman a la vez no se pisan.
 *
 * La lógica (estados, control del N° de hoja, un vivo por guía) es pura y
 * vive en `lib/forestal/gtf-cola-monte.ts`.
 */

const KEY_PREFIX = "gtf-cola-monte:";

export const claveColaMonte = (tenantId: string): string => `${KEY_PREFIX}${tenantId}`;

const firma = (user: string) => ({ en: new Date().toISOString(), por: user });

export const ForestGtfColaMonteDB = {
  async leer(tenantId: string): Promise<AlmacenCola> {
    if (!tenantId) throw new Error("tenantId is required");
    return normalizarAlmacen(await PlatformSettingsDB.getFresco<unknown>(claveColaMonte(tenantId)));
  },

  /**
   * La cola con los envíos de guías anuladas o borradas DESPUÉS de mandarlas
   * ya cerrados («La guía se anuló»): si no, quedan «Por imprimir» para siempre.
   * Escribe sólo si algo cambió; la lectura de las guías es de este tenant.
   */
  async leerAlDia(tenantId: string): Promise<AlmacenCola> {
    if (!tenantId) throw new Error("tenantId is required");
    const alm = await ForestGtfColaMonteDB.leer(tenantId);
    const ids = [...new Set(alm.trabajos.filter(esVivo).map((t) => t.gtfId))];
    if (!ids.length) return alm;
    const estado = new Map((await ForestGtfDB.estadosPorIds(tenantId, ids)).map((g) => [g.id, g.status] as const));
    const motivos = new Map<string, string>();
    for (const id of ids) {
      if (!estado.has(id)) motivos.set(id, "La guía se borró");
      else if (estado.get(id) === "anulada") motivos.set(id, "La guía se anuló");
    }
    if (!motivos.size) return alm;
    return PlatformSettingsDB.actualizar<unknown, AlmacenCola>(
      claveColaMonte(tenantId),
      (actual) => {
        const r = cerrarPorGuiaCaida(normalizarAlmacen(actual), motivos, firma("sistema"));
        return r.cambiados ? { valor: r.almacen, resultado: r.almacen } : { resultado: r.almacen };
      },
      "sistema",
    );
  },

  /** Mete la guía en la cola (o actualiza su envío pendiente) y, si llega, guarda el celular del monte. */
  async crear(tenantId: string, datos: DatosNuevoTrabajo, contacto: string | null, user = "unknown"): Promise<ResultadoCrear> {
    if (!tenantId) throw new Error("tenantId is required");
    return PlatformSettingsDB.actualizar<unknown, ResultadoCrear>(
      claveColaMonte(tenantId),
      (actual) => {
        const alm = normalizarAlmacen(actual);
        const f = firma(user);
        const conContacto: AlmacenCola = contacto && contacto !== alm.contacto?.numero ? { ...alm, contacto: { numero: contacto, actualizado: f } } : alm;
        const r = crearTrabajo(conContacto, datos, f, randomUUID());
        if (!r.ok) return conContacto === alm ? { resultado: r } : { valor: conContacto, resultado: r };
        return { valor: r.almacen, resultado: r };
      },
      user,
    );
  },

  async accion(tenantId: string, id: string, accion: AccionTrabajo, user = "unknown"): Promise<ResultadoAccion> {
    if (!tenantId) throw new Error("tenantId is required");
    return PlatformSettingsDB.actualizar<unknown, ResultadoAccion>(
      claveColaMonte(tenantId),
      (actual) => {
        const r = aplicarAccion(normalizarAlmacen(actual), id, accion, firma(user));
        return r.ok ? { valor: r.almacen, resultado: r } : { resultado: r };
      },
      user,
    );
  },

  /** El celular del monte («contacto del monte»). Vacío = se olvida. */
  async guardarContacto(tenantId: string, numero: string | null, user = "unknown"): Promise<AlmacenCola["contacto"]> {
    if (!tenantId) throw new Error("tenantId is required");
    return PlatformSettingsDB.actualizar<unknown, AlmacenCola["contacto"]>(
      claveColaMonte(tenantId),
      (actual) => {
        const alm = normalizarAlmacen(actual);
        const contacto = numero ? { numero, actualizado: firma(user) } : null;
        return { valor: { ...alm, contacto }, resultado: contacto };
      },
      user,
    );
  },
};
