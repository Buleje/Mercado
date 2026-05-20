/**
 * GET /api/health
 *
 * Lightweight liveness + readiness probe.
 * Used by load balancers, Kubernetes, UptimeRobot, and any external monitor.
 *
 * Returns 200 when all checks pass, 503 when any check is degraded.
 */
import { NextResponse } from "next/server";
import { HealthDB } from "@/lib/db/health.db";
import { withCircuitBreaker, getCircuitStatus } from "@/lib/circuit-breaker";
import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";

// Next 16 con cacheComponents NO permite `export const dynamic = "force-dynamic"`
// (rompe el build con segment-config error). El dinamismo ya está garantizado
// porque cada request ejecuta `prisma.$queryRaw` (side-effect). Lo único que
// queda por blindar es el cache del cliente / CDN — ver `Cache-Control` abajo.

// In-process counter for DB failures in the current minute.
// Resets every 60 s. When failures exceed ALERT_THRESHOLD, a Sentry alert fires
// and an email notification is sent to the superadmin.
const DB_FAIL_WINDOW_MS = 60_000;
const ALERT_THRESHOLD = 3;
let _failCount = 0;
let _windowStart = Date.now();
let _lastEmailAlert = 0;
const EMAIL_COOLDOWN_MS = 15 * 60_000; // 15 min between email alerts

export async function GET() {
  const start = Date.now();
  let dbStatus: "ok" | "error" = "ok";
  let dbLatencyMs: number | null = null;

  try {
    const t = Date.now();
    await withCircuitBreaker("prisma", () => HealthDB.ping());
    dbLatencyMs = Date.now() - t;
  } catch (e) {
    dbStatus = "error";
    const errMsg = e instanceof Error ? e.message : String(e);
    logger.warn("[health] DB check failed", { err: errMsg });

    // Rate-alert: if DB failures exceed threshold within 1 minute, trigger Sentry alert.
    const now = Date.now();
    if (now - _windowStart > DB_FAIL_WINDOW_MS) {
      _failCount = 0;
      _windowStart = now;
    }
    _failCount++;
    if (_failCount >= ALERT_THRESHOLD) {
      Sentry.captureMessage(
        `[health] DB check failed ${_failCount}x in the last minute`,
        { level: "error", extra: { failCount: _failCount, lastError: errMsg } },
      );
      // Send email alert (rate-limited to 1 per 15 minutes)
      if (Date.now() - _lastEmailAlert > EMAIL_COOLDOWN_MS) {
        _lastEmailAlert = Date.now();
        import("@/lib/mailer-superadmin").then(({ sendSuperAdminAlert }) =>
          sendSuperAdminAlert({
            subject: "⚠️ Alerta de salud: Base de datos degradada",
            title: "Base de datos no disponible",
            items: [
              { label: "Fallos detectados", value: String(_failCount) },
              { label: "Último error", value: errMsg },
            ],
            actionLabel: "Ver health check",
            actionUrl: `${process.env.NEXT_PUBLIC_BASE_URL ?? "https://buleje.pe"}/api/health`,
          })
        ).catch((err) => logger.warn("[health] superadmin alert dispatch failed", { err: String(err) }));
      }
      // Reset so a repeated burst doesn't spam Sentry on every request
      _failCount = 0;
      _windowStart = now;
    }
  }

  const cbStatus = getCircuitStatus("prisma");

  const healthy = dbStatus === "ok";

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown",
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      checks: {
        database: {
          status: dbStatus,
          latencyMs: dbLatencyMs,
          circuitBreaker: cbStatus.state,
        },
      },
      responseTimeMs: Date.now() - start,
    },
    {
      status: healthy ? 200 : 503,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    },
  );
}
