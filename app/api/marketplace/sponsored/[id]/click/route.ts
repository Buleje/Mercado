import { NextRequest, NextResponse } from "next/server";
import { SponsoredBoostsDB } from "@/lib/db/sponsored-boosts.db";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";

/**
 * POST /api/marketplace/sponsored/[id]/click
 * Registra un click en un producto patrocinado.
 * Endpoint público — el tenantId viene del header x-tenant-id.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = newTraceId();
  const requestId = req.headers.get("x-request-id") ?? traceId;

  try {
    // SECURITY F1: no aceptar "main" como fallback controlado por el cliente.
    const tenantId = req.headers.get("x-tenant-id");
    if (!tenantId || tenantId === "main") {
      return NextResponse.json({ error: "tenant header requerido" }, { status: 400 });
    }
    const { id } = await params;

    logger.debug("sponsored click", { requestId, tenantId, boostId: id });

    SponsoredBoostsDB.recordClick(tenantId, id).catch((err) => logger.error("[marketplace/sponsored/[id]/click] operation failed", { error: String(err), tenantId }));

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    logger.error("sponsored click: error", { requestId, err });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
