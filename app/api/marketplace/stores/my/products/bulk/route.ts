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
import { MarketplaceStoreProductsDB } from "@/lib/db/marketplace.db";
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

    // SECURITY P1 IDOR multi-store fix (2026-05-16): guard tenantId
    // anidado via relation store.tenantId vive dentro del DB class.
    // Audit project-wide 2026-05-19: migrado.
    const { updatedCount } = await MarketplaceStoreProductsDB.bulkSetActiveForTenant(
      auth.tenantId,
      parsed.data.ids,
      parsed.data.isActive,
    );

    return NextResponse.json({
      ok: true,
      updatedCount,
      requested: parsed.data.ids.length,
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
