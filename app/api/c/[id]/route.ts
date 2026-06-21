import { NextRequest, NextResponse } from "next/server";
import { CampaignsDB } from "@/lib/db/campaigns.db";
import { MarketplaceStoresDB } from "@/lib/db/marketplace/stores.db";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/c/[id] — link de tracking de campañas.
 *
 * Público (lo abre el cliente desde su WhatsApp). Suma 1 a `opened` de la
 * campaña y redirige a la tienda del tenant. El destino se deriva server-side
 * del tenantId de la campaña (no de query params) → sin open-redirect.
 *
 * Degrada con gracia: si está rate-limited o la campaña no existe, igual
 * redirige (la experiencia del cliente nunca se rompe), solo no cuenta el clic.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const base = process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin;
  let target = `${base}/`;

  // Rate limit suave: si se excede, saltamos el conteo pero seguimos redirigiendo.
  const limited = await applyRateLimit(req, "MODERATE", "campaign-track");
  if (!limited) {
    const tracked = await CampaignsDB.trackOpen(id);
    if (tracked) {
      const slug = await MarketplaceStoresDB.getMyStoreSlug(tracked.tenantId).catch(() => null);
      if (slug) target = `${base}/t/${slug}`;
    }
  }

  return NextResponse.redirect(target);
}
