import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/delivery/assignments/suggest
 *
 * Sugiere el mejor repartidor disponible para una zona, ordenado por:
 * 1. Coincidencia de zona (exact match primero)
 * 2. Rating más alto
 * 3. Menor carga de trabajo hoy (menos entregas pendientes)
 *
 * Query: ?zone=Calleria&tenantId=xxx (zone optional)
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const zone = searchParams.get("zone") ?? "";

    // Get all active partners
    const partners = await prisma.deliveryPartner.findMany({
      where: { isActive: true, tenantId: auth.tenantId },
      select: {
        id: true,
        name: true,
        phone: true,
        zone: true,
        vehicleType: true,
        rating: true,
        fee: true,
      },
    });

    if (partners.length === 0) {
      return NextResponse.json({ suggestions: [], message: "No hay repartidores activos" });
    }

    // Count pending assignments per partner today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const pendingCounts = await prisma.deliveryAssignment.groupBy({
      by: ["partnerId"],
      where: {
        status: { in: ["assigned", "picked_up", "in_transit"] },
        createdAt: { gte: todayStart },
      },
      _count: { id: true },
    });

    const pendingMap = new Map(pendingCounts.map((p) => [p.partnerId, p._count.id]));

    // Score each partner
    const scored = partners.map((p) => {
      const pending = pendingMap.get(p.id) ?? 0;
      const zoneMatch = zone && p.zone.toLowerCase().includes(zone.toLowerCase()) ? 1 : 0;

      // Score: zone match (50 points) + rating (0-5 scaled to 0-30) + low workload (0-20)
      const score =
        zoneMatch * 50 +
        p.rating * 6 +
        Math.max(0, 20 - pending * 5);

      return { ...p, pending, zoneMatch: Boolean(zoneMatch), score, fee: Number(p.fee) };
    });

    // Sort by score desc
    scored.sort((a, b) => b.score - a.score);

    return NextResponse.json({
      suggestions: scored.slice(0, 5),
      zone: zone || "todas",
    });
  } catch {
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}
