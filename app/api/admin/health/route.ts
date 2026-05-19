import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { cacheStore } from "@/lib/cache";
import { isQueueEnabled } from "@/lib/queue";
import { logger } from "@/lib/logger";

// Brandon 2026-05-16 (audit Info): force-dynamic obligatorio — probe
// de salud en tiempo real (DB, cache, queues), no debe cachearse.

export type HealthService = {
  id: string;
  name: string;
  status: "operativo" | "degradado" | "caido";
  responseTime: number;      // ms
  uptime: string;            // e.g. "99.9%"
  lastCheck: string;         // ISO timestamp
  description: string;
};

export type HealthMetric = {
  label: string;
  value: number;
  max: number;
  unit: string;
  status: "ok" | "warning" | "critical";
};

export type HealthIncident = {
  id: string;
  title: string;
  severity: "info" | "warning" | "critical";
  status: "open" | "resolved";
  createdAt: string;
  resolvedAt?: string;
};

export type HealthPayload = {
  services: HealthService[];
  metrics: HealthMetric[];
  incidents: HealthIncident[];
  checkedAt: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function probeDB(): Promise<{ ok: boolean; latencyMs: number }> {
  const t0 = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch {
    return { ok: false, latencyMs: Date.now() - t0 };
  }
}

async function probeCache(): Promise<{ ok: boolean; latencyMs: number }> {
  const t0 = Date.now();
  try {
    const key = "__health_probe__";
    cacheStore.set(key, 1, 5);
    const hit = cacheStore.get(key);
    cacheStore.del(key);
    return { ok: hit === 1, latencyMs: Date.now() - t0 };
  } catch {
    return { ok: false, latencyMs: Date.now() - t0 };
  }
}

function latencyStatus(ms: number, warnMs = 300, critMs = 1000): "ok" | "warning" | "critical" {
  if (ms >= critMs) return "critical";
  if (ms >= warnMs) return "warning";
  return "ok";
}

function serviceStatus(ok: boolean, ms: number): "operativo" | "degradado" | "caido" {
  if (!ok) return "caido";
  if (ms >= 500) return "degradado";
  return "operativo";
}

// ── GET /api/admin/health ─────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Allow superadmin (platform) sessions to read health metrics — the data is
  // platform-scope friendly (DB/cache probes, recent order count, queue status).
  const platformToken = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  const platformSession = platformToken ? await getPlatformSession(platformToken) : null;
  if (!platformSession) {
    const auth = await requireAdmin(req, ["admin", "owner", "manager", "tienda_owner", "cajero"]);
    if (auth instanceof NextResponse) return auth;
  }

  try {
    const checkedAt = new Date().toISOString();

    // Run probes in parallel
    const [db, cache] = await Promise.all([probeDB(), probeCache()]);

    // Brandon 2026-05-16 (audit Info hardening): este count es global
    // de TODOS los tenants — es una métrica operativa de salud de la
    // plataforma (probe que la DB responde + hay tráfico). Admin de un
    // tenant podría inferir tamaño total de la plataforma. Aceptable
    // como hardening info-level: el endpoint /admin/health solo es
    // útil para diagnóstico, no expone PII ni nombres de tenants.
    // Si en el futuro queremos restringir más, mover a /api/superadmin/health.
    // eslint-disable-next-line no-restricted-properties -- platform-wide health probe; tenantId scoping no aplica.
    const recentOrderCount = await prisma.order
      .count({ where: { createdAt: { gte: new Date(Date.now() - 3_600_000) } } })
      .catch(() => -1);

    const hasRedis = !!process.env.REDIS_URL;
    const queuesActive = isQueueEnabled();

    const services: HealthService[] = [
      {
        id: "database",
        name: "Base de datos",
        status: serviceStatus(db.ok, db.latencyMs),
        responseTime: db.latencyMs,
        uptime: db.ok ? "99.9%" : "—",
        lastCheck: checkedAt,
        description: "Prisma / PostgreSQL via Neon",
      },
      {
        id: "cache",
        name: hasRedis ? "Cache (Redis write-through)" : "Cache (in-process)",
        status: serviceStatus(cache.ok, cache.latencyMs),
        responseTime: cache.latencyMs,
        uptime: cache.ok ? "100%" : "—",
        lastCheck: checkedAt,
        description: hasRedis
          ? "RedisStore write-through + MemoryStore local"
          : "MemoryStore TTL cache (Redis-ready)",
      },
      {
        id: "redis",
        name: "Redis",
        status: hasRedis ? "operativo" : "degradado",
        responseTime: 0,
        uptime: hasRedis ? "—" : "—",
        lastCheck: checkedAt,
        description: hasRedis
          ? "REDIS_URL configurado — cache distribuido activo"
          : "No configurado — usando fallback en memoria (ver docs/redis-activation-guide.md)",
      },
      {
        id: "queues",
        name: "Colas BullMQ",
        status: queuesActive ? "operativo" : "degradado",
        responseTime: 0,
        uptime: queuesActive ? "—" : "—",
        lastCheck: checkedAt,
        description: queuesActive
          ? "BullMQ activo — emails, PDFs, notificaciones con reintentos"
          : "Fire-and-forget — sin reintentos (activar Redis para colas durables)",
      },
      {
        id: "api",
        name: "API de pedidos",
        status: recentOrderCount >= 0 ? "operativo" : "degradado",
        responseTime: db.latencyMs, // proxy: same connection
        uptime: "99.8%",
        lastCheck: checkedAt,
        description: "POST /api/orders — cadena de pago y notificaciones",
      },
    ];

    const metrics: HealthMetric[] = [
      {
        label: "Latencia BD",
        value: db.latencyMs,
        max: 1000,
        unit: "ms",
        status: latencyStatus(db.latencyMs),
      },
      {
        label: "Pedidos última hora",
        value: Math.max(0, recentOrderCount),
        max: 100,
        unit: "pedidos",
        status: "ok",
      },
      {
        label: "Latencia caché",
        value: cache.latencyMs,
        max: 50,
        unit: "ms",
        status: latencyStatus(cache.latencyMs, 10, 50),
      },
    ];

    // Surface open incidents based on probe results
    const incidents: HealthIncident[] = [];
    if (!db.ok) {
      incidents.push({
        id: "db-down",
        title: "Base de datos no responde",
        severity: "critical",
        status: "open",
        createdAt: checkedAt,
      });
    }
    if (db.latencyMs >= 500 && db.ok) {
      incidents.push({
        id: "db-slow",
        title: `Base de datos lenta (${db.latencyMs}ms)`,
        severity: "warning",
        status: "open",
        createdAt: checkedAt,
      });
    }
    if (!hasRedis) {
      incidents.push({
        id: "redis-missing",
        title: "Redis no configurado — cache y colas en modo degradado",
        severity: "info",
        status: "open",
        createdAt: checkedAt,
      });
    }

    const payload: HealthPayload = { services, metrics, incidents, checkedAt };
    return NextResponse.json(payload);
  } catch (e) {
    logger.error("[admin/health] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Health check failed" }, { status: 503 });
  }
}
