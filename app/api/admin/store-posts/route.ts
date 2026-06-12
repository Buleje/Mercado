import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { MarketplaceStoresDB } from "@/lib/db/marketplace.db";
import { StorePostsDB } from "@/lib/db/store-posts.db";
import { applyRateLimit } from "@/lib/rate-limit";
import { isAllowedImageUrl } from "@/lib/url-allowlist";
import { logger } from "@/lib/logger";

/**
 * Gestión de Publicaciones por el DUEÑO (ADR-130). Resuelve la tienda desde el
 * auth (tenantId → store), igual que /api/admin/store-reviews. Sin slug en el
 * cliente.
 *   GET    — lista (incluye ocultas).
 *   POST   — crear { body, imageUrl?, pinned? }.
 *   DELETE — soft-delete ?postId=.
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

async function resolveStore(tenantId: string) {
  return MarketplaceStoresDB.getByTenant(tenantId);
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const store = await resolveStore(auth.tenantId);
    if (!store) return NextResponse.json({ data: [] });
    const data = await StorePostsDB.listForOwner(auth.tenantId, store.id);
    return NextResponse.json({ data });
  } catch (err) {
    logger.error("[admin/store-posts GET] error", { error: String(err) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "MODERATE", "admin-store-posts");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const store = await resolveStore(auth.tenantId);
    if (!store) return NextResponse.json({ error: "Tu tienda no está en el marketplace" }, { status: 404 });

    const json = await req.json().catch(() => ({}));
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
    }

    const created = await StorePostsDB.createPost(auth.tenantId, store.id, parsed.data);
    if (!created) return NextResponse.json({ error: "No se pudo publicar" }, { status: 500 });

    logger.info("[admin/store-posts POST]", { tenantId: auth.tenantId, postId: created.id });
    return NextResponse.json({ data: { id: created.id } }, { status: 201 });
  } catch (err) {
    logger.error("[admin/store-posts POST] error", { error: String(err) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const postId = new URL(req.url).searchParams.get("postId");
    if (!postId) return NextResponse.json({ error: "Falta postId" }, { status: 400 });

    const store = await resolveStore(auth.tenantId);
    if (!store) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });

    const ok = await StorePostsDB.deletePost(auth.tenantId, store.id, postId);
    return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
  } catch (err) {
    logger.error("[admin/store-posts DELETE] error", { error: String(err) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
