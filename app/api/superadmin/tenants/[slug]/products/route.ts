import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { invalidateByPrefix } from "@/lib/cache";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

const ModifierOptionSchema = z.object({
  name: z.string().min(1).max(80),
  priceDelta: z.number().min(0).max(9999).default(0),
  isDefault: z.boolean().optional(),
});

const ModifierGroupSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(200).optional().nullable(),
  required: z.boolean().optional(),
  minSelect: z.number().int().min(0).max(20).optional(),
  maxSelect: z.number().int().min(1).max(20).optional(),
  options: z.array(ModifierOptionSchema).max(30),
});

const CreateProductSchema = z.object({
  name: z.string().min(1).max(150),
  category: z.string().min(1).max(100),
  price: z.number().positive(),
  costPrice: z.number().min(0).optional().nullable(),
  unit: z.string().max(20).default("unidad"),
  description: z.string().max(500).optional().nullable(),
  image: z.string().max(500).optional().nullable(),
  stock: z.number().int().min(0).optional().nullable(),
  stockMin: z.number().int().min(0).optional().nullable(),
  active: z.boolean().default(true),
  modifierGroups: z.array(ModifierGroupSchema).max(15).optional(),
});

/**
 * GET /api/superadmin/tenants/[slug]/products
 * Returns products list for a specific tenant (superadmin only).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const session = await requirePlatform(req);
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { slug } = await params;

    // Find tenant by slug or id
    const tenant = await prisma.tenant.findFirst({
      where: { OR: [{ slug }, { id: slug }] },
      select: { id: true, slug: true, name: true },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }

    const products = await prisma.product.findMany({
      where: { tenantId: tenant.id, deletedAt: null },
      select: {
        id: true,
        name: true,
        barcode: true,
        price: true,
        costPrice: true,
        stock: true,
        category: true,
        unit: true,
        image: true,
        active: true,
      },
      orderBy: { name: "asc" },
      take: 500,
    });

    return NextResponse.json({
      tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
      products: products.map((p) => ({
        ...p,
        price: p.price ? Number(p.price) : 0,
        barcode: p.barcode ?? null,
      })),
      total: products.length,
    });
  } catch (error) {
    logger.error("[superadmin/tenants/products] Error cargando productos", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: "Error server loading products" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/superadmin/tenants/[slug]/products
 * Crea un producto en el tenant especificado, con modifierGroups + options
 * opcionales (toppings/variantes/adicionales). Solo superadmin.
 *
 * Body: CreateProductSchema (nombre, categoría, precio + modifierGroups[])
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const _rl = await applyRateLimit(req, "GENEROUS", "superadmin-tenants-X-products"); if (_rl) return _rl;
  // P1 fix 2026-05-24: CSRF defense-in-depth (mutation cross-tenant)
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
  try {
    const session = await requirePlatform(req);
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { slug } = await params;
    const tenant = await prisma.tenant.findFirst({
      where: { OR: [{ slug }, { id: slug }] },
      select: { id: true, slug: true },
    });
    if (!tenant) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }

    const body = await req.json().catch((err) => {
      logger.warn("[superadmin/tenants/products] body parse failed", { tenant: slug, error: String(err) });
      return null;
    });
    const parsed = CreateProductSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
    }

    const { modifierGroups = [], ...productData } = parsed.data;

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          tenantId: tenant.id,
          name: productData.name,
          category: productData.category,
          price: productData.price,
          costPrice: productData.costPrice ?? null,
          unit: productData.unit,
          description: productData.description ?? null,
          image: productData.image ?? "",
          stock: productData.stock ?? 999,
          stockMin: productData.stockMin ?? 0,
          active: productData.active,
        },
      });

      for (let i = 0; i < modifierGroups.length; i++) {
        const g = modifierGroups[i];
        await tx.productModifierGroup.create({
          data: {
            productId: created.id,
            tenantId: tenant.id,
            name: g.name,
            description: g.description ?? null,
            required: g.required ?? false,
            minSelect: g.minSelect ?? 0,
            maxSelect: g.maxSelect ?? 1,
            position: i,
            isActive: true,
            options: {
              create: g.options.map((o, j) => ({
                name: o.name,
                priceDelta: o.priceDelta ?? 0,
                isDefault: o.isDefault ?? false,
                position: j,
                isActive: true,
                tenantId: tenant.id,
              })),
            },
          },
        });
      }
      return created;
    });

    invalidateByPrefix(`products:${tenant.id}`);

    return NextResponse.json({
      ok: true,
      productId: product.id,
      modifierGroupsCreated: modifierGroups.length,
    });
  } catch (error) {
    logger.error("[superadmin/tenants/products] POST error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
