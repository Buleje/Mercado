/**
 * @prisma-direct ok — operaciones con scope explícito por `auth.tenantId` o
 * por `tenantId` resuelto desde slug del URL antes de la query. Aislamiento
 * cross-tenant verificado manualmente. Migrar a clase `lib/db/*.db.ts`
 * dedicada cuando se centralice el patrón.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { z } from "zod";
import { logActivity } from "@/lib/activity-logger";
import { CouponsDB } from "@/lib/db/coupons.db";
import { MarketplaceStoresDB } from "@/lib/db/marketplace.db";
import { logger } from "@/lib/logger";
import { runWithAuditContext } from "@/lib/audit/audit-context";

const CreateCouponSchema = z.object({
  code: z
    .string()
    .min(3, "El código debe tener al menos 3 caracteres")
    .max(30)
    .transform((v) => v.toUpperCase().trim()),
  description: z.string().max(200).optional().default(""),
  discountType: z.enum(["percent", "fixed"]),
  discountValue: z.number().positive("El descuento debe ser mayor a 0"),
  minPurchase: z.number().min(0).optional().nullable(),
  maxUses: z.number().int().positive().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  storeId: z.string().optional().nullable(),
});

/**
 * GET /api/marketplace/coupons
 * Lista cupones de la tienda del vendedor.
 * Query param ?storeId=xxx filtra por tienda específica.
 */
export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "manager", "cajero"]);
    if (auth instanceof NextResponse) return auth;

    const store = await MarketplaceStoresDB.getByTenant(auth.tenantId);

    if (!store) {
      return NextResponse.json({ data: [] });
    }

    const storeIdFilter = req.nextUrl.searchParams.get("storeId");

    // F8: si se provee storeId externo, validar que pertenece al tenant del admin.
    // Sin esta validación, storeId de otro tenant devolvía [] confirmando que existe.
    if (storeIdFilter && storeIdFilter !== store.id) {
      const storeOwned = await MarketplaceStoresDB.assertStoreOwnership(auth.tenantId, storeIdFilter);
      if (!storeOwned) {
        return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
      }
    }

    const coupons = await CouponsDB.list(auth.tenantId, storeIdFilter ?? store.id);

    return NextResponse.json({ data: coupons });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

/**
 * POST /api/marketplace/coupons
 * Crear un nuevo cupón para la tienda del vendedor.
 * Body acepta storeId opcional para cupones específicos de tienda.
 */
export async function POST(req: NextRequest) {
  const traceId = newTraceId();
  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;

  return runWithAuditContext(req, auth.username, async () => {
    try {
      const store = await MarketplaceStoresDB.getByTenant(auth.tenantId);

      if (!store) {
        return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
      }

      const body = await req.json();
      const parsed = CreateCouponSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
      }

      const { code, description, discountType, discountValue, minPurchase, maxUses, expiresAt, storeId } = parsed.data;

      // Check for duplicate code in this tenant
      const existing = await CouponsDB.findByCode(auth.tenantId, code);
      if (existing) {
        return NextResponse.json({ error: "Ya existe un cupón con ese código" }, { status: 409 });
      }

      const coupon = await CouponsDB.create(auth.tenantId, {
        code,
        storeId: storeId ?? store.id,
        description,
        discountType,
        discountValue,
        minPurchase: minPurchase ?? null,
        maxUses: maxUses ?? null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      });

      logActivity(
        "coupon_created",
        "Coupon",
        `Cupón ${code} creado para tienda ${storeId ?? store.id}`,
        coupon.id,
        auth.username,
      ).catch((err) =>
        logger.error("[marketplace/coupons] operation failed", { error: String(err), tenantId: auth.tenantId })
      );

      return NextResponse.json({ data: coupon }, { status: 201 });
    } catch (err) {
      const { payload, status } = toErrorPayload(err, traceId);
      return NextResponse.json(payload, { status });
    }
  });
}
