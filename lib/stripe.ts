import Stripe from "stripe";
import { PLANS, type PlanId } from "@/lib/plans";

// ─── Client (singleton) ──────────────────────────────────
// Audit 2026-05-17 04-P1-W5: el fallback "sk_test_placeholder" hacía que
// en prod sin la var la app booteara con cliente Stripe inválido, y las
// llamadas explotaban con auth errors silenciosos en runtime (HTTP 401
// from api.stripe.com escondidos en try/catch del caller). Mejor fail-fast
// en startup: si STRIPE_SECRET_KEY falta en prod, lib/env.ts ya lanza error
// crítico. En dev (sin var) seguimos con string vacío → Stripe lanza error
// claro al primer call y el dev lo ve de inmediato.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2026-04-22.dahlia",
  typescript: true,
});

// ─── Price IDs per plan (set in env) ─────────────────────
// STRIPE_PRICE_PRO        → monthly recurring price for Pro plan
// STRIPE_PRICE_BUSINESS   → monthly recurring price for Business plan
// STRIPE_PRICE_ENTERPRISE → monthly recurring price for Enterprise plan
export const STRIPE_PRICE_IDS: Partial<Record<PlanId, string>> = {
  pro:        process.env.STRIPE_PRICE_PRO ?? "",
  business:   process.env.STRIPE_PRICE_BUSINESS ?? "",
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE ?? "",
};

// ─── Helpers ─────────────────────────────────────────────

/**
 * Create or retrieve a Stripe Customer for a tenant.
 * If `stripeCustomerId` is already set, returns it as-is.
 */
export async function getOrCreateStripeCustomer(opts: {
  stripeCustomerId: string | null;
  tenantSlug: string;
  email: string | null;
  name: string;
}): Promise<string> {
  if (opts.stripeCustomerId) return opts.stripeCustomerId;

  const customer = await stripe.customers.create({
    email: opts.email ?? undefined,
    name: opts.name,
    metadata: { tenantSlug: opts.tenantSlug },
  });
  return customer.id;
}

/**
 * Build a Stripe Checkout Session URL for upgrading to a paid plan.
 */
export async function createCheckoutSession(opts: {
  customerId: string;
  priceId: string;
  tenantSlug: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const session = await stripe.checkout.sessions.create({
    customer: opts.customerId,
    mode: "subscription",
    line_items: [{ price: opts.priceId, quantity: 1 }],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata: { tenantSlug: opts.tenantSlug },
    subscription_data: {
      metadata: { tenantSlug: opts.tenantSlug },
    },
    allow_promotion_codes: true,
  });
  return session.url!;
}

/**
 * Build a Stripe Customer Portal URL for managing subscription / payment details.
 */
export async function createBillingPortalSession(opts: {
  customerId: string;
  returnUrl: string;
}): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer: opts.customerId,
    return_url: opts.returnUrl,
  });
  return session.url;
}

/**
 * Map a Stripe subscription status to the equivalent plan id.
 * Returns "free" if the subscription is not active.
 */
export function planFromSubscription(
  sub: Stripe.Subscription,
): PlanId {
  if (sub.status !== "active" && sub.status !== "trialing") return "free";
  const priceId = sub.items.data[0]?.price.id ?? "";
  for (const [plan, pid] of Object.entries(STRIPE_PRICE_IDS)) {
    if (pid === priceId) return plan as PlanId;
  }
  return "free";
}

/** Verify and construct a Stripe Webhook event from raw body + signature. */
export function constructWebhookEvent(
  rawBody: Buffer,
  signature: string,
): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

export { PLANS };
