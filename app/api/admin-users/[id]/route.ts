export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prismaForTenant } from "@/lib/tenant";
import { hash } from "bcryptjs";
import { z } from "zod";
import { logActivity } from "@/lib/activity-logger";
import { toErrorPayload, newTraceId, NotFoundError } from "@/lib/api-error";

const UpdateSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  role: z.enum(["admin", "cajero", "almacenero"]).optional(),
  password: z.string().min(6).optional(),
  active: z.boolean().optional(),
});

// GET /api/admin-users/[id] – obtener un usuario por id
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin"]);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const db = prismaForTenant(auth.tenantId);

    const user = await db.adminUser.findFirst({
      where: { id },
      select: { id: true, username: true, role: true, name: true, active: true, createdAt: true, updatedAt: true },
    });

    if (!user) throw new NotFoundError("usuario_admin");

    return NextResponse.json(user);
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

// PATCH /api/admin-users/[id] – actualizar nombre, rol, contraseña o estado
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin"]);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const body = await req.json();
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const db = prismaForTenant(auth.tenantId);

    const existing = await db.adminUser.findFirst({ where: { id } });
    if (!existing) throw new NotFoundError("usuario_admin");

    const { password, ...rest } = parsed.data;
    const updateData: Record<string, unknown> = { ...rest };
    if (password) updateData.passwordHash = await hash(password, 12);

    const updated = await db.adminUser.update({
      where: { id },
      data: updateData,
      select: { id: true, username: true, role: true, name: true, active: true },
    });

    if (parsed.data.role && parsed.data.role !== existing.role) {
      logActivity("Cambiar rol", "usuario_admin", `Rol de '${existing.username}' cambiado de '${existing.role}' a '${parsed.data.role}'`, id, auth.username).catch(() => {});
    } else if (parsed.data.active !== undefined && parsed.data.active !== existing.active) {
      const action = parsed.data.active ? "Activar" : "Desactivar";
      logActivity(action, "usuario_admin", `Usuario '${existing.username}' ${parsed.data.active ? "activado" : "desactivado"}`, id, auth.username).catch(() => {});
    } else if (password) {
      logActivity("Cambiar contraseña", "usuario_admin", `Contraseña de '${existing.username}' actualizada`, id, auth.username).catch(() => {});
    }

    return NextResponse.json(updated);
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

// DELETE /api/admin-users/[id] – eliminar un miembro del equipo
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin"]);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const db = prismaForTenant(auth.tenantId);

    const existing = await db.adminUser.findFirst({ where: { id } });
    if (!existing) throw new NotFoundError("usuario_admin");

    await db.adminUser.delete({ where: { id } });
    logActivity("Eliminar", "usuario_admin", `Usuario '${existing.username}' (rol: ${existing.role}) eliminado`, id, auth.username).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
