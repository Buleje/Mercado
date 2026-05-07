import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

// GET /api/turnos/activo — get currently open turno for authenticated admin
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    // SECURITY 2026-05-07 (T1): scopear por adminUserId del cajero autenticado.
    // Antes devolvia turno de CUALQUIER cajero del tenant → cajero A veia
    // inicioEfectivo y ventasTotal del cajero B (PII financiero del equipo).
    //
    // Excepciones de rol:
    //   - admin/owner/manager pueden ver el turno activo del tenant entero
    //     (necesitan supervisar) — mantenemos el comportamiento original.
    //   - cajero solo ve SU propio turno activo.
    // eslint-disable-next-line no-restricted-properties -- lookup centralizado por username del session payload; refactor a lib/db/admin-users.db.ts pendiente.
    const adminUser = await prisma.adminUser.findFirst({
      where: { tenantId: auth.tenantId, username: auth.username },
      select: { id: true },
    });

    const isManagement = auth.role === "admin" || auth.role === "owner" || auth.role === "manager";
    // eslint-disable-next-line no-restricted-properties -- legacy: pre-existing turno lookup; refactor a TurnosDB.getActivoForUser pendiente.
    const turno = await prisma.turno.findFirst({
      where: {
        tenantId: auth.tenantId,
        status: "ABIERTO",
        ...(isManagement ? {} : { adminUserId: adminUser?.id ?? "__none__" }),
      },
      orderBy: { abrioEn: "desc" },
    });

    if (!turno) {
      return NextResponse.json({ turnoActivo: false, turno: null });
    }

    return NextResponse.json({
      turnoActivo: true,
      turno: {
        id: turno.id,
        adminUserId: turno.adminUserId,
        inicioEfectivo: Number(turno.inicioEfectivo),
        ventasTotal: Number(turno.ventasTotal),
        status: turno.status,
        abrioEn: turno.abrioEn.toISOString(),
        minutosActivo: Math.floor((Date.now() - turno.abrioEn.getTime()) / 60000),
      },
    });
  } catch (e) {
    logger.error("[turnos/activo] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
