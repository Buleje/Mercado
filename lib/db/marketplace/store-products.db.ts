import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { NotFoundError } from "@/lib/api-error";
import { toNum, toNumOrZero } from "@/lib/decimal-utils";
import { type DbStoreProduct } from "./types";

// ─── MarketplaceStoreProductsDB ───────────────────────────────────────────────

export const MarketplaceStoreProductsDB = {
  /**
   * Listar productos de una tienda (con datos del catálogo).
   */
  async list(params: {
    storeId: string;
    category?: string;
    search?: string;
    sort?: "price_asc" | "price_desc";
    limit?: number;
  }): Promise<DbStoreProduct[]> {
    const cacheKey = `marketplace:store-products:${JSON.stringify(params)}`;

    return getOrSet(cacheKey, 120, async () => {
      const orderBy = params.sort === "price_desc"
        ? { retailPrice: "desc" as const }
        : { retailPrice: "asc" as const };

      const rows = await prisma.storeProduct.findMany({
        where: {
          storeId:  params.storeId,
          isActive: true,
          ...(params.category && { product: { category: params.category } }),
          ...(params.search   && { product: { name: { contains: params.search, mode: "insensitive" } } }),
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              image: true,
              category: true,
              unit: true,
              modifierGroups: {
                where: { isActive: true },
                orderBy: { position: "asc" },
                include: {
                  options: {
                    where: { isActive: true },
                    orderBy: { position: "asc" },
                  },
                },
              },
            },
          },
        },
        orderBy,
        take: params.limit ?? 50,
      });

      return rows.map((r) => ({
        id:                 r.id,
        storeId:            r.storeId,
        productId:          r.productId,
        // TD-018: retailPrice / wholesalePrice ahora son Decimal → serializar a number
        retailPrice:        toNumOrZero(r.retailPrice),
        wholesalePrice:     toNum(r.wholesalePrice),
        minOrderQty:        r.minOrderQty,
        isActive:           r.isActive,
        volumePricingTiers: r.volumePricingTiers,
        productName:        r.product.name,
        productImage:       r.product.image,
        productCategory:    r.product.category,
        productUnit:        r.product.unit,
        modifierGroups: r.product.modifierGroups.map((g) => ({
          id: g.id,
          name: g.name,
          description: g.description,
          required: g.required,
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          options: g.options.map((o) => ({
            id: o.id,
            name: o.name,
            priceDelta: toNumOrZero(o.priceDelta),
            isDefault: o.isDefault,
            imageUrl: o.imageUrl,
          })),
        })),
      }));
    });
  },

  /**
   * Agregar o actualizar un producto en una tienda.
   * Si ya existe la combinación storeId+productId, lo actualiza (upsert).
   */
  async upsert(params: {
    storeId: string;
    productId: number;
    retailPrice: number;
    wholesalePrice?: number;
    minOrderQty?: number;
    volumePricingTiers?: unknown;
  }): Promise<DbStoreProduct> {
    // Verificar que el producto existe en el catálogo
    const product = await prisma.product.findUnique({
      where:  { id: params.productId },
      select: { id: true, name: true, image: true, category: true, unit: true },
    });
    if (!product) throw new NotFoundError(`Producto #${params.productId}`);

    const row = await prisma.storeProduct.upsert({
      where: {
        storeId_productId: { storeId: params.storeId, productId: params.productId },
      },
      create: {
        id:                 crypto.randomUUID(),
        storeId:            params.storeId,
        productId:          params.productId,
        retailPrice:        params.retailPrice,
        wholesalePrice:     params.wholesalePrice ?? null,
        minOrderQty:        params.minOrderQty ?? 1,
        isActive:           true,
        volumePricingTiers: params.volumePricingTiers ?? undefined,
      },
      update: {
        retailPrice:        params.retailPrice,
        wholesalePrice:     params.wholesalePrice ?? null,
        minOrderQty:        params.minOrderQty ?? 1,
        isActive:           true,
        volumePricingTiers: params.volumePricingTiers ?? undefined,
      },
    });

    invalidateByPrefix(`marketplace:store-products:{"storeId":"${params.storeId}`);

    return {
      id:                 row.id,
      storeId:            row.storeId,
      productId:          row.productId,
      // TD-018: serializar Decimal → number
      retailPrice:        toNumOrZero(row.retailPrice),
      wholesalePrice:     toNum(row.wholesalePrice),
      minOrderQty:        row.minOrderQty,
      isActive:           row.isActive,
      volumePricingTiers: row.volumePricingTiers,
      productName:        product.name,
      productImage:       product.image,
      productCategory:    product.category,
      productUnit:        product.unit,
      modifierGroups:     [], // upsert no fetcha modifierGroups; usar list() para refresh
    };
  },

  /**
   * Desactivar (soft-delete) un producto de la tienda.
   */
  async deactivate(storeId: string, productId: number): Promise<void> {
    await prisma.storeProduct.updateMany({
      where:  { storeId, productId },
      data:   { isActive: false },
    });
    invalidateByPrefix(`marketplace:store-products:{"storeId":"${storeId}`);
  },

  /**
   * Sincronizar TODOS los productos activos del inventario de un tenant
   * como StoreProducts en su tienda del marketplace.
   * - Productos nuevos → se crean con retailPrice = product.price
   * - Productos existentes → se reactivan si estaban desactivados
   * - Productos inactivos en catálogo → se desactivan en StoreProduct
   * Retorna { created, updated, deactivated }
   */
  async syncInventory(tenantId: string, possibleTenantIds?: string[]): Promise<{ created: number; updated: number; deactivated: number }> {
    const searchIds = possibleTenantIds ?? [tenantId];

    // 1. Find the store for this tenant — search by all possible IDs
    let store = await prisma.store.findFirst({
      where:  { tenantId: { in: searchIds } },
      select: { id: true, tenantId: true, slug: true, name: true, isPublished: true },
    });
    if (!store) {
      // Auto-create store from tenant settings
      const settings = await prisma.settings.findFirst({ where: { tenantId: { in: searchIds } } });
      const storeName = settings?.businessName || "Mi Tienda";
      const slug = storeName
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        || `tienda-${tenantId.slice(0, 8)}`;

      // Ensure slug is unique
      const existingSlug = await prisma.store.findUnique({
        where: { slug },
        select: { id: true },
      });
      const finalSlug = existingSlug ? `${slug}-${Date.now().toString(36)}` : slug;

      store = await prisma.store.create({
        data: {
          id:          crypto.randomUUID(),
          tenantId,
          slug:        finalSlug,
          name:        storeName,
          description: settings?.description || null,
          logo:        settings?.logoUrl || null,
          category:    settings?.businessType || "bodega",
          zone:        settings?.deliveryZone || null,
          commission:  5.0,
          isPublished: false,
          updatedAt:   new Date(),
        },
      });
      invalidateByPrefix("marketplace:stores");
    }

    // 2. Get all catalog products for this tenant (search all possible IDs)
    const catalogProducts = await prisma.product.findMany({
      where: { tenantId: { in: searchIds }, deletedAt: null },
      select: { id: true, price: true, active: true },
    });

    // 3. Get all existing StoreProducts for this store
    const existingStoreProducts = await prisma.storeProduct.findMany({
      where: { storeId: store.id },
      select: { id: true, productId: true, isActive: true },
    });
    const existingMap = new Map(existingStoreProducts.map((sp) => [sp.productId, sp]));

    // 4. Bucket each catalog product into: create, reactivate, deactivate, noop
    // N+1 fix: was N sequential create/update calls. Now: 1 createMany + N small updates
    // in a single transaction. Reactivations need per-row prices, so they stay as
    // individual updates but run in parallel inside the transaction.
    const toCreate: Array<{
      id: string;
      storeId: string;
      productId: number;
      retailPrice: number;
      minOrderQty: number;
      isActive: boolean;
    }> = [];
    const toReactivate: Array<{ id: string; price: number }> = [];
    const toDeactivate: string[] = [];

    for (const product of catalogProducts) {
      const existing = existingMap.get(product.id);
      // TD-018: product.price es Decimal → convertir para el contrato number
      const priceNum = toNumOrZero(product.price);

      if (product.active) {
        if (!existing) {
          toCreate.push({
            id:          crypto.randomUUID(),
            storeId:     store.id,
            productId:   product.id,
            retailPrice: priceNum,
            minOrderQty: 1,
            isActive:    true,
          });
        } else if (!existing.isActive) {
          toReactivate.push({ id: existing.id, price: priceNum });
        }
        // If already active, skip (don't override manual price changes)
      } else if (existing && existing.isActive) {
        toDeactivate.push(existing.id);
      }
    }

    const created = toCreate.length;
    const updated = toReactivate.length;
    const deactivated = toDeactivate.length;

    if (created > 0 || updated > 0 || deactivated > 0) {
      await prisma.$transaction(async (tx) => {
        if (toCreate.length > 0) {
          await tx.storeProduct.createMany({
            data: toCreate,
            skipDuplicates: true,
          });
        }
        if (toDeactivate.length > 0) {
          await tx.storeProduct.updateMany({
            where: { id: { in: toDeactivate } },
            data:  { isActive: false },
          });
        }
        if (toReactivate.length > 0) {
          // Bulk UPDATE con CASE WHEN — 1 query en lugar de N (perf fix
          // Bug Hunter Report 2026-04-30). Para 1000 productos: 1000 -> 1.
          // Tenant scope via storeId que ya viene scoped en la closure.
          if (toReactivate.length === 1) {
            const r = toReactivate[0];
            await tx.storeProduct.update({
              where: { id: r.id },
              data:  { isActive: true, retailPrice: r.price },
            });
          } else {
            const cases = Prisma.join(
              toReactivate.map((r) => Prisma.sql`WHEN ${r.id} THEN ${r.price}::decimal`),
              " ",
            );
            const ids = Prisma.join(toReactivate.map((r) => Prisma.sql`${r.id}`));
            await tx.$executeRaw`
              UPDATE "StoreProduct"
                 SET "isActive" = true,
                     "retailPrice" = CASE "id" ${cases} END
               WHERE "id" IN (${ids}) AND "storeId" = ${store.id}
            `;
          }
        }
      });
    }

    invalidateByPrefix(`marketplace:store-products`);

    return { created, updated, deactivated };
  },
};
