import "server-only";
import { logger } from "@/lib/logger";

/**
 * lib/ai/cost-control.ts — Roadmap item #68
 *
 * Tracking de costos de AI por tenant + circuit breaker por presupuesto.
 *
 * F4 FIX: Migrado a Upstash Redis para persistencia cross-instance/deploy.
 * Key pattern: aispend:{tenantId}:{YYYY-MM} (INCR atomico, TTL 31 dias).
 *
 * Fallback: si Upstash no esta disponible, usa Map in-memory con WARNING en log.
 * FIXME: si el fallback persiste, agregar tabla MonthlyAiSpend al schema Prisma.
 *
 * Uso:
 *   const ok = await aiCostGuard.canSpend(tenantId, estimatedCost, plan);
 *   if (!ok) return { error: "Presupuesto AI agotado" };
 *   await aiCostGuard.recordSpend(tenantId, actualCost);
 */

// Presupuestos por plan (USD por mes por tenant) — en centavos para INCR entero
const PLAN_BUDGETS_CENTS: Record<string, number> = {
  free: 50,       // $0.50
  pro: 500,       // $5.00
  business: 2000, // $20.00
  enterprise: 10000, // $100.00
};

// ── Upstash Redis client (lazy singleton) ──────────────────────────────────────
let _redis: import("@upstash/redis").Redis | null = null;
let _redisResolved = false;
let _fallbackWarned = false;

async function getRedis(): Promise<import("@upstash/redis").Redis | null> {
  if (_redisResolved) return _redis;
  _redisResolved = true;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (!_fallbackWarned) {
      _fallbackWarned = true;
      logger.warn(
        "[ai-cost] Upstash Redis no configurado — usando in-memory (no persiste entre deploys). " +
        "FIXME: configurar UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN o agregar tabla MonthlyAiSpend.",
      );
    }
    _redis = null;
    return null;
  }

  try {
    const { Redis } = await import("@upstash/redis");
    _redis = new Redis({ url, token });
    return _redis;
  } catch {
    _redis = null;
    return null;
  }
}

// ── Fallback in-memory (cuando Upstash no disponible) ─────────────────────────
const _memTracker = new Map<string, { totalCents: number; count: number; lastReset: number }>();
const RESET_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

function getMemTracker(tenantId: string, monthKey: string) {
  const key = `${tenantId}:${monthKey}`;
  const now = Date.now();
  const existing = _memTracker.get(key);
  if (!existing || (now - existing.lastReset) > RESET_INTERVAL_MS) {
    const fresh = { totalCents: 0, count: 0, lastReset: now };
    _memTracker.set(key, fresh);
    return fresh;
  }
  return existing;
}

function monthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── Public API ────────────────────────────────────────────────────────────────
export const aiCostGuard = {
  async canSpend(tenantId: string, estimatedCostUsd: number, plan = "free"): Promise<boolean> {
    const budget = PLAN_BUDGETS_CENTS[plan] ?? PLAN_BUDGETS_CENTS.free;
    const estimatedCents = Math.round(estimatedCostUsd * 100);
    const redis = await getRedis();

    if (redis) {
      try {
        const key = `aispend:${tenantId}:${monthKey()}`;
        const current = await redis.get<number>(key) ?? 0;
        if (current + estimatedCents > budget) {
          logger.warn("[ai-cost] Presupuesto agotado (Redis)", {
            tenantId: tenantId.slice(-6), spentCents: current, budget, estimatedCents,
          });
          return false;
        }
        return true;
      } catch (err) {
        logger.warn("[ai-cost] Error leyendo Redis, permitting spend", { err: String(err) });
        return true; // fail-open para no bloquear servicio
      }
    }

    // Fallback in-memory
    const tracker = getMemTracker(tenantId, monthKey());
    if (tracker.totalCents + estimatedCents > budget) {
      logger.warn("[ai-cost] Presupuesto agotado (in-memory)", {
        tenantId: tenantId.slice(-6), spentCents: tracker.totalCents, budget,
      });
      return false;
    }
    return true;
  },

  async recordSpend(tenantId: string, actualCostUsd: number): Promise<void> {
    const actualCents = Math.round(actualCostUsd * 100);
    const redis = await getRedis();

    if (redis) {
      try {
        const key = `aispend:${tenantId}:${monthKey()}`;
        // INCR atomico + TTL 31 dias (mes completo con margen)
        await redis.incrby(key, actualCents);
        await redis.expire(key, 31 * 24 * 60 * 60);
        return;
      } catch (err) {
        logger.warn("[ai-cost] Error escribiendo Redis, fallback in-memory", { err: String(err) });
      }
    }

    // Fallback in-memory
    const tracker = getMemTracker(tenantId, monthKey());
    tracker.totalCents += actualCents;
    tracker.count += 1;
  },

  async getUsage(tenantId: string): Promise<{ spentUsd: number; count: number }> {
    const redis = await getRedis();

    if (redis) {
      try {
        const key = `aispend:${tenantId}:${monthKey()}`;
        const totalCents = await redis.get<number>(key) ?? 0;
        return { spentUsd: totalCents / 100, count: 0 }; // count no persiste en Redis (no critico)
      } catch {
        // fallthrough a in-memory
      }
    }

    const tracker = getMemTracker(tenantId, monthKey());
    return { spentUsd: tracker.totalCents / 100, count: tracker.count };
  },
};
