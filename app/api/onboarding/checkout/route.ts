import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import {
  getOrCreateStripeCustomer,
  createCheckoutSession,
  STRIPE_PRICE_IDS,
} from "@/lib/stripe";
import type { PlanId } from "@/lib/plans";

/**
 * POST /api/onboarding/checkout
 * Body: { tenantSlug: string, plan: "pro" | "business" | "enterprise" }
 *
 * Creates a Stripe Checkout Session for a just-registered tenant.
 * Called immediately after onboarding for paid plans.
 * Returns { url } → redirect the user to Stripe.
 */
export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "STRICT", "onboard-checkout");
  if (rl) return rl;

  let body: { tenantSlug?: string; plan?: string };
  try { body = await req.json(); } catch { body = {}; }

  const slug = body.tenantSlug;
  const plan = body.plan as PlanId | undefined;

  if (!slug || typeof slug !== "string") {
    return NextResponse.json({ error: "tenantSlug requerido" }, { status: 400 });
  }
  if (!plan || plan === "free") {
    return NextResponse.json({ error: "Plan de pago requerido" }, { status: 400 });
  }

  const priceId = STRIPE_PRICE_IDS[plan];
  if (!priceId) {
    return NextResponse.json(
      { error: `Plan "${plan}" no tiene precio Stripe configurado.` },
      { status: 503 },
    );
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) {
    return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
  }

  // Security: only allow checkout for tenants created in the last 30 minutes
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
  if (tenant.createdAt < thirtyMinAgo) {
    return NextResponse.json(
      { error: "El período de activación expiró. Inicia sesión en tu panel para upgrade." },
      { status: 403 },
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://bodegasanmartin.com";

  const stripeCustomerId = await getOrCreateStripeCustomer({
    stripeCustomerId: tenant.stripeCustomerId ?? null,
    tenantSlug: slug,
    email: tenant.ownerEmail ?? null,
    name: tenant.name,
  });

  if (!tenant.stripeCustomerId) {
    await prisma.tenant.update({
      where: { slug },
      data: { stripeCustomerId },
    });
  }

  const url = await createCheckoutSession({
    customerId: stripeCustomerId,
    priceId,
    tenantSlug: slug,
    successUrl: `${baseUrl}/${slug}/admin?upgraded=1`,
    cancelUrl: `${baseUrl}/${slug}/admin`,
  });

  return NextResponse.json({ url });
}
