import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { StoreBannersDB } from "@/lib/db/store-banners.db";
import { MarketplaceStoresDB } from "@/lib/db/marketplace/stores.db";
import { logger } from "@/lib/logger";

/**
 * POST /api/marketplace/stores/[slug]/banners/reorder
 *
 * Persiste el orden (drag&drop) de los banners de una sección del storefront.
 * Cierra el gap: BannerEditorTab ya posteaba aquí pero la ruta no existía
 * (DnD no persistía). StoreBannersDB.reorder ya estaba implementado.
 */

const Schema = z.object({
  section: z.enum(["hero", "featured", "promo"]),
  order: z.array(z.string().min(1)).max(50),
});

async function resolveStore(slug: string, tenantId: string) {
  return MarketplaceStoresDB.getIdBySlugAndTenant(tenantId, slug);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { slug } = await params;

  const store = await resolveStore(slug, auth.tenantId);
  if (!store) {
    return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
  }

  const body = await req.json().catch((err) => {
    logger.error("[banners/reorder] parse JSON body failed", { error: String(err) });
    return null;
  });
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  await StoreBannersDB.reorder(auth.tenantId, store.id, parsed.data.section, parsed.data.order);

  return NextResponse.json({ ok: true });
}
