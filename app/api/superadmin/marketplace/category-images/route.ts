import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { applyRateLimit } from "@/lib/rate-limit";
import {
  getGlobalCategoryImages,
  setGlobalCategoryImages,
} from "@/lib/superadmin-category-images";
import { invalidateByPrefix } from "@/lib/cache";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";

/**
 * GET/PUT /api/superadmin/marketplace/category-images
 *
 * Imágenes estandarizadas globales que sirven como default para TODAS las
 * tiendas del marketplace. Si la tienda no subió su propia imagen, el
 * storefront usa esta. Si tampoco hay default global → texto-only.
 *
 * Solo accesible por SuperAdmin.
 */

const PutSchema = z.object({
  images: z.record(
    z.string().min(1).max(120),
    z.union([z.string().url().max(2000), z.literal(""), z.null()]),
  ),
});

async function requireSuperadmin(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await getPlatformSession(token);
  return session?.username ?? null;
}

export async function GET(req: NextRequest) {
  const user = await requireSuperadmin(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limited = applyRateLimit(req, "MODERATE", "superadmin:cat-images:get");
  if (limited) return limited;

  try {
    const images = await getGlobalCategoryImages();
    return NextResponse.json({ images });
  } catch (err) {
    logger.error("[superadmin/marketplace/category-images GET]", { error: String(err) });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
  const user = await requireSuperadmin(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limited = applyRateLimit(req, "MODERATE", "superadmin:cat-images:put");
  if (limited) return limited;

  const body = await req.json().catch((err) => {
    logger.error("[superadmin/marketplace/category-images PUT] invalid json", { error: String(err) });
    return null;
  });
  if (!body) return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
  }

  try {
    await setGlobalCategoryImages(parsed.data.images);
    // Invalida caché de marketplace global — afecta a TODAS las tiendas.
    invalidateByPrefix("marketplace:store:");
    invalidateByPrefix("marketplace:home");
    logActivity(
      "category-images-updated",
      "superadmin",
      `${user} actualizó ${Object.keys(parsed.data.images).length} imágenes globales`,
      undefined,
      "superadmin",
    ).catch((err) => logger.error("[superadmin/marketplace/category-images] activity log failed", { error: String(err) }));
    const images = await getGlobalCategoryImages();
    return NextResponse.json({ ok: true, images });
  } catch (err) {
    logger.error("[superadmin/marketplace/category-images PUT]", { error: String(err) });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
