/**
 * GET /api/marketplace/stores/[slug]/live-viewers
 *
 * Devuelve el conteo de visitas unicas a una tienda en la ultima hora.
 *
 * Estrategia de conteo:
 *   - Usa un sorted set en Upstash Redis: key = "lv:{slug}"
 *   - Cada visita registra un member = sessionId con score = timestamp(ms)
 *   - Para contar: ZCOUNT lv:{slug} (now - 3600000) +inf
 *   - Limpia automaticamente members viejos en cada lectura.
 *
 *   Si Upstash no esta configurado (env vars ausentes), retorna
 *   { recentViewers: 0 } con un comentario en header — nunca datos falsos.
 *
 * POST /api/marketplace/stores/[slug]/live-viewers
 *   Registra una visita (sessionId en body). Fire-and-forget desde el cliente.
 */

import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

// ── Redis client (lazy singleton) ─────────────────────────────────────────────

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const WINDOW_MS = 60 * 60 * 1000; // 1 hora

// Slug válido = el mismo formato que el resto del marketplace. Defensa en
// profundidad: nunca usar un slug crudo del request como key de Redis
// (evita keys basura "lv:<payload>" e inyección de patrones).
const SLUG_RE = /^[a-z0-9-]{2,64}$/;

function liveKey(slug: string): string {
  return `lv:${slug}`;
}

// ── GET — leer conteo ─────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const rl = applyRateLimit(req, "MODERATE", "live-viewers-get");
  if (rl) return rl;

  const { slug } = await params;

  if (!slug || !SLUG_RE.test(slug)) {
    return NextResponse.json({ recentViewers: 0 }, { status: 400 });
  }

  const redis = getRedis();

  if (!redis) {
    // Sin Redis configurado (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)
    // devolvemos 0 para que el cliente no muestre la pill "viewers en vivo"
    // (ver components/marketplace/LiveViewers.tsx — oculta el componente si
    // recentViewers === 0). NUNCA inventamos datos falsos.
    return NextResponse.json(
      { recentViewers: 0 },
      {
        headers: {
          "X-Live-Viewers-Source": "no-redis",
          "Cache-Control": "no-store",
        },
      },
    );
  }

  try {
    const now = Date.now();
    const cutoff = now - WINDOW_MS;
    const key = liveKey(slug);

    // Eliminar entradas expiradas para mantener el sorted set limpio
    await redis.zremrangebyscore(key, "-inf", cutoff).catch((err) => {
      logger.warn("[live-viewers] cleanup failed (non-critical)", { slug, err: String(err) });
    });

    // Contar visitas en la ultima hora
    const count = await redis.zcount(key, cutoff, "+inf");

    return NextResponse.json(
      { recentViewers: typeof count === "number" ? count : 0 },
      {
        headers: {
          "X-Live-Viewers-Source": "upstash",
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    // Degradacion elegante — nunca exponer errores internos al cliente
    return NextResponse.json(
      { recentViewers: 0 },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}

// ── POST — registrar visita ───────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const rl = applyRateLimit(req, "MODERATE", "live-viewers-post");
  if (rl) return rl;

  const { slug } = await params;

  if (!slug || !SLUG_RE.test(slug)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ ok: false, reason: "no-redis" });
  }

  let sessionId: string;
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    sessionId =
      typeof body.sessionId === "string" && body.sessionId.length > 0
        ? body.sessionId
        : crypto.randomUUID();
  } catch {
    sessionId = crypto.randomUUID();
  }

  try {
    const key = liveKey(slug);
    const now = Date.now();

    // Registrar o actualizar timestamp del session (upsert via ZADD)
    await redis.zadd(key, { score: now, member: sessionId });

    // TTL del key = 2h para que Redis limpie automaticamente keys inactivos
    await redis.expire(key, 7200);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
