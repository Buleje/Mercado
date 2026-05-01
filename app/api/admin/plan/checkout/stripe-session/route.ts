import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { stripe } from "@/lib/stripe";
import { requireAdmin } from "@/lib/require-admin";
import { PLANS, type PlanTier } from "@/lib/billing/plan-tiers";
import { tierToPlanId } from "@/lib/billing/plan-mapping";
import { prisma } from "@/lib/prisma";

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
  const auth = await requireAdmin(req);
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
}
