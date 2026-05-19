import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidate, invalidateByPrefix } from "@/lib/cache";
import { toNum, toNumOrZero } from "@/lib/decimal-utils";
import type {
  TenantStorePage as PStorePage,
  TenantPageProductOverride as POverride,
  TenantPagePromotion as PPromotion,
} from "@/lib/generated/prisma/client";

/**
 * lib/db/store-page.db.ts
 *
 * DB class para el sistema de Página Individual por Tienda.
 * Cada Tenant tiene su propia página pública personalizable en /t/[slug].
 *
 * Modelos manejados:
 *  - TenantStorePage              → customización (tema, hero, about, SEO)
 *  - TenantPageProductOverride    → productos destacados + precio exclusivo
 *  - TenantPagePromotion          → promociones SOLO de la página individual
 *  - TenantPageVisit              → analytics (visitas + conversiones)
 *
 * Multi-tenant:
 *  - `tenantId` siempre primer parámetro.
 *  - Invalida caché por prefijo tras cualquier escritura.
 *  - Los overrides NO tocan Product.price ni StoreProduct — solo aplican
 *    cuando el cliente visita /t/[slug]. El marketplace general queda intacto.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbStorePage = {
  id: string;
  tenantId: string;
  published: boolean;
  heroTitle: string | null;
  heroSubtitle: string | null;
  heroImageUrl: string | null;
  heroCtaLabel: string | null;
  heroCtaUrl: string | null;
  primaryColor: string;
  accentColor: string;
  aboutTitle: string | null;
  aboutBody: string | null;
  whatsappPhone: string | null;
  contactEmail: string | null;
  address: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImageUrl: string | null;
  footerHtml: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DbStorePageUpsertInput = {
  published?: boolean;
  heroTitle?: string | null;
  heroSubtitle?: string | null;
  heroImageUrl?: string | null;
  heroCtaLabel?: string | null;
  heroCtaUrl?: string | null;
  primaryColor?: string;
  accentColor?: string;
  aboutTitle?: string | null;
  aboutBody?: string | null;
  whatsappPhone?: string | null;
  contactEmail?: string | null;
  address?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  ogImageUrl?: string | null;
  footerHtml?: string | null;
};

export type DbPageOverride = {
  id: string;
  tenantId: string;
  productId: number;
  exclusivePrice: number | null;
  featured: boolean;
  sortOrder: number;
  badge: string | null;
  visible: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DbPageOverrideWithProduct = DbPageOverride & {
  productName: string;
  productImage: string;
  productCategory: string;
  productUnit: string;
  productBasePrice: number;
  savingsPercent: number | null;
};

export type DbPageOverrideUpsertInput = {
  productId: number;
  exclusivePrice?: number | null;
  featured?: boolean;
  sortOrder?: number;
  badge?: string | null;
  visible?: boolean;
};

export type DbPagePromotion = {
  id: string;
  tenantId: string;
  title: string;
  description: string | null;
  discountType: "percent" | "amount" | "fixed";
  discountValue: number;
  bannerImageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  active: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type DbPagePromotionCreateInput = {
  title: string;
  description?: string | null;
  discountType: "percent" | "amount" | "fixed";
  discountValue: number;
  bannerImageUrl?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  active?: boolean;
  position?: number;
};

export type DbPagePromotionUpdateInput = Partial<DbPagePromotionCreateInput>;

export type DbPageAnalytics = {
  visits7d: number;
  visits30d: number;
  conversions7d: number;
  conversions30d: number;
  conversionRate30d: number;
  topReferrers: { referrer: string; count: number }[];
  topUtmSources: { source: string; count: number }[];
  visitsByDay: { day: string; visits: number; conversions: number }[];
};

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapPage(row: PStorePage): DbStorePage {
  return {
    id: row.id,
    tenantId: row.tenantId,
    published: row.published,
    heroTitle: row.heroTitle,
    heroSubtitle: row.heroSubtitle,
    heroImageUrl: row.heroImageUrl,
    heroCtaLabel: row.heroCtaLabel,
    heroCtaUrl: row.heroCtaUrl,
    primaryColor: row.primaryColor,
    accentColor: row.accentColor,
    aboutTitle: row.aboutTitle,
    aboutBody: row.aboutBody,
    whatsappPhone: row.whatsappPhone,
    contactEmail: row.contactEmail,
    address: row.address,
    metaTitle: row.metaTitle,
    metaDescription: row.metaDescription,
    ogImageUrl: row.ogImageUrl,
    footerHtml: row.footerHtml,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapOverride(row: POverride): DbPageOverride {
  return {
    id: row.id,
    tenantId: row.tenantId,
    productId: row.productId,
    exclusivePrice: row.exclusivePrice != null ? toNum(row.exclusivePrice) : null,
    featured: row.featured,
    sortOrder: row.sortOrder,
    badge: row.badge,
    visible: row.visible,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapPromotion(row: PPromotion): DbPagePromotion {
  return {
    id: row.id,
    tenantId: row.tenantId,
    title: row.title,
    description: row.description,
    discountType: row.discountType as "percent" | "amount" | "fixed",
    discountValue: toNumOrZero(row.discountValue),
    bannerImageUrl: row.bannerImageUrl,
    ctaLabel: row.ctaLabel,
    ctaUrl: row.ctaUrl,
    startAt: row.startAt ? row.startAt.toISOString() : null,
    endAt: row.endAt ? row.endAt.toISOString() : null,
    active: row.active,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function getErrorMessage(error: unknown): string {
  if (typeof error === "string") return error.toLowerCase();
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "").toLowerCase();
  }
  return "";
}

function getErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code?: unknown }).code ?? "").toUpperCase();
  }
  return "";
}

function isMissingTableError(error: unknown, tableName: string): boolean {
  const msg = getErrorMessage(error);
  const code = getErrorCode(error);
  const table = tableName.toLowerCase();

  const mentionsTable = msg.includes(table) || msg.includes(`public.${table}`);
  const missingTableMessage = msg.includes("does not exist") || (msg.includes("relation") && msg.includes("not exist"));

  // P2021 = table does not exist in Prisma. Some environments wrap the message differently.
  if (code === "P2021") return mentionsTable || missingTableMessage;
  return mentionsTable && missingTableMessage;
}

function isMissingStorePageTableError(error: unknown): boolean {
  return isMissingTableError(error, "tenantstorepage");
}

function isMissingPromotionTableError(error: unknown): boolean {
  return isMissingTableError(error, "tenantpagepromotion");
}

function isMissingOverrideTableError(error: unknown): boolean {
  return isMissingTableError(error, "tenantpageproductoverride");
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

const CACHE_PREFIX = "store-page";
const CACHE_TTL = 120; // 2 minutes

function cacheKey(tenantId: string, suffix: string): string {
  return `${CACHE_PREFIX}:${tenantId}:${suffix}`;
}

function invalidateTenant(tenantId: string): void {
  invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}:`);
}

// ── Default page factory ──────────────────────────────────────────────────────

function defaultPage(tenantId: string): DbStorePage {
  const now = new Date().toISOString();
  return {
    id: "",
    tenantId,
    published: true,
    heroTitle: null,
    heroSubtitle: null,
    heroImageUrl: null,
    heroCtaLabel: null,
    heroCtaUrl: null,
    primaryColor: "#00B4A6",
    accentColor: "#f4a261",
    aboutTitle: null,
    aboutBody: null,
    whatsappPhone: null,
    contactEmail: null,
    address: null,
    metaTitle: null,
    metaDescription: null,
    ogImageUrl: null,
    footerHtml: null,
    createdAt: now,
    updatedAt: now,
  };
}

// ── DB Class ──────────────────────────────────────────────────────────────────

export const StorePageDB = {
  // ──────────────────────────────────────────────
  // Customization
  // ──────────────────────────────────────────────

  /**
   * Obtener customización. Si no existe, retorna defaults (no crea row).
   */
  async getCustomization(tenantId: string): Promise<DbStorePage> {
    try {
      return await getOrSet(cacheKey(tenantId, "customization"), CACHE_TTL, async () => {
        const row = await prisma.tenantStorePage.findUnique({
          where: { tenantId },
        });
        return row ? mapPage(row) : defaultPage(tenantId);
      });
    } catch (err) {
      if (isMissingStorePageTableError(err)) return defaultPage(tenantId);
      throw err;
    }
  },

  /**
   * Crear o actualizar customización. Idempotente.
   */
  async upsertCustomization(
    tenantId: string,
    data: DbStorePageUpsertInput,
  ): Promise<DbStorePage> {
    let row;
    try {
      row = await prisma.tenantStorePage.upsert({
      where: { tenantId },
      create: {
        tenantId,
        published: data.published ?? true,
        heroTitle: data.heroTitle ?? null,
        heroSubtitle: data.heroSubtitle ?? null,
        heroImageUrl: data.heroImageUrl ?? null,
        heroCtaLabel: data.heroCtaLabel ?? null,
        heroCtaUrl: data.heroCtaUrl ?? null,
        primaryColor: data.primaryColor ?? "#00B4A6",
        accentColor: data.accentColor ?? "#f4a261",
        aboutTitle: data.aboutTitle ?? null,
        aboutBody: data.aboutBody ?? null,
        whatsappPhone: data.whatsappPhone ?? null,
        contactEmail: data.contactEmail ?? null,
        address: data.address ?? null,
        metaTitle: data.metaTitle ?? null,
        metaDescription: data.metaDescription ?? null,
        ogImageUrl: data.ogImageUrl ?? null,
        footerHtml: data.footerHtml ?? null,
      },
      update: {
        ...(data.published !== undefined && { published: data.published }),
        ...(data.heroTitle !== undefined && { heroTitle: data.heroTitle }),
        ...(data.heroSubtitle !== undefined && { heroSubtitle: data.heroSubtitle }),
        ...(data.heroImageUrl !== undefined && { heroImageUrl: data.heroImageUrl }),
        ...(data.heroCtaLabel !== undefined && { heroCtaLabel: data.heroCtaLabel }),
        ...(data.heroCtaUrl !== undefined && { heroCtaUrl: data.heroCtaUrl }),
        ...(data.primaryColor !== undefined && { primaryColor: data.primaryColor }),
        ...(data.accentColor !== undefined && { accentColor: data.accentColor }),
        ...(data.aboutTitle !== undefined && { aboutTitle: data.aboutTitle }),
        ...(data.aboutBody !== undefined && { aboutBody: data.aboutBody }),
        ...(data.whatsappPhone !== undefined && { whatsappPhone: data.whatsappPhone }),
        ...(data.contactEmail !== undefined && { contactEmail: data.contactEmail }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.metaTitle !== undefined && { metaTitle: data.metaTitle }),
        ...(data.metaDescription !== undefined && { metaDescription: data.metaDescription }),
        ...(data.ogImageUrl !== undefined && { ogImageUrl: data.ogImageUrl }),
        ...(data.footerHtml !== undefined && { footerHtml: data.footerHtml }),
      },
    });
    } catch (err) {
      if (isMissingStorePageTableError(err)) return defaultPage(tenantId);
      throw err;
    }
    invalidateTenant(tenantId);
    return mapPage(row);
  },

  // ──────────────────────────────────────────────
  // Product overrides
  // ──────────────────────────────────────────────

  /**
   * Listar overrides con datos del producto (join). Solo los del tenant.
   * Ordenados: visibles primero, luego featured, luego sortOrder asc.
   */
  async listOverrides(tenantId: string): Promise<DbPageOverrideWithProduct[]> {
    try {
      return await getOrSet(cacheKey(tenantId, "overrides"), CACHE_TTL, async () => {
        const rows = await prisma.tenantPageProductOverride.findMany({
          where: { tenantId },
          include: { product: true },
          orderBy: [
            { visible: "desc" },
            { featured: "desc" },
            { sortOrder: "asc" },
          ],
        });

        return rows.map((r) => {
          const override = mapOverride(r);
          const basePrice = toNumOrZero(r.product.price);
          const savingsPercent =
            override.exclusivePrice != null && basePrice > 0
              ? Math.round((1 - override.exclusivePrice / basePrice) * 100)
              : null;
          return {
            ...override,
            productName: r.product.name,
            productImage: r.product.image,
            productCategory: r.product.category,
            productUnit: r.product.unit,
            productBasePrice: basePrice,
            savingsPercent,
          };
        });
      });
    } catch (err) {
      if (isMissingOverrideTableError(err)) return [];
      throw err;
    }
  },

  /**
   * Listar solo los overrides visibles + featured (para la página pública).
   * Cumple reglas: si exclusivePrice es null, el override igual aplica
   * (visible/featured/badge). Pero el "precio exclusivo" solo cuenta cuando
   * exclusivePrice < basePrice.
   */
  async listPublicFeatured(
    tenantId: string,
    limit = 24,
  ): Promise<DbPageOverrideWithProduct[]> {
    try {
      return await getOrSet(
        cacheKey(tenantId, `public-featured-${limit}`),
        CACHE_TTL,
        async () => {
          const rows = await prisma.tenantPageProductOverride.findMany({
            where: { tenantId, visible: true },
            include: { product: { include: { images: { take: 1 } } } },
            orderBy: [{ featured: "desc" }, { sortOrder: "asc" }],
            take: limit,
          });

          return rows
            .filter((r) => r.product.active && r.product.deletedAt == null)
            .map((r) => {
              const override = mapOverride(r);
              const basePrice = toNumOrZero(r.product.price);
              const savingsPercent =
                override.exclusivePrice != null && basePrice > 0
                  ? Math.round((1 - override.exclusivePrice / basePrice) * 100)
                  : null;
              return {
                ...override,
                productName: r.product.name,
                productImage: r.product.image,
                productCategory: r.product.category,
                productUnit: r.product.unit,
                productBasePrice: basePrice,
                savingsPercent,
              };
            });
        },
      );
    } catch (err) {
      if (isMissingOverrideTableError(err)) return [];
      throw err;
    }
  },

  /**
   * Cuenta de precios exclusivos activos (exclusivePrice < basePrice).
   * Usado para el badge "tiene N precios exclusivos hoy" en la página.
   */
  async countActiveExclusivePrices(tenantId: string): Promise<number> {
    try {
      return await getOrSet(
        cacheKey(tenantId, "exclusive-price-count"),
        CACHE_TTL,
        async () => {
          const rows = await prisma.tenantPageProductOverride.findMany({
            where: {
              tenantId,
              visible: true,
              exclusivePrice: { not: null },
            },
            select: { exclusivePrice: true, product: { select: { price: true } } },
          });
          return rows.filter((r) => {
            const excl = r.exclusivePrice != null ? toNum(r.exclusivePrice) : null;
            const base = toNumOrZero(r.product.price);
            return excl != null && base > 0 && excl < base;
          }).length;
        },
      );
    } catch (err) {
      if (isMissingOverrideTableError(err)) return 0;
      throw err;
    }
  },

  /**
   * Upsert por (tenantId, productId). Valida que el producto pertenezca al
   * mismo tenant (doble-check de aislamiento). Valida que exclusivePrice,
   * si se provee, sea >= 0 y, si es menor que base, se acepte como exclusivo.
   */
  async upsertOverride(
    tenantId: string,
    input: DbPageOverrideUpsertInput,
  ): Promise<DbPageOverride> {
    // Isolation guard: el producto debe pertenecer al mismo tenant.
    const product = await prisma.product.findFirst({
      where: { id: input.productId, tenantId },
      select: { id: true },
    });
    if (!product) {
      const err = new Error(
        "Producto no encontrado o no pertenece a este tenant",
      );
      (err as Error & { code?: string }).code = "PRODUCT_NOT_FOUND";
      throw err;
    }

    if (input.exclusivePrice != null && input.exclusivePrice < 0) {
      const err = new Error("El precio exclusivo no puede ser negativo");
      (err as Error & { code?: string }).code = "INVALID_PRICE";
      throw err;
    }

    const row = await prisma.tenantPageProductOverride.upsert({
      where: {
        tenantId_productId: {
          tenantId,
          productId: input.productId,
        },
      },
      create: {
        tenantId,
        productId: input.productId,
        exclusivePrice: input.exclusivePrice ?? null,
        featured: input.featured ?? false,
        sortOrder: input.sortOrder ?? 0,
        badge: input.badge ?? null,
        visible: input.visible ?? true,
      },
      update: {
        ...(input.exclusivePrice !== undefined && {
          exclusivePrice: input.exclusivePrice,
        }),
        ...(input.featured !== undefined && { featured: input.featured }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
        ...(input.badge !== undefined && { badge: input.badge }),
        ...(input.visible !== undefined && { visible: input.visible }),
      },
    });

    invalidateTenant(tenantId);
    return mapOverride(row);
  },

  async deleteOverride(tenantId: string, productId: number): Promise<void> {
    try {
      await prisma.tenantPageProductOverride.deleteMany({
        where: { tenantId, productId },
      });
      invalidateTenant(tenantId);
    } catch (err) {
      if (isMissingOverrideTableError(err)) return;
      throw err;
    }
  },

  /**
   * Bulk: setea `visible` para los `productIds` del tenant. Crea overrides si
   * no existen (resto de campos queda default). Idempotente. Invalida caché.
   *
   * Devuelve { updated, created, skipped } para telemetría.
   */
  async setBulkVisibility(
    tenantId: string,
    productIds: number[],
    visible: boolean,
  ): Promise<{ updated: number; created: number; skipped: number }> {
    if (productIds.length === 0) return { updated: 0, created: 0, skipped: 0 };

    try {
      // Isolation guard: solo productos del tenant
      const validProducts = await prisma.product.findMany({
        where: {
          id: { in: productIds },
          tenantId,
          deletedAt: null,
        },
        select: { id: true },
      });
      const validIds = new Set(validProducts.map((p) => p.id));
      const skipped = productIds.length - validIds.size;

      if (validIds.size === 0) {
        return { updated: 0, created: 0, skipped };
      }

      // Brandon perf P1 #4: batch lookup + createMany/updateMany en vez de 2xN upserts.
      // Antes: (findUnique + create|update) × N productos = 2xN queries.
      // Ahora: 1 findMany + máximo 2 queries (createMany + updateMany) = 3 queries total.
      const existingOverrides = await prisma.tenantPageProductOverride.findMany({
        where: { tenantId, productId: { in: [...validIds] } },
        select: { productId: true },
      });
      const existingSet = new Set(existingOverrides.map((e) => e.productId));

      const toCreate = [...validIds].filter((id) => !existingSet.has(id));
      const toUpdate = [...validIds].filter((id) => existingSet.has(id));

      const [createResult, updateResult] = await Promise.all([
        toCreate.length > 0
          ? prisma.tenantPageProductOverride.createMany({
              data: toCreate.map((productId) => ({
                tenantId,
                productId,
                visible,
                featured: false,
                sortOrder: 0,
              })),
              skipDuplicates: true,
            })
          : Promise.resolve({ count: 0 }),
        toUpdate.length > 0
          ? prisma.tenantPageProductOverride.updateMany({
              where: { tenantId, productId: { in: toUpdate } },
              data: { visible },
            })
          : Promise.resolve({ count: 0 }),
      ]);

      const created = createResult.count;
      const updated = updateResult.count;

      invalidateTenant(tenantId);
      return { updated, created, skipped };
    } catch (err) {
      if (isMissingOverrideTableError(err)) {
        return { updated: 0, created: 0, skipped: productIds.length };
      }
      throw err;
    }
  },

  /**
   * Lista todos los productos activos del tenant con su estado de visibilidad
   * en la tienda individual. Si no hay override, se considera visible=true
   * (default). Usado por el admin "Catalogo Tienda".
   */
  async listCatalogWithVisibility(
    tenantId: string,
  ): Promise<
    Array<{
      productId: number;
      name: string;
      image: string;
      category: string;
      unit: string;
      price: number;
      stock: number | null;
      active: boolean;
      visible: boolean; // true si override.visible OR no hay override
    }>
  > {
    const products = await prisma.product.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        image: true,
        category: true,
        unit: true,
        price: true,
        stock: true,
        active: true,
      },
    });

    let overrides: Array<{ productId: number; visible: boolean }> = [];
    try {
      overrides = await prisma.tenantPageProductOverride.findMany({
        where: { tenantId, productId: { in: products.map((p) => p.id) } },
        select: { productId: true, visible: true },
      });
    } catch (err) {
      if (!isMissingOverrideTableError(err)) throw err;
      // Tabla no migrada todavía → todos visibles por default
    }
    const overrideMap = new Map(overrides.map((o) => [o.productId, o.visible]));

    return products.map((p) => ({
      productId: p.id,
      name: p.name,
      image: p.image,
      category: p.category,
      unit: p.unit,
      price: toNumOrZero(p.price),
      stock: p.stock,
      active: p.active,
      // Default: si no hay override, es visible (true)
      visible: overrideMap.get(p.id) ?? true,
    }));
  },

  // ──────────────────────────────────────────────
  // Promotions
  // ──────────────────────────────────────────────

  async listPromotions(
    tenantId: string,
    onlyActive = false,
  ): Promise<DbPagePromotion[]> {
    const key = cacheKey(tenantId, `promotions:${onlyActive ? "active" : "all"}`);
    return getOrSet(key, CACHE_TTL, async () => {
      const now = new Date();
      try {
        const rows = await prisma.tenantPagePromotion.findMany({
          where: {
            tenantId,
            ...(onlyActive && {
              active: true,
              OR: [{ startAt: null }, { startAt: { lte: now } }],
              AND: [{ OR: [{ endAt: null }, { endAt: { gte: now } }] }],
            }),
          },
          orderBy: [{ position: "asc" }, { createdAt: "desc" }],
        });
        return rows.map(mapPromotion);
      } catch (error) {
        // Graceful degradation: keep /t/[slug] working if promotion migration is pending.
        if (isMissingPromotionTableError(error)) return [];
        throw error;
      }
    });
  },

  async createPromotion(
    tenantId: string,
    data: DbPagePromotionCreateInput,
  ): Promise<DbPagePromotion> {
    const row = await prisma.tenantPagePromotion.create({
      data: {
        tenantId,
        title: data.title,
        description: data.description ?? null,
        discountType: data.discountType,
        discountValue: data.discountValue,
        bannerImageUrl: data.bannerImageUrl ?? null,
        ctaLabel: data.ctaLabel ?? null,
        ctaUrl: data.ctaUrl ?? null,
        startAt: data.startAt ? new Date(data.startAt) : null,
        endAt: data.endAt ? new Date(data.endAt) : null,
        active: data.active ?? true,
        position: data.position ?? 0,
      },
    });
    invalidateTenant(tenantId);
    return mapPromotion(row);
  },

  async updatePromotion(
    tenantId: string,
    id: string,
    data: DbPagePromotionUpdateInput,
  ): Promise<DbPagePromotion | null> {
    const result = await prisma.tenantPagePromotion.updateMany({
      where: { id, tenantId },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.discountType !== undefined && { discountType: data.discountType }),
        ...(data.discountValue !== undefined && { discountValue: data.discountValue }),
        ...(data.bannerImageUrl !== undefined && { bannerImageUrl: data.bannerImageUrl }),
        ...(data.ctaLabel !== undefined && { ctaLabel: data.ctaLabel }),
        ...(data.ctaUrl !== undefined && { ctaUrl: data.ctaUrl }),
        ...(data.startAt !== undefined && {
          startAt: data.startAt ? new Date(data.startAt) : null,
        }),
        ...(data.endAt !== undefined && {
          endAt: data.endAt ? new Date(data.endAt) : null,
        }),
        ...(data.active !== undefined && { active: data.active }),
        ...(data.position !== undefined && { position: data.position }),
      },
    });
    if (result.count === 0) return null;
    const row = await prisma.tenantPagePromotion.findFirst({
      where: { id, tenantId },
    });
    invalidateTenant(tenantId);
    return row ? mapPromotion(row) : null;
  },

  async deletePromotion(tenantId: string, id: string): Promise<void> {
    await prisma.tenantPagePromotion.deleteMany({
      where: { id, tenantId },
    });
    invalidateTenant(tenantId);
  },

  // ──────────────────────────────────────────────
  // Analytics
  // ──────────────────────────────────────────────

  /**
   * Insert fire-and-forget de una visita.
   * Los callers NO deben await esta operación — ver reglas CLAUDE.md #7.
   */
  async trackVisit(
    tenantId: string,
    params: {
      sessionId?: string | null;
      referrer?: string | null;
      utmSource?: string | null;
      userAgent?: string | null;
      ipHash?: string | null;
      path?: string | null;
    },
  ): Promise<void> {
    await prisma.tenantPageVisit.create({
      data: {
        tenantId,
        sessionId: params.sessionId ?? null,
        referrer: params.referrer ?? null,
        utmSource: params.utmSource ?? null,
        userAgent: params.userAgent ?? null,
        ipHash: params.ipHash ?? null,
        path: params.path ?? null,
      },
    });
    invalidate(cacheKey(tenantId, "analytics"));
  },

  /**
   * Marcar una visita como convertida cuando el cliente completa un pedido.
   * Fire-and-forget. Si no hay sessionId, no hace nada (no podemos match).
   */
  async markConversion(
    tenantId: string,
    sessionId: string | null,
    orderId: string,
  ): Promise<void> {
    if (!sessionId) return;
    await prisma.tenantPageVisit.updateMany({
      where: {
        tenantId,
        sessionId,
        converted: false,
        visitedAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24) }, // last 24h
      },
      data: {
        converted: true,
        orderId,
      },
    });
    invalidate(cacheKey(tenantId, "analytics"));
  },

  /**
   * Agregado de métricas: visitas + conversiones 7d/30d, top referrers,
   * top UTM sources, y series diaria últimos 30d.
   */
  async getAnalytics(tenantId: string): Promise<DbPageAnalytics> {
    return getOrSet(cacheKey(tenantId, "analytics"), 60, async () => {
      const now = new Date();
      const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [
        visits7d,
        visits30d,
        conversions7d,
        conversions30d,
        rows30d,
      ] = await Promise.all([
        prisma.tenantPageVisit.count({
          where: { tenantId, visitedAt: { gte: d7 } },
        }),
        prisma.tenantPageVisit.count({
          where: { tenantId, visitedAt: { gte: d30 } },
        }),
        prisma.tenantPageVisit.count({
          where: { tenantId, converted: true, visitedAt: { gte: d7 } },
        }),
        prisma.tenantPageVisit.count({
          where: { tenantId, converted: true, visitedAt: { gte: d30 } },
        }),
        prisma.tenantPageVisit.findMany({
          where: { tenantId, visitedAt: { gte: d30 } },
          select: {
            referrer: true,
            utmSource: true,
            converted: true,
            visitedAt: true,
          },
          take: 5000,
        }),
      ]);

      // Top referrers
      const refCounts = new Map<string, number>();
      for (const r of rows30d) {
        const ref = r.referrer?.trim() || "(direct)";
        refCounts.set(ref, (refCounts.get(ref) ?? 0) + 1);
      }
      const topReferrers = [...refCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([referrer, count]) => ({ referrer, count }));

      // Top UTM sources
      const utmCounts = new Map<string, number>();
      for (const r of rows30d) {
        const src = r.utmSource?.trim() || "(none)";
        utmCounts.set(src, (utmCounts.get(src) ?? 0) + 1);
      }
      const topUtmSources = [...utmCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([source, count]) => ({ source, count }));

      // Series por día últimos 30 días
      const byDay = new Map<string, { visits: number; conversions: number }>();
      for (let i = 29; i >= 0; i--) {
        const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
        byDay.set(day, { visits: 0, conversions: 0 });
      }
      for (const r of rows30d) {
        const day = r.visitedAt.toISOString().slice(0, 10);
        const bucket = byDay.get(day);
        if (bucket) {
          bucket.visits += 1;
          if (r.converted) bucket.conversions += 1;
        }
      }
      const visitsByDay = [...byDay.entries()].map(([day, v]) => ({
        day,
        visits: v.visits,
        conversions: v.conversions,
      }));

      const conversionRate30d =
        visits30d > 0 ? Math.round((conversions30d / visits30d) * 1000) / 10 : 0;

      return {
        visits7d,
        visits30d,
        conversions7d,
        conversions30d,
        conversionRate30d,
        topReferrers,
        topUtmSources,
        visitsByDay,
      };
    });
  },

  // ──────────────────────────────────────────────
  // Cache buster
  // ──────────────────────────────────────────────

  invalidate(tenantId: string): void {
    invalidateTenant(tenantId);
  },
};
