import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TurnosDB } from "@/lib/db/turnos.db";
import { AdminUsersDB } from "@/lib/db/admin-users.db";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

const CreateTurnoSchema = z.object({
  inicioEfectivo: z.number().min(0),
  adminUserId: z.string().optional(),
  // T5: multi-caja real — opcional para compat con turnos legados.
  cashRegisterId: z.string().min(1).max(120).optional(),
});

// GET /api/turnos — list turnos for tenant
export async function GET(req: NextRequest) {
  // T9 (audit ventas-caja 2026-05-07): roles explicitos. Antes cualquier rol
  // con sesion admin (proveedor, repartidor) podia listar/abrir turnos.
  const auth = await requireAdmin(req, ["admin", "owner", "manager", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const adminUserId = searchParams.get("adminUserId") ?? undefined;
    const status = searchParams.get("status") ?? undefined;

    const turnos = await TurnosDB.list(auth.tenantId, { status, adminUserId });

    return NextResponse.json(turnos, {
      headers: { "X-Total-Count": String(turnos.length) },
    });
  } catch (e) {
    logger.error("[turnos] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// POST /api/turnos — open new turno
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "turnos"); if (_rl) return _rl;
  // T9 (audit ventas-caja 2026-05-07): roles explicitos. Antes cualquier rol
  // con sesion admin (proveedor, repartidor) podia listar/abrir turnos.
  const auth = await requireAdmin(req, ["admin", "owner", "manager", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json();
    const parsed = CreateTurnoSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    // T4: lookup centralizado en AdminUsersDB (regla #1).
    let resolvedAdminUserId = parsed.data.adminUserId;
    if (!resolvedAdminUserId) {
      const id = await AdminUsersDB.resolveIdByUsername(auth.tenantId, auth.username);
      if (!id) {
        return NextResponse.json({ error: "Usuario admin no encontrado" }, { status: 404 });
      }
      resolvedAdminUserId = id;
    } else {
      const valid = await AdminUsersDB.verifyActiveInTenant(auth.tenantId, resolvedAdminUserId);
      if (!valid) {
        return NextResponse.json({ error: "Cajero seleccionado no encontrado o inactivo" }, { status: 404 });
      }
    }

    // T5: si se especifica cashRegisterId, scopear el lookup al register.
    // Asi un cajero puede abrir turnos en distintos registers sin colision.
    const activo = await TurnosDB.getActivo(
      auth.tenantId,
      resolvedAdminUserId,
      parsed.data.cashRegisterId,
    );
    if (activo) {
      return NextResponse.json(
        { error: "Este cajero ya tiene un turno abierto. Ciérralo antes de abrir otro.", turnoActivo: activo },
        { status: 409 },
      );
    }

    const turno = await TurnosDB.abrir({
      tenantId: auth.tenantId,
      adminUserId: resolvedAdminUserId,
      cashRegisterId: parsed.data.cashRegisterId,
      inicioEfectivo: parsed.data.inicioEfectivo,
    });

    logActivity(
      "Abrir", "turno",
      `Turno abierto con S/${parsed.data.inicioEfectivo.toFixed(2)} de efectivo inicial`,
      turno.id, auth.username,
    ).catch((err) => logger.warn("[turnos] activity log failed", { turnoId: turno.id, err: String(err) }));

    return NextResponse.json(turno, { status: 201 });
  } catch (e) {
    logger.error("[turnos] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
