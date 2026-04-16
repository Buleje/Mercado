import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { invalidateByPrefix } from "@/lib/cache";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const QuerySchema = z.object({
  zone:     z.string().optional(),
  category: z.string().optional(),
  search:   z.string().optional(),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
  my:       z.string().optional(),
});

type TrustLevel = "alta" | "media" | "nueva";

/**
/**
 * Resolve tenantId → ensure the Tenant record exists and return
 * both the canonical CUID id and the slug. Queries on other tables
 * may use either value (legacy data used the slug "main").
 */
async function ensureTenant(tenantId: string): Promise<{ id: string; slug: string; possibleIds: string[] }> {
  // 1. Try finding by ID (tenantId is already a CUID)
  const byId = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, slug: true } });
  if (byId) return { id: byId.id, slug: byId.slug, possibleIds: [byId.id, byId.slug] };

  // 2. Maybe tenantId is actually a slug
  const bySlug = await prisma.tenant.findUnique({ where: { slug: tenantId }, select: { id: true, slug: true } });
  if (bySlug) return { id: bySlug.id, slug: bySlug.slug, possibleIds: [bySlug.id, bySlug.slug] };

  // 3. Tenant doesn't exist — auto-create from Settings if available
  const settings = await prisma.settings.findUnique({ where: { tenantId } }).catch((err) => { logger.error("[marketplace/stores] DB query failed", { error: String(err), tenantId }); return null; });
  const tenant = await prisma.tenant.create({
    data: {
      slug:   tenantId,
      name:   settings?.businessName || tenantId,
      plan:   "free",
      active: true,
    },
  });
  logger.info("[ensureTenant] Auto-created tenant", { tenantId: tenant.id, slug: tenant.slug });
  return { id: tenant.id, slug: tenant.slug, possibleIds: [tenant.id, tenant.slug] };
}

/**
 * GET /api/marketplace/stores
 * Sin ?my=true → listado público de tiendas publicadas
 * Con ?my=true → retorna la tienda del admin autenticado (para el panel admin)
 */
export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { zone, category, search, limit, my } = parsed.data;

    // ── Admin mode: retornar "mi tienda" ──
    if (my === "true") {
      const auth = await requireAdmin(req, ["admin", "manager"]);
      if (auth instanceof NextResponse) return auth;

      const tenant = await ensureTenant(auth.tenantId);

      let store = null;
      try {
        store = await prisma.store.findFirst({
          where: { tenantId: { in: tenant.possibleIds } },
        });
      } catch {
        // Store table may not exist yet — return empty
        return NextResponse.json({});
      }

      if (!store) {
        return NextResponse.json({});
      }

      return NextResponse.json({
        id:              store.id,
        slug:            store.slug,
        name:            store.name,
        description:     store.description ?? "",
        logoUrl:         store.logo ?? "",
        category:        store.category,
        zone:            store.zone ?? "",
        commissionRate:  store.commission,
        isActive:        store.isPublished,
        vacationMode:    store.vacationMode,
        vacationMessage: store.vacationMessage ?? "",
      });
    }

    // ── Public mode: listado de tiendas ──
    let stores: Record<string, unknown>[] = [];
    try {
      stores = await prisma.store.findMany({
        where: {
          isPublished: true,
          ...(zone     && { zone }),
          ...(category && { category }),
          ...(search   && { name: { contains: search, mode: "insensitive" as const } }),
        },
        select: {
          id:              true,
          slug:            true,
          name:            true,
          logo:            true,
          category:        true,
          zone:            true,
          rating:          true,
          reviewCount:     true,
          description:     true,
          vacationMode:    true,
          vacationMessage: true,
          createdAt:       true,
          _count:          { select: { products: true } },
        },
        take: limit * 2,
      });
    } catch (dbErr) {
      // If Store table doesn't exist or DB connection fails, return empty list
      logger.warn("[marketplace/stores] DB query failed, returning empty list", { error: dbErr instanceof Error ? dbErr.message : String(dbErr) });
      stores = [];
    }

    // ── Quality score ranking ── Stores with better ratings, more products, and
    // more reviews bubble to the top. Vacation stores sink to the bottom.
    function qualityScore(s: Record<string, unknown>): number {
      const rating = Number(s.rating) || 0;
      const reviews = Number(s.reviewCount) || 0;
      const products = s._count
        ? (s._count as { products: number }).products
        : 0;
      const isVacation = Boolean(s.vacationMode);

      const reviewConfidence = Math.min(reviews / 10, 1);
      const ratingScore = (rating / 5) * reviewConfidence * 40;
      const productScore = Math.min(products / 20, 1) * 30;
      const reviewScore = Math.min(reviews / 20, 1) * 30;
      const vacationPenalty = isVacation ? -50 : 0;

      return ratingScore + productScore + reviewScore + vacationPenalty;
    }

    function buildTrustSnapshot(s: Record<string, unknown>): {
      productCount: number;
      trustScore: number;
      trustLevel: TrustLevel;
      trustLabel: string;
      trustReason: string;
    } {
      const rating = Number(s.rating) || 0;
      const reviews = Number(s.reviewCount) || 0;
      const productCount = s._count
        ? (s._count as { products: number }).products
        : 0;
      const isVacation = Boolean(s.vacationMode);
      const trustScore = Math.max(0, Math.min(100, Math.round(qualityScore(s))));

      const trustLevel: TrustLevel = trustScore >= 70
        ? "alta"
        : trustScore >= 35
          ? "media"
          : "nueva";

      const trustLabel = trustLevel === "alta"
        ? "Muy confiable"
        : trustLevel === "media"
          ? "Buena reputación"
          : "En crecimiento";

      let trustReason = "Tienda nueva en el marketplace";
      if (isVacation) {
        trustReason = "Está en pausa temporal, pero conserva su historial";
      } else if (reviews >= 20 && rating >= 4.5) {
        trustReason = `${reviews} reseñas con calificación sobresaliente`;
      } else if (productCount >= 15) {
        trustReason = `${productCount} productos activos publicados`;
      } else if (reviews > 0) {
        trustReason = `${reviews} reseñas de clientes reales`;
      } else if (productCount > 0) {
        trustReason = `${productCount} productos ya visibles en catálogo`;
      }

      return { productCount, trustScore, trustLevel, trustLabel, trustReason };
    }

    stores.sort((a, b) => qualityScore(b) - qualityScore(a));
    const rankedStores = stores.slice(0, limit);

    // Explicitly pick only public-safe fields (defense-in-depth: Prisma select
    // already excludes tenantId, but explicit destructuring ensures it can never
    // leak even if a mock, migration, or refactor adds the field back)
    const safeStores = rankedStores.map((s) => {
      const trust = buildTrustSnapshot(s);
      return {
        id: s.id,
        slug: s.slug,
        name: s.name,
        logo: s.logo,
        category: s.category,
        zone: s.zone,
        rating: s.rating,
        reviewCount: s.reviewCount,
        description: s.description,
        vacationMode: s.vacationMode,
        vacationMessage: s.vacationMessage,
        productCount: trust.productCount,
        trustScore: trust.trustScore,
        trustLevel: trust.trustLevel,
        trustLabel: trust.trustLabel,
        trustReason: trust.trustReason,
      };
    });

    return NextResponse.json({ data: safeStores, total: safeStores.length });
  } catch (err) {
    logger.error("[marketplace/stores GET]", { error: err instanceof Error ? err.message : String(err) });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

// ── Schemas para crear/editar ─────────────────────────────────────────────────

const StoreBodySchema = z.object({
  slug:           z.string().max(100).optional().default(""),
  name:           z.string().min(1).max(200),
  description:    z.string().max(1000).optional(),
  logoUrl:        z.string().max(500).optional(),
  category:       z.string().max(100).optional(),
  zone:           z.string().max(100).optional(),
  commissionRate:  z.number().min(0).max(30).optional(),
  isActive:        z.boolean().optional(),
  vacationMode:    z.boolean().optional(),
  vacationMessage: z.string().max(500).optional(),
});

/**
 * POST /api/marketplace/stores — crear nueva tienda para el tenant
 */
export async function POST(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin"]);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json().catch(() => ({}));
    const parsed = StoreBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    // Resolve tenant ID (handle slug vs CUID, auto-create if needed)
    const tenant = await ensureTenant(auth.tenantId);

    // Verificar que el tenant no tenga ya una tienda
    let existing = null;
    try {
      existing = await prisma.store.findFirst({
        where: { tenantId: { in: tenant.possibleIds } },
      });
    } catch {
      // Store table may not exist yet — return helpful message
      return NextResponse.json(
        { error: "La tabla Store aún no existe en la base de datos. Ejecuta la migración pendiente." },
        { status: 503 },
      );
    }
    if (existing) {
      // Instead of 409 error, return the existing store so the frontend can switch to PUT
      return NextResponse.json({
        id:              existing.id,
        slug:            existing.slug,
        name:            existing.name,
        description:     existing.description ?? "",
        logoUrl:         existing.logo ?? "",
        category:        existing.category,
        zone:            existing.zone ?? "",
        commissionRate:  existing.commission,
        isActive:        existing.isPublished,
        vacationMode:    existing.vacationMode,
        vacationMessage: existing.vacationMessage ?? "",
      });
    }

    // Auto-generate slug from name if not provided
    let slug = parsed.data.slug?.trim() || "";
    if (!slug) {
      slug = parsed.data.name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        || `tienda-${Date.now().toString(36)}`;
    }
    // Ensure slug uniqueness
    const slugExists = await prisma.store.findUnique({ where: { slug } });
    if (slugExists) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    const store = await prisma.store.create({
      data: {
        tenantId:    tenant.id,
        slug,
        name:        parsed.data.name,
        description: parsed.data.description ?? null,
        logo:        parsed.data.logoUrl ?? null,
        category:    parsed.data.category ?? "bodega",
        zone:        parsed.data.zone ?? null,
        commission:  parsed.data.commissionRate ?? 5.0,
        isPublished:     parsed.data.isActive ?? false,
        vacationMode:    parsed.data.vacationMode ?? false,
        vacationMessage: parsed.data.vacationMessage ?? null,
      },
    });

    invalidateByPrefix("marketplace:stores");

    return NextResponse.json({
      id:              store.id,
      slug:            store.slug,
      name:            store.name,
      description:     store.description ?? "",
      logoUrl:         store.logo ?? "",
      category:        store.category,
      zone:            store.zone ?? "",
      commissionRate:  store.commission,
      isActive:        store.isPublished,
      vacationMode:    store.vacationMode,
      vacationMessage: store.vacationMessage ?? "",
    }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/marketplace/stores] Error:", err);
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

/**
 * PUT /api/marketplace/stores — actualizar la tienda del tenant
 */
export async function PUT(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin"]);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json().catch(() => ({}));
    const parsed = StoreBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const tenant = await ensureTenant(auth.tenantId);

    let existing = null;
    try {
      existing = await prisma.store.findFirst({
        where: { tenantId: { in: tenant.possibleIds } },
      });
    } catch {
      return NextResponse.json(
        { error: "La tabla Store aún no existe en la base de datos. Ejecuta la migración pendiente." },
        { status: 503 },
      );
    }
    if (!existing) {
      return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
    }

    // Only update slug if provided and non-empty; otherwise keep existing
    const newSlug = parsed.data.slug?.trim() || existing.slug;

    // If slug changed, ensure uniqueness
    let finalSlug = newSlug;
    if (newSlug !== existing.slug) {
      const slugTaken = await prisma.store.findUnique({ where: { slug: newSlug } });
      if (slugTaken) {
        finalSlug = `${newSlug}-${Date.now().toString(36)}`;
      }
    }

    const store = await prisma.store.update({
      where: { id: existing.id },
      data: {
        slug:            finalSlug,
        name:            parsed.data.name,
        description:     parsed.data.description ?? existing.description,
        logo:            parsed.data.logoUrl ?? existing.logo,
        category:        parsed.data.category ?? existing.category,
        zone:            parsed.data.zone ?? existing.zone,
        commission:      parsed.data.commissionRate ?? existing.commission,
        isPublished:     parsed.data.isActive ?? existing.isPublished,
        vacationMode:    parsed.data.vacationMode ?? existing.vacationMode,
        vacationMessage: parsed.data.vacationMessage ?? existing.vacationMessage,
      },
    });

    invalidateByPrefix("marketplace:stores");

    return NextResponse.json({
      id:              store.id,
      slug:            store.slug,
      name:            store.name,
      description:     store.description ?? "",
      logoUrl:         store.logo ?? "",
      category:        store.category,
      zone:            store.zone ?? "",
      commissionRate:  store.commission,
      isActive:        store.isPublished,
      vacationMode:    store.vacationMode,
      vacationMessage: store.vacationMessage ?? "",
    });
  } catch (err) {
    console.error("[PUT /api/marketplace/stores] Error:", err);
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

