import "server-only";
import { logger } from "@/lib/logger";
import { TenantBillingDB } from "@/lib/db/tenant-billing.db";

/**
 * lib/ai/cost-control.ts — Roadmap item #68
 *
 * Tracking de costos de AI por tenant + circuit breaker por presupuesto.
 *
 * F4 FIX: Migrado a Upstash Redis para persistencia cross-instance/deploy.
 * Key pattern: aispend:{tenantId}:{YYYY-MM} (INCRBYFLOAT atomico en centavos, TTL 31 dias).
 *
 * Fallback: si Upstash no esta disponible, usa Map in-memory con WARNING en log.
 * FIXME: si el fallback persiste, agregar tabla MonthlyAiSpend al schema Prisma.
 *
 * Uso:
 *   const ok = await aiCostGuard.canSpend(tenantId, estimatedCost, plan);
 *   if (!ok) return { error: "Presupuesto AI agotado" };
 *   await aiCostGuard.recordSpend(tenantId, actualCost);
 */

// Presupuestos por plan (USD por mes por tenant), en centavos. El gasto se
// acumula en centavos CON decimales (INCRBYFLOAT): leer un papel cuesta ~$0,0029
// = 0,29 centavos, y redondear a entero lo guardaba como 0 (el medidor no se
// movía y el tope nunca frenaba los comandos). Las claves viejas, enteras, siguen
// sirviendo: INCRBYFLOAT suma sobre un entero sin migrar nada.
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

/**
 * El tope de IA del mes para el plan del tenant, resuelto IGUAL que `canSpend`
 * (`TenantBillingDB.getPlan` + `PLAN_BUDGETS_CENTS`, con caída a free). Lo usa el
 * medidor del panel (`/api/admin/ai-costs`) para mostrar el tope que de verdad
 * se aplica: antes la ruta tenía su propia tabla y leía `plan` de la sesión
 * (que no lo trae), así que todos veían el tope de free.
 *
 * `planEnTabla=false` = el plan no tiene fila propia y usa el tope de free
 * (hoy le pasa a "starter").
 */
export async function topeDelPlan(
  tenantId: string,
): Promise<{ plan: string; capUsd: number; planEnTabla: boolean }> {
  const plan = await TenantBillingDB.getPlan(tenantId);
  const planEnTabla = Object.prototype.hasOwnProperty.call(PLAN_BUDGETS_CENTS, plan);
  const cents = planEnTabla ? PLAN_BUDGETS_CENTS[plan] : PLAN_BUDGETS_CENTS.free;
  return { plan, capUsd: cents / 100, planEnTabla };
}

function monthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── Public API ────────────────────────────────────────────────────────────────
export const aiCostGuard = {
  /**
   * @param plan  Opcional. Si NO se pasa y `tenantId` es un tenant real, se
   *   resuelve el plan REAL del tenant (Tenant.plan, cacheado). Antes el default
   *   era "free" y todos los call sites lo hardcodeaban → los planes pagos
   *   quedaban capados al presupuesto free. Pasar un plan explícito (ej. buckets
   *   por IP que no son tenants, o un override) preserva el comportamiento viejo.
   */
  async canSpend(tenantId: string, estimatedCostUsd: number, plan?: string): Promise<boolean> {
    const resolvedPlan = plan ?? (await TenantBillingDB.getPlan(tenantId));
    const budget = PLAN_BUDGETS_CENTS[resolvedPlan] ?? PLAN_BUDGETS_CENTS.free;
    // Sin redondear: un estimado de 0,29 centavos tiene que pesar en el tope.
    const estimatedCents = Math.max(0, estimatedCostUsd * 100);
    const redis = await getRedis();

    if (redis) {
      try {
        const key = `aispend:${tenantId}:${monthKey()}`;
        // Number(): INCRBYFLOAT puede devolverlo como texto ("0.29") según el cliente.
        const current = Number((await redis.get<number | string>(key)) ?? 0) || 0;
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
    // Sin redondear (ver PLAN_BUDGETS_CENTS): hasta 4.999 tokens se guardaban 0 centavos.
    const actualCents = Math.max(0, actualCostUsd * 100);
    if (!Number.isFinite(actualCents)) return;
    const redis = await getRedis();

    if (redis) {
      try {
        const key = `aispend:${tenantId}:${monthKey()}`;
        // INCRBYFLOAT atomico + TTL 31 dias (mes completo con margen)
        await redis.incrbyfloat(key, actualCents);
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
        const totalCents = Number((await redis.get<number | string>(key)) ?? 0) || 0;
        return { spentUsd: totalCents / 100, count: 0 }; // count no persiste en Redis (no critico)
      } catch {
        // fallthrough a in-memory
      }
    }

    const tracker = getMemTracker(tenantId, monthKey());
    return { spentUsd: tracker.totalCents / 100, count: tracker.count };
  },
};
