import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { AdminUsersDB } from "@/lib/db/admin-users.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/pos/metrics
 *
 * Metricas en vivo del turno activo del cajero autenticado. Polling
 * desde POSMetricsStrip cada 30s.
 *
 * SECURITY 2026-05-07 (P0 audit ventas-caja):
 *  - Antes findFirst sin adminUserId devolvia turno de cualquier cajero del
 *    tenant (mismo bug que T1 en /api/turnos/activo) -> cross-cajero leak.
 *  - sale.aggregate sin cashierId sumaba ventas de TODOS los cajeros
 *    (mismo bug que T2 en /api/turnos/[id]/cerrar) -> ventasTotal incorrecto.
 *  - Ambas queries ahora scoped por adminUserId del cajero (excepto roles
 *    management que ven la vista global).
 *
 * ENRIQUECIDO 2026-05-07: ahora devuelve tambien:
 *  - paymentBreakdown: distribucion por metodo de pago.
 *  - topProductos: 3 productos mas vendidos del turno.
 *  - comisionEstimada: % por defecto sobre revenue.
 */

const DEFAULT_COMMISSION_RATE = 2.5; // % sobre revenue (override via CommissionRule pendiente)

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const tenantId = auth.tenantId ?? "main";

  try {
    const adminUserId = await AdminUsersDB.resolveIdByUsername(tenantId, auth.username);
    const isManagement = auth.role === "admin" || auth.role === "owner" || auth.role === "manager";

    // eslint-disable-next-line no-restricted-properties -- legacy: pre-existing turno lookup; refactor a TurnosDB.getActivoForUser pendiente.
    const turno = await prisma.turno.findFirst({
      where: {
        tenantId,
        status: "ABIERTO",
        ...(isManagement ? {} : { adminUserId: adminUserId ?? "__none__" }),
      },
      orderBy: { abrioEn: "desc" },
    });

    if (!turno) {
      return NextResponse.json({ turnoActivo: false });
    }

    const ahora = new Date();
    const turnoMinutos = Math.floor((ahora.getTime() - turno.abrioEn.getTime()) / 60000);

    // eslint-disable-next-line no-restricted-properties -- read scoped por tenantId+cashierId; refactor a SalesDB.summarizeShift pendiente.
    const sales = await prisma.sale.findMany({
      where: {
        tenantId,
        cashierId: turno.adminUserId,
        createdAt: { gte: turno.abrioEn },
      },
      select: {
        total: true,
        payment: true,
        items: { select: { name: true, quantity: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Aggregations en JS (mas barato que 3 round-trips de aggregate +
    // groupBy x2 en DB para los pocos sales del turno actual).
    const payMap = new Map<string, number>();
    const prodMap = new Map<string, number>();
    let totalVentas = 0;

    for (const s of sales) {
      const totalNum = Number(s.total);
      totalVentas += totalNum;
      const method = (s.payment ?? "efectivo").toLowerCase();
      payMap.set(method, (payMap.get(method) ?? 0) + totalNum);
      for (const item of s.items) {
        prodMap.set(item.name, (prodMap.get(item.name) ?? 0) + item.quantity);
      }
    }

    const cantidadVentas = sales.length;
    const ticketPromedio = cantidadVentas > 0 ? totalVentas / cantidadVentas : 0;

    const paymentBreakdown = Array.from(payMap.entries())
      .map(([metodo, total]) => ({
        metodo,
        total: Math.round(total * 100) / 100,
        pct: totalVentas > 0 ? Math.round((total / totalVentas) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    const topProductos = Array.from(prodMap.entries())
      .map(([nombre, cantidad]) => ({ nombre, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 3);

    const comisionEstimada = Math.round(totalVentas * DEFAULT_COMMISSION_RATE) / 100;

    return NextResponse.json({
      turnoActivo: true,
      turnoId: turno.id,
      adminUserId: turno.adminUserId,
      turnoMinutos,
      totalVentas: Math.round(totalVentas * 100) / 100,
      cantidadVentas,
      ticketPromedio: Math.round(ticketPromedio * 100) / 100,
      paymentBreakdown,
      topProductos,
      comisionEstimada,
      comisionRate: DEFAULT_COMMISSION_RATE,
    });
  } catch (e) {
    logger.error("[POS Metrics]", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json(
      { error: "Error al obtener metricas" },
      { status: 500 }
    );
  }
}
