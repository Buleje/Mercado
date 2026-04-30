import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { NotFoundError } from "@/lib/api-error";
import { toNum, toNumOrZero } from "@/lib/decimal-utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DbStore = {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  description: string | null;
  logo: string | null;
  banner: string | null;
  category: string;
  zone: string | null;
  rating: number;
  reviewCount: number;
  isPublished: boolean;
  commission: number;
  createdAt: string;
};

export interface DbStoreProductModifierOption {
  id: string;
  name: string;
  priceDelta: number;
  isDefault: boolean;
  imageUrl: string | null;
}

export interface DbStoreProductModifierGroup {
  id: string;
  name: string;
  description: string | null;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: DbStoreProductModifierOption[];
}

export type DbStoreProduct = {
  id: string;
  storeId: string;
  productId: number;
  retailPrice: number;
  wholesalePrice: number | null;
  minOrderQty: number;
  isActive: boolean;
  volumePricingTiers: unknown | null;
  productName: string;
  productImage: string | null;
  productCategory: string;
  productUnit: string;
  modifierGroups: DbStoreProductModifierGroup[];
};

export type DbVendorDashboard = {
  totalOrders: number;
  totalRevenue: number;
  totalProducts: number;
  pendingOrders: number;
  topProducts: { name: string; quantity: number; revenue: number }[];
  recentOrders: {
    id: string;
    customerName: string;
    total: number;
    status: string;
    createdAt: string;
  }[];
};

// ─── Slugify ──────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// ─── MarketplaceStoresDB ──────────────────────────────────────────────────────

/**
 * Normaliza un número telefónico dejando solo dígitos.
 * Usado como dedup-key contra `Tenant.ownerPhone` (que NO es unique en schema,
 * así que la unicidad se fuerza en application-layer).
 */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export const MarketplaceStoresDB = {
  /**
   * Registrar una nueva tienda en el marketplace.
   *
   * **Fix 2026-04-09 (ADR-023):** antes este método recibea un `tenantId`
   * sintético como string (`store-${phone}`) que NUNCA existía como row real
   * en la tabla `Tenant`. Eso rompía el aislamiento multi-tenant, bloqueaba
   * el login del dueño al admin y dejaba los stores huérfanos.
   *
   * Ahora crea un `Tenant` REAL dentro de un `$transaction` y luego crea el
   * `Store` apuntando a ese `tenant.id` (cuid de verdad).
   *
   * Si ya existe un Tenant con el mismo `ownerPhone` normalizado, lanza error
   * (el route handler lo traduce a 409).
   */
  async register(params: {
    ownerName: string;
    ownerPhone: string;
    ownerEmail?: string;
    storeName: string;
    description?: string;
    logo?: string;
    banner?: string;
    category?: string;
    zone?: string;
    commission?: number;
  }): Promise<DbStore> {
    const phoneDigits = normalizePhone(params.ownerPhone);
    if (!phoneDigits) {
      throw new Error("Teléfono inválido");
    }

    // 1. Duplicate check por ownerPhone normalizado (application-layer unique)
    const existingTenant = await prisma.tenant.findFirst({
      where: { ownerPhone: phoneDigits, type: "store" },
      select: { id: true, slug: true, stores: { select: { slug: true }, take: 1 } },
    });
    if (existingTenant) {
      const err = new Error("Ya tienes una solicitud registrada con ese teléfono");
      (err as Error & { code?: string; storeSlug?: string }).code = "MKT_DUPLICATE_PHONE";
      (err as Error & { code?: string; storeSlug?: string }).storeSlug =
        existingTenant.stores[0]?.slug ?? existingTenant.slug;
      throw err;
    }

    // 2. Generar slugs únicos (Tenant.slug y Store.slug son ambos unique)
    const baseSlug = slugify(params.storeName) || `tienda-${phoneDigits.slice(-6)}`;

    const [storeSlugTaken, tenantSlugTaken] = await Promise.all([
      prisma.store.findUnique({ where: { slug: baseSlug }, select: { id: true } }),
      prisma.tenant.findUnique({ where: { slug: baseSlug }, select: { id: true } }),
    ]);

    const suffix = phoneDigits.slice(-6) || Date.now().toString(36).slice(-6);
    const storeSlug  = storeSlugTaken  ? `${baseSlug}-${suffix}` : baseSlug;
    const tenantSlug = tenantSlugTaken ? `${baseSlug}-${suffix}` : baseSlug;

    // 3. Crear Tenant + Store en una transacción atómica
    // Trial: 15 días desde la creación. La tienda queda invisible hasta
    // que el superadmin la aprueba (active=true + isPublished=true), pero
    // el contador de trial arranca al registrar — política de producto.
    const TRIAL_DAYS = 15;
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);
    const { store } = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          // id autogenerado por @default(cuid())
          slug:       tenantSlug,
          name:       params.storeName,
          type:       "store",
          plan:       "free",
          active:     false, // requiere aprobación del superadmin
          trialEndsAt,
          ownerEmail: params.ownerEmail ?? null,
          ownerPhone: phoneDigits,
        },
        select: { id: true },
      });

      const createdStore = await tx.store.create({
        data: {
          id:          crypto.randomUUID(),
          tenantId:    tenant.id, // ← tenant REAL
          slug:        storeSlug,
          name:        params.storeName,
          description: params.description ?? null,
          logo:        params.logo ?? null,
          banner:      params.banner ?? null,
          category:    params.category ?? "bodega",
          zone:        params.zone ?? null,
          commission:  params.commission ?? 5.0,
          isPublished: false, // requiere aprobación manual
          updatedAt:   new Date(),
        },
      });

      return { tenant, store: createdStore };
    });

    invalidateByPrefix("marketplace:stores");

    return {
      id:          store.id,
      tenantId:    store.tenantId,
      slug:        store.slug,
      name:        store.name,
      description: store.description,
      logo:        store.logo,
      banner:      store.banner,
      category:    store.category,
      zone:        store.zone,
      rating:      store.rating,
      reviewCount: store.reviewCount,
      isPublished: store.isPublished,
      commission:  store.commission,
      createdAt:   store.createdAt.toISOString(),
    };
  },

  /**
   * Registrar una tienda en el marketplace para un Tenant que YA EXISTE.
   *
   * Usado por el endpoint admin-autenticado `POST /api/marketplace/stores/register`,
   * donde el `tenantId` viene de `auth.tenantId` (sesión JWT) y por construcción
   * corresponde a un row real en la tabla `Tenant`.
   *
   * No crea Tenant nuevo. Diferente de `register()` (que sí lo hace para el
   * flujo público del apply).
   */
  async registerForExistingTenant(params: {
    tenantId: string;
    name: string;
    description?: string;
    logo?: string;
    banner?: string;
    category?: string;
    zone?: string;
    commission?: number;
  }): Promise<DbStore> {
    const baseSlug = slugify(params.name);

    // Si ya existe el slug, agregar sufijo del tenantId real
    const existing = await prisma.store.findUnique({
      where: { slug: baseSlug },
      select: { id: true },
    });
    const slug = existing ? `${baseSlug}-${params.tenantId.slice(-6)}` : baseSlug;

    const store = await prisma.store.create({
      data: {
        id:          crypto.randomUUID(),
        tenantId:    params.tenantId,
        slug,
        name:        params.name,
        description: params.description ?? null,
        logo:        params.logo ?? null,
        banner:      params.banner ?? null,
        category:    params.category ?? "bodega",
        zone:        params.zone ?? null,
        commission:  params.commission ?? 5.0,
        isPublished: false, // requiere aprobación manual
        updatedAt:   new Date(),
      },
    });

    invalidateByPrefix("marketplace:stores");

    return {
      id:          store.id,
      tenantId:    store.tenantId,
      slug:        store.slug,
      name:        store.name,
      description: store.description,
      logo:        store.logo,
      banner:      store.banner,
      category:    store.category,
      zone:        store.zone,
      rating:      store.rating,
      reviewCount: store.reviewCount,
      isPublished: store.isPublished,
      commission:  store.commission,
      createdAt:   store.createdAt.toISOString(),
    };
  },

  /**
   * Listar tiendas publicadas — usando cache de 5 minutos.
   */
  async list(params: {
    tenantId: string;
    zone?: string;
    category?: string;
    search?: string;
    limit?: number;
  }): Promise<DbStore[]> {
    const cacheKey = `marketplace:stores:list:${JSON.stringify(params)}`;

    return getOrSet(cacheKey, 300, async () => {
      // ADR-084: ocultar tiendas cuyo tenant tiene trial expirado sin plan pagado.
      // Visible si: tenant.active && (sub stripe OR sub mp OR trial vigente).
      const now = new Date();
      const rows = await prisma.store.findMany({
        where: {
          isPublished: true,
          tenantId: params.tenantId,
          tenant: {
            active: true,
            OR: [
              { stripeSubscriptionId: { not: null } },
              { mpSubscriptionId: { not: null } },
              { trialEndsAt: { gt: now } },
            ],
          },
          ...(params.zone     && { zone: params.zone }),
          ...(params.category && { category: params.category }),
          ...(params.search   && { name: { contains: params.search, mode: "insensitive" } }),
        },
        orderBy: { rating: "desc" },
        take:    params.limit ?? 20,
      });

      return rows.map((s) => ({
        id:          s.id,
        tenantId:    s.tenantId,
        slug:        s.slug,
        name:        s.name,
        description: s.description,
        logo:        s.logo,
        banner:      s.banner,
        category:    s.category,
        zone:        s.zone,
        rating:      s.rating,
        reviewCount: s.reviewCount,
        isPublished: s.isPublished,
        commission:  s.commission,
        createdAt:   s.createdAt.toISOString(),
      }));
    });
  },

  /**
   * Obtener tienda por slug (pública).
   */
  async getBySlug(slug: string): Promise<DbStore | null> {
    const cacheKey = `marketplace:stores:slug:${slug}`;

    return getOrSet(cacheKey, 300, async () => {
      // select explícito: evita columnas del schema que la DB aún no tiene
      // (lat, lng, vacationMode, vacationMessage — migration 20260411 pending).
      const s = await prisma.store.findUnique({
        where: { slug },
        select: {
          id: true, tenantId: true, slug: true, name: true, description: true,
          logo: true, banner: true, category: true, zone: true, rating: true,
          reviewCount: true, isPublished: true, commission: true, createdAt: true,
          tenant: {
            select: {
              active: true,
              plan: true,
              trialEndsAt: true,
              stripeSubscriptionId: true,
              mpSubscriptionId: true,
            },
          },
        },
      });
      if (!s || !s.isPublished) return null;
      // ADR-084: tienda oculta si tenant inactivo o trial expirado sin plan pagado.
      const t = s.tenant;
      const hasPaidSub = !!(t.stripeSubscriptionId || t.mpSubscriptionId);
      const trialActive = t.trialEndsAt ? t.trialEndsAt.getTime() > Date.now() : false;
      if (!t.active || (!hasPaidSub && !trialActive)) return null;

      return {
        id:          s.id,
        tenantId:    s.tenantId,
        slug:        s.slug,
        name:        s.name,
        description: s.description,
        logo:        s.logo,
        banner:      s.banner,
        category:    s.category,
        zone:        s.zone,
        rating:      s.rating,
        reviewCount: s.reviewCount,
        isPublished: s.isPublished,
        commission:  s.commission,
        createdAt:   s.createdAt.toISOString(),
      };
    });
  },

  /**
   * Buscar la tienda de un tenant específico (para auth de vendedor).
   */
  async getByTenantId(tenantId: string): Promise<DbStore | null> {
    const s = await prisma.store.findFirst({
      where: { tenantId },
      select: {
        id: true, tenantId: true, slug: true, name: true, description: true,
        logo: true, banner: true, category: true, zone: true, rating: true,
        reviewCount: true, isPublished: true, commission: true, createdAt: true,
      },
    });
    if (!s) return null;

    return {
      id:          s.id,
      tenantId:    s.tenantId,
      slug:        s.slug,
      name:        s.name,
      description: s.description,
      logo:        s.logo,
      banner:      s.banner,
      category:    s.category,
      zone:        s.zone,
      rating:      s.rating,
      reviewCount: s.reviewCount,
      isPublished: s.isPublished,
      commission:  s.commission,
      createdAt:   s.createdAt.toISOString(),
    };
  },
};

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
        .replace(/[\u0300-\u036f]/g, "")
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

// ─── MarketplaceOrdersDB ──────────────────────────────────────────────────────

type CartItem = {
  storeProductId: string;
  productId: number;
  name: string;
  quantity: number;
  retailPrice: number;
  unit: string;
};

export type DbMarketplaceOrder = {
  id: string;
  storeId: string;
  storeName: string;
  storeSlug: string;
  sellerTenantId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  notes: string | null;
  total: number;
  commission: number;
  status: string;
  createdAt: string;
};

export const MarketplaceOrdersDB = {
  /**
   * Crear un pedido en el sistema del vendedor con source="marketplace".
   * Un pedido por tienda (cada tienda es un tenant distinto).
   */
  async createFromCart(params: {
    storeSlug: string;
    customerName: string;
    customerPhone: string;
    customerAddress: string;
    notes?: string;
    paymentMethod?: string;
    items: CartItem[];
  }): Promise<DbMarketplaceOrder> {
    // 1. Cargar tienda y verificar que esté publicada
    const store = await prisma.store.findUnique({
      where:  { slug: params.storeSlug },
      select: { id: true, tenantId: true, name: true, slug: true, isPublished: true, commission: true },
    });
    if (!store || !store.isPublished) {
      throw new Error("Tienda no disponible");
    }

    // 2. Verificar que todos los items pertenecen a esta tienda y calcular totales
    const storeProductIds = params.items.map((i) => i.storeProductId);
    const storeProducts = await prisma.storeProduct.findMany({
      where: { id: { in: storeProductIds }, storeId: store.id, isActive: true },
      select: { id: true, productId: true, retailPrice: true, minOrderQty: true },
    });

    if (storeProducts.length !== storeProductIds.length) {
      throw new Error("Uno o más productos no están disponibles en esta tienda");
    }

    // Mapa de precio real (server-side — nunca confiar en el precio del cliente)
    // TD-018: sp.retailPrice es Decimal → convertir a number antes de map
    const priceMap = new Map(storeProducts.map((sp) => [sp.id, toNumOrZero(sp.retailPrice)]));

    const orderItems = params.items.map((item) => {
      // Defense-in-depth: la guarda anterior (line 675) ya garantiza que cada
      // storeProductId existe en priceMap. Si el fallback se dispara, es un
      // bug — lanzamos para evitar aceptar precios cliente-side.
      const unitPrice = priceMap.get(item.storeProductId);
      if (unitPrice === undefined) {
        throw new Error(`Precio server-side no disponible para storeProductId=${item.storeProductId}`);
      }
      return {
        productId: item.productId,
        name:      item.name,
        price:     unitPrice,
        quantity:  item.quantity,
        unit:      item.unit,
        image:     "",
      };
    });

    const subtotal   = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

    // ── Descuento por tier de cliente (Frecuente/VIP/Embajador) ──
    // Calculado server-side basado en pedidos entregados reales — no se
    // confía en el conteo del cliente (localStorage). Helper local
    // (espejo de tierForCount en /api/marketplace/customer-tier).
    let tierDiscountPct = 0;
    let tierLabel: string | null = null;
    if (params.customerPhone) {
      try {
        const deliveredCount = await prisma.order.count({
          where: {
            customerPhone: params.customerPhone,
            source: "marketplace",
            deletedAt: null,
            status: "entregado",
          },
        });
        if (deliveredCount >= 25) {
          tierDiscountPct = 10;
          tierLabel = "Cliente Embajador";
        } else if (deliveredCount >= 10) {
          tierDiscountPct = 7;
          tierLabel = "Cliente VIP";
        } else if (deliveredCount >= 5) {
          tierDiscountPct = 5;
          tierLabel = "Cliente Frecuente";
        }
      } catch {
        // Si la query falla (DB error), seguimos sin descuento — nunca
        // bloquear un pedido por la feature de tier.
      }
    }
    const tierDiscount = parseFloat(((subtotal * tierDiscountPct) / 100).toFixed(2));
    const total = parseFloat((subtotal - tierDiscount).toFixed(2));

    // TD-018: store.commission es Decimal → convertir para toFixed()
    const commissionRate = toNumOrZero(store.commission);
    const commission = parseFloat(((total * commissionRate) / 100).toFixed(2));

    // 2.5. Garantizar que el Customer existe antes de crear el Order.
    //     Order.customerPhone es FK a Customer.phone — sin este upsert, Postgres
    //     rechaza el INSERT con "Foreign key constraint violated on
    //     Order_customerPhone_fkey" (bug descubierto 2026-04-24 en smoke test).
    //     Los marketplace orders son de compradores anónimos que pueden nunca
    //     haber registrado cuenta, asi que garantizamos un Customer minimo.
    if (params.customerPhone) {
      // Race-safe: cuando el carrito tiene productos de 2+ tiendas, el frontend
      // dispara 1 POST por tienda en paralelo. Ambos intentan upsertar el
      // mismo Customer.phone — el primero gana, el segundo fallaria con P2002
      // (unique). Capturamos ese caso como ok ya que el Customer ya existe.
      try {
        await prisma.customer.upsert({
          where:  { phone: params.customerPhone },
          create: {
            phone:    params.customerPhone,
            name:     params.customerName,
            location: params.customerAddress,
            tenantId: store.tenantId, // asigna al vendedor en primer contacto
          },
          update: {
            // No pisar datos existentes del customer — solo crear si no existe.
          },
        });
      } catch (e: unknown) {
        const code = (e as { code?: string })?.code;
        if (code !== "P2002") throw e; // P2002 = unique violation (race) — safe to ignore
      }
    }

    // 3. Crear el Order en el tenant del vendedor
    const orderId = crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();

    // Componer notas con tag de tier para audit
    const noteParts: string[] = [];
    if (params.notes) noteParts.push(params.notes);
    if (tierDiscount > 0 && tierLabel) {
      noteParts.push(`[${tierLabel}: -${tierDiscountPct}% = -S/${tierDiscount.toFixed(2)}]`);
    }
    const composedNotes = noteParts.length > 0 ? noteParts.join(" ") : null;

    await prisma.order.create({
      data: {
        id:               `MKT-${orderId}`,
        tenantId:         store.tenantId,
        source:           "marketplace",
        customerName:     params.customerName,
        customerPhone:    params.customerPhone,
        customerLocation: params.customerAddress,
        total,
        discountAmount:   tierDiscount > 0 ? tierDiscount : null,
        notes:            composedNotes,
        paymentMethod:    params.paymentMethod || "marketplace",
        updatedAt:        new Date(),
        items: {
          create: orderItems,
        },
      },
    });

    // 4. Registrar comisión
    await prisma.commissionLedger.create({
      data: {
        id:       crypto.randomUUID(),
        orderId:  `MKT-${orderId}`,
        storeId:  store.id,
        type:     "sale",
        amount:   commission,
        rate:     store.commission,
        status:   "pending",
        tenantId: store.tenantId,
      },
    });

    return {
      id:             `MKT-${orderId}`,
      storeId:        store.id,
      storeName:      store.name,
      storeSlug:      store.slug,
      sellerTenantId: store.tenantId,
      customerName:   params.customerName,
      customerPhone:  params.customerPhone,
      customerAddress: params.customerAddress,
      notes:           params.notes ?? null,
      total,
      commission,
      status:         "pendiente",
      createdAt:      new Date().toISOString(),
    };
  },

  /**
   * Dashboard del vendedor: estadísticas de ventas, productos y pedidos recientes.
   * El tenantId del vendedor filtra únicamente sus datos.
   */
  async getVendorDashboard(tenantId: string): Promise<DbVendorDashboard> {
    const cacheKey = `marketplace:vendor:dashboard:${tenantId}`;

    return getOrSet(cacheKey, 60, async () => {
      const [allOrders, store] = await Promise.all([
        prisma.order.findMany({
          where: {
            tenantId,
            source:    "marketplace",
            deletedAt: null,
          },
          select: {
            id:           true,
            customerName: true,
            total:        true,
            status:       true,
            createdAt:    true,
            items: {
              select: { name: true, quantity: true, price: true },
            },
          },
          orderBy: { createdAt: "desc" },
          take:    100,
        }),
        prisma.store.findFirst({
          where:  { tenantId },
          select: { id: true },
        }),
      ]);

      // TD-018: o.total es Decimal → convertir para suma
      const totalRevenue = allOrders.reduce((sum, o) => sum + toNumOrZero(o.total), 0);
      const pendingOrders = allOrders.filter(
        (o) => o.status === "pendiente" || o.status === "confirmado",
      ).length;

      // Agregar ventas por producto
      const productSales = new Map<string, { quantity: number; revenue: number }>();
      for (const order of allOrders) {
        for (const item of order.items) {
          const existing = productSales.get(item.name) ?? { quantity: 0, revenue: 0 };
          // TD-018: item.price es Decimal → convertir para aritmética
          const itemPriceNum = toNumOrZero(item.price);
          productSales.set(item.name, {
            quantity: existing.quantity + item.quantity,
            revenue:  existing.revenue + itemPriceNum * item.quantity,
          });
        }
      }

      const topProducts = Array.from(productSales.entries())
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      const totalProducts = store
        ? await prisma.storeProduct.count({ where: { storeId: store.id, isActive: true } })
        : 0;

      return {
        totalOrders:  allOrders.length,
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        totalProducts,
        pendingOrders,
        topProducts,
        recentOrders: allOrders.slice(0, 10).map((o) => ({
          id:           o.id,
          customerName: o.customerName,
          // TD-018: total es Decimal → serializar a number
          total:        toNumOrZero(o.total),
          status:       o.status,
          createdAt:    o.createdAt.toISOString(),
        })),
      };
    });
  },

  /**
   * Get today's marketplace orders for a specific tenant (for daily summary).
   */
  async getTodayOrders(tenantId: string) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return prisma.order.findMany({
      where: {
        tenantId,
        source: "marketplace",
        createdAt: { gte: startOfDay },
        deletedAt: null,
      },
      select: {
        id: true,
        customerName: true,
        total: true,
        status: true,
        createdAt: true,
        items: { select: { name: true, quantity: true, price: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  },
};

// ─── MarketplaceReviewsDB ─────────────────────────────────────────────────────

export const MarketplaceReviewsDB = {
  /**
   * Get approved reviews for a store (public).
   */
  async getByStore(storeId: string) {
    return prisma.review.findMany({
      where: { storeId, status: "approved", deletedAt: null },
      select: {
        id: true, name: true, text: true, rating: true,
        date: true, adminReply: true, adminReplyDate: true,
      },
      orderBy: { date: "desc" },
      take: 50,
    });
  },

  /**
   * Get aggregate rating for a store.
   */
  async getStoreRating(storeId: string): Promise<{ rating: number; count: number }> {
    const result = await prisma.review.aggregate({
      where: { storeId, status: "approved", deletedAt: null },
      _avg: { rating: true },
      _count: { rating: true },
    });
    return {
      rating: Math.round((result._avg.rating ?? 0) * 10) / 10,
      count: result._count.rating,
    };
  },

  /**
   * Add a review for a marketplace store (public, status=pending).
   */
  async add(params: {
    storeId: string;
    name: string;
    text: string;
    rating: number;
    phone?: string;
  }) {
    // Verify store exists
    const store = await prisma.store.findUnique({
      where: { id: params.storeId },
      select: { id: true, tenantId: true },
    });
    if (!store) throw new Error("Tienda no encontrada");

    const review = await prisma.review.create({
      data: {
        id: crypto.randomUUID(),
        name: params.name,
        text: params.text,
        rating: params.rating,
        phone: params.phone ?? null,
        storeId: params.storeId,
        tenantId: store.tenantId,
        status: "pending",
        date: new Date(),
      },
      select: {
        id: true, name: true, text: true, rating: true,
        date: true, status: true,
      },
    });

    return review;
  },
};

// ─── MarketplaceAbandonedCartsDB ──────────────────────────────────────────────

type AbandonedCartItem = {
  storeProductId: string;
  productId: number;
  name: string;
  quantity: number;
  price: number;
  unit: string;
};

export type AbandonedCartRecord = {
  id: string;
  storeSlug: string;
  customerName: string;
  customerPhone: string;
  itemsJson: string;
  total: number;
  recovered: boolean;
  convertedAt: Date | null;
  reminderSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export const MarketplaceAbandonedCartsDB = {
  /**
   * Save/update a marketplace cart for recovery tracking.
   * Called when user enters customer info in checkout.
   * Upserts by storeSlug + customerPhone to avoid duplicates.
   */
  async save(params: {
    storeSlug: string;
    customerName: string;
    customerPhone: string;
    items: AbandonedCartItem[];
    total: number;
  }): Promise<AbandonedCartRecord | null> {
    try {
      const itemsJson = JSON.stringify(params.items);
      // Try to find existing non-recovered cart for this customer+store
      const existing = await prisma.marketplaceAbandonedCart.findFirst({
        where: {
          storeSlug: params.storeSlug,
          customerPhone: params.customerPhone,
          recovered: false,
        },
        select: { id: true },
      });

      if (existing) {
        const updated = await prisma.marketplaceAbandonedCart.update({
          where: { id: existing.id },
          data: {
            customerName: params.customerName,
            itemsJson,
            total: params.total,
            reminderSentAt: null, // reset so new reminder can be sent
          },
        });
        return updated as AbandonedCartRecord;
      }

      const created = await prisma.marketplaceAbandonedCart.create({
        data: {
          storeSlug: params.storeSlug,
          customerName: params.customerName,
          customerPhone: params.customerPhone,
          itemsJson,
          total: params.total,
        },
      });
      return created as AbandonedCartRecord;
    } catch {
      return null;
    }
  },

  /**
   * Mark a cart as converted (order was placed).
   */
  async markConverted(storeSlug: string, customerPhone: string): Promise<void> {
    try {
      await prisma.marketplaceAbandonedCart.updateMany({
        where: {
          storeSlug,
          customerPhone,
          recovered: false,
        },
        data: {
          recovered: true,
          convertedAt: new Date(),
        },
      });
    } catch {
      // silently fail — non-critical
    }
  },

  /**
   * Get abandoned carts that haven't been converted and haven't received a reminder.
   * Only carts older than `hoursOld` hours and younger than 24h.
   */
  async getAbandoned(hoursOld = 2): Promise<AbandonedCartRecord[]> {
    try {
      const cutoff = new Date(Date.now() - hoursOld * 60 * 60 * 1000);
      const maxAge = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const carts = await prisma.marketplaceAbandonedCart.findMany({
        where: {
          recovered: false,
          reminderSentAt: null,
          createdAt: { lt: cutoff, gt: maxAge },
        },
        orderBy: { createdAt: "asc" },
        take: 50,
      });
      return carts as AbandonedCartRecord[];
    } catch {
      return [];
    }
  },

  /**
   * Mark reminder as sent for a cart.
   */
  async markReminderSent(id: string): Promise<void> {
    try {
      await prisma.marketplaceAbandonedCart.update({
        where: { id },
        data: { reminderSentAt: new Date() },
      });
    } catch {
      // silently fail
    }
  },
};
