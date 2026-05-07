import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { StoreBannersDB } from "@/lib/db/store-banners.db";
import { MarketplaceStoresDB } from "@/lib/db/marketplace.db";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { isAllowedImageUrl } from "@/lib/url-allowlist";

const PostSchema = z.object({
  title: z.string().min(1).max(200),
  subtitle: z.string().max(300).optional(),
  // F6: validar imageUrl contra allowlist para prevenir SSRF
  imageUrl: z.string().url().refine(isAllowedImageUrl, "URL de imagen no permitida"),
  linkUrl: z.string().url().optional(),
  position: z.number().int().min(0).optional(),
  section: z.enum(["hero", "featured", "promo"]).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

/**
 * Resolver tienda para escritura admin. Filtra por `tenantId` (no usa
 * `MarketplaceStoresDB.getBySlug` porque ese filtra `isPublished:true`
 * y el admin debe poder editar tiendas no publicadas / draft).
 *
 * @prisma-direct excepción documentada — operación admin con `tenantId`
 * obligatorio en el WHERE = aislada cross-tenant.
 */
async function resolveStore(slug: string, tenantId: string) {
  return prisma.store.findFirst({ where: { slug, tenantId } });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const section = req.nextUrl.searchParams.get("section") ?? undefined;

  // El marketplace es cross-tenant: el banner se resuelve por slug
  // y luego usamos su tenantId real. Resiliente: cualquier error → lista vacía.
  try {
    const store = await MarketplaceStoresDB.getBySlug(slug);
    if (!store) return NextResponse.json({ banners: [] });

    const banners = await StoreBannersDB.list(store.tenantId, store.id, section);
    return NextResponse.json({ banners });
  } catch (err) {
    logger.warn("[stores/[slug]/banners GET]", { slug, error: String(err) });
    return NextResponse.json({ banners: [] });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { slug } = await params;

  const store = await resolveStore(slug, auth.tenantId);
  if (!store) {
    return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
  }

  const body = await req.json().catch((err) => { logger.error("[marketplace/stores/[slug]/banners] parse JSON body failed", { error: String(err) }); return null; });
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  const banner = await StoreBannersDB.create(auth.tenantId, {
    storeId: store.id,
    ...parsed.data,
  });

  return NextResponse.json({ banner }, { status: 201 });
}
