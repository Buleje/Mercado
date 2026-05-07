import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { LiveSessionsDB } from "@/lib/db/live-sessions.db";
import { createDistributedRateLimiter , applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * Rate limit ligero: 60 events/min por viewer (2 heartbeats/min + clicks).
 */
const eventLimiter = createDistributedRateLimiter({
  key: "live-event",
  maxRequests: 60,
  windowMs: 60_000,
});

const PostBody = z.object({
  eventType: z.enum([
    "joined",
    "left",
    "heartbeat",
    "product_click",
    "add_to_cart",
    "ordered",
  ]),
  userId: z.string().max(64).optional(),
  anonymousId: z.string().max(64).optional(),
  productId: z.number().int().optional(),
});

/**
 * POST /api/lives/[id]/event — tracking de evento del viewer.
 * Fire-and-forget desde el cliente. El servidor devuelve 204 aun si hubo
 * error interno (el cliente no debe reintentar).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _rl = await applyRateLimit(req, "STRICT", "lives-X-event"); if (_rl) return _rl;
  try {
    const { id } = await params;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = PostBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    // Rate limit por identifier
    const rateId =
      parsed.data.userId ?? parsed.data.anonymousId ?? "anon-" + id;
    const allowed = await eventLimiter.check(`${id}:${rateId}`);
    if (!allowed) {
      return NextResponse.json(
        {
          error: "too_many_requests",
          retryAfter: Math.ceil(eventLimiter.windowMs / 1000),
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(eventLimiter.windowMs / 1000)),
          },
        },
      );
    }

    // Lookup tenantId (cache 5s vía getById)
    const sessionResult = await LiveSessionsDB.getById(null, id);
    if (!sessionResult) {
      return NextResponse.json({ error: "Live no encontrada" }, { status: 404 });
    }

    // Fire-and-forget: tracking no puede romper la UX del viewer
    LiveSessionsDB.trackViewerEvent({
      tenantId: sessionResult.session.tenantId,
      sessionId: id,
      userId: parsed.data.userId ?? null,
      anonymousId: parsed.data.anonymousId ?? null,
      eventType: parsed.data.eventType,
      productId: parsed.data.productId ?? null,
    }).catch((err: unknown) => {
      logger.warn("[api/lives/event] tracking failed (swallowed)", {
        err: String(err),
        sessionId: id,
      });
    });

    // Retorna stats actuales para que el cliente actualice UI
    const stats = await LiveSessionsDB.getLiveStats(
      sessionResult.session.tenantId,
      id,
    );

    return NextResponse.json({ data: stats }, { status: 200 });
  } catch (err) {
    logger.error("[api/lives/event] POST failed", { err: String(err) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

/**
 * GET /api/lives/[id]/event — obtiene stats actuales (para polling del count).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const stats = await LiveSessionsDB.getLiveStats(null, id);
    return NextResponse.json(
      { data: stats },
      {
        headers: {
          "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15",
        },
      },
    );
  } catch (err) {
    logger.error("[api/lives/event] GET failed", { err: String(err) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
