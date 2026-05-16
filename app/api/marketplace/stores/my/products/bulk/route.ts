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

    // 1) Asegurar que la tienda existe y pertenece al tenant del admin.
    const store = await prisma.store.findFirst({
      where: { tenantId: auth.tenantId },
      select: { id: true },
    });
    if (!store) {
      return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
    }

    // 2) updateMany con scope storeId + ids — aislamiento doble.
    const result = await prisma.storeProduct.updateMany({
      where: {
        id: { in: parsed.data.ids },
        storeId: store.id,
      },
      data: { isActive: parsed.data.isActive },
    });

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
