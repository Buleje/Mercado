import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { resolveTenantSlug, resolveTenantSlugToId } from "@/lib/resolve-tenant";
import { logger } from "@/lib/logger";
import { toNumOrZero } from "@/lib/decimal-utils";

type RouteCtx = { params: Promise<{ id: string }> };

const OptionSchema = z.object({
  id: z.string().optional(), // present on update
  name: z.string().min(1).max(80),
  priceDelta: z.number().min(0).max(9999).default(0),
  isDefault: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

const GroupSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(80),
  description: z.string().max(200).optional().nullable(),
  required: z.boolean().optional(),
  minSelect: z.number().int().min(0).max(20).optional(),
  maxSelect: z.number().int().min(1).max(20).optional(),
  position: z.number().int().min(0).optional(),
  options: z.array(OptionSchema).max(30),
});

const PutBodySchema = z.object({
  groups: z.array(GroupSchema).max(15),
});

async function resolveTenantFromHeaders(req: NextRequest): Promise<string> {
  const raw = req.headers.get("x-tenant-id") ?? "main";
  const slugOrId = (await resolveTenantSlug(raw)) ?? "main";
  return resolveTenantSlugToId(slugOrId);
}

/**
 * GET /api/products/[id]/modifiers
 * Public read for storefront (used by QuickAddModal). Returns groups + options
 * scoped by tenant.
 */
export async function GET(req: NextRequest, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const productId = Number(id);
    if (!Number.isFinite(productId)) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 });
    }
    const tenantId = await resolveTenantFromHeaders(req);

    const groups = await prisma.productModifierGroup.findMany({
      where: { productId, tenantId, isActive: true },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: {
        options: {
          where: { isActive: true },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    const payload = groups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      required: g.required,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      position: g.position,
      options: g.options.map((o) => ({
        id: o.id,
        name: o.name,
        priceDelta: toNumOrZero(o.priceDelta),
        isDefault: o.isDefault,
        position: o.position,
      })),
    }));

    return NextResponse.json({ groups: payload });
  } catch (e) {
    logger.error("[modifiers GET] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

/**
 * PUT /api/products/[id]/modifiers
 * Admin-only replace-all of modifier groups for a product. Wipes existing
 * groups + options and recreates from the request body in a single
 * transaction. Strict tenant scoping.
 */
export async function PUT(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await ctx.params;
    const productId = Number(id);
    if (!Number.isFinite(productId)) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 });
    }
    const tenantId = auth.tenantId;

    // Tenant-scope the product to prevent cross-tenant writes.
    const product = await prisma.product.findFirst({
      where: { id: productId, tenantId },
      select: { id: true },
    });
    if (!product) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const json = await req.json().catch((err) => {
      logger.warn("[products/modifiers] body parse failed", { productId, error: String(err) });
      return null;
    });
    const parsed = PutBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
    }

    const { groups } = parsed.data;

    await prisma.$transaction(async (tx) => {
      // Wipe existing — cascade deletes options too.
      await tx.productModifierGroup.deleteMany({ where: { productId, tenantId } });

      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        await tx.productModifierGroup.create({
          data: {
            productId,
            tenantId,
            name: g.name,
            description: g.description ?? null,
            required: g.required ?? false,
            minSelect: g.minSelect ?? 0,
            maxSelect: g.maxSelect ?? 1,
            position: g.position ?? i,
            isActive: true,
            options: {
              create: g.options.map((o, j) => ({
                name: o.name,
                priceDelta: o.priceDelta ?? 0,
                isDefault: o.isDefault ?? false,
                position: o.position ?? j,
                isActive: true,
                tenantId,
              })),
            },
          },
        });
      }
    });

    return NextResponse.json({ ok: true, count: groups.length });
  } catch (e) {
    logger.error("[modifiers PUT] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
