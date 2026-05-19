import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prismaForTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { z } from "zod";
import { newPasswordSchema, newPasswordSchemaOptional } from "@/lib/auth/password-schema";
import { getPlanLimits, withinLimit, planLimitPayload } from "@/lib/plans";
import { enqueueActivityLog } from "@/lib/queue";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const CreateSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-z0-9_.]+$/i, "Solo letras, números, punto y guión bajo"),
  password: newPasswordSchema,
  role: z.enum(["admin", "cajero", "almacenero"]),
  name: z.string().min(1).max(64),
});

const UpdateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(64).optional(),
  role: z.enum(["admin", "cajero", "almacenero"]).optional(),
  password: newPasswordSchemaOptional,
  active: z.boolean().optional(),
});

// GET /api/admin-users – list all users in the current tenant
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const db = prismaForTenant(auth.tenantId);
  const users = await db.adminUser.findMany({
    select: { id: true, username: true, role: true, name: true, active: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(users);
}

// POST /api/admin-users – create a new team member
export async function POST(req: NextRequest) {
  const rateLimitResult = applyRateLimit(req, "STRICT", "admin-users-post");
  if (rateLimitResult) return rateLimitResult;

  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { username, password, role, name } = parsed.data;
  const db = prismaForTenant(auth.tenantId);

  try {
    // Plan limit check
    const tenant = await prisma.tenant.findFirst({ where: { OR: [{ id: auth.tenantId }, { slug: auth.tenantId }] } });
    const limits = getPlanLimits(tenant?.plan ?? "free");
    // H5 audit: contar TODOS los usuarios (incl. inactivos) para evitar bypass
    // desactivar → crear → reactivar que eluda el límite del plan.
    const currentUserCount = await db.adminUser.count({});
    if (!withinLimit(currentUserCount, limits.maxUsers)) {
      return NextResponse.json(
        planLimitPayload("usuarios", currentUserCount, limits.maxUsers, tenant?.plan ?? "free"),
        { status: 402 }
      );
    }

    const existing = await db.adminUser.findFirst({ where: { username } });
    if (existing) {
      return NextResponse.json({ error: "El usuario ya existe" }, { status: 409 });
    }

    const passwordHash = await hash(password, 12);
    const user = await db.adminUser.create({
      data: { tenantId: auth.tenantId, username, passwordHash, role, name, active: true },
      select: { id: true, username: true, role: true, name: true, active: true, createdAt: true },
    });

    enqueueActivityLog({ action: "Crear", resource: "usuario_admin", resourceId: user.id, userId: auth.username, tenantId: auth.tenantId, details: { description: `Usuario '${username}' creado con rol '${role}'` }, timestamp: new Date().toISOString() }).catch(() => {
        /* fire-and-forget per CLAUDE.md rule #7 */
      });
    return NextResponse.json(user, { status: 201 });
  } catch (e) {
    logger.error("[admin-users] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno al crear usuario" }, { status: 500 });
  }
}

// PATCH /api/admin-users – update name, role, password or active status
export async function PATCH(req: NextRequest) {
  const rateLimitResult = applyRateLimit(req, "STRICT", "admin-users-patch");
  if (rateLimitResult) return rateLimitResult;

  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { id, password, ...rest } = parsed.data;
  const db = prismaForTenant(auth.tenantId);

  const existing = await db.adminUser.findFirst({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const updateData: Record<string, unknown> = { ...rest };
  if (password) updateData.passwordHash = await hash(password, 12);

  const updated = await db.adminUser.update({
    where: { id },
    data: updateData,
    select: { id: true, username: true, role: true, name: true, active: true },
  });

  if (parsed.data.role && parsed.data.role !== existing.role) {
    enqueueActivityLog({ action: "Cambiar rol", resource: "usuario_admin", resourceId: id, userId: auth.username, tenantId: auth.tenantId, details: { description: `Rol de '${existing.username}' cambiado de '${existing.role}' a '${parsed.data.role}'` }, timestamp: new Date().toISOString() }).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
  } else if (parsed.data.active !== undefined && parsed.data.active !== existing.active) {
    const action = parsed.data.active ? "Activar" : "Desactivar";
    enqueueActivityLog({ action, resource: "usuario_admin", resourceId: id, userId: auth.username, tenantId: auth.tenantId, details: { description: `Usuario '${existing.username}' ${parsed.data.active ? "activado" : "desactivado"}` }, timestamp: new Date().toISOString() }).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
  } else if (parsed.data.password) {
    enqueueActivityLog({ action: "Cambiar contraseña", resource: "usuario_admin", resourceId: id, userId: auth.username, tenantId: auth.tenantId, details: { description: `Contraseña de '${existing.username}' actualizada` }, timestamp: new Date().toISOString() }).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
  }
  return NextResponse.json(updated);
}

// DELETE /api/admin-users?id=xxx – remove a team member
export async function DELETE(req: NextRequest) {
  const rateLimitResult = applyRateLimit(req, "STRICT", "admin-users-delete");
  if (rateLimitResult) return rateLimitResult;

  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = prismaForTenant(auth.tenantId);
  const existing = await db.adminUser.findFirst({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await db.adminUser.delete({ where: { id } });
  enqueueActivityLog({ action: "Eliminar", resource: "usuario_admin", resourceId: id, userId: auth.username, tenantId: auth.tenantId, details: { description: `Usuario '${existing.username}' (rol: ${existing.role}) eliminado` }, timestamp: new Date().toISOString() }).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
  return NextResponse.json({ ok: true });
}
