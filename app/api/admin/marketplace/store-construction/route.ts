import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { invalidateByPrefix } from "@/lib/cache";
import { getConstructionMode, setConstructionMode } from "@/lib/store-construction-mode";
import { resolveStoreSlugForTenant } from "@/lib/store-tenant-bridge";
import { logger } from "@/lib/logger";
import { assertCsrf } from "@/lib/auth/csrf";

/**
 * GET/PUT /api/admin/marketplace/store-construction
 *
 * Permite al admin del negocio habilitar el flag "Tienda en construccion"
 * sobre SU PROPIA tienda. El storefront /tiendas y /marketplace/<slug>
 * lee este flag y pinta un overlay sobre la portada.
 *
 * Storage: lib/data/store-construction.json keyed por storeSlug (sin
 * migracion Prisma — mismo patron que store-category-orders).
 */

const PutSchema = z.object({
  enabled: z.boolean(),
  message: z.string().max(120).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const slug = await resolveStoreSlugForTenant(auth.tenantId);
    if (!slug) {
      return NextResponse.json({ enabled: false, storeSlug: null });
    }
    const entry = await getConstructionMode(slug);
    return NextResponse.json({
      enabled: entry?.enabled ?? false,
      message: entry?.message,
      updatedAt: entry?.updatedAt,
      storeSlug: slug,
    });
  } catch (err) {
    logger.error("[admin/marketplace/store-construction GET]", { error: String(err) });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch((err) => {
    logger.warn("[admin/marketplace/store-construction] invalid json body", { error: String(err) });
    return null;
  });
  if (!body) return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const slug = await resolveStoreSlugForTenant(auth.tenantId);
    if (!slug) {
      return NextResponse.json({ error: "no_store_for_tenant" }, { status: 404 });
    }
    const next = await setConstructionMode(slug, parsed.data.enabled, parsed.data.message);
    invalidateByPrefix(`marketplace:store:${slug}`);
    invalidateByPrefix(`marketplace:stores`);
    return NextResponse.json({ ok: true, storeSlug: slug, ...next });
  } catch (err) {
    logger.error("[admin/marketplace/store-construction PUT]", { error: String(err) });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
