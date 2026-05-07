import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { getSessionPayload, SESSION } from "@/lib/session";
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

  // F3: requerir sesión de onboarding — sin esto cualquiera con tenantSlug inicia
  // un Stripe Checkout ajeno abusando del período de activación de 30 min.
  const sessionToken = req.cookies.get(SESSION.COOKIE_NAME)?.value;
  const adminSession = sessionToken ? await getSessionPayload(sessionToken) : null;
  if (!adminSession) {
    return NextResponse.json(
      { error: "Auth requerida — completá signup primero" },
      { status: 401 }
    );
  }

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

  // F3: tenant debe coincidir con la sesión activa — evita que un admin de tenant A
  // inicie checkout de tenant B conociendo su slug.
  const tenant = await prisma.tenant.findFirst({
    where: { slug, id: adminSession.tenantId },
  });
  if (!tenant) {
    return NextResponse.json(
      { error: "Tenant no coincide con sesión" },
      { status: 403 }
    );
  }

  // Security: only allow checkout for tenants created in the last 30 minutes
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
  if (tenant.createdAt < thirtyMinAgo) {
    return NextResponse.json(
      { error: "El período de activación expiró. Inicia sesión en tu panel para upgrade." },
      { status: 403 },
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://buleje.pe";

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
