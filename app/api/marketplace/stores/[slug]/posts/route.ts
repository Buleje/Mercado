import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MarketplaceStoresDB } from "@/lib/db/marketplace.db";
import { StorePostsDB } from "@/lib/db/store-posts.db";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isAllowedImageUrl } from "@/lib/url-allowlist";
import { toErrorPayload } from "@/lib/api-error";
import { logger } from "@/lib/logger";

/**
 * Publicaciones por tienda (ADR-130).
 *   GET    — feed público (publicadas + comentarios).
 *   POST   — el DUEÑO publica (requireAdmin + match tenantId del store).
 *   DELETE — el DUEÑO borra (soft) una publicación (?postId=).
 */

const createSchema = z.object({
  body: z.string().min(1).max(1000),
  imageUrl: z
    .string()
    .url()
    .refine(isAllowedImageUrl, "URL de imagen no permitida (allowlist)")
    .optional(),
  pinned: z.boolean().optional(),
});

// ── GET — feed público ───────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const store = await MarketplaceStoresDB.getBySlug(slug);
    if (!store) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });

    const posts = await StorePostsDB.listFeed(store.tenantId, store.id, { limit: 30 });
    return NextResponse.json({ data: posts });
  } catch (err) {
    logger.error("[STORE-POSTS] GET error", { error: err });
    return NextResponse.json(toErrorPayload(err), { status: 500 });
  }
}

// ── POST — el dueño publica ──────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const rl = applyRateLimit(req, "STRICT", "marketplace-posts-create");
  if (rl) return rl;

  try {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { slug } = await params;
    const store = await MarketplaceStoresDB.getBySlug(slug);
    if (!store) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });

    // Solo el dueño de ESA tienda (mismo tenant) puede publicar.
    if (store.tenantId !== auth.tenantId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const json = await req.json().catch(() => ({}));
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const created = await StorePostsDB.createPost(store.tenantId, store.id, parsed.data);
    if (!created) return NextResponse.json({ error: "No se pudo publicar" }, { status: 500 });

    return NextResponse.json({ data: { id: created.id } }, { status: 201 });
  } catch (err) {
    logger.error("[STORE-POSTS] POST error", { error: err });
    return NextResponse.json(toErrorPayload(err), { status: 500 });
  }
}

// ── DELETE — el dueño borra (soft) ───────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { slug } = await params;
    const postId = new URL(req.url).searchParams.get("postId");
    if (!postId) return NextResponse.json({ error: "Falta postId" }, { status: 400 });

    const store = await MarketplaceStoresDB.getBySlug(slug);
    if (!store) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
    if (store.tenantId !== auth.tenantId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const ok = await StorePostsDB.deletePost(store.tenantId, store.id, postId);
    return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
  } catch (err) {
    logger.error("[STORE-POSTS] DELETE error", { error: err });
    return NextResponse.json(toErrorPayload(err), { status: 500 });
  }
}
