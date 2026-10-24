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
    const [tenants, settings, partners, activeDeliveries] = await Promise.all([
      prisma.tenant.findMany({ select: { id: true, slug: true, name: true, lat: true, lng: true, active: true, logoUrl: true } }),
      // Ubicación y logo REALES configurados por el negocio (no inventados).
      prisma.settings.findMany({ select: { tenantId: true, businessLat: true, businessLon: true, businessAddress: true, logoUrl: true } }),
      prisma.deliveryPartner.findMany({
        where: { lat: { not: null }, lng: { not: null } },
        select: { id: true, name: true, lat: true, lng: true, isOnline: true, vehicleType: true, zone: true, lastPingAt: true, currentOrderId: true, tenantId: true },
      }),
      prisma.deliveryAssignment.count({ where: { deliveredAt: null } }),
    ]);
    const sMap = new Map(settings.map((s) => [s.tenantId, s]));

    // Coordenadas REALES: las que configuró el negocio (Settings.businessLat/Lon)
    // tienen prioridad; el lat/lng del Tenant (picker del superadmin) es fallback.
    // El logo es el del marketplace (Settings.logoUrl) con fallback al del Tenant.
    const stores: { slug: string; name: string; lat: number; lng: number; active: boolean; logoUrl: string | null; address: string | null; source: "negocio" | "superadmin" }[] = [];
    const unlocated: { slug: string; name: string }[] = [];
    for (const t of tenants) {
      const s = sMap.get(t.id);
      const bizLat = s?.businessLat ?? null;
      const bizLng = s?.businessLon ?? null;
      const lat = bizLat ?? t.lat;
      const lng = bizLng ?? t.lng;
      const logoUrl = s?.logoUrl ?? t.logoUrl ?? null;
      if (lat != null && lng != null) {
        stores.push({ slug: t.slug, name: t.name, lat, lng, active: t.active, logoUrl, address: s?.businessAddress ?? null, source: bizLat != null && bizLng != null ? "negocio" : "superadmin" });
      } else {
        unlocated.push({ slug: t.slug, name: t.name });
      }
    }

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
