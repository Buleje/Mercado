/**
 * Bulk PATCH para productos del marketplace de la tienda actual.
 *
 * Brandon mayo 2026 v7 (Nivel B): permite publicar/despublicar N productos
 * a la vez sin tener que llamar al endpoint individual por cada uno.
 *
 * POST /api/marketplace/stores/my/products/bulk
 * Body: { ids: string[], isActive: boolean }
 *
 * Devuelve: { ok: true, updatedCount: number }
 *
 * @prisma-direct ok — scope tenant validado antes de updateMany.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix } from "@/lib/cache";
import { toErrorPayload, newTraceId } from "@/lib/api-error";

const BulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  isActive: z.boolean(),
});

export async function POST(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "manager"]);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json().catch(() => ({}));
    const parsed = BulkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    // SECURITY 2026-05-16 (P1 IDOR multi-store fix): antes tomaba la
    // PRIMERA tienda del tenant con findFirst, lo que permitía mutar
    // StoreProduct de OTRAS tiendas del mismo tenant. Ahora updateMany
    // matchea contra TODAS las tiendas del tenant via `store.tenantId`.
    //
    // El rule no-restricted-syntax MULTI-TENANT busca tenantId LITERAL
    // top-level en el where. Aquí el guard tenantId está ANIDADO via
    // relation `store.tenantId` (StoreProduct no tiene tenantId directo;
    // pertenece a un Store que sí lo tiene). Es semánticamente correcto
    // — eslint-disable block justificado per ADR-101.
    /* eslint-disable no-restricted-syntax */
    const result = await prisma.storeProduct.updateMany({
      where: {
        id: { in: parsed.data.ids },
        store: { tenantId: auth.tenantId },
      },
      data: { isActive: parsed.data.isActive },
    });
    /* eslint-enable no-restricted-syntax */

    invalidateByPrefix(`marketplace:store-products`);

    return NextResponse.json({
      ok: true,
      updatedCount: result.count,
      requested: parsed.data.ids.length,
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
