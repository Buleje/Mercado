import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Redis } from "@upstash/redis";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";

/**
 * GET / PUT /api/admin/content-calendar
 *
 * Persistence backend para `components/admin/ContentCalendar.tsx`. Antes vivía
 * solo en localStorage — al limpiar navegador o cambiar de dispositivo, el
 * dueño perdía todo el calendario de marketing.
 *
 * Storage: Upstash Redis con clave `content-calendar:{tenantId}` (JSON array).
 * Si Redis no está configurado (dev local sin Upstash), responde con
 * `persisted: false` y el cliente sigue usando localStorage como fallback.
 *
 * Audit 2026-05-05 (BUG P2-2 del audit profundo).
 */

let _redisClient: Redis | null = null;
function getRedis(): Redis | null {
  if (_redisClient) return _redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  _redisClient = new Redis({ url, token });
  return _redisClient;
}

const EntrySchema = z.object({
  id: z.string().min(1).max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["oferta", "receta", "post", "evento"]),
  title: z.string().min(1).max(200),
  notes: z.string().max(2000),
});

const PutSchema = z.object({
  entries: z.array(EntrySchema).max(500),
});

function key(tenantId: string): string {
  return `content-calendar:${tenantId}`;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["owner", "admin", "manager"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const redis = getRedis();
    if (!redis) {
      // Fallback si Redis no está configurado: array vacío, el cliente sigue
      // usando localStorage como antes.
      return NextResponse.json({ entries: [], persisted: false });
    }
    const raw = await redis.get<string>(key(auth.tenantId));
    const entries = raw ? JSON.parse(raw) : [];
    return NextResponse.json({ entries, persisted: true });
  } catch (err) {
    logger.error("[admin/content-calendar] GET error", {
      error: err instanceof Error ? err.message : String(err),
      tenantId: auth.tenantId,
    });
    return NextResponse.json({ entries: [], persisted: false }, { status: 200 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req, ["owner", "admin", "manager"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = PutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "invalid body" },
        { status: 400 },
      );
    }

    const redis = getRedis();
    if (!redis) {
      return NextResponse.json({ ok: true, persisted: false });
    }
    await redis.set(key(auth.tenantId), JSON.stringify(parsed.data.entries));
    logger.info("[admin/content-calendar] saved", {
      tenantId: auth.tenantId,
      count: parsed.data.entries.length,
    });
    return NextResponse.json({ ok: true, persisted: true });
  } catch (err) {
    logger.error("[admin/content-calendar] PUT error", {
      error: err instanceof Error ? err.message : String(err),
      tenantId: auth.tenantId,
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
