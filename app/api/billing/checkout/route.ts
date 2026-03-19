import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import {
  getOrCreateStripeCustomer,
  createCheckoutSession,
  STRIPE_PRICE_IDS,
} from "@/lib/stripe";
import type { PlanId } from "@/lib/plans";

// POST /api/billing/checkout
// Body: { plan: "pro" | "business" }
// Creates a Stripe Checkout Session and returns { url }
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { tenantId } = auth;

  let body: { plan?: string };
  try { body = await req.json(); } catch { body = {}; }

  const plan = body.plan as PlanId | undefined;
  if (!plan || plan === "free") {
    return NextResponse.json({ error: "Plan inválido" }, { status: 400 });
  }

  const priceId = STRIPE_PRICE_IDS[plan];
  if (!priceId) {
    return NextResponse.json(
      { error: `El plan "${plan}" no tiene un precio de Stripe configurado. Contacta soporte.` },
      { status: 503 }
    );
  }

  const tenant = await prisma.tenant.findFirst({ where: { slug: tenantId } });
  if (!tenant) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });

  // Already on this plan
  if (tenant.plan === plan) {
    return NextResponse.json({ error: "Ya estás en este plan" }, { status: 409 });
  }

  const origin = req.headers.get("origin") ?? `https://${tenantId}.${process.env.ROOT_DOMAIN ?? "localhost:3000"}`;

  // Create or reuse Stripe customer
  const stripeCustomerId = await getOrCreateStripeCustomer({
    stripeCustomerId: tenant.stripeCustomerId ?? null,
    tenantSlug: tenantId,
    email: tenant.ownerEmail ?? null,
    name: tenant.name,
  });

  // Save stripeCustomerId if new
  if (!tenant.stripeCustomerId) {
    await prisma.tenant.update({
      where: { slug: tenantId },
      data: { stripeCustomerId },
    });
  }

  const url = await createCheckoutSession({
    customerId: stripeCustomerId,
    priceId,
    tenantSlug: tenantId,
    successUrl: `${origin}/admin?tab=plan&upgraded=1`,
    cancelUrl: `${origin}/admin?tab=plan`,
  });

  return NextResponse.json({ url });
}
