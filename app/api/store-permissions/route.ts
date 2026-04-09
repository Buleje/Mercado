import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { prisma } from "@/lib/prisma";

const VALID_PERMISSIONS = [
  "view_orders",
  "edit_status",
  "view_prices",
  "manage_products",
  "view_analytics",
] as const;

const PermissionPostSchema = z.object({
  storeId: z.string().min(1, "storeId requerido"),
  userId: z.string().min(1, "userId requerido"),
  userType: z.string().min(1, "userType requerido").max(50),
  permissions: z
    .array(z.enum(VALID_PERMISSIONS))
    .min(1, "Se requiere al menos un permiso"),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get("storeId");

    if (!storeId) {
      return NextResponse.json(
        { error: "storeId requerido como parámetro de consulta" },
        { status: 400 }
      );
    }

    const permissions = await prisma.storePermission.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(permissions);
  } catch {
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json();
    const parsed = PermissionPostSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    const { storeId, userId, userType, permissions } = parsed.data;

    // Upsert: si ya existe para storeId+userId+userType, actualizar
    const result = await prisma.storePermission.upsert({
      where: { storeId_userId_userType: { storeId, userId, userType } },
      update: {
        permissions: permissions.join(","),
        grantedBy: auth.username,
      },
      create: {
        storeId,
        userId,
        userType,
        permissions: permissions.join(","),
        grantedBy: auth.username,
      },
    });

    logActivity(
      "Upsert",
      "storePermission",
      `Permisos actualizados para usuario ${userId} en tienda ${storeId}: ${permissions.join(", ")}`,
      result.id,
      auth.username
    ).catch(() => {});

    return NextResponse.json(result, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id requerido como parámetro de consulta" },
        { status: 400 }
      );
    }

    const existing = await prisma.storePermission.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Permiso no encontrado" }, { status: 404 });
    }

    await prisma.storePermission.delete({ where: { id } });

    logActivity(
      "Revocar",
      "storePermission",
      `Permiso revocado: usuario ${existing.userId} en tienda ${existing.storeId}`,
      id,
      auth.username
    ).catch(() => {});

    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}
