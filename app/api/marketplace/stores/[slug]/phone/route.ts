import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId } from "@/lib/api-error";

export const dynamic = "force-dynamic";

/**
 * GET /api/marketplace/stores/[slug]/phone
 * Endpoint público liviano: devuelve el whatsappPhone de la customización de la
 * tienda. Solo expone ese campo — nada más sensible.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const traceId = newTraceId();
  try {
    const { slug } = await params;

    // Buscar el tenant por slug del store
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
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
