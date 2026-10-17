/**
 * GET /api/superadmin/intelligence/demand
 *
 * "Inteligencia de Barrio" — señales reales cross-tenant de demanda del marketplace.
 *
 * Arma el DemandInput desde Prisma (datos de producción, nada inventado) y delega
 * el cálculo a la función pura `buildDemandReport` de lib/intelligence/demand-signals.ts.
 *
 * Fuentes de datos verificadas:
 *  - categories : Order.createdAt + OrderItem.quantity + Product.category
 *                 (join: OrderItem.productId → Product.id)
 *  - stockouts  : StockoutPrediction.productId → Product.name / Product.category
 *                 Agrupado por producto, contando en cuántos tenants aparece.
 *  - zones      : Store.zone → unidades/categorías de los pedidos de ese tenant
 *                 (Order.tenantId = Store.tenantId). Join honesto sin inventar
 *                 un campo storeId que no existe en Order.
 *
 * Auth: requirePlatformAPI · Rate-limit GENEROUS · Cache-Control no-store
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getOrSet } from "@/lib/cache";
import { buildDemandReport, type DemandInput } from "@/lib/intelligence/demand-signals";

const PERIOD_DAYS = 30;
const PERIOD_LABEL = "Últimos 30 días";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
} as const;

export async function GET(req: NextRequest) {
  // Rate-limit primero (igual que billing-summary)
  const rl = await applyRateLimit(req, "GENEROUS", "superadmin-demand");
  if (rl) return rl;

  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  try {
    // [PERF] Cache 10min (stale-while-revalidate vía getOrSet + dedupe in-flight):
    // las queries cross-tenant (OrderItem/Order/Store/StockoutPrediction) se
    // recomputaban en CADA carga del dashboard (route no-store). Mismo resultado.
    const report = await getOrSet("superadmin:demand", 600, async () => {
      const now = Date.now();
      const msPerDay = 24 * 60 * 60 * 1000;

      // Ventana actual: [now - 30d, now)
      const currentStart = new Date(now - PERIOD_DAYS * msPerDay);
      // Ventana anterior: [now - 60d, now - 30d)
      const prevStart = new Date(now - 2 * PERIOD_DAYS * msPerDay);
      const prevEnd = currentStart;

      // ── 1. CATEGORIES — unidades por categoría, periodo actual vs anterior ──────
      //
      // Columnas reales usadas:
      //   OrderItem : quantity, productId
      //   Order     : createdAt, deletedAt
      //   Product   : category
      //
      // Excluimos pedidos soft-deleted (deletedAt IS NULL).
      // Filtramos OrderItem con productId != null para poder unir con Product.

      const [currentItems, prevItems] = await Promise.all([
        prisma.orderItem.findMany({
          where: {
            productId: { not: null },
            order: {
              createdAt: { gte: currentStart },
              deletedAt: null,
            },
          },
          select: {
            quantity: true,
            product: { select: { category: true } },
          },
        }),
        prisma.orderItem.findMany({
          where: {
            productId: { not: null },
            order: {
              createdAt: { gte: prevStart, lt: prevEnd },
              deletedAt: null,
            },
          },
          select: {
            quantity: true,
            product: { select: { category: true } },
          },
        }),
      ]);

      // Suma de unidades por categoría en cada ventana
      const aggregateByCategory = (
        items: { quantity: number; product: { category: string } | null }[],
      ): Map<string, number> => {
        const map = new Map<string, number>();
        for (const item of items) {
          const cat = item.product?.category;
          if (!cat) continue;
          map.set(cat, (map.get(cat) ?? 0) + item.quantity);
        }
        return map;
      };

      const currentCatMap = aggregateByCategory(currentItems);
      const prevCatMap = aggregateByCategory(prevItems);

      // Unión de categorías de ambas ventanas
      const allCategories = new Set([...currentCatMap.keys(), ...prevCatMap.keys()]);

      const categories: DemandInput["categories"] = Array.from(allCategories).map((cat) => ({
        category: cat,
        units: currentCatMap.get(cat) ?? 0,
        prevUnits: prevCatMap.get(cat) ?? 0,
      }));

      // ── 2. STOCKOUTS — productos con quiebres predichos, agrupados por producto ──
      //
      // Columnas reales usadas:
      //   StockoutPrediction : tenantId, expiresAt
      //   Product            : name, category
      //
      // "Vigentes" = predicciones cuyo expiresAt es futuro.
      // Agrupamos por Product.name contando tenants únicos (tenantCount).

      const rawStockouts = await prisma.stockoutPrediction.findMany({
        where: {
          expiresAt: { gt: new Date(now) },
        },
        select: {
          tenantId: true,
          product: { select: { name: true, category: true } },
        },
      });

      // Agrupamos por nombre de producto, contando tenants únicos
      const stockoutMap = new Map<
        string, // product name como clave natural
        { name: string; category: string | null; tenantIds: Set<string> }
      >();
      for (const s of rawStockouts) {
        const name = s.product.name;
        const existing = stockoutMap.get(name);
        if (existing) {
          existing.tenantIds.add(s.tenantId);
        } else {
          stockoutMap.set(name, {
            name,
            category: s.product.category ?? null,
            tenantIds: new Set([s.tenantId]),
          });
        }
      }

      const stockouts: DemandInput["stockouts"] = Array.from(stockoutMap.values()).map((s) => ({
        name: s.name,
        category: s.category,
        tenantCount: s.tenantIds.size,
      }));

      // ── 3. ZONES — unidades por zona de tienda ────────────────────────────────
      //
      // Order no tiene storeId; el vínculo honesto es Order.tenantId = Store.tenantId.
      // Una bodega (tenant) puede tener varias Stores; usamos la primera tienda
      // publicada con zona definida por tenant.
      //
      // Columnas reales usadas:
      //   Store     : tenantId, zone, isPublished
      //   Order     : tenantId, createdAt, deletedAt
      //   OrderItem + Product : para mezcla por categoría

      // Solo tiendas publicadas con zona definida
      const stores = await prisma.store.findMany({
        where: {
          zone: { not: null },
          isPublished: true,
        },
        select: {
          tenantId: true,
          zone: true,
        },
      });

      // Si un tenant tiene varias tiendas publicadas, tomamos la primera zona encontrada
      const tenantZoneMap = new Map<string, string>();
      for (const s of stores) {
        if (s.zone && !tenantZoneMap.has(s.tenantId)) {
          tenantZoneMap.set(s.tenantId, s.zone);
        }
      }

      // Pedidos del periodo actual con sus items para asignar a zona
      const ordersForZones = await prisma.order.findMany({
        where: {
          createdAt: { gte: currentStart },
          deletedAt: null,
          tenantId: { in: Array.from(tenantZoneMap.keys()) },
        },
        select: {
          tenantId: true,
          items: {
            where: { productId: { not: null } },
            select: {
              quantity: true,
              product: { select: { category: true } },
            },
          },
        },
      });

      // Acumulador por zona: unidades totales y unidades por categoría
      const zoneAcc = new Map<string, { units: number; categoryUnits: Map<string, number> }>();

      for (const order of ordersForZones) {
        const zone = tenantZoneMap.get(order.tenantId);
        if (!zone) continue;

        const acc = zoneAcc.get(zone) ?? {
          units: 0,
          categoryUnits: new Map<string, number>(),
        };

        for (const item of order.items) {
          const cat = item.product?.category;
          acc.units += item.quantity;
          if (cat) {
            acc.categoryUnits.set(cat, (acc.categoryUnits.get(cat) ?? 0) + item.quantity);
          }
        }

        zoneAcc.set(zone, acc);
      }

      // Quiebres predichos por zona: suma de predicciones vigentes de los tenants de esa zona
      const tenantStockoutCount = new Map<string, number>();
      for (const s of rawStockouts) {
        tenantStockoutCount.set(s.tenantId, (tenantStockoutCount.get(s.tenantId) ?? 0) + 1);
      }

      const zoneStockoutCount = new Map<string, number>();
      for (const [tenantId, zone] of tenantZoneMap.entries()) {
        const count = tenantStockoutCount.get(tenantId) ?? 0;
        zoneStockoutCount.set(zone, (zoneStockoutCount.get(zone) ?? 0) + count);
      }

      const zones: DemandInput["zones"] = Array.from(zoneAcc.entries()).map(([zone, acc]) => ({
        zone,
        units: acc.units,
        categoryUnits: Array.from(acc.categoryUnits.entries()).map(([category, units]) => ({
          category,
          units,
        })),
        stockouts: zoneStockoutCount.get(zone) ?? 0,
      }));

      // ── 4. Delegar cálculo a la función pura ──────────────────────────────────
      const input: DemandInput = { categories, stockouts, zones };
      return buildDemandReport(input, now, PERIOD_DAYS, PERIOD_LABEL);
    });

    logger.info("[demand] reporte generado", {
      by: auth.username,
      totalUnits: report.totalUnits,
      risingCount: report.risingCategories.length,
      stockoutHotspots: report.stockoutHotspots.length,
      zones: report.byZone.length,
    });

    return NextResponse.json(report, { headers: NO_STORE_HEADERS });
  } catch (err) {
    logger.error("[demand] error al generar reporte", { error: String(err) });
    return NextResponse.json(
      { error: "Error al generar reporte de demanda" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
