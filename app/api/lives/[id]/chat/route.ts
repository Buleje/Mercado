import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { LiveSessionsDB } from "@/lib/db/live-sessions.db";
import { createDistributedRateLimiter } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * Rate limit público de chat live: 10 mensajes/min por identifier.
 * Identifier = userId si logueado, anonymousId si no.
 */
const chatLimiter = createDistributedRateLimiter({
  key: "live-chat",
  maxRequests: 10,
  windowMs: 60_000,
});

const PostBody = z.object({
  message: z.string().min(1).max(500),
  userName: z.string().min(1).max(80),
  /** userId del cliente logueado (opcional — si no viene, es anónimo). */
  userId: z.string().max(64).optional(),
  /** Cookie id persistente del viewer anónimo. */
  anonymousId: z.string().max(64).optional(),
});

const SinceQuery = z
  .string()
  .datetime()
  .optional();

/**
 * GET /api/lives/[id]/chat — lista mensajes (polling cada 3-5s desde el cliente).
 * Query params:
 *   - since (opcional, ISO date): solo mensajes nuevos desde ese timestamp
 *   - limit (opcional, int 1-500): default 100
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const sinceParam = req.nextUrl.searchParams.get("since") ?? undefined;
    const sinceParsed = SinceQuery.safeParse(sinceParam);
    const since = sinceParsed.success && sinceParsed.data
      ? new Date(sinceParsed.data)
      : undefined;
    const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? 100);
    const limit = Number.isFinite(limitParam) ? limitParam : 100;

    const messages = await LiveSessionsDB.listChatMessages(null, id, since, limit);

    return NextResponse.json(
      { data: messages },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3, stale-while-revalidate=10",
        },
      },
    );
  } catch (err) {
    logger.error("[api/lives/chat] GET failed", { err: String(err) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

/**
 * POST /api/lives/[id]/chat — crea un mensaje público.
 * Rate-limited: 10 msg/min per userId/anonymousId.
 * Moderación keyword automática — si flagged, no aparece en feed pero se persiste.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _rl = await applyRateLimit(req, "STRICT", "lives-X-chat"); if (_rl) return _rl;
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

    // Rate limit por userId (priorizado) o anonymousId
    const rateId =
      parsed.data.userId ?? parsed.data.anonymousId ?? "anon-" + id;
    const allowed = await chatLimiter.check(`${id}:${rateId}`);
    if (!allowed) {
      return NextResponse.json(
        {
          error: "too_many_requests",
          message: "Demasiados mensajes. Esperá un momento.",
          retryAfter: Math.ceil(chatLimiter.windowMs / 1000),
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(chatLimiter.windowMs / 1000)),
          },
        },
      );
    }

    // Verificar que la live existe y obtener su tenantId
    const sessionResult = await LiveSessionsDB.getById(null, id);
    if (!sessionResult) {
      return NextResponse.json({ error: "Live no encontrada" }, { status: 404 });
    }

    const tenantId = sessionResult.session.tenantId;

    const message = await LiveSessionsDB.postChatMessage(
      tenantId,
      id,
      parsed.data.userId ?? null,
      parsed.data.userName,
      parsed.data.message,
    );

    // Si quedó flagged, devolvemos el ID pero indicamos que está en moderación
    if (message.moderationState === "flagged") {
      return NextResponse.json(
        {
          data: {
            ...message,
            message: "[mensaje en revisión]",
          },
          info: "message_flagged_for_review",
        },
        { status: 201 },
      );
    }

    return NextResponse.json({ data: message }, { status: 201 });
  } catch (err) {
    logger.error("[api/lives/chat] POST failed", { err: String(err) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
