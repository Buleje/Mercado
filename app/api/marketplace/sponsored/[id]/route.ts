export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { SponsoredBoostsDB } from "@/lib/db/sponsored-boosts.db";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const PatchSchema = z.object({
  action: z.enum(["pause", "resume", "cancel"]),
});

/**
 * PATCH /api/marketplace/sponsored/[id]
 * Pausa, reactiva o cancela un boost.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = newTraceId();
  const requestId = req.headers.get("x-request-id") ?? traceId;

  try {
    const auth = await requireAdmin(req, ["admin", "tienda_owner"]);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const body = await req.json().catch((err) => { logger.error("[marketplace/sponsored/[id]] parse JSON body failed", { error: String(err) }); return null; });
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { action } = parsed.data;
    logger.info("sponsored PATCH", { requestId, tenantId: auth.tenantId, id, action });

    let boost;
    if (action === "pause") {
      boost = await SponsoredBoostsDB.pause(auth.tenantId, id);
    } else if (action === "resume") {
      boost = await SponsoredBoostsDB.resume(auth.tenantId, id);
    } else {
      boost = await SponsoredBoostsDB.cancel(auth.tenantId, id);
    }

    return NextResponse.json({ data: boost });
  } catch (err) {
    logger.error("sponsored PATCH: error", { requestId, err });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

/**
 * DELETE /api/marketplace/sponsored/[id]
 * Cancela un boost (alias de PATCH cancel).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = newTraceId();
  const requestId = req.headers.get("x-request-id") ?? traceId;

  try {
    const auth = await requireAdmin(req, ["admin", "tienda_owner"]);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    logger.info("sponsored DELETE", { requestId, tenantId: auth.tenantId, id });

    await SponsoredBoostsDB.cancel(auth.tenantId, id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    logger.error("sponsored DELETE: error", { requestId, err });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
