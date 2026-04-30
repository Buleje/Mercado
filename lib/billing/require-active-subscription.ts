/**
 * lib/billing/require-active-subscription.ts
 *
 * Helper de enforcement: bloquea endpoints de escritura cuando el tenant
 * tiene su trial expirado y no activó un plan pagado.
 *
 * Ver ADR-084 — trial-suspension-mode.
 *
 * Uso típico en un Route Handler de escritura (POST/PATCH/PUT/DELETE):
 *
 *   const auth = await requireAdmin(req, ["admin"]);
 *   if (auth instanceof NextResponse) return auth;
 *   const blocked = await requireActiveSubscription(auth.tenantId);
 *   if (blocked) return blocked;  // 402 Payment Required
 *   // ... lógica del endpoint
 */

import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isReadOnlyMode } from "@/lib/billing/trial-status";
import { logger } from "@/lib/logger";

/**
 * Devuelve `null` si el tenant puede operar; devuelve un NextResponse 402 si no.
 * Fail-open en errores de DB para no romper la operación si Postgres está raro.
 */
export async function requireActiveSubscription(
  tenantId: string,
): Promise<NextResponse | null> {
  try {
    const tenant = await prisma.tenant.findFirst({
      where: { OR: [{ id: tenantId }, { slug: tenantId }] },
      select: {
        plan: true,
        trialEndsAt: true,
        stripeSubscriptionId: true,
        mpSubscriptionId: true,
      },
    });
    if (!tenant) {
      // Tenant no encontrado — dejamos que el endpoint principal decida (404 o lo que sea).
      return null;
    }
    if (!isReadOnlyMode(tenant)) {
      return null;
    }
    return NextResponse.json(
      {
        error: "Trial expirado",
        detail:
          "Tu periodo de prueba terminó. Activa un plan para volver a operar (procesar ventas, crear clientes, productos, gastos, etc.).",
        code: "TENANT_SUSPENDED_TRIAL_EXPIRED",
        upgradeUrl: "/admin?tab=plan",
      },
      { status: 402 },
    );
  } catch (err) {
    logger.warn("[requireActiveSubscription] DB error — fail-open", {
      tenantId,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
