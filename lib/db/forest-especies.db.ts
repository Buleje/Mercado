import "server-only";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import {
  CATALOGO_VACIO,
  agregarEspecie,
  editarEspecie,
  normalizarCatalogo,
  quitarEspecie,
  restaurarEspecie,
  type CatalogoEspecies,
  type ResultadoCatalogo,
} from "@/lib/forestal/especies-catalogo";

/**
 * ForestEspeciesDB — el catálogo de especies que edita el aserradero.
 *
 * POR QUÉ KV y no un modelo Prisma (mismo criterio que la biblioteca de fotos y
 * que trámites, ADR-308 §4): son decenas de especies por planta, no miles, y
 * cada entrada es un nombre. Promoverlo a tabla el día que haga falta (sinónimos,
 * CITES por especie, aprobación) es leer el KV e insertar filas —sin fabricar
 * una migración que necesita DIRECT_URL.
 *
 * Los writes se auditan: la especie es lo que el libro declara ante SERFOR, y
 * quién la creó o la sacó de la lista tiene que poder saberse.
 */

const KEY_PREFIX = "ctp-especies-catalogo:";

const clave = (tenantId: string) => `${KEY_PREFIX}${tenantId}`;

/**
 * Lo que el catálogo rechaza por sus propias reglas —una especie repetida, un
 * nombre vacío— y no por una falla del sistema. El route lo traduce a 422 con
 * el motivo tal cual: son mensajes escritos para quien está cargando.
 */
export class EspecieCatalogoError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "EspecieCatalogoError";
  }
}

/** Guarda y deja el rastro. Devuelve el catálogo ya guardado. */
async function aplicar(
  tenantId: string,
  resultado: ResultadoCatalogo,
  user: string,
  detalle: string,
): Promise<{ catalogo: CatalogoEspecies; mensaje: string }> {
  if (!resultado.ok) throw new EspecieCatalogoError(resultado.motivo);
  await PlatformSettingsDB.set(clave(tenantId), resultado.catalogo, user);
  auditCtp({
    tenantId,
    action: "ctp_especie_catalogo",
    entity: "ForestEspecieCatalogo",
    entityId: tenantId,
    detail: detalle,
    user,
  });
  return { catalogo: resultado.catalogo, mensaje: resultado.mensaje };
}

export const ForestEspeciesDB = {
  /** El catálogo del tenant. Nunca `null`: sin nada guardado son las de fábrica. */
  async get(tenantId: string): Promise<CatalogoEspecies> {
    if (!tenantId) throw new Error("tenantId is required");
    const raw = await PlatformSettingsDB.get<unknown>(clave(tenantId));
    return raw ? normalizarCatalogo(raw) : CATALOGO_VACIO;
  },

  async agregar(
    tenantId: string,
    entrada: { nombre: string; cientifico?: string | null },
    user = "unknown",
  ) {
    const actual = await this.get(tenantId);
    const r = agregarEspecie(actual, entrada, { usuario: user });
    return aplicar(tenantId, r, user, `Agregó la especie «${entrada.nombre}» al catálogo`);
  },

  async editar(
    tenantId: string,
    claveEspecie: string,
    cambios: { nombre?: string; cientifico?: string | null },
    user = "unknown",
  ) {
    const actual = await this.get(tenantId);
    const r = editarEspecie(actual, claveEspecie, cambios, { usuario: user });
    return aplicar(
      tenantId,
      r,
      user,
      `Editó la especie «${claveEspecie}»${cambios.nombre ? ` → «${cambios.nombre}»` : ""}`,
    );
  },

  async quitar(tenantId: string, claveEspecie: string, user = "unknown") {
    const actual = await this.get(tenantId);
    const r = quitarEspecie(actual, claveEspecie);
    return aplicar(tenantId, r, user, `Quitó la especie «${claveEspecie}» del catálogo`);
  },

  async restaurar(tenantId: string, claveEspecie: string, user = "unknown") {
    const actual = await this.get(tenantId);
    const r = restaurarEspecie(actual, claveEspecie);
    return aplicar(tenantId, r, user, `Volvió a mostrar la especie «${claveEspecie}»`);
  },
};
