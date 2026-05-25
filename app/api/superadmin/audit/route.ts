/**
 * #58 Audit trail superadmin dedicado
 * GET /api/superadmin/audit
 *
 * Devuelve el log de auditoría exclusivo del panel superadmin.
 * Auth: sesión de plataforma (buleje-platform-sess cookie) — mismo guard
 *       que el resto de endpoints superadmin (ej. roadmap/items/route.ts).
 *
 * Query params:
 *   ?limit=100  — número de registros (máx 500)
 *   ?from=ISO   — filtrar desde fecha ISO 8601 (opcional)
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { applyRateLimit } from "@/lib/rate-limit";
import { getSuperadminAuditLog } from "@/lib/audit/superadmin-audit";
import { logger } from "@/lib/logger";

// ─── Guard de sesión de plataforma ────────────────────────────────────────────

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

// ─── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    logger.info("[superadmin/audit] GET", { url: req.url });

    // Rate limit conservador — datos sensibles
    const rateLimited = applyRateLimit(req, "STRICT", "sa-audit");
    if (rateLimited) return rateLimited;

    // Auth: sesión superadmin de plataforma
    const session = await requirePlatform(req);
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // Parámetros de consulta — extraer desde URL para compatibilidad Next.js 16
    const url = new URL(req.url);
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam
      ? Math.min(Math.max(parseInt(limitParam, 10) || 100, 1), 500)
      : 100;

    const fromParam = url.searchParams.get("from");
    let from: Date | undefined;
    if (fromParam) {
      const parsed = new Date(fromParam);
      if (!isNaN(parsed.getTime())) {
        from = parsed;
      }
    }

    // Consulta via DB class
    const entries = await getSuperadminAuditLog(limit, from);

    return NextResponse.json({
      entries,
      count: entries.length,
      limit,
      from: from?.toISOString() ?? null,
    });

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
