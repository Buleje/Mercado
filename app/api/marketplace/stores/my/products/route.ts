/**
 * @prisma-direct ok — operación con scope explícito por `auth.tenantId` o
 * por `tenantId` resuelto desde slug del URL antes de la query. Aislamiento
 * cross-tenant verificado manualmente. Migrar a clase `lib/db/*.db.ts`
 * dedicada cuando se centralice el patrón.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId } from "@/lib/api-error";

/**
 * GET /api/marketplace/stores/my/products
 * Lista todos los productos de la tienda del tenant (activos e inactivos).
 * El admin ve todos para poder activar/desactivar.
 */
export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "manager"]);
    if (auth instanceof NextResponse) return auth;

    const store = await prisma.store.findFirst({
      where: { tenantId: auth.tenantId },
      select: { id: true, slug: true },
    });

    if (!store) {
      return NextResponse.json([]);
    }

    const storeProducts = await prisma.storeProduct.findMany({
      where: { storeId: store.id },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            stock: true,
            barcode: true,
            image: true,
            description: true,
            category: true,
          },
        },
      },
      orderBy: { product: { name: "asc" } },
    });

    // Brandon mayo 2026 v7 (Nivel C): boosts activos para mostrar chip
    // "Destacado" en la tabla del admin. Raw SQL — el Prisma Client en dev
    // a veces no tiene el modelo cacheado tras una sesión larga y rompe.
    type BoostRow = {
      id: string;
      productId: number;
      status: string;
      bidAmount: string;
      startDate: Date;
      endDate: Date;
      totalSpentPen: string;
      maxBudgetPen: string;
      impressionsCount: number;
      clicksCount: number;
    };
     
    const boosts = await prisma.$queryRaw<BoostRow[]>`
      SELECT id, "productId", status,
             "bidAmount"::text, "startDate", "endDate",
             "totalSpentPen"::text, "maxBudgetPen"::text,
             "impressionsCount", "clicksCount"
      FROM "SponsoredBoost"
      WHERE "storeId" = ${store.id}
        AND status IN ('active', 'paused')
    `.catch(() => [] as BoostRow[]);
    const boostByProductId = new Map<number, BoostRow>();
    for (const b of boosts) {
      const existing = boostByProductId.get(b.productId);
      if (!existing || (b.status === "active" && existing.status !== "active")) {
        boostByProductId.set(b.productId, b);
      }
    }

    // Brandon mayo 2026 v7 (Nivel C): cálculo de "precio promedio en otras
    // tiendas" — para que el admin sepa si está caro/barato vs competencia.
    // Match por barcode (no por productId porque cada tenant tiene Product
    // distinto). Una sola query agregada por barcodes únicos del catálogo.
    const barcodes = Array.from(
      new Set(storeProducts.map((sp) => sp.product.barcode).filter((b): b is string => !!b && b.length > 3)),
    );
    const competitionMap = new Map<string, { avg: number; count: number }>();
    if (barcodes.length > 0) {
       
      const others = await prisma.storeProduct.findMany({
        where: {
          isActive: true,
          storeId: { not: store.id },
          product: { barcode: { in: barcodes } },
        },
        select: {
          retailPrice: true,
          product: { select: { barcode: true } },
        },
      });
      const grouped = new Map<string, number[]>();
      for (const r of others) {
        const bc = r.product.barcode;
        if (!bc) continue;
        const arr = grouped.get(bc) ?? [];
        arr.push(Number(r.retailPrice));
        grouped.set(bc, arr);
      }
      for (const [bc, prices] of grouped) {
        const avg = prices.reduce((s, n) => s + n, 0) / prices.length;
        competitionMap.set(bc, { avg, count: prices.length });
      }
    }

    const result = storeProducts.map((sp) => {
      const activeBoost = boostByProductId.get(sp.product.id) ?? null;
      const competition = sp.product.barcode ? competitionMap.get(sp.product.barcode) ?? null : null;
      return {
        id: sp.id,
        productId: sp.product.id,
        name: sp.product.name,
        isActive: sp.isActive,
        retailPrice: Number(sp.retailPrice),
        wholesalePrice: Number(sp.wholesalePrice ?? 0),
        stock: sp.product.stock ?? 0,
        sku: sp.product.barcode ?? "",
        image: sp.product.image ?? null,
        description: sp.product.description ?? null,
        category: sp.product.category ?? null,
        boost: activeBoost
          ? {
              id: activeBoost.id,
              status: activeBoost.status,
              bidAmount: Number(activeBoost.bidAmount),
              startDate: activeBoost.startDate.toISOString(),
              endDate: activeBoost.endDate.toISOString(),
              totalSpentPen: Number(activeBoost.totalSpentPen),
              maxBudgetPen: Number(activeBoost.maxBudgetPen),
              impressionsCount: activeBoost.impressionsCount,
              clicksCount: activeBoost.clicksCount,
            }
          : null,
        competitionAvgPrice: competition ? Number(competition.avg.toFixed(2)) : null,
        competitionStoreCount: competition?.count ?? 0,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
