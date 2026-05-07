import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

const VALID_PERMISSIONS = [
  "view_orders",
  "edit_status",
  "view_prices",
  "manage_products",
  "view_analytics",
] as const;

const PatchSchema = z.object({
  permissions: z.array(z.enum(VALID_PERMISSIONS)),
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const _rl = await applyRateLimit(req, "MODERATE", "store-permissions-X"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;

  try {
    const raw = await req.json();
    const parsed = PatchSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    // SECURITY: scope tenant via Store
    const existing = await prisma.storePermission.findFirst({
      where: { id, store: { tenantId: auth.tenantId } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Permiso no encontrado" }, { status: 404 });
    }

    const updated = await prisma.storePermission.update({
      where: { id },
      data: {
        permissions: parsed.data.permissions.join(","),
        grantedBy: auth.username,
      },
    });

    logActivity(
      "Actualizar",
      "storePermission",
      `Permisos actualizados: ${parsed.data.permissions.join(", ") || "(ninguno)"}`,
      id,
      auth.username,
    ).catch((err) => logger.error("[store-permissions/:id] activity log failed", { error: String(err) }));

    return NextResponse.json({
      id: updated.id,
      permissions: updated.permissions ? updated.permissions.split(",").filter(Boolean) : [],
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("[store-permissions/:id] PATCH failed", { error: detail, tenantId: auth.tenantId });
    return NextResponse.json(
      {
        error: "Error del servidor",
        ...(process.env.NODE_ENV !== "production" ? { detail } : {}),
      },
      { status: 503 },
    );
  }
}
