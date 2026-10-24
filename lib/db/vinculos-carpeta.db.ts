import "server-only";
import { z } from "zod";
import { AdminPreferencesDB } from "@/lib/db/admin-preferences.db";
import { ActivityLogDB } from "@/lib/db/activity-log.db";
import { logger } from "@/lib/logger";
import { esTagDeVinculo, leerVinculo } from "@/lib/documentos/terceros-vinculo";
import { TOPE_ALIAS } from "@/lib/documentos/vinculos-sistema";

/**
 * Lo que «Vínculos con el sistema…» guarda aparte de la etiqueta (Brandon 24-10).
 *
 * · El ALIAS («Santa Rosa» por «COMUNIDAD NATIVA SANTA ROSA DE CHIVIS») vive en
 *   `admin_prefs["vinculoAlias:<clave>"] = alias`, UNA clave por tercero: es del
 *   NEGOCIO y del TERCERO (todas sus carpetas lo muestran igual). Una clave por
 *   tercero y no un mapa: `AdminPreferencesDB.write` mezcla en una sentencia sólo
 *   un nivel adentro, y con el mapa entero dos renombres simultáneos se pisaban
 *   (seguridad 24-10: 6 PUT en paralelo, sobrevivió 1). No entra en la etiqueta:
 *   el tope es 40 y la clave ya lo usa entero.
 * · QUIÉN y DESDE CUÁNDO: una fila de `ActivityLog` por carpeta y vínculo al
 *   ligar o quitar. Lo ligado antes del 24-10 no tiene registro y se dice así
 *   (no se inventa la fecha con el `updatedAt` de la carpeta).
 */

const PREFIJO_PREFS = "vinculoAlias:";
/** Lo guardado el 24-10 antes de pasar a una clave por tercero (se sigue leyendo; lo nuevo gana). */
const CLAVE_PREFS_VIEJA = "vinculosAlias";
const Mapa = z.record(z.string().min(3).max(80), z.string().min(1).max(TOPE_ALIAS));
const Alias = z.string().min(1).max(TOPE_ALIAS);

export const ENTIDAD_CARPETA = "DocumentFolder";
export const ACCION_LIGAR = "VINCULO_LIGAR";
export const ACCION_QUITAR = "VINCULO_QUITAR";
const Detalle = z.object({ clave: z.string() });

export interface RegistroVinculo {
  clave: string;
  accion: "ligar" | "quitar";
  por: string;
  cuando: string;
}

export const VinculosCarpetaDB = {
  /** Los alias del negocio (vacío si nunca se puso uno o el JSON no es válido). */
  async alias(tenantId: string): Promise<Record<string, string>> {
    if (!tenantId) throw new Error("tenantId is required");
    const prefs = await AdminPreferencesDB.read(tenantId);
    const viejo = Mapa.safeParse(prefs[CLAVE_PREFS_VIEJA]);
    const mapa: Record<string, string> = viejo.success ? { ...viejo.data } : {};
    for (const [k, v] of Object.entries(prefs)) {
      if (!k.startsWith(PREFIJO_PREFS)) continue;
      const clave = k.slice(PREFIJO_PREFS.length);
      const alias = Alias.safeParse(v);
      // `null` = quitado (también tapa un alias del mapa viejo).
      if (alias.success) mapa[clave] = alias.data;
      else delete mapa[clave];
    }
    return mapa;
  },

  /** Los alias de esas claves solamente (quien mira no se entera de terceros de carpetas que no ve). */
  async aliasDe(tenantId: string, claves: readonly string[]): Promise<Record<string, string>> {
    if (claves.length === 0) return {};
    const todos = await this.alias(tenantId);
    return Object.fromEntries(claves.filter((c) => todos[c]).map((c) => [c, todos[c]]));
  },

  /**
   * Pone (o quita, con `null`) el alias de un tercero: una sola clave en una
   * sola sentencia, así renombrar dos terceros a la vez no pisa a ninguno.
   */
  async ponerAlias(tenantId: string, clave: string, alias: string | null): Promise<string | null> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!leerVinculo(clave)) throw new Error("clave inválida");
    const limpio = alias?.replace(/\s+/g, " ").trim().slice(0, TOPE_ALIAS) || null;
    await AdminPreferencesDB.write(tenantId, { [`${PREFIJO_PREFS}${clave}`]: limpio });
    return limpio;
  },

  /**
   * Una fila de registro por carpeta y vínculo que cambió. Se ESPERA (en
   * paralelo, ~120 ms): la ventana relee el registro apenas vuelve el lote y,
   * sin esperar, decía «sin registro» de lo recién ligado. Si una fila falla se
   * anota en el log y el lote sigue (el vínculo ya quedó guardado).
   */
  async registrar(tenantId: string, args: { carpetaIds: readonly string[]; accion: "addTags" | "removeTags"; tags: readonly string[]; user: string }): Promise<void> {
    const claves = [...new Set(args.tags.map((t) => t.trim().toLowerCase()).filter(esTagDeVinculo))];
    if (claves.length === 0 || args.carpetaIds.length === 0) return;
    const action = args.accion === "addTags" ? ACCION_LIGAR : ACCION_QUITAR;
    const filas = args.carpetaIds.flatMap((entityId) => claves.map((clave) => ({ entityId, clave })));
    const hechos = await Promise.allSettled(
      filas.map(({ entityId, clave }) => ActivityLogDB.create(tenantId, { action, entity: ENTIDAD_CARPETA, entityId, detail: JSON.stringify({ clave }), user: args.user })),
    );
    hechos.forEach((h, i) => {
      if (h.status === "rejected") logger.error("[vinculos-carpeta] no se registró el vínculo", { tenantId, ...filas[i], error: String(h.reason) });
    });
  },

  /** Lo registrado de la carpeta, lo último primero. */
  async historial(tenantId: string, carpetaId: string): Promise<RegistroVinculo[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await ActivityLogDB.list(tenantId, { entity: ENTIDAD_CARPETA, entityId: carpetaId, limit: 100 });
    return filas.flatMap((f) => {
      if (f.action !== ACCION_LIGAR && f.action !== ACCION_QUITAR) return [];
      let detalle: unknown = null;
      try {
        detalle = JSON.parse(f.detail);
      } catch (err) {
        logger.warn("[vinculos-carpeta] registro sin JSON", { id: f.id, error: String(err) });
      }
      const d = Detalle.safeParse(detalle);
      if (!d.success) return [];
      return [{ clave: d.data.clave, accion: f.action === ACCION_LIGAR ? "ligar" : "quitar", por: f.user, cuando: new Date(f.createdAt).toISOString() }];
    });
  },
};

/** Desde cuándo y quién: el último «ligar» de cada clave (si se quitó después, ya no cuenta). */
export function desdeYPor(historial: readonly RegistroVinculo[]): Record<string, { desde: string; por: string }> {
  const out: Record<string, { desde: string; por: string }> = {};
  const vistas = new Set<string>();
  for (const r of historial) {
    if (vistas.has(r.clave)) continue;
    vistas.add(r.clave);
    if (r.accion === "ligar") out[r.clave] = { desde: r.cuando, por: r.por };
  }
  return out;
}
