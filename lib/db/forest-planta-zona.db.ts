import "server-only";
import { randomUUID } from "node:crypto";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { ForestPlantaCroquisDB } from "@/lib/db/forest-planta-croquis.db";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { geometriaZonaCroquis } from "@/lib/forestal/planta-croquis-guardado";
import { normalizarComponente, normalizeZona, zonaTipoMeta, type ComponenteZona, type PlantaZona, type ZonaCruda } from "@/lib/forestal/planta-zona-types";

/**
 * ForestPlantaZonaDB — zonas físicas del aserradero (Mapa de Planta, ADR-142).
 *
 * POR QUÉ KV: una zona (patio de trozas, aserrado, despacho…) es identidad
 * estable de la planta, no un movimiento del libro. Se guarda como lista en un
 * KV maestro por tenant (`PlatformSetting`), igual que la Ficha del CTP y la geo
 * EUDR — sin fabricar una migración (que necesita DIRECT_URL). No toca las tablas
 * de trazabilidad; el mapa LEE el libro (saldos) pero las zonas viven aparte.
 *
 * `tenantId` 1er param en toda operación. Auditado vía `auditCtp`.
 */

const KEY_PREFIX = "ctp-planta-zonas:";

/** La zona del croquis no se puede medir: polígono roto, fuera del terreno o sin croquis. */
export class ZonaCroquisInvalidaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZonaCroquisInvalidaError";
  }
}

const normalizarLista = (raw: unknown): PlantaZona[] =>
  Array.isArray(raw)
    ? raw.map((z) => normalizeZona((z ?? {}) as Record<string, unknown>)).filter((z) => z.id && z.codigo)
    : [];

export const ForestPlantaZonaDB = {
  /** Todas las zonas del tenant, más nuevas primero por creación. */
  async list(tenantId: string): Promise<PlantaZona[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const raw = await PlatformSettingsDB.get<unknown[]>(`${KEY_PREFIX}${tenantId}`);
    return normalizarLista(raw).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  /**
   * Crea o actualiza una zona (upsert por id). Sin id → crea con uno nuevo.
   *
   * Zona del CROQUIS (`plano: "croquis"`, ADR-465): el polígono va en `[y, x]`
   * metros y el servidor calcula el área con la fórmula PLANA y el centroide —
   * lo que mande el cliente en `areaM2` se ignora (una geodésica sobre metros
   * daría cualquier cosa). Sin croquis, con el polígono roto o fuera del
   * terreno → `ZonaCroquisInvalidaError`.
   *
   * Lee y escribe bajo el lock de la clave (`actualizar`): dos altas a la vez
   * no se pisan (sembrar diez zonas seguidas perdía alguna).
   */
  async save(tenantId: string, input: ZonaCruda, user = "unknown"): Promise<PlantaZona> {
    if (!tenantId) throw new Error("tenantId is required");
    // Siempre: una edición de sólo el nombre de una zona del croquis también
    // recalcula su geometría (y sin el terreno no se puede).
    const croquis = await ForestPlantaCroquisDB.get(tenantId);
    const { zona, isNew } = await PlatformSettingsDB.actualizar<unknown, { zona: PlantaZona; isNew: boolean }>(
      `${KEY_PREFIX}${tenantId}`,
      (actual) => {
        const list = normalizarLista(actual);
        const isNew = !input.id || !list.some((z) => z.id === input.id);
        const existing = isNew ? undefined : list.find((z) => z.id === input.id);
        let zona = normalizeZona({
          ...existing,
          ...input,
          id: isNew ? randomUUID() : String(input.id),
          createdAt: existing?.createdAt,
        });
        if (!zona.codigo) throw new Error("El código de la zona es obligatorio.");
        if (zona.plano === "croquis" && zona.poligono) {
          const g = geometriaZonaCroquis(zona.poligono, croquis);
          if (!g.ok) throw new ZonaCroquisInvalidaError(g.error);
          zona = { ...zona, areaM2: g.areaM2, lat: g.lat, lng: g.lng };
        } else if (zona.plano === "croquis" && !croquis) {
          throw new ZonaCroquisInvalidaError("Primero carga el croquis del aserradero (ancho y alto del terreno).");
        }
        const next = isNew ? [zona, ...list] : list.map((z) => (z.id === zona.id ? zona : z));
        return { valor: next, resultado: { zona, isNew } };
      },
      user,
    );
    auditCtp({
      tenantId,
      action: "ctp_planta_zona_set",
      entity: "ForestPlantaZona",
      entityId: zona.id,
      detail: `${isNew ? "Creó" : "Actualizó"} la zona ${zona.codigo} (${zonaTipoMeta(zona.tipo).label})${zona.plano === "croquis" ? " en el croquis" : ""}${zona.areaM2 != null ? ` · ${Math.round(zona.areaM2)} m²` : ""}`,
      user,
    });
    return zona;
  },

  /**
   * Alta en LOTE de zonas del croquis (importar el PDF del plano): una sola
   * lectura y una sola escritura bajo el lock. Nunca pisa: un código que ya
   * existe (sin importar mayúsculas, en cualquier plano) o un polígono fuera
   * del terreno queda en `omitidas` con su motivo, y el resto se crea igual.
   */
  async crearVarias(
    tenantId: string,
    inputs: ZonaCruda[],
    user = "unknown",
  ): Promise<{ creadas: PlantaZona[]; omitidas: { codigo: string; motivo: string }[] }> {
    if (!tenantId) throw new Error("tenantId is required");
    const croquis = await ForestPlantaCroquisDB.get(tenantId);
    if (!croquis) throw new ZonaCroquisInvalidaError("Primero carga el croquis del aserradero (ancho y alto del terreno).");
    const r = await PlatformSettingsDB.actualizar<unknown, { creadas: PlantaZona[]; omitidas: { codigo: string; motivo: string }[] }>(
      `${KEY_PREFIX}${tenantId}`,
      (actual) => {
        const list = normalizarLista(actual);
        const usados = new Set(list.map((z) => z.codigo.toUpperCase()));
        const creadas: PlantaZona[] = [];
        const omitidas: { codigo: string; motivo: string }[] = [];
        // Un milisegundo menos por zona, en el orden recibido: la lista se ordena por
        // fecha y el mapa dibuja la más vieja ENCIMA. Con la misma fecha para todas el
        // orden dependía del reloj (medido 03-10: la ramada quedó tapando su losa).
        const base = Date.now();
        for (const [i, input] of inputs.entries()) {
          const zona = normalizeZona({ ...input, id: randomUUID(), plano: "croquis", createdAt: new Date(base - i).toISOString() });
          if (!zona.codigo) { omitidas.push({ codigo: "", motivo: "sin código" }); continue; }
          if (usados.has(zona.codigo.toUpperCase())) { omitidas.push({ codigo: zona.codigo, motivo: "ya existe una zona con ese código" }); continue; }
          const g = geometriaZonaCroquis(zona.poligono, croquis);
          if (!g.ok) { omitidas.push({ codigo: zona.codigo, motivo: g.error }); continue; }
          usados.add(zona.codigo.toUpperCase());
          creadas.push({ ...zona, areaM2: g.areaM2, lat: g.lat, lng: g.lng });
        }
        return creadas.length ? { valor: [...creadas, ...list], resultado: { creadas, omitidas } } : { resultado: { creadas, omitidas } };
      },
      user,
    );
    if (r.creadas.length) {
      auditCtp({
        tenantId,
        action: "ctp_planta_zona_set",
        entity: "ForestPlantaZona",
        entityId: r.creadas[0].id,
        detail: `Importó ${r.creadas.length} zonas del croquis desde el PDF del plano: ${r.creadas.slice(0, 12).map((z) => z.codigo).join(", ")}${r.creadas.length > 12 ? "…" : ""}`,
        user,
      });
    }
    return r;
  },

  /**
   * «Identificar la leyenda»: el componente del plano de varias zonas en UNA
   * escritura bajo el lock. Solo toca `componente` (null = lo borra): tipo,
   * código y polígono quedan como estaban. Un id que ya no existe va a `faltan`.
   */
  async asignarComponentes(
    tenantId: string,
    cambios: Array<{ id: string; componente: ComponenteZona | null }>,
    user = "unknown",
  ): Promise<{ actualizadas: PlantaZona[]; faltan: string[] }> {
    if (!tenantId) throw new Error("tenantId is required");
    const r = await PlatformSettingsDB.actualizar<unknown, { actualizadas: PlantaZona[]; faltan: string[] }>(
      `${KEY_PREFIX}${tenantId}`,
      (actual) => {
        const list = normalizarLista(actual);
        const porId = new Map(cambios.map((c) => [c.id, normalizarComponente(c.componente)] as const));
        const actualizadas: PlantaZona[] = [];
        const next = list.map((z) => {
          if (!porId.has(z.id)) return z;
          const comp = porId.get(z.id) ?? null;
          const nz: PlantaZona = { ...z };
          if (comp) nz.componente = comp;
          else delete nz.componente;
          actualizadas.push(nz);
          return nz;
        });
        const vivos = new Set(list.map((z) => z.id));
        const faltan = cambios.filter((c) => !vivos.has(c.id)).map((c) => c.id);
        return actualizadas.length ? { valor: next, resultado: { actualizadas, faltan } } : { resultado: { actualizadas, faltan } };
      },
      user,
    );
    if (r.actualizadas.length) {
      auditCtp({
        tenantId,
        action: "ctp_planta_zona_set",
        entity: "ForestPlantaZona",
        entityId: r.actualizadas[0].id,
        detail: `Identificó con la leyenda del plano ${r.actualizadas.length} zonas del croquis: ${r.actualizadas.slice(0, 12).map((z) => `${z.codigo}${z.componente ? ` (${z.componente.categoria})` : ""}`).join(", ")}${r.actualizadas.length > 12 ? "…" : ""}`,
        user,
      });
    }
    return r;
  },

  /** Borra una zona por id. Devuelve true si existía. */
  async remove(tenantId: string, id: string, user = "unknown"): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!id) return false;
    const zona = await PlatformSettingsDB.actualizar<unknown, PlantaZona | null>(
      `${KEY_PREFIX}${tenantId}`,
      (actual) => {
        const list = normalizarLista(actual);
        const z = list.find((x) => x.id === id) ?? null;
        return z ? { valor: list.filter((x) => x.id !== id), resultado: z } : { resultado: null };
      },
      user,
    );
    if (!zona) return false;
    auditCtp({
      tenantId,
      action: "ctp_planta_zona_delete",
      entity: "ForestPlantaZona",
      entityId: id,
      detail: `Borró la zona ${zona.codigo} (${zonaTipoMeta(zona.tipo).label})`,
      user,
    });
    return true;
  },
};
