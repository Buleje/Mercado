import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * GET /api/superadmin/health/metrics — métricas REALES del sistema (Brandon
 * 2026-06-19). NADA de adorno: todo se mide en vivo.
 *  - DB: latencia (SELECT 1 cronometrado), conexiones (pg_stat_activity), tamaño
 *    (pg_database_size), cache hit ratio + commits/rollbacks (pg_stat_database),
 *    tablas más grandes (pg_total_relation_size).
 *  - Servicios: configurado = el secreto está en el entorno (honesto: no implica
 *    que esté operativo). Redis SÍ se pinea de verdad.
 *  - Tenants: rollup real (total/activas/publicadas/pedidos hoy/productos).
 * Cada métrica va en su try/catch → si falla, queda null ("no disponible"), nunca
 * un valor falso.
 */

const NO_STORE = { "Cache-Control": "no-store, max-age=0" } as const;

async function dbMetrics() {
  const out: Record<string, unknown> = {};
  try {
    const t0 = performance.now();
    await prisma.$queryRawUnsafe("SELECT 1");
    out.latencyMs = Math.round((performance.now() - t0) * 10) / 10;
  } catch { out.latencyMs = null; }

  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ state: string | null; n: bigint }>>(
      "SELECT state, count(*)::bigint AS n FROM pg_stat_activity WHERE datname = current_database() GROUP BY state",
    );
    let total = 0, active = 0, idle = 0;
    for (const r of rows) {
      const n = Number(r.n);
      total += n;
      if (r.state === "active") active += n;
      else if (r.state === "idle") idle += n;
    }
    out.connections = { total, active, idle };
  } catch { out.connections = null; }

  try {
    const r = await prisma.$queryRawUnsafe<Array<{ bytes: bigint }>>(
      "SELECT pg_database_size(current_database())::bigint AS bytes",
    );
    out.sizeBytes = Number(r[0]?.bytes ?? 0);
  } catch { out.sizeBytes = null; }

  try {
    const r = await prisma.$queryRawUnsafe<Array<{ hit: bigint; rd: bigint; commits: bigint; rollbacks: bigint }>>(
      "SELECT COALESCE(sum(blks_hit),0)::bigint AS hit, COALESCE(sum(blks_read),0)::bigint AS rd, COALESCE(sum(xact_commit),0)::bigint AS commits, COALESCE(sum(xact_rollback),0)::bigint AS rollbacks FROM pg_stat_database WHERE datname = current_database()",
    );
    const hit = Number(r[0]?.hit ?? 0), rd = Number(r[0]?.rd ?? 0);
    out.cacheHitRatio = hit + rd > 0 ? Math.round((hit / (hit + rd)) * 1000) / 10 : null;
    out.commits = Number(r[0]?.commits ?? 0);
    out.rollbacks = Number(r[0]?.rollbacks ?? 0);
  } catch { out.cacheHitRatio = null; }

  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ name: string; bytes: bigint }>>(
      "SELECT relname AS name, pg_total_relation_size(relid)::bigint AS bytes FROM pg_stat_user_tables ORDER BY bytes DESC LIMIT 6",
    );
    out.topTables = rows.map((r) => ({ name: r.name, bytes: Number(r.bytes) }));
  } catch { out.topTables = null; }

  return out;
}

function servicesStatus() {
  const env = process.env;
  const set = (v?: string) => !!v && v.trim() !== "" && !/^(tu-|your-|changeme|placeholder)/i.test(v);
  return [
    { key: "database", label: "PostgreSQL", configured: set(env.DATABASE_URL), critical: true },
    { key: "supabase", label: "Supabase", configured: set(env.NEXT_PUBLIC_SUPABASE_URL), critical: true },
    { key: "auth", label: "Auth (JWT)", configured: set(env.AUTH_SECRET), critical: true },
    { key: "redis", label: "Redis (Upstash)", configured: set(env.UPSTASH_REDIS_REST_URL), critical: false },
    { key: "stripe", label: "Stripe (suscripciones)", configured: set(env.STRIPE_SECRET_KEY), critical: false },
    { key: "mercadopago", label: "Mercado Pago", configured: set(env.MP_ACCESS_TOKEN), critical: false },
    { key: "whatsapp", label: "WhatsApp (Twilio)", configured: set(env.TWILIO_AUTH_TOKEN) || set(env.WHATSAPP_API_URL), critical: false },
    { key: "email", label: "Email (Resend)", configured: set(env.RESEND_API_KEY), critical: false },
    { key: "push", label: "Web Push (VAPID)", configured: set(env.VAPID_PRIVATE_KEY), critical: false },
    { key: "sentry", label: "Sentry (errores)", configured: set(env.SENTRY_DSN) || set(env.NEXT_PUBLIC_SENTRY_DSN), critical: false },
    { key: "cron", label: "Cron (jobs)", configured: set(env.CRON_SECRET), critical: false },
  ];
}

async function redisPing() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return { configured: false, latencyMs: null as number | null, ok: false };
  try {
    const t0 = performance.now();
    const res = await fetch(`${url}/ping`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(2500) });
    return { configured: true, ok: res.ok, latencyMs: Math.round((performance.now() - t0) * 10) / 10 };
  } catch {
    return { configured: true, ok: false, latencyMs: null };
  }
}

async function tenantsRollup() {
  try {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const [total, active, published, ordersToday, products] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { active: true } }),
      prisma.store.count({ where: { isPublished: true } }),
      prisma.order.count({ where: { createdAt: { gte: start } } }),
      prisma.product.count(),
    ]);
    return { total, active, published, ordersToday, products };
  } catch (e) {
    logger.error("[health/metrics] tenants rollup", { err: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const [db, redis, tenants] = await Promise.all([dbMetrics(), redisPing(), tenantsRollup()]);
    const app = {
      env: process.env.NODE_ENV ?? "unknown",
      node: process.version,
      uptimeSec: Math.round(process.uptime()),
      version: process.env.npm_package_version ?? process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    };
    return NextResponse.json({ db, redis, services: servicesStatus(), tenants, app, generatedAt: new Date().toISOString() }, { headers: NO_STORE });
  } catch (e) {
    logger.error("[superadmin/health/metrics] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
