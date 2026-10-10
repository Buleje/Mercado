import "server-only";
import { prisma } from "@/lib/prisma";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { ForestCtpDB } from "@/lib/db/forest-ctp.db";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { enPatio } from "@/lib/forestal/patio-por-permiso";
import { aplicarUbicaciones, parsearUbicaciones, soloZonas, type Ubicacion } from "@/lib/forestal/planta-ubicacion";
import { esClaveTroza, type AsignacionPlanta } from "@/lib/forestal/planta-zona-types";

/**
 * ForestPlantaAsignacionDB — dónde está ubicada cada pila o troza (ADR-142
 * follow-up, ADR-465).
 *
 * Mapa `clave → { zonaId, lat?, lng? }`. La clave es el `woodEntryId` de la
 * PILA (la guía entera, como llega y se apila), el id de la corrida o del
 * despacho, o `troza:<id>` para una troza SEPARADA de su pila (manda sobre la
 * de su pila). Va en KV (PlatformSetting) — no fabrica una migración ni agrega
 * columnas. La ubicación es un dato operativo e INFORMATIVO (la madera se
 * mueve): nunca cambia saldo, consumo ni GTF.
 *
 * Toda escritura pasa por `PlatformSettingsDB.actualizar` (lock por clave,
 * lectura de la base sin caché): antes, ubicar diez pilas eran diez PUT que
 * leían la misma lista y cada uno pisaba al anterior — quedaba sólo la última.
 *
 * El formato viejo (el valor era el `zonaId` suelto) se sigue leyendo: la
 * normalización vive en `planta-ubicacion.ts`, que es puro y tiene tests.
 *
 * `tenantId` 1er param. Auditado vía `auditCtp`.
 */

const KEY_PREFIX = "ctp-planta-asignacion:";
/** Las zonas viven en otra clave (`ForestPlantaZonaDB`); se leen frescas dentro del lock. */
const KEY_ZONAS_PREFIX = "ctp-planta-zonas:";
const clave = (tenantId: string) => `${KEY_PREFIX}${tenantId}`;

/** Tope de un PUT por lote: una guía grande son ~80 trozas; 500 cubre un patio entero. */
export const MAX_ASIGNACIONES_POR_LOTE = 500;

/** El cambio apunta a una zona que no existe en este negocio. */
export class ZonaInexistenteError extends Error {
  constructor(readonly zonaId: string) {
    super(`La zona ${zonaId} no existe.`);
    this.name = "ZonaInexistenteError";
  }
}

/** Ids de las zonas guardadas (lectura cruda del KV de zonas). */
function idsDeZonas(raw: unknown): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(raw)) return out;
  for (const z of raw) {
    const id = z && typeof z === "object" ? (z as { id?: unknown }).id : null;
    if (typeof id === "string" && id.trim()) out.add(id.trim());
  }
  return out;
}

const corto = (id: string) => (esClaveTroza(id) ? `troza ${id.slice(6, 14)}` : id.slice(0, 8));

export const ForestPlantaAsignacionDB = {
  /** Ubicación completa (zona + punto) de cada clave ubicada. */
  async getUbicaciones(tenantId: string): Promise<Record<string, Ubicacion>> {
    if (!tenantId) throw new Error("tenantId is required");
    return parsearUbicaciones(await PlatformSettingsDB.get<Record<string, unknown>>(clave(tenantId)));
  },

  /** Vista `clave → zonaId`, que es lo que consume casi todo el módulo. */
  async getMap(tenantId: string): Promise<Record<string, string>> {
    return soloZonas(await this.getUbicaciones(tenantId));
  },

  /**
   * Ubica (o desubica con zonaId=null) UNA clave. Compatibilidad con el PUT
   * viejo `{ entryId, zonaId, lat, lng }`: pasa por `setMany`, así hereda el
   * lock y la validación de la zona.
   */
  async set(
    tenantId: string,
    entryId: string,
    zonaId: string | null,
    user = "unknown",
    pos?: { lat: number; lng: number } | null,
  ): Promise<void> {
    const id = String(entryId ?? "").trim();
    if (!id) throw new Error("entryId is required");
    await this.setMany(tenantId, [{ clave: id, zonaId, lat: pos?.lat ?? null, lng: pos?.lng ?? null }], user);
  },

  /**
   * Aplica VARIAS ubicaciones en UNA lectura y UNA escritura, bajo lock.
   * Una zona inexistente rechaza el lote entero (`ZonaInexistenteError`): mejor
   * un 400 que pilas ubicadas en una cancha que nadie ve.
   *
   * Devuelve cómo quedó cada clave tocada (`null` = quedó sin ubicar).
   */
  async setMany(
    tenantId: string,
    asignaciones: readonly AsignacionPlanta[],
    user = "unknown",
  ): Promise<Record<string, Ubicacion | null>> {
    if (!tenantId) throw new Error("tenantId is required");
    const limpias = asignaciones
      .map((a) => ({ ...a, clave: String(a.clave ?? "").trim(), zonaId: a.zonaId ? String(a.zonaId).trim() || null : null }))
      .filter((a) => a.clave);
    if (limpias.length === 0) return {};
    if (limpias.length > MAX_ASIGNACIONES_POR_LOTE) {
      throw new Error(`Hasta ${MAX_ASIGNACIONES_POR_LOTE} ubicaciones por vez.`);
    }

    const resultado = await PlatformSettingsDB.actualizar<Record<string, unknown>, Record<string, Ubicacion | null>>(
      clave(tenantId),
      async (actual, tx) => {
        if (limpias.some((a) => a.zonaId)) {
          const fila = await tx.platformSetting.findUnique({ where: { key: `${KEY_ZONAS_PREFIX}${tenantId}` }, select: { value: true } });
          const zonas = idsDeZonas(fila?.value);
          const mala = limpias.find((a) => a.zonaId && !zonas.has(a.zonaId));
          if (mala?.zonaId) throw new ZonaInexistenteError(mala.zonaId);
        }
        const next = aplicarUbicaciones(parsearUbicaciones(actual), limpias);
        const out: Record<string, Ubicacion | null> = {};
        for (const a of limpias) out[a.clave] = next[a.clave] ?? null;
        return { valor: next, resultado: out };
      },
      user,
    );

    const ubicadas = limpias.filter((a) => a.zonaId);
    const quitadas = limpias.length - ubicadas.length;
    if (limpias.length === 1) {
      const a = limpias[0];
      auditCtp({
        tenantId,
        action: "ctp_planta_asignar",
        entity: "ForestPlantaZona",
        entityId: a.clave,
        detail: a.zonaId
          ? `Ubicó ${esClaveTroza(a.clave) ? "la" : "el ingreso"} ${corto(a.clave)} en la zona ${a.zonaId.slice(0, 8)}`
          : `Quitó ${esClaveTroza(a.clave) ? "la" : "el ingreso"} ${corto(a.clave)} de su zona`,
        user,
      });
    } else {
      const trozas = ubicadas.filter((a) => esClaveTroza(a.clave)).length;
      const zonas = [...new Set(ubicadas.map((a) => (a.zonaId as string).slice(0, 8)))];
      auditCtp({
        tenantId,
        action: "ctp_planta_asignar_lote",
        entity: "ForestPlantaZona",
        entityId: zonas.length === 1 ? (ubicadas[0].zonaId as string) : "varias",
        detail:
          `Ubicó ${ubicadas.length} (${ubicadas.length - trozas} pila(s), ${trozas} troza(s) separada(s))` +
          (zonas.length ? ` en ${zonas.length === 1 ? "la zona" : "las zonas"} ${zonas.slice(0, 5).join(", ")}` : "") +
          (quitadas ? ` · quitó ${quitadas} del plano` : ""),
        user,
      });
    }
    return resultado;
  },

  /**
   * De las claves CANDIDATAS a huérfanas (no vinieron en las listas del
   * plano), cuáles están muertas DE VERDAD, confirmado por id contra la base:
   *  · troza → no está en el patio (`enPatio`, el mismo predicado del libro);
   *  · ingreso → no existe, se anuló o ya no tiene saldo;
   *  · corrida → no existe, se anuló o ya salió entera;
   *  · despacho → no existe o se anuló.
   * Lo que no aparece en ninguna tabla de ESTE negocio, también.
   *
   * Por qué por id: las listas del plano tienen tope (300 ingresos, 500
   * despachos). Borrar por ausencia en una lista truncada tiraría la ubicación
   * de una pila vieja que sigue en el patio.
   */
  async confirmarMuertas(tenantId: string, candidatas: readonly string[]): Promise<string[]> {
    if (!tenantId) throw new Error("tenantId is required");
    if (candidatas.length === 0) return [];
    const trozaClaves = candidatas.filter(esClaveTroza);
    const trozaIds = trozaClaves.map((c) => c.slice("troza:".length)).filter(Boolean);
    const otras = candidatas.filter((c) => !esClaveTroza(c));

    const [trozas, ingresos, corridas, despachos] = await Promise.all([
      trozaIds.length ? WoodEntriesDB.trozasComoConsumibles(tenantId, { ids: trozaIds }) : Promise.resolve([]),
      otras.length ? ForestCtpDB.availableSource(tenantId, "produccion", { ids: otras }) : Promise.resolve([]),
      otras.length ? ForestCtpDB.availableSource(tenantId, "despacho", { ids: otras }) : Promise.resolve([]),
      otras.length
        ? prisma.forestCtpEntry.findMany({
            where: { tenantId, id: { in: otras }, section: "despacho", status: "registrado", deletedAt: null },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);
    const vivas = new Set<string>([
      ...trozas.filter(enPatio).map((t) => `troza:${t.id}`),
      ...ingresos.map((i) => i.id),
      ...corridas.map((c) => c.id),
      ...despachos.map((d) => d.id),
    ]);
    return candidatas.filter((c) => !vivas.has(c));
  },

  /**
   * Borra ubicaciones huérfanas. `muertas` ya vienen confirmadas por id
   * (`confirmarMuertas`); `zonaMuerta` se RE-VERIFICA dentro del lock contra
   * las zonas leídas de la base: la lista de zonas del GET sale del caché de
   * la instancia y podría no tener una zona recién creada en otra.
   *
   * Devuelve cuántas se borraron.
   */
  async limpiarHuerfanas(
    tenantId: string,
    huerfanas: { muertas: readonly string[]; zonaMuerta: readonly string[] },
    user = "sistema",
  ): Promise<number> {
    if (!tenantId) throw new Error("tenantId is required");
    if (huerfanas.muertas.length === 0 && huerfanas.zonaMuerta.length === 0) return 0;
    const borradas = await PlatformSettingsDB.actualizar<Record<string, unknown>, string[]>(
      clave(tenantId),
      async (actual, tx) => {
        const map = parsearUbicaciones(actual);
        const fuera: string[] = [];
        for (const c of huerfanas.muertas) if (map[c]) fuera.push(c);
        if (huerfanas.zonaMuerta.length) {
          const fila = await tx.platformSetting.findUnique({ where: { key: `${KEY_ZONAS_PREFIX}${tenantId}` }, select: { value: true } });
          const zonas = idsDeZonas(fila?.value);
          for (const c of huerfanas.zonaMuerta) if (map[c] && !zonas.has(map[c].zonaId)) fuera.push(c);
        }
        if (fuera.length === 0) return { resultado: [] };
        for (const c of fuera) delete map[c];
        return { valor: map, resultado: fuera };
      },
      user,
    );
    if (borradas.length > 0) {
      auditCtp({
        tenantId,
        action: "ctp_planta_limpiar",
        entity: "ForestPlantaZona",
        entityId: "huerfanas",
        detail: `Quitó del plano ${borradas.length} ubicación(es) de madera que ya no está en el patio o de zonas borradas: ${borradas.slice(0, 8).map(corto).join(", ")}${borradas.length > 8 ? "…" : ""}`,
        user,
      });
    }
    return borradas.length;
  },

  /**
   * Limpia las asignaciones que apuntan a una zona borrada (evita huérfanas).
   * Devuelve cuántas se limpiaron.
   */
  async clearForZona(tenantId: string, zonaId: string, user = "unknown"): Promise<number> {
    if (!tenantId || !zonaId) return 0;
    return PlatformSettingsDB.actualizar<Record<string, unknown>, number>(
      clave(tenantId),
      (actual) => {
        const map = parsearUbicaciones(actual);
        const antes = Object.keys(map).length;
        for (const [k, u] of Object.entries(map)) if (u.zonaId === zonaId) delete map[k];
        const limpiadas = antes - Object.keys(map).length;
        return limpiadas > 0 ? { valor: map, resultado: limpiadas } : { resultado: 0 };
      },
      user,
    );
  },
};
