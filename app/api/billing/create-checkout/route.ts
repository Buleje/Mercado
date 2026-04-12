/**
 * POST /api/billing/create-checkout
 *
 * Crea una Stripe Checkout Session para que el tenant se suscriba a un plan
 * de pago (starter o pro). Reutiliza los helpers de lib/stripe.ts y los
 * planes definidos en lib/billing/plans.ts.
 *
 * Body: { planId: "starter" | "pro" }
 * Response: { url: string }  — URL de la Checkout Session de Stripe
 *
 * Diferencias respecto a /api/billing/checkout (ruta legacy):
 *  - Valida con Zod safeParse (nunca .parse()).
 *  - Usa BillingPlanId de lib/billing/plans.ts (starter/pro en céntimos PEN).
 *  - Sigue la estructura obligatoria de endpoints del proyecto.
 *  - logActivity fire-and-forget tras crear la sesión.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import {
  getOrCreateStripeCustomer,
  createCheckoutSession,
} from "@/lib/stripe";
import { getStripePriceId, type BillingPlanId } from "@/lib/billing/plans";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

// ─── Validación ───────────────────────────────────────────────────────────────

const CreateCheckoutSchema = z.object({
  planId: z.enum(["starter", "pro"] as const satisfies [BillingPlanId, BillingPlanId]),
});

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Auth
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { tenantId } = auth;

  // 2. Parsear body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // 3. Validación Zod (safeParse — nunca .parse())
  const parsed = CreateCheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { planId } = parsed.data;

  // 4. Resolver Stripe Price ID desde variables de entorno
  let priceId: string;
  try {
    priceId = getStripePriceId(planId);
  } catch (err) {
    logger.error("[create-checkout] Stripe Price ID no configurado", {
      tenantId,
      planId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        error: `El plan "${planId}" no tiene un precio de Stripe configurado. Contacta soporte.`,
        code: "STRIPE_PRICE_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  }

  // 5. Cargar tenant desde DB (nunca Prisma directo en lógica de negocio —
  //    aquí es acceso puntual de lectura para obtener stripeCustomerId)
  const tenant = await prisma.tenant.findFirst({
    where: { OR: [{ id: tenantId }, { slug: tenantId }] },
    select: {
      id: true,
      slug: true,
      name: true,
      plan: true,
      stripeCustomerId: true,
      ownerEmail: true,
    },
  });

  if (!tenant) {
    return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
  }

  // Prevenir checkout duplicado si ya está en ese plan
  if (tenant.plan === planId) {
    return NextResponse.json({ error: "Ya estás en este plan" }, { status: 409 });
  }

  // 6. Crear o reutilizar Stripe Customer
  const stripeCustomerId = await getOrCreateStripeCustomer({
    stripeCustomerId: tenant.stripeCustomerId ?? null,
    tenantSlug: tenant.slug,
    email: tenant.ownerEmail ?? null,
    name: tenant.name,
  });

  // Persistir el stripeCustomerId si es nuevo (evitar crear duplicados en Stripe)
  if (!tenant.stripeCustomerId) {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { stripeCustomerId },
    });
  }

  // 7. Construir URLs de retorno
  const origin =
    req.headers.get("origin") ??
    `https://${tenant.slug}.${process.env.ROOT_DOMAIN ?? "localhost:3000"}`;

  // 8. Crear Checkout Session en Stripe
  let checkoutUrl: string;
  try {
    checkoutUrl = await createCheckoutSession({
      customerId: stripeCustomerId,
      priceId,
      tenantSlug: tenant.slug,
      successUrl: `${origin}/admin?tab=plan&upgraded=1&plan=${planId}`,
      cancelUrl: `${origin}/admin?tab=plan`,
    });
  } catch (err) {
    logger.error("[create-checkout] Error creando Checkout Session en Stripe", {
      tenantId,
      planId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Error al iniciar el proceso de pago. Inténtalo de nuevo." },
      { status: 502 },
    );
  }

  // 9. Registrar actividad (fire-and-forget)
  logActivity(
    "checkout_initiated",
    "tenant",
    `Checkout Session iniciado para plan "${planId}" (tenant: ${tenant.slug})`,
    tenant.slug,
    "admin",
    undefined,
    tenant.slug,
  ).catch(() => {});

  return NextResponse.json({ url: checkoutUrl });
}
