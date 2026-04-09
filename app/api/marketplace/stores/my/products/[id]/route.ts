import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix } from "@/lib/cache";
import { toErrorPayload, newTraceId } from "@/lib/api-error";

const PatchSchema = z.object({
  isActive: z.boolean(),
});

/**
 * PATCH /api/marketplace/stores/my/products/[id]
 * Activar/desactivar un producto en la tienda del marketplace.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "manager"]);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;

    const body = await req.json().catch(() => ({}));
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    // Verificar que el StoreProduct pertenece a una tienda del tenant
    const store = await prisma.store.findFirst({
      where: { tenantId: auth.tenantId },
      select: { id: true },
    });

    if (!store) {
      return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
    }

    const storeProduct = await prisma.storeProduct.findFirst({
      where: { id, storeId: store.id },
    });

    if (!storeProduct) {
      return NextResponse.json({ error: "Producto no encontrado en tu tienda" }, { status: 404 });
    }

    await prisma.storeProduct.update({
      where: { id },
      data: { isActive: parsed.data.isActive },
    });

    invalidateByPrefix(`marketplace:store-products`);

    return NextResponse.json({ ok: true, isActive: parsed.data.isActive });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
