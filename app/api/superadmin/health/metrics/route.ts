import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { HealthDB } from "@/lib/db/health.db";
import { logger } from "@/lib/logger";
import { startOfLimaDay } from "@/lib/utils";

/**
 * GET /api/superadmin/health/metrics — métricas REALES del sistema (Brandon
 * 2026-06-19). NADA de adorno: todo se mide en vivo.
 *  - DB: latencia (SELECT 1 cronometrado), conexiones (pg_stat_activity), tamaño
 *    (pg_database_size), cache hit ratio + commits/rollbacks (pg_stat_database),
 *    tablas más grandes (pg_total_relation_size).
 *  - Servicios: configurado = el secreto está en el entorno (honesto: no implica
 *    que esté operativo). Redis SÍ se pinea de verdad.
 *  - Tenants: rollup real (total/activas/publicadas/pedidos hoy/productos).
 * Cada métrica de la base va aparte en `HealthDB.metricasDelMotor` → si falla, queda null
 * ("no disponible") y se registra; nunca un valor falso. Las consultas viven en `HealthDB`.
 */

const NO_STORE = { "Cache-Control": "no-store, max-age=0" } as const;

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
  } catch (err) {
    logger.error("[health/metrics] ping a Redis falló", { error: String(err) });
    return { configured: true, ok: false, latencyMs: null };
  }
}

async function tenantsRollup() {
  try {
    return await HealthDB.resumenPlataforma(new Date(startOfLimaDay()));
  } catch (e) {
    logger.error("[health/metrics] tenants rollup", { err: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const [db, redis, tenants] = await Promise.all([HealthDB.metricasDelMotor(), redisPing(), tenantsRollup()]);
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
