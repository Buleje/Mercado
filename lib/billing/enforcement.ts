/**
 * lib/billing/enforcement.ts
 *
 * Funciones de enforcement de límites de plan para el SaaS Bodega San Martín.
 * Úsalas en Route Handlers y Server Actions antes de crear recursos.
 *
 * Diseño:
 *  - Cada función recibe `tenantId` como primer parámetro (regla multi-tenant).
 *  - Usan `lib/usage.ts` para contar recursos actuales (sin Prisma directo).
 *  - Leen el plan desde `prisma.tenant` vía una query mínima (select plan only).
 *  - Fail-open: si hay error de DB, se permite la operación para no bloquear al usuario.
 *
 * Uso típico en un Route Handler:
 *   const allowed = await canCreateProduct(tenantId);
 *   if (!allowed.ok) return NextResponse.json({ error: allowed.reason }, { status: 402 });
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getTenantUsage } from "@/lib/usage";
import { getBillingPlan, planHasFeature, type BillingFeature } from "@/lib/billing/plans";

// ─── Tipos de retorno ─────────────────────────────────────────────────────────

export interface EnforcementResult {
  /** true = operación permitida, false = bloqueada por límite de plan. */
  ok: boolean;
  /** Mensaje legible cuando ok = false. */
  reason?: string;
  /** Plan actual del tenant. */
  plan?: string;
  /** Uso actual del recurso verificado. */
  current?: number;
  /** Límite del plan para ese recurso. -1 = sin límite. */
  max?: number;
}

// ─── Helper interno ───────────────────────────────────────────────────────────

async function getTenantPlan(tenantId: string): Promise<string> {
  try {
    const tenant = await prisma.tenant.findFirst({
      where: { OR: [{ id: tenantId }, { slug: tenantId }] },
      select: { plan: true },
    });
    return tenant?.plan ?? "free";
  } catch (err) {
    logger.warn("[billing/enforcement] No se pudo leer el plan del tenant — usando free", {
      tenantId,
      err: err instanceof Error ? err.message : String(err),
    });
    return "free";
  }
}

// ─── Enforcement de productos ─────────────────────────────────────────────────

/**
 * Verifica si el tenant puede crear un producto más según su plan.
 *
 * @param tenantId - ID o slug del tenant (siempre primer parámetro).
 * @returns EnforcementResult con ok=true si puede crear, ok=false si está al límite.
 */
export async function canCreateProduct(tenantId: string): Promise<EnforcementResult> {
  try {
    const planId = await getTenantPlan(tenantId);
    const plan = getBillingPlan(planId);

    if (plan.maxProducts === -1) {
      return { ok: true, plan: planId, max: -1 };
    }

    const usage = await getTenantUsage(tenantId);
    const current = usage.products;

    if (current >= plan.maxProducts) {
      return {
        ok: false,
        reason:
          `Tu plan ${plan.name} permite máximo ${plan.maxProducts} productos activos. ` +
          `Actualmente tienes ${current}. Actualiza tu plan para continuar.`,
        plan: planId,
        current,
        max: plan.maxProducts,
      };
    }

    return { ok: true, plan: planId, current, max: plan.maxProducts };
  } catch (err) {
    // Fail-open: nunca bloquear al usuario por errores de infraestructura
    logger.error("[billing/enforcement] canCreateProduct error — fail open", {
      tenantId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: true };
  }
}

// ─── Enforcement de usuarios ──────────────────────────────────────────────────

/**
 * Verifica si el tenant puede crear un usuario (adminUser) más según su plan.
 *
 * @param tenantId - ID o slug del tenant (siempre primer parámetro).
 * @returns EnforcementResult con ok=true si puede crear, ok=false si está al límite.
 */
export async function canCreateUser(tenantId: string): Promise<EnforcementResult> {
  try {
    const planId = await getTenantPlan(tenantId);
    const plan = getBillingPlan(planId);

    if (plan.maxUsers === -1) {
      return { ok: true, plan: planId, max: -1 };
    }

    const usage = await getTenantUsage(tenantId);
    const current = usage.users;

    if (current >= plan.maxUsers) {
      return {
        ok: false,
        reason:
          `Tu plan ${plan.name} permite máximo ${plan.maxUsers} usuario(s). ` +
          `Actualmente tienes ${current}. Actualiza tu plan para agregar más usuarios.`,
        plan: planId,
        current,
        max: plan.maxUsers,
      };
    }

    return { ok: true, plan: planId, current, max: plan.maxUsers };
  } catch (err) {
    logger.error("[billing/enforcement] canCreateUser error — fail open", {
      tenantId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: true };
  }
}

// ─── Enforcement de features ──────────────────────────────────────────────────

/**
 * Verifica si el tenant tiene acceso a un feature según su plan.
 *
 * @param tenantId - ID o slug del tenant (siempre primer parámetro).
 * @param feature  - Feature a verificar (ver BillingFeature en lib/billing/plans.ts).
 * @returns true si el plan incluye el feature, false si no.
 *
 * Ejemplo de uso en un Route Handler:
 *   if (!await hasFeature(tenantId, "fiado")) {
 *     return NextResponse.json({ error: "Tu plan no incluye fiado" }, { status: 402 });
 *   }
 */
export async function hasFeature(
  tenantId: string,
  feature: BillingFeature,
): Promise<boolean> {
  try {
    const planId = await getTenantPlan(tenantId);
    const plan = getBillingPlan(planId);
    return planHasFeature(plan, feature);
  } catch (err) {
    // Fail-open: nunca bloquear por errores de infraestructura
    logger.error("[billing/enforcement] hasFeature error — fail open", {
      tenantId,
      feature,
      err: err instanceof Error ? err.message : String(err),
    });
    return true;
  }
}

// ─── Helper combinado para respuesta 402 ─────────────────────────────────────

/**
 * Construye un payload estándar de error 402 para respuestas de límite de plan.
 * Usar con NextResponse.json(buildLimitPayload(...), { status: 402 }).
 */
export function buildLimitPayload(result: EnforcementResult) {
  return {
    error: "Límite de plan alcanzado",
    detail: result.reason ?? "Has alcanzado el límite de tu plan actual.",
    code: "PLAN_LIMIT_REACHED",
    plan: result.plan,
    current: result.current,
    max: result.max,
    upgrade: true,
  };
}
