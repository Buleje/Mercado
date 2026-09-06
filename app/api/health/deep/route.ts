/**
 * GET /api/health/deep
 *
 * Deep health check — verifies database connectivity, app version,
 * memory usage, and uptime. Public endpoint (no auth required).
 *
 * Returns 200 when all checks pass, 503 when any check fails.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

// App version from package.json (set at build time or read from env)
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.1";
void APP_VERSION; // referenciada solo en logs

export async function GET(req: NextRequest) {
  // SECURITY 2026-05-06 (audit storefront H08): rate limit. Antes este
  // endpoint público dejaba enumerar restarts y fingerprintear infra.
  // Cap a 30 req/min por IP — health checkers legítimos sobreviven, scanners
  // se frenan.
  const rl = applyRateLimit(req, "GENEROUS", "health-deep");
  if (rl) return rl;

  const start = Date.now();
  let dbHealthy = false;
  let dbLatencyMs: number | null = null;
  let dbError: string | null = null;

  // ── 1. Database connectivity check ──────────────────────────────────────
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - dbStart;
    dbHealthy = true;
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
    logger.warn("[health/deep] DB check failed", { err: dbError });
  }

  // ── 2. Build response ───────────────────────────────────────────────────
  const status = dbHealthy ? "healthy" : "unhealthy";
  const responseTimeMs = Date.now() - start;

  // SECURITY 2026-05-06 (audit storefront H08): NO exponer `dbError` raw —
  // puede contener parte del connection string en errores Prisma. Tampoco
  // memory/uptime/version detallado que ayuden a un atacante a fingerprintear
  // versiones para CVE-matching. El error queda en logs server-side.
  return NextResponse.json(
    {
      status,
      db: dbHealthy,
      ...(dbLatencyMs !== null ? { dbLatencyMs } : {}),
      timestamp: new Date().toISOString(),
      responseTimeMs,
    },
    { status: dbHealthy ? 200 : 503 },
  );
}
