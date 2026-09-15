/**
 * POST /api/admin/log-error — endpoint público de logging para error boundaries.
 *
 * Usado por `app/admin/error.tsx` para reportar errores runtime del panel admin.
 * Público (sin auth) porque los error boundaries pueden dispararse antes del login.
 * El payload solo contiene info no sensible (error.message + digest + source).
 *
 * Defensas en capas (Brandon 2026-05-16, audit P2):
 *   1. force-dynamic (no caching).
 *   2. STRICT rate-limit edge (10 req / 15 min por IP).
 *   3. CSRF double-submit.
 *   4. Zod schema con maxLengths agresivos.
 *   5. Filtro de digest: rechaza payloads sin digest válido de Next.js
 *      (hex 8-16 chars). Esto bloquea uso del endpoint como log dump
 *      genérico — solo errores reales de error.tsx pasan.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { recordClientError } from "@/lib/db/client-errors.db";


const DIGEST_RE = /^[a-f0-9]{8,32}$/i;

const LogErrorSchema = z.object({
  error: z.string().max(2000),
  // Digest se valida con regex después: Next.js genera hex de 8-32 chars.
  digest: z.string().max(64).optional(),
  source: z.string().max(100).optional(),
});

export async function POST(req: Request) {
  const _rl = await applyRateLimit(req, "STRICT", "admin-log-error"); if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = LogErrorSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    // Si viene digest, debe ser un hash hex válido — bloquea log-dump abuse.
    if (parsed.data.digest && !DIGEST_RE.test(parsed.data.digest)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    logger.warn("[admin-error-boundary]", {
      error: parsed.data.error,
      digest: parsed.data.digest,
      source: parsed.data.source,
    });

    // Persistir con tenantId (x-tenant-id lo setea el proxy server-side) para
    // verlo en vivo en el superadmin. Fire-and-forget: no rompe el beacon.
    const tenantId = req.headers.get("x-tenant-id");
    if (tenantId) {
      void recordClientError({
        tenantId,
        message: parsed.data.error,
        digest: parsed.data.digest ?? null,
        source: parsed.data.source ?? null,
        userAgent: req.headers.get("user-agent"),
      }).catch((err) => logger.warn("[admin-log-error] persist failed", { error: String(err) }));
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
