/**
 * GET/POST /api/v1/products
 *
 * Versioned endpoint for product CRUD. See docs/api-versioning-strategy.md
 * for the migration policy. The legacy `/api/products` path now re-exports
 * this file wrapped in `deprecatedResponse`.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ProductsDB } from "@/lib/jsondb";
import { logActivity } from "@/lib/activity-logger";
import { requireAdmin, tryAdmin } from "@/lib/require-admin";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { prismaForTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getPlanLimits, withinLimit, planLimitPayload } from "@/lib/plans";
import { logger } from "@/lib/logger";
import { invalidate } from "@/lib/cache";
import { withDbRetry } from "@/lib/db-retry";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * Strip sensitive fields (costPrice, stock counts) from product records when
 * the caller is unauthenticated. Storefront visitors must NEVER see margins.
 */
function toPublicProduct(p: Awaited<ReturnType<typeof ProductsDB.getAll>>[number]) {
  const { costPrice: _cost, stock: _s, stockMin: _smin, stockMax: _smax, ...rest } = p as Record<string, unknown> & { costPrice?: number; stock?: number; stockMin?: number; stockMax?: number };
  void _cost; void _s; void _smin; void _smax;
  return rest;
}

const ProductPostSchema = z.object({
  name:        z.string().min(1).max(150),
  category:    z.string().min(1).max(100),
  price:       z.number().positive(),
  // FIX 2026-05: bumped 500 → 500_000 para dataURL WebP. processImage()
  // garantiza ≤120KB (~160K chars).
  image:       z.string().max(500_000).optional(),
  unit:        z.string().max(20).optional(),
  badge:       z.string().max(50).optional(),
  description: z.string().max(2000).optional(),
  stock:       z.number().min(0).optional(),
  stockMin:    z.number().min(0).optional(),
  // FIX 2026-06: el create antes DESCARTABA estos campos (sólo persistía
  // name/category/price/image/unit/badge). El producto nacía incompleto y
  // había que editarlo para agregar costo/código/stockMax. Ahora se persisten.
  costPrice:   z.number().min(0).optional(),
  barcode:     z.string().max(100).optional(),
  stockMax:    z.number().min(0).optional(),
  // ── Producto/servicio completo ──
  type:          z.enum(["product", "service"]).optional(),
  brand:         z.string().max(100).optional(),
  sku:           z.string().max(60).optional(),
  taxType:       z.enum(["gravado", "exonerado", "inafecto"]).optional(),
  weightKg:      z.number().min(0).optional(),
  dimensions:    z.string().max(60).optional(),
  durationLabel: z.string().max(60).optional(),
  pricingUnit:   z.enum(["fijo", "hora", "m3", "unidad", "dia"]).optional(),
  notes:         z.string().max(2000).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category   = searchParams.get("category");
    const search     = searchParams.get("q");
    const onlyActive = searchParams.get("active");
    const limitParam = searchParams.get("limit");
    const pageParam  = searchParams.get("page");

    // Soft-auth: anonymous callers (storefront) get only active products with
    // public-safe fields. Authenticated admins get the full record.
    const session = await tryAdmin(req);
    const isAdmin = session !== null;

    // SECURITY 2026-05-06: si hay sesión admin, forzar tenantId del JWT (no
    // del header). Esto evita que un admin con cookies/headers cruzados vea
    // datos de otro tenant — el JWT es la fuente de verdad. Anónimos siguen
    // resolviendo por header (storefront público vía subdominio).
    const tenantId = isAdmin
      ? session!.tenantId
      : (req.headers.get("x-tenant-id") ?? "main");
    let products = await withDbRetry(() => ProductsDB.getAll(tenantId));

    if (category && category !== "todos") {
      products = products.filter((p) => p.category === category);
    }
    if (search) {
      const q = search.toLowerCase();
      products = products.filter((p) => p.name.toLowerCase().includes(q));
    }
    // Active filter is opt-in via ?active=true (preserves public API contract).
    if (onlyActive === "true") {
      products = products.filter((p) => p.active !== false);
    }

    const total = products.length;
    const responseProducts = isAdmin ? products : products.map(toPublicProduct);

    // Optional pagination — only applied when ?limit= is provided
    if (limitParam) {
      const limit = Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 200);
      const page  = Math.max(parseInt(pageParam ?? "1", 10) || 1, 1);
      const start = (page - 1) * limit;
      const paged = responseProducts.slice(start, start + limit);

      return NextResponse.json(paged, {
        headers: {
          "X-Total-Count":   String(total),
          "X-Page":          String(page),
          "X-Limit":         String(limit),
          "X-Total-Pages":   String(Math.ceil(total / limit)),
          "Cache-Control":   "public, s-maxage=30, stale-while-revalidate=120",
          "X-Api-Version":   "v1",
        },
      });
    }

    return NextResponse.json(responseProducts, {
      headers: {
        "X-Total-Count": String(total),
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        "X-Api-Version": "v1",
      },
    });
  } catch (e) {
    logger.error("[v1/products] GET error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "v1-products"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  const blocked = await requireActiveSubscription(auth.tenantId);
  if (blocked) return blocked;

  try {
    const raw    = await req.json();
    const parsed = ProductPostSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:  "Datos inválidos",
          issues: parsed.error.issues.map((i) => i.message),
        },
        { status: 400 }
      );
    }

    const body = parsed.data;

    // Plan limit check
    const tenant = await prisma.tenant.findFirst({
      where: { OR: [{ id: auth.tenantId }, { slug: auth.tenantId }] },
    });
    const limits = getPlanLimits(tenant?.plan ?? "free");
    const db = prismaForTenant(auth.tenantId);
    const currentProductCount = await db.product.count();
    if (!withinLimit(currentProductCount, limits.maxProducts)) {
      return NextResponse.json(
        planLimitPayload(
          "productos",
          currentProductCount,
          limits.maxProducts,
          tenant?.plan ?? "free"
        ),
        { status: 402 }
      );
    }

    // FIX 2026-06: usar create() (id autoincrement de la DB) en lugar de
    // upsert({id: max(tenant)+1}). Product.id es GLOBAL, no per-tenant: para
    // el 1er producto de un tenant nuevo newId=1 colisionaba con el id=1 de
    // otro tenant → "cross-tenant access denied". Ver [[feedback_prisma_upsert_id_zero]].
    const isService = body.type === "service";
    const product = await ProductsDB.create({
      name:        body.name,
      category:    body.category,
      price:       body.price,
      image:       body.image ?? "",
      unit:        body.unit ?? "und",
      badge:       body.badge || undefined,
      description: body.description || undefined,
      active:      true,
      tenantId:    auth.tenantId,
      // Producto completo (antes se perdían). Servicios NO llevan stock/barcode.
      costPrice:   body.costPrice ?? undefined,
      barcode:     isService ? undefined : (body.barcode || undefined),
      stock:       isService ? undefined : (body.stock ?? undefined),
      stockMin:    isService ? undefined : (body.stockMin ?? undefined),
      stockMax:    isService ? undefined : (body.stockMax ?? undefined),
      type:        body.type ?? "product",
      brand:       body.brand || undefined,
      sku:         body.sku || undefined,
      taxType:     body.taxType ?? "gravado",
      weightKg:    isService ? undefined : (body.weightKg ?? undefined),
      dimensions:  isService ? undefined : (body.dimensions || undefined),
      durationLabel: isService ? (body.durationLabel || undefined) : undefined,
      pricingUnit:   isService ? (body.pricingUnit || undefined) : undefined,
      notes:         body.notes || undefined,
    });
    const requestId = req.headers.get("x-request-id") ?? undefined;
    logActivity(
      "Crear",
      "producto",
      `Producto creado: ${product.name} (S/${product.price})`,
      String(product.id),
      "admin",
      requestId
       
    ).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
    invalidate(`dashboard:${auth.tenantId}`);
    // Fase 4 perf (2026-05-16): invalidación completa de caches admin tras
    // crear producto. KPIs (overview, stats, eoq-suggest) refrescan al
    // instante sin esperar TTL ciego.
    try {
      const { invalidateAdminCache } = await import("@/lib/admin-cache");
      invalidateAdminCache.afterProduct(auth.tenantId);
    } catch { /* fire-and-forget */ }
    return NextResponse.json(product, {
      headers: { "X-Api-Version": "v1" },
    });
  } catch (e) {
    logger.error("[v1/products POST] create failed", { err: e instanceof Error ? (e.stack ?? e.message) : String(e) });
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
}
