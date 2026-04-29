import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { invalidateByPrefix } from "@/lib/cache";
import {
  getStoreCategoryImages,
  setStoreCategoryImages,
} from "@/lib/store-category-order";
import { resolveCategoryImages } from "@/lib/superadmin-category-images";
import { logger } from "@/lib/logger";

/**
 * GET/PUT /api/admin/marketplace/category-images
 *
 * Permite al admin del negocio subir/editar imágenes por categoría de SU tienda.
 * Prioridad en storefront: imagen propia > imagen global del superadmin > texto.
 *
 * GET: devuelve { ownImages, resolvedImages }
 *   - ownImages: solo lo que la tienda subió
 *   - resolvedImages: tienda + global merged (lo que se muestra al cliente)
 *
 * PUT: { images: Record<categoryName, url|null> }
 *   - url null o "" → borra la entrada
 */

const PutSchema = z.object({
  images: z.record(
    z.string().min(1).max(120),
    z.union([z.string().url().max(2000), z.literal(""), z.null()]),
  ),
});

async function getCurrentStoreSlug(req: NextRequest): Promise<string | null> {
  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return null;
  const tenantId = auth.tenantId;
  const tenant = await prisma.tenant
    .findFirst({
      where: { OR: [{ id: tenantId }, { slug: tenantId }] },
      select: { id: true, slug: true },
    })
    .catch((err) => {
      logger.error("[admin/marketplace/category-images] tenant lookup failed", { error: String(err) });
      return null;
    });
  if (!tenant) return null;
  const store = await prisma.store
    .findFirst({
      where: { tenantId: { in: [tenant.id, tenant.slug] } },
      select: { slug: true },
    })
    .catch((err) => {
      logger.error("[admin/marketplace/category-images] store lookup failed", { error: String(err) });
      return null;
    });
  return store?.slug ?? null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const slug = await getCurrentStoreSlug(req);
    if (!slug) {
      return NextResponse.json({ ownImages: {}, resolvedImages: {}, storeSlug: null });
    }
    const ownImages = await getStoreCategoryImages(slug);
    const resolvedImages = await resolveCategoryImages(ownImages);
    return NextResponse.json({ ownImages, resolvedImages, storeSlug: slug });
  } catch (err) {
    logger.error("[admin/marketplace/category-images GET]", { error: String(err) });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch((err) => {
    logger.error("[admin/marketplace/category-images PUT] invalid json", { error: String(err) });
    return null;
  });
  if (!body) return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const slug = await getCurrentStoreSlug(req);
    if (!slug) {
      return NextResponse.json({ error: "no_store_for_tenant" }, { status: 404 });
    }
    await setStoreCategoryImages(slug, parsed.data.images);
    invalidateByPrefix(`marketplace:store:${slug}`);
    const ownImages = await getStoreCategoryImages(slug);
    return NextResponse.json({ ok: true, storeSlug: slug, ownImages });
  } catch (err) {
    logger.error("[admin/marketplace/category-images PUT]", { error: String(err) });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
