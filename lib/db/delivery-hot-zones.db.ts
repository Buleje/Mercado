/**
 * lib/db/delivery-hot-zones.db.ts
 *
 * Calcula zonas de alta demanda (hot zones) para la app del repartidor.
 * Las zonas se derivan del texto libre de `Order.customerLocation` usando
 * alias case-insensitive contra las 6 zonas conocidas de Pucallpa.
 *
 * Cache: "use cache" Next 16 — revalidate 300s (5 min), tag `hot-zones`.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { cacheLife, cacheTag } from "next/cache";
import { logger } from "@/lib/logger";

// ── Zonas hardcoded ────────────────────────────────────────────────────────────

interface ZoneDef {
  id: string;
  name: string;
  lat: number;
  lng: number;
  mockKm: number;
  aliases: string[];
}

const ZONES: ZoneDef[] = [
  {
    id: "yarinacocha",
    name: "Yarinacocha",
    lat: -8.336,
    lng: -74.586,
    mockKm: 2.4,
    aliases: ["yarinacocha", "yarino", "yari"],
  },
  {
    id: "centro",
    name: "Centro Pucallpa",
    lat: -8.379,
    lng: -74.553,
    mockKm: 1.1,
    aliases: ["centro", "pucallpa centro", "plaza"],
  },
  {
    id: "manantay",
    name: "Manantay",
    lat: -8.421,
    lng: -74.527,
    mockKm: 4.8,
    aliases: ["manantay"],
  },
  {
    id: "calleria",
    name: "Callería",
    lat: -8.387,
    lng: -74.543,
    mockKm: 3.2,
    aliases: ["calleria", "callería"],
  },
  {
    id: "san-fernando",
    name: "San Fernando",
    lat: -8.356,
    lng: -74.572,
    mockKm: 5.5,
    aliases: ["san fernando", "fernando"],
  },
  {
    id: "pucallpa-norte",
    name: "Pucallpa Norte",
    lat: -8.341,
    lng: -74.555,
    mockKm: 6.1,
    aliases: ["pucallpa norte", "norte"],
  },
];

// ── Tipos públicos ─────────────────────────────────────────────────────────────

export interface HotZone {
  id: string;
  name: string;
  heat: "high" | "medium" | "low";
  pendingOrders: number;
  avgFee: number;
  distanceKm: number;
  bonus: string | null;
}

// ── Haversine ──────────────────────────────────────────────────────────────────

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── DB class ───────────────────────────────────────────────────────────────────

export const DeliveryHotZonesDb = {
  /**
   * Retorna las 6 zonas de Pucallpa con métricas de demanda actuales.
   *
   * @param tenantId  Tenant del repartidor (aislamiento multi-tenant)
   * @param partnerLat  Latitud actual del repartidor (opcional)
   * @param partnerLng  Longitud actual del repartidor (opcional)
   */
  async getHotZones(
    tenantId: string,
    partnerLat?: number,
    partnerLng?: number,
  ): Promise<HotZone[]> {
    "use cache";
    cacheLife({ revalidate: 300, stale: 60, expire: 600 });
    cacheTag("hot-zones");

    // Traer todas las órdenes pendientes/confirmadas del tenant de una sola vez
    // para evitar N+1 (una query por zona).
    const pendingOrders = await prisma.order.findMany({
      where: {
        tenantId,
        status: { in: ["pendiente", "confirmado"] },
      },
      select: {
        customerLocation: true,
        total: true,
      },
    });

    const results: HotZone[] = ZONES.map((zone) => {
      // Filtrar órdenes cuyo customerLocation coincida con algún alias
      const matching = pendingOrders.filter((o) => {
        const loc = o.customerLocation.toLowerCase();
        return zone.aliases.some((alias) => loc.includes(alias));
      });

      const count = matching.length;

      // avgFee — promedio de `total`, fallback S/7.50
      const avgFee =
        count > 0
          ? matching.reduce((sum, o) => sum + Number(o.total), 0) / count
          : 7.5;

      // heat
      const heat: HotZone["heat"] =
        count >= 8 ? "high" : count >= 4 ? "medium" : "low";

      // distanceKm — Haversine si coords disponibles, mock si no
      const hasCoords =
        partnerLat !== undefined &&
        partnerLng !== undefined &&
        Number.isFinite(partnerLat) &&
        Number.isFinite(partnerLng);

      const distanceKm = hasCoords
        ? Math.round(
            haversineKm(partnerLat!, partnerLng!, zone.lat, zone.lng) * 10,
          ) / 10
        : zone.mockKm;

      // bonus — solo Yarinacocha con alta demanda (regla mock lluvia)
      const bonus =
        zone.id === "yarinacocha" && heat === "high" ? "Lluvia +25%" : null;

      return {
        id: zone.id,
        name: zone.name,
        heat,
        pendingOrders: count,
        avgFee: Math.round(avgFee * 100) / 100,
        distanceKm,
        bonus,
      };
    });

    logger.info("delivery.hot-zones.read", {
      totalZones: results.length,
      partnerLat,
      tenantId,
    });

    return results;
  },
};
