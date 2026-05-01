/**
 * Superadmin · Conteo de pedidos pendientes por tenant.
 *
 * GET /api/superadmin/tenants/pending-counts
 *   Devuelve { [tenantIdOrSlug]: count }.
 *
 * NO cacheado — siempre devuelve datos frescos. Vive aparte de
 * `/api/superadmin/tenants` (que usa "use cache" para el resto del payload)
 * para que el badge de notificaciones se actualice al instante cuando llega
 * un pedido nuevo, sin depender de la revalidación de 60s del listado.
 */
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@/lib/generated/prisma/client";
import { logger } from "@/lib/logger";

// NO `"use cache"` — la respuesta debe ser fresca cada vez (badge en vivo).
// Next 16 trata las route handlers como dynamic por default cuando no usan
// "use cache", así que no necesitamos `force-dynamic` (incompatible con
// nextConfig.cacheComponents).

export async function GET(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const session = await getPlatformSession(token);
  if (!session) return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });

  try {
    const grouped = await prisma.order.groupBy({
      by: ["tenantId"],
      where: {
        status: { in: [OrderStatus.pendiente, OrderStatus.confirmado, OrderStatus.en_camino] },
        deletedAt: null,
      },
      _count: { _all: true },
    });

    const counts: Record<string, number> = {};
    for (const r of grouped) counts[r.tenantId] = r._count._all;
    return NextResponse.json({ counts });
  } catch (err) {
    logger.error("[superadmin/tenants/pending-counts] failed", { error: String(err) });
    return NextResponse.json({ error: "Error al cargar conteos" }, { status: 500 });
  }
}

