import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { stripe } from "@/lib/stripe";
import { requireAdmin } from "@/lib/require-admin";
import { PLANS, type PlanTier } from "@/lib/billing/plan-tiers";
import { tierToPlanId } from "@/lib/billing/plan-mapping";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";

/**
 * POST /api/admin/plan/checkout/stripe-session
 *
 * Crea una Stripe Checkout Session para upgrade de plan vendor.
 *
 * Request:  { plan: "pro" | "enterprise" | "max" }
 * Response: { url: string }  → cliente redirige a esa URL
 *
 * Flow:
 *   1. Valida que el caller es admin del tenant.
 *   2. Resuelve / crea el Stripe Customer del tenant (persistido en
 *      `Tenant.stripeCustomerId`).
 *   3. Crea Checkout Session en modo `subscription` con el price del tier.
 *   4. Devuelve `session.url` para redirigir.
 *
 * Tras el pago, el webhook `checkout.session.completed` actualiza
 * `Tenant.plan` en DB. El cliente se entera vía /api/plan en el próximo mount.
 */

const bodySchema = z.object({
  plan: z.enum(["pro", "enterprise", "max"]),
});

export async function POST(req: NextRequest) {
  try {
    // Audit 2026-05-19: endpoint crea sesión Stripe — STRICT.
    const _rl = await applyRateLimit(req, "STRICT", "admin-plan-checkout-stripe-session"); if (_rl) return _rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    // Audit 2026-05-17 Q-P0-2: roles explícitos.
    // Antes requireAdmin(req) sin array permitía cajero/almacenero/analista
    // (management-tier bypass solo cubre admin/owner/manager/superadmin), pero
    // iniciar sesión Stripe del tenant es decisión de facturación SaaS que
    // SOLO debería poder tomar el dueño (owner) o admin del tenant.
    const auth = await requireAdmin(req, ["owner", "admin"]);
    if (auth instanceof NextResponse) return auth;

    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Plan inválido", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const tier: PlanTier = parsed.data.plan;
    const planDef = PLANS[tier];
    const priceId = planDef.stripePriceId;

    if (!priceId) {
      return NextResponse.json(
        { error: `Plan ${tier} no tiene Stripe Price ID configurado` },
        { status: 500 },
      );
    }

    // ── Resuelve tenant + customer Stripe ────────────────────────────────────
    // Tenant resolution legítimo: endpoint admin que actúa sobre el tenant
    // del caller (no cross-tenant). Refactor a TenantsDB pendiente.
    // eslint-disable-next-line no-restricted-properties -- legacy: resolver tenant por id o slug; refactor a TenantsDB pendiente
    const tenant = await prisma.tenant.findFirst({
      where: { OR: [{ id: auth.tenantId }, { slug: auth.tenantId }] },
    });
    if (!tenant) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }

    let customerId = tenant.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: tenant.name,
        metadata: {
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
        },
      });
      customerId = customer.id;
      // eslint-disable-next-line no-restricted-properties -- legacy: update stripeCustomerId del tenant resuelto arriba; refactor a TenantsDB.setStripeCustomerId pendiente
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { stripeCustomerId: customerId },
      });
    }

    // ── Crea Checkout Session ────────────────────────────────────────────────
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      // El cliente vuelve a la pantalla de éxito de nuestro checkout — nuestro
      // webhook ya activó el plan vía `checkout.session.completed`.
      success_url: `${baseUrl}/admin/plan/checkout/success?plan=${tier}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/admin/plan/checkout?plan=${tier}&canceled=1`,
      locale: "es",
      metadata: {
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        planTier: tier,
        planId: tierToPlanId(tier),
      },
      subscription_data: {
        metadata: {
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          planTier: tier,
          planId: tierToPlanId(tier),
        },
      },
      // Permite al usuario aplicar cupones promocionales si los configurás en Stripe.
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe no devolvió URL de checkout" },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: session.url, sessionId: session.id });

  } catch (e) {
    logger.error("[post] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
