import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import {
  getOrCreateStripeCustomer,
  createCheckoutSession,
  STRIPE_PRICE_IDS,
} from "@/lib/stripe";
import type { PlanId } from "@/lib/plans";
import { applyRateLimit } from "@/lib/rate-limit";

// POST /api/billing/checkout
// Body: { plan: "pro" | "business" }
// Creates a Stripe Checkout Session and returns { url }
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "billing-checkout"); if (_rl) return _rl;
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
    // Modo dev: si no hay STRIPE_PRICE_IDS configurado, devolver una URL
    // mock que simula el checkout (acelera testing local sin secrets reales).
    // Activado SOLO en NODE_ENV !== "production" para evitar accidentes.
    if (process.env.NODE_ENV !== "production") {
      const mockUrl = `${req.headers.get("origin") ?? "http://localhost:3000"}/admin/plan/checkout/mock?plan=${plan}`;
      return NextResponse.json({ url: mockUrl, mock: true });
    }
    return NextResponse.json(
      { error: `El plan "${plan}" no tiene un precio de Stripe configurado. Contacta soporte.` },
      { status: 503 }
    );
  }

  const tenant = await prisma.tenant.findFirst({ where: { OR: [{ id: tenantId }, { slug: tenantId }] } });
  if (!tenant) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });

  // Already on this plan
  if (tenant.plan === plan) {
    return NextResponse.json({ error: "Ya estás en este plan" }, { status: 409 });
  }

  const origin = req.headers.get("origin") ?? `https://${tenant.slug}.${process.env.ROOT_DOMAIN ?? "localhost:3000"}`;

  // Create or reuse Stripe customer
  const stripeCustomerId = await getOrCreateStripeCustomer({
    stripeCustomerId: tenant.stripeCustomerId ?? null,
    tenantSlug: tenant.slug,
    email: tenant.ownerEmail ?? null,
    name: tenant.name,
  });

  // Save stripeCustomerId if new
  if (!tenant.stripeCustomerId) {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { stripeCustomerId },
    });
  }

  const url = await createCheckoutSession({
    customerId: stripeCustomerId,
    priceId,
    tenantSlug: tenant.slug,
    successUrl: `${origin}/admin?tab=plan&upgraded=1`,
    cancelUrl: `${origin}/admin?tab=plan`,
  });

  return NextResponse.json({ url });
}
