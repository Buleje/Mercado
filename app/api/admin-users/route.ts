export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { z } from "zod";

const CreateSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-z0-9_]+$/, "Solo letras minÃºsculas, nÃºmeros y guiÃ³n bajo"),
  password: z.string().min(8),
  role: z.enum(["admin", "cajero", "almacenero"]),
  name: z.string().min(1).max(64),
});

// GET /api/admin-users â€” list all admin users (passwords excluded)
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const users = await prisma.adminUser.findMany({
    select: { id: true, username: true, role: true, name: true, active: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(users);
}

// POST /api/admin-users â€” create a new admin user
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { username, password, role, name } = parsed.data;

  const existing = await prisma.adminUser.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json({ error: "El usuario ya existe" }, { status: 409 });
  }

  const passwordHash = await hash(password, 12);
  const user = await prisma.adminUser.create({
    data: { username, passwordHash, role, name, active: true },
    select: { id: true, username: true, role: true, name: true, active: true, createdAt: true },
  });

  return NextResponse.json(user, { status: 201 });
}
