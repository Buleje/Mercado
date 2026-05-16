import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * /api/admin/delivery/network-toggle
 *
 * GET   → estado actual de `useThirdPartyDelivery` para el tenant del admin.
 * PATCH → actualiza el flag. Body: { enabled: boolean }.
 *
 * Brandon mayo 2026 v7: este endpoint controla si la tienda participa de la
 * red de repartidores Buleje. Cuando se desactiva:
 *   - La tienda deja de aparecer en /delivery-app/mapa (nearby-stores).
 *   - No se generan DeliveryOffer para riders cross-tenant.
 *   - Los hot-zones del rider no cuentan esta tienda.
 *   - Los repartidores propios del negocio siguen operando normal.
 *
 * Auth: admin / manager (no cajero — es decisión operativa importante).
 */

const PatchSchema = z.object({
  enabled: z.boolean(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;

  try {
    // Brandon mayo 2026 v7: raw SQL para evitar dependencia del cache de
    // Prisma Client cuando el campo es nuevo (caso post-migración con dev
    // server corriendo desde antes). Más robusto que findUnique.
    // eslint-disable-next-line no-restricted-properties
    const rows = await prisma.$queryRaw<Array<{ useThirdPartyDelivery: boolean }>>`
      SELECT "useThirdPartyDelivery" FROM "Tenant" WHERE id = ${auth.tenantId} LIMIT 1
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ enabled: rows[0].useThirdPartyDelivery });
  } catch (err) {
    logger.error("admin.delivery.network-toggle.get.failed", {
      tenantId: auth.tenantId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json(
      { error: "No se pudo leer la configuración" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Body inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    // raw SQL — mismo motivo que el GET (Prisma Client cache en dev).
    // eslint-disable-next-line no-restricted-properties
    const rows = await prisma.$queryRaw<Array<{ useThirdPartyDelivery: boolean }>>`
      UPDATE "Tenant"
      SET "useThirdPartyDelivery" = ${parsed.data.enabled}, "updatedAt" = NOW()
      WHERE id = ${auth.tenantId}
      RETURNING "useThirdPartyDelivery"
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }
    logger.info("admin.delivery.network-toggle.patch", {
      tenantId: auth.tenantId,
      adminUser: auth.username,
      enabled: parsed.data.enabled,
    });
    return NextResponse.json({ enabled: rows[0].useThirdPartyDelivery });
  } catch (err) {
    logger.error("admin.delivery.network-toggle.patch.failed", {
      tenantId: auth.tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "No se pudo actualizar la configuración" },
      { status: 500 },
    );
  }
}
