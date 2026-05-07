import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TurnosDB } from "@/lib/db/turnos.db";
import { toNumOrZero } from "@/lib/decimal-utils";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";

const CerrarTurnoSchema = z.object({
  cierreEfectivo: z.number().min(0),
  notas: z.string().max(1000).optional(),
});

// POST /api/turnos/[id]/cerrar — close turno
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _rl = await applyRateLimit(req, "MODERATE", "turnos-X-cerrar"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const raw = await req.json();
    const parsed = CerrarTurnoSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    // Verify turno exists and belongs to tenant
    // eslint-disable-next-line no-restricted-properties -- legacy: pre-existing turno lookup; refactor a TurnosDB pendiente.
    const existing = await prisma.turno.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== auth.tenantId) {
      return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });
    }
    if (existing.status !== "ABIERTO") {
      return NextResponse.json({ error: "El turno ya está cerrado" }, { status: 422 });
    }

    // SECURITY 2026-05-07 (T2): aggregate scoped por cashierId del turno.
    // Antes sumaba ventas de TODOS los cajeros del tenant durante el periodo →
    // ventasTotal incorrecto en multi-cajero, podia ocultar/fabricar diferencias.
    // Sale.cashierId guarda el adminUserId del cajero que cobro.
    // eslint-disable-next-line no-restricted-properties -- aggregate read scoped por tenantId+cashierId; refactor a SalesDB.aggregateByCashierShift pendiente.
    const ventasTotal = await prisma.sale.aggregate({
      where: {
        tenantId: auth.tenantId,
        cashierId: existing.adminUserId,
        createdAt: { gte: existing.abrioEn },
      },
      _sum: { total: true },
    });
    // TD-018: _sum.total y existing.inicioEfectivo son Decimal
    const totalVentas = toNumOrZero(ventasTotal._sum.total);

    const updated = await TurnosDB.cerrar(id, {
      cierreEfectivo: parsed.data.cierreEfectivo,
      ventasTotal: totalVentas,
      notas: parsed.data.notas,
    });

    if (!updated) return NextResponse.json({ error: "Error al cerrar turno" }, { status: 500 });

    const diferencia = parsed.data.cierreEfectivo - (toNumOrZero(existing.inicioEfectivo) + totalVentas);

    logActivity(
      "Cerrar", "turno",
      `Turno ${id.slice(-6)} cerrado — ventas: S/${totalVentas.toFixed(2)}, diferencia: S/${diferencia.toFixed(2)}`,
      id, auth.username,
    ).catch((err) => logger.warn("[turnos/id/cerrar] activity log failed", { id, err: String(err) }));

    return NextResponse.json({ ...updated, diferencia });
  } catch (e) {
    logger.error("[turnos/id/cerrar] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
