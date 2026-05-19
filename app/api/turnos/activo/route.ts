import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { AdminUsersDB } from "@/lib/db/admin-users.db";

// GET /api/turnos/activo — get currently open turno for authenticated admin
export async function GET(req: NextRequest) {
  // Brandon 2026-05-17 (audit C1): lista explícita de roles. El comentario
  // de seguridad de más abajo asume role admin/owner/manager/cajero — no
  // permitir que proveedor/repartidor/vendor lleguen acá sin filtro.
  const auth = await requireAdmin(req, ["admin", "owner", "manager", "cajero"]);
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
    // T4: lookup centralizado en AdminUsersDB (regla #1).
    const adminUserId = await AdminUsersDB.resolveIdByUsername(auth.tenantId, auth.username);

    const isManagement = auth.role === "admin" || auth.role === "owner" || auth.role === "manager";
    const turno = await prisma.turno.findFirst({
      where: {
        tenantId: auth.tenantId,
        status: "ABIERTO",
        ...(isManagement ? {} : { adminUserId: adminUserId ?? "__none__" }),
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
