import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TurnosDB } from "@/lib/db/turnos.db";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const CreateTurnoSchema = z.object({
  inicioEfectivo: z.number().min(0),
  adminUserId: z.string().optional(),
});

// GET /api/turnos — list turnos for tenant
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
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
  const auth = await requireAdmin(req);
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

    // Resolve AdminUser.id — use provided adminUserId if given, else resolve from session
    let resolvedAdminUserId = parsed.data.adminUserId;
    if (!resolvedAdminUserId) {
      const adminUser = await prisma.adminUser.findFirst({
        where: { tenantId: auth.tenantId, username: auth.username },
        select: { id: true },
      });
      if (!adminUser) {
        return NextResponse.json({ error: "Usuario admin no encontrado" }, { status: 404 });
      }
      resolvedAdminUserId = adminUser.id;
    } else {
      // Verify the provided adminUserId belongs to this tenant
      const targetUser = await prisma.adminUser.findFirst({
        where: { id: resolvedAdminUserId, tenantId: auth.tenantId, active: true },
        select: { id: true },
      });
      if (!targetUser) {
        return NextResponse.json({ error: "Cajero seleccionado no encontrado o inactivo" }, { status: 404 });
      }
    }

    // Verify no open turno exists for this admin
    const activo = await TurnosDB.getActivo(auth.tenantId, resolvedAdminUserId);
    if (activo) {
      return NextResponse.json(
        { error: "Este cajero ya tiene un turno abierto. Ciérralo antes de abrir otro.", turnoActivo: activo },
        { status: 409 },
      );
    }

    const turno = await TurnosDB.abrir({
      tenantId: auth.tenantId,
      adminUserId: resolvedAdminUserId,
      inicioEfectivo: parsed.data.inicioEfectivo,
    });

    logActivity(
      "Abrir", "turno",
      `Turno abierto con S/${parsed.data.inicioEfectivo.toFixed(2)} de efectivo inicial`,
      turno.id, auth.username,
    ).catch(() => {});

    return NextResponse.json(turno, { status: 201 });
  } catch (e) {
    logger.error("[turnos] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
