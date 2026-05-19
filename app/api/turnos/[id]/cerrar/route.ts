import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TurnosDB } from "@/lib/db/turnos.db";
import { AdminUsersDB } from "@/lib/db/admin-users.db";
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
  // Brandon 2026-05-17 (audit C1): lista de roles explícita. Cerrar turno
  // es una acción financiera — solo personal de staff puede ejecutarla.
  const auth = await requireAdmin(req, ["admin", "owner", "manager", "cajero"]);
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

    // SECURITY 2026-05-17 (audit A1): cajero solo puede cerrar SU turno.
    // Antes cualquier cajero del tenant podía cerrar el turno de otro cajero
    // con un `cierreEfectivo` falsificado → vector de fraude laboral
    // (culpar al compañero por una diferencia inventada).
    // Roles management (admin/owner/manager) siguen pudiendo cerrar cualquier turno.
    //
    // Audit 2026-05-17 B-P0-1: antes se comparaba `existing.adminUserId !== auth.username`
    // pero `Turno.adminUserId` referencia `AdminUser.id` (CUID) mientras
    // `auth.username` es el username del JWT (string humano). Siempre distintos
    // → cajero NUNCA podía cerrar su propio turno (403 garantizado). Ahora
    // resolvemos el id real con AdminUsersDB.resolveIdByUsername (mismo patrón
    // que /api/turnos/activo:25).
    const isCajeroOnly = auth.role === "cajero";
    if (isCajeroOnly) {
      const resolvedId = await AdminUsersDB.resolveIdByUsername(auth.tenantId, auth.username);
      if (!resolvedId || existing.adminUserId !== resolvedId) {
        return NextResponse.json(
          { error: "No tenés permiso para cerrar el turno de otro cajero" },
          { status: 403 },
        );
      }
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

    // T3: cerrar con optimistic lock — si dos requests llegan en paralelo,
    // el segundo recibe null (count === 0) y respondemos 409 (conflict).
    const updated = await TurnosDB.cerrar(id, auth.tenantId, {
      cierreEfectivo: parsed.data.cierreEfectivo,
      ventasTotal: totalVentas,
      notas: parsed.data.notas,
    });

    if (!updated) {
      return NextResponse.json(
        { error: "El turno ya fue cerrado por otro request o no existe" },
        { status: 409 },
      );
    }

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
