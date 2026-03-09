import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { z } from "zod";

const UpdateSchema = z.object({
  password: z.string().min(8).optional(),
  role: z.enum(["admin", "cajero", "almacenero"]).optional(),
  name: z.string().min(1).max(64).optional(),
  active: z.boolean().optional(),
});

// PATCH /api/admin-users/[id] — update a user (password, role, name, active)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.adminUser.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.active !== undefined) data.active = parsed.data.active;
  if (parsed.data.password !== undefined) {
    data.passwordHash = await hash(parsed.data.password, 12);
  }

  const user = await prisma.adminUser.update({
    where: { id },
    data,
    select: { id: true, username: true, role: true, name: true, active: true, updatedAt: true },
  });

  return NextResponse.json(user);
}

// DELETE /api/admin-users/[id] — deactivate or permanently delete
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const currentAuth = auth as { username: string };
  const target = await prisma.adminUser.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  // Prevent admin from deleting their own account
  if (target.username === currentAuth.username) {
    return NextResponse.json({ error: "No puedes eliminar tu propia cuenta" }, { status: 400 });
  }

  // Ensure at least one active admin remains
  if (target.role === "admin") {
    const adminCount = await prisma.adminUser.count({ where: { role: "admin", active: true } });
    if (adminCount <= 1) {
      return NextResponse.json({ error: "Debe quedar al menos un administrador activo" }, { status: 400 });
    }
  }

  await prisma.adminUser.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
