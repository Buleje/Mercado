import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * GET /api/superadmin/repartidores/overview — panorama EJECUTIVO de la flota
 * cross-tenant (funciones de alto nivel, Brandon 2026-06-19):
 *  - KPIs de flota: activos/online, rating y aceptación promedio, entregas 24h/7d,
 *    tiempo medio de entrega.
 *  - SOS activos (seguridad).
 *  - Top repartidores (leaderboard) + en riesgo (rating/aceptación/inactividad).
 *  - Cobertura por zona.
 * Datos REALES de DeliveryPartner / DeliveryAssignment / DeliverySOSAlert.
 */

async function authSuperadmin(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

export async function GET(req: NextRequest) {
  const session = await authSuperadmin(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const now = Date.now();
    const ago24h = new Date(now - 24 * 3_600_000);
    const ago7d = new Date(now - 7 * 86_400_000);

    const [partners, tenants, deliveries24h, deliveries7d, recentDelivered, activeSos] = await Promise.all([
      prisma.deliveryPartner.findMany({
        take: 1000,
        select: {
          id: true, name: true, zone: true, vehicleType: true, isActive: true, isOnline: true,
          rating: true, acceptanceRate: true, totalAccepted: true, totalOffers: true,
          lastPingAt: true, tenantId: true,
        },
      }),
      prisma.tenant.findMany({ select: { id: true, name: true } }),
      prisma.deliveryAssignment.count({ where: { deliveredAt: { gte: ago24h } } }),
      prisma.deliveryAssignment.count({ where: { deliveredAt: { gte: ago7d } } }),
      prisma.deliveryAssignment.findMany({
        where: { deliveredAt: { gte: ago7d } },
        orderBy: { deliveredAt: "desc" },
        take: 300,
        select: { createdAt: true, deliveredAt: true },
      }),
      prisma.deliverySOSAlert.findMany({
        where: { status: "active" },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, partnerId: true, message: true, createdAt: true },
      }),
    ]);

    const tenantName = new Map(tenants.map((t) => [t.id, t.name]));
    const partnerName = new Map(partners.map((p) => [p.id, p.name]));
    const active = partners.filter((p) => p.isActive);

    // ── KPIs de flota ───────────────────────────────────────────────────────────
    const onlineCount = active.filter((p) => p.isOnline).length;
    const ratedActive = active.filter((p) => typeof p.rating === "number");
    const avgRating = ratedActive.length
      ? ratedActive.reduce((s, p) => s + p.rating, 0) / ratedActive.length
      : null;
    const avgAcceptance = active.length
      ? active.reduce((s, p) => s + (p.acceptanceRate ?? 0), 0) / active.length
      : null;
    const totalDeliveries = partners.reduce((s, p) => s + (p.totalAccepted ?? 0), 0);
    const durations = recentDelivered
      .map((d) => (d.deliveredAt ? (d.deliveredAt.getTime() - d.createdAt.getTime()) / 60_000 : null))
      .filter((m): m is number => m !== null && m > 0 && m < 24 * 60);
    const avgDeliveryMin = durations.length
      ? Math.round(durations.reduce((s, m) => s + m, 0) / durations.length)
      : null;

    const fleet = {
      total: partners.length,
      active: active.length,
      online: onlineCount,
      pending: partners.filter((p) => !p.isActive).length,
      onlinePct: active.length ? Math.round((onlineCount / active.length) * 100) : 0,
      avgRating,
      avgAcceptance,
      totalDeliveries,
      deliveries24h,
      deliveries7d,
      avgDeliveryMin,
    };

    // ── SOS activos ─────────────────────────────────────────────────────────────
    const sos = activeSos.map((s) => ({
      id: s.id,
      partnerId: s.partnerId,
      name: partnerName.get(s.partnerId) ?? s.partnerId,
      message: s.message,
      createdAt: s.createdAt.toISOString(),
    }));

    // ── Leaderboard: top por entregas (activos) ─────────────────────────────────
    const topPerformers = [...active]
      .sort((a, b) => (b.totalAccepted ?? 0) - (a.totalAccepted ?? 0))
      .slice(0, 5)
      .map((p) => ({
        id: p.id, name: p.name, zone: p.zone, rating: p.rating,
        acceptanceRate: p.acceptanceRate, totalAccepted: p.totalAccepted,
        tenant: tenantName.get(p.tenantId) ?? null, isOnline: p.isOnline,
      }));

    // ── En riesgo: rating bajo / aceptación baja / inactividad ───────────────────
    const atRisk = active
      .map((p) => {
        const reasons: string[] = [];
        if (p.rating < 4.0 && (p.totalAccepted ?? 0) >= 5) reasons.push(`rating ${p.rating.toFixed(1)}`);
        if ((p.acceptanceRate ?? 1) < 0.6 && (p.totalOffers ?? 0) >= 5) reasons.push(`aceptación ${Math.round((p.acceptanceRate ?? 0) * 100)}%`);
        const pingAgeDays = p.lastPingAt ? (now - p.lastPingAt.getTime()) / 86_400_000 : Infinity;
        if (!p.isOnline && pingAgeDays > 7) reasons.push(p.lastPingAt ? `sin conexión ${Math.floor(pingAgeDays)}d` : "nunca se conectó");
        return { id: p.id, name: p.name, zone: p.zone, rating: p.rating, acceptanceRate: p.acceptanceRate, lastPingAt: p.lastPingAt?.toISOString() ?? null, tenant: tenantName.get(p.tenantId) ?? null, reasons };
      })
      .filter((p) => p.reasons.length > 0)
      .sort((a, b) => b.reasons.length - a.reasons.length || a.rating - b.rating)
      .slice(0, 8);

    // ── Cobertura por zona ──────────────────────────────────────────────────────
    const zoneAgg = new Map<string, { count: number; online: number; ratingSum: number }>();
    for (const p of active) {
      const z = p.zone || "Sin zona";
      const e = zoneAgg.get(z) ?? { count: 0, online: 0, ratingSum: 0 };
      e.count += 1;
      if (p.isOnline) e.online += 1;
      e.ratingSum += p.rating;
      zoneAgg.set(z, e);
    }
    const byZone = Array.from(zoneAgg.entries())
      .map(([zone, e]) => ({ zone, count: e.count, online: e.online, avgRating: e.ratingSum / e.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return NextResponse.json({ fleet, sos, topPerformers, atRisk, byZone });
  } catch (err) {
    logger.error("[superadmin/repartidores/overview] error", { error: String(err) });
    return NextResponse.json({ error: "Error al cargar el panorama" }, { status: 500 });
  }
}
