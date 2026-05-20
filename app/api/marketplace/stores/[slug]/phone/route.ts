import { NextRequest, NextResponse } from "next/server";
import { MarketplaceStoresDB } from "@/lib/db/marketplace.db";
import { TenantStorePageDB } from "@/lib/db/tenant-store-page.db";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/marketplace/stores/[slug]/phone
 *
 * Endpoint público liviano: devuelve el whatsappPhone de la customización de la
 * tienda. Solo expone ese campo — nada más sensible.
 *
 * Contrato defensivo (2026-04-19): en caso de error de DB, schema drift, o
 * slug inexistente, SIEMPRE responde 200 con `{ phone: null }`. El WhatsApp
 * button es opcional — si la consulta falla, la UI del carrito degrada
 * graciosamente (oculta el botón). Un 500 aquí spam-eaba la consola del
 * marketplace sin beneficio: el caller ya tolera `phone: null`.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  // Audit P11: rate limit anti-scraping de WhatsApp phones (60 / 15min / IP)
  const rl = applyRateLimit(req, "MODERATE", "marketplace-store-phone");
  if (rl) return rl;

  let slug = "";
  try {
    ({ slug } = await params);

    // MarketplaceStoresDB.getBySlug ya filtra `isPublished: true` y cachea.
    const store = await MarketplaceStoresDB.getBySlug(slug);
    if (!store) {
      return NextResponse.json({ phone: null });
    }

    // Audit project-wide 2026-05-19: migrado a TenantStorePageDB.
    const phone = await TenantStorePageDB.getWhatsAppPhone(store.tenantId);
    return NextResponse.json({ phone });
  } catch (err) {
    logger.warn("[marketplace/stores/phone] soft-fail", {
      slug,
      error: err instanceof Error ? err.message : String(err),
    });
    // Siempre degrada a null — el caller espera { phone: null | string }.
    return NextResponse.json({ phone: null });
  }
}
