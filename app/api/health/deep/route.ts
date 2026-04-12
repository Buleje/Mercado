/**
 * GET /api/health/deep
 *
 * Deep health check — verifies database connectivity, app version,
 * memory usage, and uptime. Public endpoint (no auth required).
 *
 * Returns 200 when all checks pass, 503 when any check fails.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// App version from package.json (set at build time or read from env)
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.1";

export async function GET() {
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

  // ── 2. Memory usage ─────────────────────────────────────────────────────
  let memory: Record<string, number> | null = null;
  try {
    if (typeof process !== "undefined" && typeof process.memoryUsage === "function") {
      const mem = process.memoryUsage();
      memory = {
        rssBytes: mem.rss,
        heapUsedBytes: mem.heapUsed,
        heapTotalBytes: mem.heapTotal,
        externalBytes: mem.external,
      };
    }
  } catch {
    // Edge runtime may not support memoryUsage — skip silently
  }

  // ── 3. Uptime ───────────────────────────────────────────────────────────
  let uptimeSeconds: number | null = null;
  try {
    if (typeof process !== "undefined" && typeof process.uptime === "function") {
      uptimeSeconds = Math.floor(process.uptime());
    }
  } catch {
    // Edge runtime may not support uptime — skip silently
  }

  // ── 4. Build response ───────────────────────────────────────────────────
  const status = dbHealthy ? "healthy" : "unhealthy";
  const responseTimeMs = Date.now() - start;

  return NextResponse.json(
    {
      status,
      db: dbHealthy,
      ...(dbError ? { dbError } : {}),
      ...(dbLatencyMs !== null ? { dbLatencyMs } : {}),
      timestamp: new Date().toISOString(),
      version: APP_VERSION,
      ...(uptimeSeconds !== null ? { uptime: uptimeSeconds } : {}),
      ...(memory ? { memory } : {}),
      responseTimeMs,
    },
    { status: dbHealthy ? 200 : 503 },
  );
}
