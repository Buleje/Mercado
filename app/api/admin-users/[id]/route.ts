export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { z } from "zod";
import { logActivity } from "@/lib/activity-logger";

const CreateSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-z0-9_]+$/, "Solo letras minúsculas, números y guión bajo"),
  password: z.string().min(8),
  role: z.enum(["admin", "cajero", "almacenero"]),
  name: z.string().min(1).max(64),
});

const UpdateSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  role: z.enum(["admin", "cajero", "almacenero"]).optional(),
  password: z.string().min(6).optional(),
  active: z.boolean().optional(),
});

// GET /api/admin-users – list all admin users (passwords excluded)
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const users = await prisma.adminUser.findMany({
    select: { id: true, username: true, role: true, name: true, active: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(users);
}

// POST /api/admin-users – create a new admin user
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { username, password, role, name } = parsed.data;

  const existing = await prisma.adminUser.findFirst({ where: { username, tenantId: auth.tenantId } });
  if (existing) {
    return NextResponse.json({ error: "El usuario ya existe" }, { status: 409 });
  }

  const passwordHash = await hash(password, 12);
  const user = await prisma.adminUser.create({
    data: { username, passwordHash, role, name, active: true, tenantId: auth.tenantId },
    select: { id: true, username: true, role: true, name: true, active: true, createdAt: true },
  });

  logActivity("Crear", "usuario_admin", `Usuario '${username}' creado con rol '${role}'`, user.id, auth.username).catch(() => {});
  return NextResponse.json(user, { status: 201 });
}

// PATCH /api/admin-users/[id] – update name, role, password, or active
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.adminUser.findFirst({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { password, ...rest } = parsed.data;
  const updateData: Record<string, unknown> = { ...rest };
  if (password) updateData.passwordHash = await hash(password, 12);

  const updated = await prisma.adminUser.update({
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
}

// DELETE /api/admin-users/[id] – remove a team member
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const existing = await prisma.adminUser.findFirst({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.adminUser.delete({ where: { id } });
  logActivity("Eliminar", "usuario_admin", `Usuario '${existing.username}' (rol: ${existing.role}) eliminado`, id, auth.username).catch(() => {});
  return NextResponse.json({ ok: true });
}

