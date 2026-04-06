import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlanLimits, type PlanLimits } from "@/lib/plans";
import { getTenantUsage } from "@/lib/usage";

type Resource = "products" | "users" | "ordersThisMonth";

const LIMIT_MAP: Record<Resource, keyof PlanLimits> = {
  products: "maxProducts",
  users: "maxUsers",
  ordersThisMonth: "maxOrdersPerMonth",
};

const LABEL_MAP: Record<Resource, string> = {
  products: "productos",
  users: "usuarios",
  ordersThisMonth: "pedidos este mes",
};

/**
 * Verifica si el tenant puede crear un recurso más según su plan.
 * Retorna null si OK, o NextResponse 402 si está sobre el límite.
 *
 * Uso:
 *   const blocked = await checkPlanLimit(tenantId, "products");
 *   if (blocked) return blocked;
 */
export async function checkPlanLimit(
  tenantSlug: string,
  resource: Resource,
): Promise<NextResponse | null> {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { plan: true },
    });
    if (!tenant) return null; // no tenant = no limit enforcement

    const limits = getPlanLimits(tenant.plan);
    const limitKey = LIMIT_MAP[resource];
    const max = limits[limitKey] as number;

    if (max === -1) return null; // unlimited

    const usage = await getTenantUsage(tenantSlug);
    const current = usage[resource];

    if (current >= max) {
      return NextResponse.json(
        {
          error: `Límite de plan alcanzado`,
          detail: `Tu plan ${tenant.plan} permite máximo ${max} ${LABEL_MAP[resource]}. Actualmente tienes ${current}. Actualiza tu plan para continuar.`,
          code: "PLAN_LIMIT_REACHED",
          resource,
          current,
          max,
          plan: tenant.plan,
        },
        { status: 402 },
      );
    }

    return null;
  } catch {
    // Si falla la verificación, no bloquear (fail open)
    return null;
  }
}
