/**
 * @prisma-direct ok — operación con scope explícito por `auth.tenantId` o
 * por `tenantId` resuelto desde slug del URL antes de la query. Aislamiento
 * cross-tenant verificado manualmente. Migrar a clase `lib/db/*.db.ts`
 * dedicada cuando se centralice el patrón.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix } from "@/lib/cache";
import { toErrorPayload, newTraceId } from "@/lib/api-error";

const PatchSchema = z
  .object({
    isActive: z.boolean().optional(),
    retailPrice: z.number().nonnegative().max(99999).optional(),
    wholesalePrice: z.number().nonnegative().max(99999).optional(),
  })
  .refine(
    (d) =>
      d.isActive !== undefined ||
      d.retailPrice !== undefined ||
      d.wholesalePrice !== undefined,
    { message: "Al menos un campo es requerido" },
  );

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

    // SECURITY 2026-05-16 (P1 IDOR multi-store fix): antes la validación
    // tomaba la PRIMERA tienda del tenant con `store.findFirst({ tenantId })`
    // y luego buscaba `storeProduct.findFirst({ storeId: store.id })`. Si un
    // tenant tiene 2+ tiendas, un admin de la tienda A podía mutar
    // StoreProduct de la tienda B (mismo tenant). No es cross-tenant pero
    // rompe el aislamiento per-store en multi-store.
    //
    // Ahora: resolvemos el storeProduct primero y validamos directamente
    // que su Store.tenantId === auth.tenantId. Esto cubre TODOS los stores
    // del tenant correctamente, independiente del orden de creación.
    const storeProduct = await prisma.storeProduct.findFirst({
      where: { id },
      select: {
        id: true,
        storeId: true,
        store: { select: { tenantId: true } },
      },
    });

    if (!storeProduct || storeProduct.store.tenantId !== auth.tenantId) {
      // Misma respuesta para "no existe" y "cross-tenant" — evita info
      // disclosure (atacante no puede enumerar IDs de otros tenants).
      return NextResponse.json({ error: "Producto no encontrado en tu tienda" }, { status: 404 });
    }

    const updateData: {
      isActive?: boolean;
      retailPrice?: number;
      wholesalePrice?: number;
    } = {};
    if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;
    if (parsed.data.retailPrice !== undefined) updateData.retailPrice = parsed.data.retailPrice;
    if (parsed.data.wholesalePrice !== undefined) updateData.wholesalePrice = parsed.data.wholesalePrice;

    const updated = await prisma.storeProduct.update({
      where: { id },
      data: updateData,
      select: { id: true, isActive: true, retailPrice: true, wholesalePrice: true },
    });

    invalidateByPrefix(`marketplace:store-products`);

    return NextResponse.json({
      ok: true,
      id: updated.id,
      isActive: updated.isActive,
      retailPrice: Number(updated.retailPrice),
      wholesalePrice: Number(updated.wholesalePrice ?? 0),
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
