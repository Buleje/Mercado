import "server-only";
import { prisma } from "@/lib/prisma";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { normalizeOrigenGeo, type OrigenGeo } from "@/lib/forestal/eudr-types";

/**
 * ForestOrigenGeoDB — geolocalización de los orígenes de materia prima (ADR-140).
 *
 * POR QUÉ EXISTE:
 * la EUDR exige geolocalizar la PARCELA de cosecha para colocar madera en la UE.
 * El CTP conoce el origen por TEXTO (`WoodEntry.originCode`), sin coordenadas.
 * La geolocalización es estable por origen (una concesión no cambia de polígono
 * por ingreso), así que se guarda por `originCode` en un KV maestro — sin
 * duplicarla en cada fila ni fabricar una migración (patrón ForestCtpFicha).
 *
 * `tenantId` 1er param. La única vía a Prisma para leer los orígenes existentes;
 * la geo persiste en `PlatformSetting` vía `PlatformSettingsDB`.
 */

const KEY_PREFIX = "ctp-origen-geo:";

export const ForestOrigenGeoDB = {
  /** Mapa `originCode → OrigenGeo` del tenant. */
  async getMap(tenantId: string): Promise<Record<string, OrigenGeo>> {
    if (!tenantId) throw new Error("tenantId is required");
    const raw = await PlatformSettingsDB.get<Record<string, unknown>>(`${KEY_PREFIX}${tenantId}`);
    const out: Record<string, OrigenGeo> = {};
    if (raw && typeof raw === "object") {
      for (const [code, v] of Object.entries(raw)) {
        const g = normalizeOrigenGeo({ ...(v as object), originCode: code });
        if (g.originCode) out[g.originCode] = g;
      }
    }
    return out;
  },

  /** Guarda/actualiza la geo de un origen (merge sobre lo existente). */
  async set(tenantId: string, input: OrigenGeo, user = "unknown"): Promise<OrigenGeo> {
    if (!tenantId) throw new Error("tenantId is required");
    const code = String(input.originCode ?? "").trim();
    if (!code) throw new Error("originCode is required");
    const map = await this.getMap(tenantId);
    const merged = normalizeOrigenGeo({ ...map[code], ...input, originCode: code, updatedAt: new Date().toISOString() });
    map[code] = merged;
    await PlatformSettingsDB.set(`${KEY_PREFIX}${tenantId}`, map, user);
    auditCtp({
      tenantId,
      action: "ctp_origen_geo_set",
      entity: "ForestOrigenGeo",
      entityId: code,
      detail: `Geolocalizó el origen ${code}${merged.lat != null && merged.lng != null ? ` · ${merged.lat}, ${merged.lng}` : merged.polygonJson ? " · polígono" : " · sin coordenadas"}${merged.deforestationFree ? " · sin deforestación (post-2020)" : ""}`,
      user,
    });
    return merged;
  },

  /**
   * Orígenes DISTINTOS que aparecen en los ingresos vivos (validado/procesado/
   * pendiente) — los que el editor tiene que geolocalizar. Cruza con el mapa geo
   * para marcar cuáles ya tienen coordenadas.
   */
  async distinctOrigins(tenantId: string): Promise<{ originCode: string; originType: string | null; region: string | null; ingresos: number }[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const rows = await prisma.woodEntry.groupBy({
      by: ["originCode", "originType", "originRegion"],
      where: { tenantId, deletedAt: null, status: { in: ["validado", "procesado", "pendiente"] }, originCode: { not: null } },
      _count: { _all: true },
    });
    return rows
      .filter((r) => (r.originCode ?? "").trim())
      .map((r) => ({ originCode: (r.originCode ?? "").trim(), originType: r.originType ?? null, region: r.originRegion ?? null, ingresos: r._count._all }))
      .sort((a, b) => b.ingresos - a.ingresos);
  },
};
