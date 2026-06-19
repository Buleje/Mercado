import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * GET /api/superadmin/map/live — monitoreo en vivo del mapa de operaciones
 * (Brandon 2026-06-19): tiendas geolocalizadas (con logo) + repartidores con su
 * posición GPS (heartbeat lastPingAt cada ~30s) + tráfico por zona + KPIs.
 * Datos REALES de Tenant / DeliveryPartner / DeliveryAssignment. La página
 * polea este endpoint cada ~15s → posiciones casi en tiempo real.
 */

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if ("status" in auth) return auth;

  try {
    const [tenants, partners, activeDeliveries] = await Promise.all([
      prisma.tenant.findMany({ select: { slug: true, name: true, lat: true, lng: true, active: true, logoUrl: true } }),
      prisma.deliveryPartner.findMany({
        where: { lat: { not: null }, lng: { not: null } },
        select: { id: true, name: true, lat: true, lng: true, isOnline: true, vehicleType: true, zone: true, lastPingAt: true, currentOrderId: true, tenantId: true },
      }),
      prisma.deliveryAssignment.count({ where: { deliveredAt: null } }),
    ]);

    const stores = tenants
      .filter((t) => t.lat != null && t.lng != null)
      .map((t) => ({ slug: t.slug, name: t.name, lat: t.lat as number, lng: t.lng as number, active: t.active, logoUrl: t.logoUrl ?? null }));
    const unlocated = tenants
      .filter((t) => t.lat == null || t.lng == null)
      .map((t) => ({ slug: t.slug, name: t.name }));

    const riders = partners.map((p) => ({
      id: p.id,
      name: p.name,
      lat: p.lat as number,
      lng: p.lng as number,
      isOnline: p.isOnline,
      vehicleType: p.vehicleType,
      zone: p.zone || "Sin zona",
      lastPingAt: p.lastPingAt?.toISOString() ?? null,
      onDelivery: !!p.currentOrderId,
    }));

    // Tráfico por zona: cuántos repartidores y cuántos online, con centroide.
    const zoneAgg = new Map<string, { count: number; online: number; latSum: number; lngSum: number }>();
    for (const r of riders) {
      const e = zoneAgg.get(r.zone) ?? { count: 0, online: 0, latSum: 0, lngSum: 0 };
      e.count += 1;
      if (r.isOnline) e.online += 1;
      e.latSum += r.lat;
      e.lngSum += r.lng;
      zoneAgg.set(r.zone, e);
    }
    const zones = Array.from(zoneAgg.entries())
      .map(([zone, e]) => ({ zone, count: e.count, online: e.online, lat: e.latSum / e.count, lng: e.lngSum / e.count }))
      .sort((a, b) => b.count - a.count);

    const kpis = {
      storesLocated: stores.length,
      storesTotal: tenants.length,
      ridersLocated: riders.length,
      ridersOnline: riders.filter((r) => r.isOnline).length,
      onDelivery: riders.filter((r) => r.onDelivery).length,
      activeDeliveries,
      zones: zones.length,
    };

    return NextResponse.json({ stores, unlocated, riders, zones, kpis, generatedAt: new Date().toISOString() });
  } catch (e) {
    logger.error("[superadmin/map/live] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
