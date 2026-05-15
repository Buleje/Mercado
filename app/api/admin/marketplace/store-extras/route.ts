import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { invalidateByPrefix } from "@/lib/cache";
import { getStoreExtras, setStoreExtras } from "@/lib/store-extras";
import { resolveStoreSlugForTenant } from "@/lib/store-tenant-bridge";
import { logger } from "@/lib/logger";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * GET/PUT /api/admin/marketplace/store-extras
 *
 * Lee/actualiza los campos "extra" del marketplace que no viven en la tabla
 * Store (subcategory, coverageZones[], customCategories[]). Storage en JSON.
 */

const CustomSubcategorySchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(80),
  imageUrl: z.string().max(800).nullable().optional(),
});

const CustomCategorySchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(80),
  imageUrl: z.string().max(800).nullable().optional(),
  subcategories: z.array(CustomSubcategorySchema).max(40).default([]),
});

const PutSchema = z.object({
  subcategory: z.string().max(120).nullable().optional(),
  coverageZones: z.array(z.string().min(1).max(120)).max(40).optional(),
  customCategories: z.array(CustomCategorySchema).max(20).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const slug = await resolveStoreSlugForTenant(auth.tenantId);
    if (!slug) {
      return NextResponse.json({
        subcategory: null,
        coverageZones: [],
        customCategories: [],
        storeSlug: null,
      });
    }
    const extras = await getStoreExtras(slug);
    return NextResponse.json({ ...extras, storeSlug: slug });
  } catch (err) {
    logger.error("[admin/marketplace/store-extras GET]", { error: String(err) });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const rl = await applyRateLimit(req, "MODERATE", "marketplace-store-extras-put");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
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
    // Normaliza custom subcategories: si imageUrl viene undefined → null.
    const normalized = {
      ...parsed.data,
      customCategories: parsed.data.customCategories?.map((c) => ({
        id: c.id,
        label: c.label,
        imageUrl: c.imageUrl ?? null,
        subcategories: c.subcategories.map((s) => ({
          id: s.id,
          label: s.label,
          imageUrl: s.imageUrl ?? null,
        })),
      })),
    };
    const next = await setStoreExtras(slug, normalized);
    invalidateByPrefix(`marketplace:store:${slug}`);
    invalidateByPrefix(`marketplace:stores`);
    return NextResponse.json({ ok: true, storeSlug: slug, ...next });
  } catch (err) {
    logger.error("[admin/marketplace/store-extras PUT]", { error: String(err) });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
