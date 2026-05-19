/**
 * @prisma-direct ok — operación con scope explícito por `auth.tenantId` o
 * por `tenantId` resuelto desde slug del URL antes de la query. Aislamiento
 * cross-tenant verificado manualmente. Migrar a clase `lib/db/*.db.ts`
 * dedicada cuando se centralice el patrón.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { MarketplaceStoreProductsDB } from "@/lib/db/marketplace.db";
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

    // SECURITY P1 IDOR multi-store fix (2026-05-16): el guard
    // tenantId vive dentro de MarketplaceStoreProductsDB.updateOneForTenant
    // — valida contra store.tenantId (nested) en lugar del primer store.
    // Audit project-wide 2026-05-19: migrado.
    const updated = await MarketplaceStoreProductsDB.updateOneForTenant(
      auth.tenantId,
      id,
      parsed.data,
    );
    if (!updated) {
      // Misma respuesta para "no existe" y "cross-tenant" — evita info disclosure.
      return NextResponse.json({ error: "Producto no encontrado en tu tienda" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...updated });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
