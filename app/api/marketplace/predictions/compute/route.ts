/**
 * @cross-tenant intentional — endpoint público marketplace.
 * Agregados/lecturas cross-tenant son parte del diseño del marketplace
 * (rankings, búsqueda, comparar, analytics globales). Donde aplica filtra
 * por `store.isPublished: true` para no exponer tiendas en draft.
 * Migrar a `lib/db/marketplace-*.db.ts` cuando se cree clase específica.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { StockoutPredictionsDB } from "@/lib/db";
import { logger } from "@/lib/logger";

const BodySchema = z.object({ storeSlug: z.string().min(1) });

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req, ["admin"]);
    if (auth instanceof NextResponse) return auth;
    const body = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const store = await prisma.store.findFirst({
      where: { tenantId: auth.tenantId, slug: parsed.data.storeSlug },
      select: { id: true },
    });
    if (!store) {
      return NextResponse.json({ error: "Store no encontrado" }, { status: 404 });
    }
    const count = await StockoutPredictionsDB.compute(auth.tenantId, store.id);
    logger.info("[marketplace/predictions/compute] success", { tenantId: auth.tenantId, storeId: store.id, count });
    return NextResponse.json({ count });
  } catch (err) {
    logger.error("[marketplace/predictions/compute] POST error", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}