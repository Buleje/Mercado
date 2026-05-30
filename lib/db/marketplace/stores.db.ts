import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { type DbStore, slugify, normalizePhone } from "./types";

/**
 * Lookup deduplicado del hoursJson de una tienda por id.
 * PENTEST 2026-05-18 Fase 2 P0 #29: extraído de app/marketplace/[slug]/page.tsx
 * que tenía un getHoursJson cached con `prisma.$queryRaw` directo en RSC.
 * Violaba CLAUDE.md regla #1 (toda query DB debe vivir en lib/db/*.db.ts).
 *
 * `react.cache` deduplica dentro de la misma request — múltiples componentes
 * que pidan el hoursJson de la misma tienda solo disparan 1 query.
 *
 * hoursJson vive en la DB pero NO en el schema Prisma (expand-migrate-contract).
 */
export const getStoreHoursJson = cache(async (storeId: string): Promise<unknown> => {
  try {
    const rows = await prisma.$queryRaw<Array<{ hoursJson: unknown }>>`
      SELECT "hoursJson" FROM "Store" WHERE id = ${storeId} LIMIT 1
    `;
    return rows[0]?.hoursJson ?? null;
  } catch {
    return null;
  }
});

// ─── MarketplaceStoresDB ──────────────────────────────────────────────────────

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
      commission:  store.commission.toNumber(),
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
      commission:  store.commission.toNumber(),
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
        commission:  s.commission.toNumber(),
        createdAt:   s.createdAt.toISOString(),
      }));
    });
  },

  /**
   * Slugs de tiendas publicadas (cross-tenant) para `generateStaticParams`
   * del storefront `/marketplace/[slug]`. Liviano: solo `slug`, sin filtro de
   * suscripción (el render maneja trial/oculto vía `getBySlug` → notFound).
   *
   * Por qué existe: bajo Next 16 cacheComponents, un segmento dinámico SIN
   * generateStaticParams no puede prerenderar un shell estático — los `params`
   * son request-time, y eso dispara el warning "Uncached data outside
   * <Suspense>" atribuido al RootLayout (la ruta entera queda sin shell).
   * Con esta lista (o incluso []), la ruta gana shell estático; los slugs no
   * listados rendean on-demand vía dynamicParams=true. (audit #1, 2026-05-30)
   *
   * Cap `limit` para no explotar el build si hay miles de tiendas — las que
   * superen el tope rendean dinámicas igual (sin prerender, pero sin warning).
   */
  async listPublishedSlugs(limit = 200): Promise<string[]> {
    const rows = await prisma.store.findMany({
      where:   { isPublished: true },
      select:  { slug: true },
      orderBy: [{ rating: "desc" }, { reviewCount: "desc" }],
      take:    limit,
    });
    return rows.map((r) => r.slug);
  },

  /**
   * Obtener tienda por slug (pública).
   */
  async getBySlug(slug: string): Promise<(DbStore & { vacationMode: boolean; vacationMessage: string | null; whatsappPublic: string | null }) | null> {
    const cacheKey = `marketplace:stores:slug:${slug}`;

    return getOrSet(cacheKey, 300, async () => {
      // PENTEST 2026-05-18 Fase 3 P1 #34: incluir vacationMode + vacationMessage.
      // ANTES: select los excluía con comentario "migration pending", pero la
      // migration YA está aplicada (ver findByPossibleIds que sí los usa).
      // Resultado: cliente agregaba al cart sin saber que tienda en vacaciones.
      // AHORA: incluidos en select + return shape.
      const s = await prisma.store.findUnique({
        where: { slug },
        select: {
          id: true, tenantId: true, slug: true, name: true, description: true,
          logo: true, banner: true, category: true, zone: true, rating: true,
          reviewCount: true, isPublished: true, commission: true, createdAt: true,
          vacationMode: true, vacationMessage: true, whatsappPublic: true,
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
        commission:  s.commission.toNumber(),
        createdAt:   s.createdAt.toISOString(),
        vacationMode:    s.vacationMode ?? false,
        vacationMessage: s.vacationMessage ?? null,
        whatsappPublic:  s.whatsappPublic ?? null,
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
      commission:  s.commission.toNumber(),
      createdAt:   s.createdAt.toISOString(),
    };
  },

  /**
   * Busca la tienda del tenant por possibleIds (CUID y slug legacy).
   * Retorna null si no existe — no lanza excepción.
   */
  async findByPossibleIds(possibleIds: string[]): Promise<(DbStore & { vacationMode: boolean; vacationMessage: string | null }) | null> {
    const s = await prisma.store.findFirst({
      where: { tenantId: { in: possibleIds } },
      select: {
        id: true, tenantId: true, slug: true, name: true, description: true,
        logo: true, banner: true, category: true, zone: true, rating: true,
        reviewCount: true, isPublished: true, commission: true, createdAt: true,
        vacationMode: true, vacationMessage: true,
      },
    });
    if (!s) return null;
    return {
      id: s.id, tenantId: s.tenantId, slug: s.slug, name: s.name,
      description: s.description, logo: s.logo, banner: s.banner,
      category: s.category, zone: s.zone, rating: s.rating,
      reviewCount: s.reviewCount, isPublished: s.isPublished,
      commission: s.commission.toNumber(), createdAt: s.createdAt.toISOString(),
      vacationMode: s.vacationMode, vacationMessage: s.vacationMessage,
    };
  },

  /**
   * Verifica unicidad de slug. Retorna true si ya está tomado por OTRA tienda.
   */
  async isSlugTaken(slug: string, excludeId?: string): Promise<boolean> {
    const row = await prisma.store.findUnique({ where: { slug }, select: { id: true } });
    if (!row) return false;
    return row.id !== excludeId;
  },

  /**
   * Crea una tienda para el tenant indicado.
   * Persiste hoursJson via raw query si se proporciona.
   */
  async createStore(params: {
    tenantId: string;
    slug: string;
    name: string;
    description?: string | null;
    logo?: string | null;
    category?: string;
    zone?: string | null;
    commission?: number;
    isActive?: boolean;
    vacationMode?: boolean;
    vacationMessage?: string | null;
    hours?: unknown;
  }): Promise<DbStore & { vacationMode: boolean; vacationMessage: string | null; hours: unknown }> {
    const store = await prisma.store.create({
      data: {
        tenantId:        params.tenantId,
        slug:            params.slug,
        name:            params.name,
        description:     params.description ?? null,
        logo:            params.logo ?? null,
        category:        params.category ?? "bodega",
        zone:            params.zone ?? null,
        commission:      params.commission ?? 5.0,
        isPublished:     params.isActive ?? false,
        vacationMode:    params.vacationMode ?? false,
        vacationMessage: params.vacationMessage ?? null,
      },
    });

    let savedHours: unknown = null;
    if (params.hours !== undefined) {
      const hoursStr = JSON.stringify(params.hours);
      await prisma.$executeRaw`UPDATE "Store" SET "hoursJson" = ${hoursStr}::jsonb WHERE id = ${store.id}`;
      savedHours = params.hours;
    }

    invalidateByPrefix("marketplace:stores");

    return {
      id: store.id, tenantId: store.tenantId, slug: store.slug, name: store.name,
      description: store.description, logo: store.logo, banner: store.banner,
      category: store.category, zone: store.zone, rating: store.rating,
      reviewCount: store.reviewCount, isPublished: store.isPublished,
      commission: store.commission.toNumber(), createdAt: store.createdAt.toISOString(),
      vacationMode: store.vacationMode, vacationMessage: store.vacationMessage,
      hours: savedHours,
    };
  },

  /**
   * Actualiza una tienda existente (por id). Persiste hoursJson si se proporciona.
   */
  async updateStore(params: {
    id: string;
    slug: string;
    name: string;
    description?: string | null;
    logo?: string | null;
    category?: string;
    zone?: string | null;
    commission?: number;
    isActive?: boolean;
    vacationMode?: boolean;
    vacationMessage?: string | null;
    hours?: unknown;
  }): Promise<DbStore & { vacationMode: boolean; vacationMessage: string | null; hours: unknown }> {
    const store = await prisma.store.update({
      where: { id: params.id },
      data: {
        slug:            params.slug,
        name:            params.name,
        description:     params.description ?? null,
        logo:            params.logo ?? null,
        category:        params.category,
        zone:            params.zone,
        commission:      params.commission,
        isPublished:     params.isActive,
        vacationMode:    params.vacationMode,
        vacationMessage: params.vacationMessage,
      },
    });

    let savedHours: unknown = null;
    if (params.hours !== undefined) {
      const hoursStr = JSON.stringify(params.hours);
      await prisma.$executeRaw`UPDATE "Store" SET "hoursJson" = ${hoursStr}::jsonb WHERE id = ${store.id}`;
      savedHours = params.hours;
    } else {
      const rows = await prisma.$queryRaw<Array<{ hoursJson: unknown }>>`
        SELECT "hoursJson" FROM "Store" WHERE id = ${store.id} LIMIT 1
      `;
      savedHours = rows[0]?.hoursJson ?? null;
    }

    invalidateByPrefix("marketplace:stores");

    return {
      id: store.id, tenantId: store.tenantId, slug: store.slug, name: store.name,
      description: store.description, logo: store.logo, banner: store.banner,
      category: store.category, zone: store.zone, rating: store.rating,
      reviewCount: store.reviewCount, isPublished: store.isPublished,
      commission: store.commission.toNumber(), createdAt: store.createdAt.toISOString(),
      vacationMode: store.vacationMode, vacationMessage: store.vacationMessage,
      hours: savedHours,
    };
  },

  /**
   * Obtener la primera Store del tenant autenticado.
   * Usado para rutas que necesitan el storeId del vendor actual.
   */
  async getByTenant(tenantId: string): Promise<{ id: string } | null> {
    return prisma.store.findFirst({
      where: { tenantId },
      select: { id: true },
    });
  },

  /**
   * Verificar que un storeId pertenece al tenant (guard cross-tenant).
   */
  async assertStoreOwnership(tenantId: string, storeId: string): Promise<boolean> {
    const row = await prisma.store.findFirst({
      where: { id: storeId, tenantId },
      select: { id: true },
    });
    return !!row;
  },

  /**
   * Resuelve el storeId de una tienda por slug + tenantId.
   * Audit project-wide 2026-05-19 (CodeReview P0 #1): patron usado en
   * marketplace/predictions y marketplace/anomalies para resolver el
   * store antes de delegar a la DB class especifica.
   *
   * Retorna null si el store no existe o no pertenece al tenant.
   */
  async getIdBySlugAndTenant(
    tenantId: string,
    slug: string,
  ): Promise<{ id: string } | null> {
    return prisma.store.findFirst({
      where: { tenantId, slug },
      select: { id: true },
    });
  },

  /**
   * Devuelve el slug de la tienda del tenant (si tiene). Util para que
   * el flujo "check-slug" pueda saber si el slug pedido es su propio
   * slug actual (no debe reportarse como ocupado).
   */
  async getMyStoreSlug(tenantId: string): Promise<string | null> {
    const row = await prisma.store.findFirst({
      where: { tenantId },
      select: { slug: true },
    });
    return row?.slug ?? null;
  },

  /**
   * isSlugTakenCrossStore(slug): true si CUALQUIER tienda (de cualquier
   * tenant) usa este slug. A diferencia de isSlugTaken arriba, esto NO
   * permite excluir un id propio — usar el wrapper si se necesita.
   */
  async isSlugTakenCrossStore(slug: string): Promise<boolean> {
    const row = await prisma.store.findFirst({
      where: { slug },
      select: { id: true },
    });
    return !!row;
  },
};
