import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { AdminUsersDB } from "@/lib/db/admin-users.db";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/turnos/[id]/summary
 *
 * Devuelve agregados oficiales del turno: metodos de pago, top productos,
 * cantidad de ventas y total. Server-authoritative — antes el frontend
 * hacia GET /api/sales y agregaba en cliente, violando regla critica #6
 * (totales en backend) y trayendo todas las ventas del tenant a memoria
 * del browser.
 *
 * T6 audit ventas-caja 2026-05-07.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _rl = await applyRateLimit(req, "MODERATE", "turnos-X-summary"); if (_rl) return _rl;
  // T9: roles explicitos.
  const auth = await requireAdmin(req, ["admin", "owner", "manager", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    // eslint-disable-next-line no-restricted-properties -- legacy: pre-existing turno lookup; refactor a TurnosDB pendiente.
    const turno = await prisma.turno.findUnique({ where: { id } });
    if (!turno || turno.tenantId !== auth.tenantId) {
      return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });
    }

    // SECURITY 2026-05-17 (audit A2): cajero solo puede ver SU summary.
    // Antes cualquier cajero del tenant podía consultar ventasTotal, top
    // productos y métodos de pago de un compañero. Sigue el mismo patrón
    // que el cierre de turno (A1) y /api/turnos/activo.
    //
    // Audit 2026-05-17 B-P0-1: comparar adminUserId (CUID) con auth.username
    // (string) siempre daba 403. Resolver username → adminUserId con
    // AdminUsersDB.resolveIdByUsername (mismo patrón que activo:25 y cerrar).
    const isCajeroOnly = auth.role === "cajero";
    if (isCajeroOnly) {
      const resolvedId = await AdminUsersDB.resolveIdByUsername(auth.tenantId, auth.username);
      if (!resolvedId || turno.adminUserId !== resolvedId) {
        return NextResponse.json(
          { error: "No tenés permiso para ver el resumen de otro cajero" },
          { status: 403 },
        );
      }
    }

    // T2: scoped por cashierId del turno + ventana temporal abrioEn..(cerroEn|now).
    // Para turnos cerrados usa cerroEn como upper bound; para abiertos usa now.
    const lowerBound = turno.abrioEn;
    const upperBound = turno.cerroEn ?? new Date();

    // eslint-disable-next-line no-restricted-properties -- aggregate scoped por tenantId+cashierId+createdAt; refactor a SalesDB.summarizeShift pendiente.
    const sales = await prisma.sale.findMany({
      where: {
        tenantId: auth.tenantId,
        cashierId: turno.adminUserId,
        createdAt: { gte: lowerBound, lte: upperBound },
      },
      select: {
        id: true,
        total: true,
        payment: true,
        createdAt: true,
        items: {
          select: { name: true, quantity: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Aggregations
    const payMap = new Map<string, number>();
    const prodMap = new Map<string, number>();
    let totalVendido = 0;

    for (const s of sales) {
      const totalNum = Number(s.total);
      totalVendido += totalNum;
      const method = (s.payment ?? "efectivo").toLowerCase();
      payMap.set(method, (payMap.get(method) ?? 0) + totalNum);

      for (const item of s.items) {
        const name = item.name ?? "Producto";
        prodMap.set(name, (prodMap.get(name) ?? 0) + item.quantity);
      }
    }

    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

    const metodosPago = Array.from(payMap.entries())
      .map(([metodo, total]) => ({ metodo: cap(metodo), total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total);

    const topProductos = Array.from(prodMap.entries())
      .map(([nombre, cantidad]) => ({ nombre, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5);

    return NextResponse.json({
      turnoId: turno.id,
      cantidadVentas: sales.length,
      totalVendido: Math.round(totalVendido * 100) / 100,
      metodosPago,
      topProductos,
      periodo: {
        desde: lowerBound.toISOString(),
        hasta: upperBound.toISOString(),
      },
    });
  } catch (e) {
    logger.error("[turnos/id/summary] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
