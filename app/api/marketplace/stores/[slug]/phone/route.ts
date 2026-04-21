import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

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
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  let slug = "";
  try {
    ({ slug } = await params);

    const store = await prisma.store.findUnique({
      where: { slug },
      select: { tenantId: true, isPublished: true },
    });

    if (!store || !store.isPublished) {
      return NextResponse.json({ phone: null });
    }

    const page = await prisma.tenantStorePage.findUnique({
      where: { tenantId: store.tenantId },
      select: { whatsappPhone: true },
    });

    return NextResponse.json({ phone: page?.whatsappPhone ?? null });
  } catch (err) {
    logger.warn("[marketplace/stores/phone] soft-fail", {
      slug,
      error: err instanceof Error ? err.message : String(err),
    });
    // Siempre degrada a null — el caller espera { phone: null | string }.
    return NextResponse.json({ phone: null });
  }
}
